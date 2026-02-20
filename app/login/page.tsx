"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "../i18n";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";

function getBaseDomain(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

function getLoginMessage(errorCode: string | null, t: (key: string) => string) {
  switch (errorCode) {
    case "tenant_incorrecto":
      return t("errors.tenantIncorrecto");
    case "usuario_deshabilitado":
      return t("auth.userDisabled");
    case "tenant_no_asignado":
      return t("errors.tenantNoAsignado");
    case "perfil_no_encontrado":
      return t("errors.perfilNoEncontrado");
    case "tenant_invalido":
      return t("errors.tenantInvalido");
    case "aprobacion_en_curso":
      return t("auth.pendingApproval");
    default:
      return null;
  }
}

async function safeReadJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

  const errorCode = searchParams.get("error");
  const tenantSlug = searchParams.get("tenant");

  const tenantRedirectUrl = useMemo(() => {
    if (!tenantSlug) return null;
    if (typeof window === "undefined") return null;

    const base = getBaseDomain(window.location.hostname);
    return `https://${tenantSlug}.${base}`;
  }, [tenantSlug]);

  useEffect(() => {
    let active = true;

    const checkPasskeySupport = async () => {
      try {
        const browserSupport = browserSupportsWebAuthn();
        if (!browserSupport) {
          if (active) setPasskeySupported(false);
          return;
        }
        if (active) setPasskeySupported(true);
      } catch {
        if (active) setPasskeySupported(false);
      }
    };

    checkPasskeySupport();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const msg = getLoginMessage(errorCode, t);
    if (msg) setErrorMsg(msg);
  }, [errorCode, t]);

  const validateProfileAndRedirect = async (userId: string, fallbackError: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile || profile.active === false) {
      await supabase.auth.signOut();
      setErrorMsg(
        profile && profile.active === false
          ? t("auth.pendingApproval")
          : fallbackError
      );
      return;
    }

    router.push(profile?.role === "super_admin" ? "/super-admin" : "/");
    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      setErrorMsg(
        error?.message === "Invalid login credentials"
          ? t("auth.invalidCredentials")
          : error?.message ?? t("auth.loginError")
      );
      setLoading(false);
      return;
    }

    await validateProfileAndRedirect(data.user.id, t("auth.userDisabled"));
    setLoading(false);
  };

  const handlePasskeyLogin = async () => {
    if (!passkeySupported) {
      setErrorMsg(t("auth.passkeyUnavailable"));
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg(t("auth.passkeyNeedEmail"));
      return;
    }

    setPasskeyLoading(true);
    setErrorMsg(null);

    try {
      const optionsRes = await fetch("/api/auth/passkeys/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const optionsPayload = await safeReadJson(optionsRes);
      if (!optionsRes.ok || !optionsPayload.options) {
        const errCode = String(optionsPayload.error || "");
        if (errCode === "no_passkeys_registered" || optionsRes.status === 404) {
          setErrorMsg(t("auth.passkeyNoRegistered"));
        } else {
          setErrorMsg(t("auth.passkeyLoginError"));
        }
        return;
      }

      const credential = await startAuthentication({
        optionsJSON: optionsPayload.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });

      const verifyRes = await fetch("/api/auth/passkeys/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          credential,
        }),
      });

      const verifyPayload = await safeReadJson(verifyRes);
      if (!verifyRes.ok) {
        setErrorMsg(t("auth.passkeyLoginError"));
        return;
      }

      const otpToken =
        typeof verifyPayload.otpToken === "string" ? verifyPayload.otpToken : null;
      const otpType =
        typeof verifyPayload.otpType === "string" ? verifyPayload.otpType : "magiclink";
      const verifiedEmail =
        typeof verifyPayload.email === "string"
          ? verifyPayload.email
          : normalizedEmail;

      if (!otpToken) {
        setErrorMsg(t("auth.passkeyLoginError"));
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: verifiedEmail,
        token: otpToken,
        type: otpType as "magiclink",
      });

      if (error || !data.session || !data.user) {
        setErrorMsg(error?.message || t("auth.passkeyLoginError"));
        return;
      }

      await validateProfileAndRedirect(data.user.id, t("auth.userDisabled"));
    } catch (error) {
      console.error("passkey login error", error);
      setErrorMsg(t("auth.passkeyLoginError"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00]">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-extrabold text-gray-900 italic tracking-tight">PadelX</h1>
          <span className="inline-block bg-gray-900 text-[#ccff00] px-2 py-0.5 text-xs font-bold tracking-[0.2em] uppercase rounded-sm mt-1">
            Dashboard
          </span>
          <p className="text-gray-400 text-sm mt-4">Bienvenido</p>
        </div>

        {/* Banner PRO para tenant incorrecto */}
        {errorCode === "tenant_incorrecto" && (
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-900 p-3 mb-4 text-sm rounded-r">
            <p className="font-semibold">Acceso por subdominio incorrecto</p>
            <p className="mt-1">
              Este usuario pertenece a otro club. Para evitar errores, ingresá desde el subdominio correcto.
            </p>

            {tenantRedirectUrl && (
              <a
                href={tenantRedirectUrl}
                className="inline-flex mt-3 items-center justify-center rounded-lg bg-gray-900 text-white font-bold px-4 py-2 hover:bg-black transition"
              >
                Ir al club correcto
              </a>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 mb-6 text-sm rounded-r">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email</label>
            <input
              type="email"
              required
              data-testid="login-email"
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="usuario@twinco.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Contraseña</label>
            <input
              type="password"
              required
              data-testid="login-password"
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || passkeyLoading}
            data-testid="login-submit"
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 disabled:opacity-70 shadow-lg"
          >
            {loading ? "Accediendo..." : "Iniciar Sesión"}
          </button>

          <button
            type="button"
            disabled={passkeyLoading || loading}
            onClick={() => void handlePasskeyLogin()}
            className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition duration-200 shadow-sm disabled:opacity-60"
          >
            {passkeyLoading ? t("auth.passkeyVerifying") : t("auth.passkeySignIn")}
          </button>

          {!passkeySupported && (
            <p className="text-xs text-amber-600 text-center">{t("auth.passkeyUnavailable")}</p>
          )}

          <button
            type="button"
            onClick={() => router.push("/register")}
            className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition duration-200 shadow-sm"
          >
            Registrarme
          </button>
          <p className="text-xs text-gray-500 text-center">
            Si no ves tu club en el registro, contactá al administrador.
          </p>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Desarrollado por{" "}
            <a
              href="https://ggdisenio.es"
              target="_blank"
              className="text-gray-600 hover:text-[#aacc00] font-bold transition"
            >
              GGDisenio.es
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
