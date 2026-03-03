"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "../i18n";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const response = await fetch("/api/auth/password/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setErrorMsg(payload.error || t("auth.resetEmailError"));
      setLoading(false);
      return;
    }

    router.replace("/login?reset=sent");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00]">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-gray-900">
            {t("auth.forgotPassword")}
          </h1>
          <p className="text-gray-500 text-sm mt-3">{t("auth.forgotPasswordSubtitle")}</p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 mb-6 text-sm rounded-r">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">
              {t("auth.email")}
            </label>
            <input
              type="email"
              required
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="usuario@padelx.es"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 disabled:opacity-70 shadow-lg"
          >
            {loading ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition duration-200 shadow-sm"
          >
            {t("auth.backToLogin")}
          </button>
        </form>
      </div>
    </div>
  );
}
