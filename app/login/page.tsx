"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "../i18n";

const REMEMBERED_EMAIL_KEY = "padelx.rememberedEmail";
const STRICT_TENANT_SLUGS = new Set(["twinco"]);
const LOGIN_REQUEST_TIMEOUT_MS = 15000;

function getBaseDomain(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

function getPreferredSubdomain(tenantSlug: string) {
  const slug = String(tenantSlug || "").trim().toLowerCase();
  if (!slug) return "";
  // Entorno demo usa el host new.padelx.es
  if (slug === "demo") return "new";
  return slug;
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
    case "session_expired":
      return t("auth.sessionExpired");
    default:
      return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberUser, setRememberUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const errorCode = searchParams.get("error");
  const tenantSlug = searchParams.get("tenant");
  const resetStatus = searchParams.get("reset");

  const tenantRedirectUrl = useMemo(() => {
    if (!tenantSlug) return null;
    if (typeof window === "undefined") return null;

    const base = getBaseDomain(window.location.hostname);
    const preferredSubdomain = getPreferredSubdomain(tenantSlug);
    if (!preferredSubdomain) return null;
    return `https://${preferredSubdomain}.${base}`;
  }, [tenantSlug]);

  useEffect(() => {
    const msg = getLoginMessage(errorCode, t);
    if (msg) setErrorMsg(msg);
  }, [errorCode, t]);

  useEffect(() => {
    if (resetStatus === "sent") {
      setInfoMsg(t("auth.resetEmailSent"));
      return;
    }
    if (resetStatus === "ok") {
      setInfoMsg(t("auth.passwordResetSuccess"));
      return;
    }
    if (resetStatus === "invalid") {
      setErrorMsg(t("auth.resetLinkInvalid"));
      return;
    }
    setInfoMsg(null);
  }, [resetStatus, t]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (!savedEmail) return;

    setEmail(savedEmail);
    setRememberUser(true);
  }, []);

  const validateProfileAndRedirect = async (userId: string, fallbackError: string) => {
    const { data: profile, error: profileError } = await withTimeout(
      supabase
        .from("profiles")
        .select("active, role, tenant_id")
        .eq("id", userId)
        .single(),
      LOGIN_REQUEST_TIMEOUT_MS
    );

    if (profileError || !profile || profile.active === false) {
      await supabase.auth.signOut();
      setErrorMsg(
        profile && profile.active === false
          ? t("auth.pendingApproval")
          : fallbackError
      );
      return;
    }

    if (profile.role !== "super_admin") {
      if (!profile.tenant_id) {
        await supabase.auth.signOut();
        setErrorMsg(t("errors.tenantNoAsignado"));
        return;
      }

      const { data: tenantData, error: tenantError } = await withTimeout(
        supabase
          .from("tenants")
          .select("slug")
          .eq("id", profile.tenant_id)
          .maybeSingle(),
        LOGIN_REQUEST_TIMEOUT_MS
      );

      const tenantSlugFromProfile = String(tenantData?.slug || "")
        .trim()
        .toLowerCase();

      if (tenantError || !tenantSlugFromProfile) {
        await supabase.auth.signOut();
        setErrorMsg(t("errors.tenantInvalido"));
        return;
      }

      if (typeof window !== "undefined") {
        const currentHost = window.location.hostname.trim().toLowerCase();
        const currentSubdomain = currentHost.split(".")[0] || "";
        const preferredSubdomain = getPreferredSubdomain(tenantSlugFromProfile);
        const shouldForceTenantHost =
          STRICT_TENANT_SLUGS.has(tenantSlugFromProfile) &&
          preferredSubdomain &&
          currentSubdomain !== preferredSubdomain;

        if (shouldForceTenantHost) {
          const baseDomain = getBaseDomain(currentHost);
          await supabase.auth.signOut();
          window.location.replace(
            `https://${preferredSubdomain}.${baseDomain}/login?error=tenant_incorrecto&tenant=${encodeURIComponent(tenantSlugFromProfile)}`
          );
          return;
        }
      }
    }

    router.push(profile?.role === "super_admin" ? "/super-admin" : "/");
    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        }),
        LOGIN_REQUEST_TIMEOUT_MS
      );

      if (error || !data.session || !data.user) {
        setErrorMsg(
          error?.message === "Invalid login credentials"
            ? t("auth.invalidCredentials")
            : error?.message ?? t("auth.loginError")
        );
        return;
      }

      if (typeof window !== "undefined") {
        if (rememberUser) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      }

      await withTimeout(
        validateProfileAndRedirect(data.user.id, t("auth.userDisabled")),
        LOGIN_REQUEST_TIMEOUT_MS
      );
    } catch (error: any) {
      console.error("[login] timeout/error:", error);
      if (String(error?.message || "").includes("timeout")) {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {}
        setErrorMsg(
          "La autenticación tardó demasiado. Se limpió la sesión local, intentá nuevamente."
        );
      } else {
        setErrorMsg(t("auth.loginError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#00b4ff] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#00b4ff]">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-extrabold text-gray-900 italic tracking-tight">PadelX QA</h1>
          <span className="inline-block bg-[#00b4ff]/10 text-[#00b4ff] px-2 py-0.5 text-xs font-bold tracking-[0.2em] uppercase rounded-sm mt-1">
            QA
          </span>
          <p className="text-gray-400 text-sm mt-4">Bienvenido a PadelX QA</p>
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
        {infoMsg && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 p-3 mb-6 text-sm rounded-r">
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email</label>
            <input
              type="email"
              required
              data-testid="login-email"
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00b4ff] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="usuario@padelx.es"
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
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00b4ff] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => router.push("/forgot-password")}
                className="text-sm font-semibold text-gray-700 hover:text-black underline underline-offset-2"
              >
                {t("auth.forgotPasswordLink")}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
            <input
              type="checkbox"
              checked={rememberUser}
              onChange={(e) => setRememberUser(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#00b4ff] focus:ring-[#00b4ff]"
            />
            {t("auth.rememberUser")}
          </label>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 disabled:opacity-70 shadow-lg"
          >
            {loading ? "Accediendo..." : "Iniciar Sesión"}
          </button>

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
              className="text-gray-600 hover:text-[#00b4ff] font-bold transition"
            >
              GGDisenio.es
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
