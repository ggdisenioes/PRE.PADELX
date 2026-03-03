"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useTranslation } from "../i18n";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const resolveRecoverySession = async () => {
      let session = (await supabase.auth.getSession()).data.session;

      // Supabase setea la sesión de recovery desde el hash de URL; puede tardar un instante.
      if (
        !session &&
        typeof window !== "undefined" &&
        window.location.hash.includes("access_token")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        session = (await supabase.auth.getSession()).data.session;
      }

      if (!mounted) return;
      setCanReset(Boolean(session));
      setCheckingSession(false);
    };

    resolveRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setCanReset(Boolean(session));
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(t("auth.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message || t("auth.resetPasswordError"));
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?reset=ok");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00]">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-gray-900">
            {t("auth.resetPasswordTitle")}
          </h1>
          <p className="text-gray-500 text-sm mt-3">{t("auth.resetPasswordSubtitle")}</p>
        </div>

        {checkingSession ? (
          <p className="text-sm text-gray-500 text-center">{t("common.loading")}</p>
        ) : !canReset ? (
          <div className="space-y-4">
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 text-sm rounded-r">
              {t("auth.resetLinkInvalid")}
            </div>
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 shadow-lg"
            >
              {t("auth.sendResetLink")}
            </button>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition duration-200 shadow-sm"
            >
              {t("auth.backToLogin")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="space-y-5">
            {errorMsg && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 text-sm rounded-r">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">
                {t("auth.newPassword")}
              </label>
              <input
                type="password"
                required
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">
                {t("auth.confirmNewPassword")}
              </label>
              <input
                type="password"
                required
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 disabled:opacity-70 shadow-lg"
            >
              {loading ? t("auth.savingNewPassword") : t("auth.saveNewPassword")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
