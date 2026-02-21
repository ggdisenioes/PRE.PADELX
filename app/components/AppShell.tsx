// ./app/components/AppShell.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import LanguageSelector from "./LanguageSelector";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useTranslation } from "../i18n";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabaseClient() {
  // Importante: NO crear el cliente si faltan envs.
  // Esto evita que falle el prerender/build (por ejemplo en /_not-found).
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function buildCleanUrl(pathname: string, params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const ERROR_KEYS: Record<string, string> = {
  tenant_incorrecto: "errors.tenantIncorrecto",
  usuario_deshabilitado: "errors.usuarioDeshabilitado",
  tenant_no_asignado: "errors.tenantNoAsignado",
  perfil_no_encontrado: "errors.perfilNoEncontrado",
  tenant_invalido: "errors.tenantInvalido",
  config_supabase: "errors.configSupabase",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Evita duplicar toasts en re-renders
  const lastToastKeyRef = useRef<string>("");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // 1) Session guard
  useEffect(() => {
    if (isAuthPage) {
      sessionStorage.removeItem("unauthorized_redirect");
      setCheckingSession(false);
      return;
    }

    const checkSession = async () => {
      if (!supabaseRef.current) {
        supabaseRef.current = getSupabaseClient();
      }

      // Si falta configuración de Supabase, no rompemos el build ni el runtime.
      // Redirigimos al login para evitar pantallas en blanco.
      if (!supabaseRef.current) {
        setCheckingSession(false);
        router.replace("/login?error=config_supabase");
        return;
      }

      const {
        data: { session },
      } = await supabaseRef.current.auth.getSession();

      if (!session) {
        // Retry corto para evitar falsos negativos de sesión en mobile.
        await new Promise((resolve) => setTimeout(resolve, 150));
        const {
          data: { session: retriedSession },
        } = await supabaseRef.current.auth.getSession();

        if (!retriedSession) {
          router.replace("/login");
          return;
        }
      }

      setCheckingSession(false);
    };

    checkSession();
  }, [isAuthPage, router]);

  // 2) Sidebar slide-in transition after login
  useEffect(() => {
    if (!checkingSession && !isAuthPage) {
      // Small delay to trigger CSS transition
      const timer = setTimeout(() => setSidebarVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setSidebarVisible(false);
    }
  }, [checkingSession, isAuthPage]);

  // 3) Mejora PRO: toast + limpieza de URL para errores "soft"
  useEffect(() => {
    const error = searchParams.get("error");
    const tenant = searchParams.get("tenant");

    if (!error) return;

    const errorKey = ERROR_KEYS[error];
    if (!errorKey) return;
    const msg = t(errorKey);

    const toastKey = `${pathname}|${error}|${tenant ?? ""}`;
    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    // Toast PRO (no invasivo)
    toast.error(msg, { duration: 5000 });

    // Limpieza de URL: borramos solo los params que usamos para el aviso
    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    params.delete("tenant");

    const cleanUrl = buildCleanUrl(pathname, params);

    // No rompemos navegación, no recargamos todo
    router.replace(cleanUrl);
  }, [pathname, searchParams, router]);

  if (checkingSession) return null;

  // Auth pages: render clean, no sidebar
  if (isAuthPage) {
    return (
      <>
        <Toaster position="top-right" />
        {children}
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />

      <div className="min-h-screen flex bg-[#05070b]">
        {/* SIDEBAR DESKTOP — slide-in from left */}
        <div
          className="hidden md:flex transition-transform duration-500 ease-out"
          style={{ transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)" }}
        >
          <Sidebar />
        </div>

        {/* COLUMNA PRINCIPAL */}
        <div className="flex-1 flex flex-col">
          {/* HEADER MOBILE */}
          <header className="md:hidden fixed inset-x-0 top-0 z-[70] flex items-center justify-center px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-[#05070b]/95 backdrop-blur border-b border-gray-800 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="rounded-md border border-white/25 bg-black/30 px-1 py-1">
                <LanguageSelector />
              </div>
            </div>

            <div className="text-center">
              <p className="text-[11px] font-extrabold tracking-[0.26em] text-white uppercase">
                PADELX QA
              </p>
              <p className="text-[9px] font-semibold tracking-[0.32em] text-[#ccff00] uppercase mt-1">
                Pádel Manager
              </p>
            </div>

            <button
              type="button"
              aria-label={mobileOpen ? t("shell.closeMenu") : t("shell.openMenu")}
              data-testid="mobile-menu-toggle"
              className="absolute right-4 inline-flex items-center gap-2 rounded-md border border-white/40 bg-black/30 px-3 py-2 shadow-sm hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#05070b] focus:ring-[#ccff00]"
              style={{ color: "#ffffff" }}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
              <span className="text-xs font-semibold">{mobileOpen ? t("shell.close") : t("shell.menu")}</span>
            </button>
          </header>

          {/* CONTENIDO */}
          <div className="flex-1 bg-gray-50 pt-[88px] md:pt-0">{children}</div>
        </div>

        {/* OVERLAY MOBILE — slide-in transition */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 max-w-[80%] overflow-hidden animate-slide-in-left">
              <Sidebar onLinkClick={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
