"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

function getBaseDomain(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

function getLoginMessage(errorCode: string | null) {
  switch (errorCode) {
    case "tenant_incorrecto":
      return "Este usuario pertenece a otro club. Ingresá desde el subdominio correcto.";
    case "usuario_deshabilitado":
      return "Usuario deshabilitado, contacte su administrador.";
    case "tenant_no_asignado":
      return "Tu usuario no tiene club asignado. Contactá al administrador.";
    case "perfil_no_encontrado":
      return "No se pudo leer tu perfil. Probá cerrar sesión e ingresar nuevamente.";
    case "tenant_invalido":
      return "Tu club no es válido. Contactá al administrador.";
    default:
      return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const errorCode = searchParams.get("error");
  const tenantSlug = searchParams.get("tenant");

  const tenantRedirectUrl = useMemo(() => {
    if (!tenantSlug) return null;
    if (typeof window === "undefined") return null;

    const base = getBaseDomain(window.location.hostname);
    return `https://${tenantSlug}.${base}`;
  }, [tenantSlug]);

  useEffect(() => {
    const msg = getLoginMessage(errorCode);
    if (msg) setErrorMsg(msg);
  }, [errorCode]);

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
          ? "Usuario o contraseña incorrectos"
          : error?.message ?? "Error al iniciar sesión"
      );
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile || profile.active === false) {
      await supabase.auth.signOut();
      setErrorMsg("Usuario deshabilitado, contacte su administrador.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00]">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-extrabold text-gray-900 italic tracking-tight">DEMO</h1>
          <span className="inline-block bg-gray-900 text-[#ccff00] px-2 py-0.5 text-xs font-bold tracking-[0.2em] uppercase rounded-sm mt-1">
            Pádel Manager
          </span>
          <p className="text-gray-400 text-sm mt-4">Bienvenido al club</p>
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
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] focus:border-transparent outline-none transition bg-gray-50"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition duration-200 disabled:opacity-70 shadow-lg"
          >
            {loading ? "Accediendo..." : "Iniciar Sesión"}
          </button>
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