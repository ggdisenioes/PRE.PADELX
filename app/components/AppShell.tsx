// ./app/components/AppShell.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function getMessageFromError(code: string | null) {
  switch (code) {
    case "tenant_incorrecto":
      return "Este usuario pertenece a otro club. Te redirigimos al subdominio correcto.";
    case "usuario_deshabilitado":
      return "Usuario deshabilitado. Contactá al administrador.";
    case "tenant_no_asignado":
      return "Tu usuario no tiene club asignado. Contactá al administrador.";
    case "perfil_no_encontrado":
      return "No se pudo leer tu perfil. Probá cerrar sesión e ingresar nuevamente.";
    case "tenant_invalido":
      return "Tu club no es válido. Contactá al administrador.";
    case "config_supabase":
      return "Falta configuración de Supabase en el entorno. Revisá las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    default:
      return null;
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);

  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Evita duplicar toasts en re-renders
  const lastToastKeyRef = useRef<string>("");

  // 1) Session guard (lo que ya tenías)
  useEffect(() => {
    setMobileOpen(false);

    const isLogin = pathname === "/login";
    if (isLogin) {
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
        router.replace("/login");
        return;
      }

      setCheckingSession(false);
    };

    checkSession();
  }, [pathname, router]);

  // 2) Mejora PRO: toast + limpieza de URL para errores “soft”
  useEffect(() => {
    const error = searchParams.get("error");
    const tenant = searchParams.get("tenant");

    if (!error) return;

    const msg = getMessageFromError(error);
    if (!msg) return;

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

  return (
    <>
      <Toaster position="top-right" />

      <div className="min-h-screen flex bg-[#05070b]">
        {/* SIDEBAR DESKTOP */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* COLUMNA PRINCIPAL */}
        <div className="flex-1 flex flex-col">
          {/* HEADER MOBILE */}
          <header className="md:hidden flex items-center justify-between px-4 py-4 bg-[#05070b] border-b border-gray-800">
            <div className="text-center flex-1">
              <p className="text-[11px] font-extrabold tracking-[0.26em] text-white uppercase">
                DEMO
              </p>
              <p className="text-[9px] font-semibold tracking-[0.32em] text-[#ccff00] uppercase mt-1">
                Pádel Manager
              </p>
            </div>

            <button
              type="button"
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              className="ml-3 inline-flex items-center justify-center rounded-md border border-gray-700 p-2 text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#05070b] focus:ring-[#ccff00]"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </header>

          {/* CONTENIDO */}
          <div className="flex-1 bg-gray-50">{children}</div>
        </div>

        {/* OVERLAY MOBILE */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 max-w-[80%]">
              <Sidebar onLinkClick={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}