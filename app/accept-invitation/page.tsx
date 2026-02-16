"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

type InvitePreview =
  | { valid: false; reason: "not_found" | "expired" }
  | {
      valid: true;
      email: string;
      first_name: string | null;
      last_name: string | null;
      tenant_name: string;
      expires_at: string;
    };

export default function AcceptInvitationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Validar token al cargar
  useEffect(() => {
    if (!token) {
      setPreview({ valid: false, reason: "not_found" });
      setLoadingPreview(false);
      return;
    }

    supabase
      .rpc("get_invitation_preview", { p_token: token })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr || !data) {
          setPreview({ valid: false, reason: "not_found" });
        } else {
          setPreview(data as InvitePreview);
          if (data?.valid && data.first_name) setFirstName(data.first_name);
          if (data?.valid && data.last_name) setLastName(data.last_name);
        }
        setLoadingPreview(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !preview || !preview.valid) return;

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: result, error: rpcErr } = await supabase.rpc(
      "accept_tenant_invitation",
      {
        p_token: token,
        p_password: password,
        p_first_name: firstName || null,
        p_last_name: lastName || null,
      }
    );

    if (rpcErr) {
      setError(rpcErr.message);
      setSubmitting(false);
      return;
    }

    setSuccess(true);

    // Auto-login con las credenciales recién creadas
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email: result.email,
      password: password,
    });

    if (loginErr) {
      // Cuenta creada pero falló el login automático
      router.push("/login");
      return;
    }

    // Redirect al panel
    router.push("/");
    router.refresh();
  };

  // --- Loading ---
  if (loadingPreview) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#ccff00] mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Verificando invitación...</p>
        </div>
      </div>
    );
  }

  // --- Invalid / Expired ---
  if (!preview?.valid) {
    const isExpired = preview?.reason === "expired";
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden p-6">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00] text-center">
          <div className="text-5xl mb-4">{isExpired ? "\u23F0" : "\u274C"}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isExpired ? "Invitación expirada" : "Invitación no válida"}
          </h1>
          <p className="text-gray-600 text-sm mb-6">
            {isExpired
              ? "Esta invitación expiró (válida por 72 horas). Contactá al administrador de PadelX para que te envíe una nueva."
              : "Esta invitación no existe o ya fue utilizada."}
          </p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black transition text-sm"
          >
            Ir al login
          </a>
        </div>
      </div>
    );
  }

  // --- Success (brief state before redirect) ---
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-5xl mb-4">{"\u2705"}</div>
          <p className="text-white font-semibold">Cuenta creada. Redirigiendo...</p>
        </div>
      </div>
    );
  }

  // --- Valid: Set Password Form ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 relative overflow-hidden p-6">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#ccff00] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md z-10 border-t-4 border-[#ccff00]">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-extrabold text-gray-900 italic tracking-tight">
            PadelX
          </h1>
          <span className="inline-block bg-gray-900 text-[#ccff00] px-2 py-0.5 text-xs font-bold tracking-[0.2em] uppercase rounded-sm mt-1">
            {preview.tenant_name}
          </span>
          <p className="text-gray-500 text-sm mt-4">
            Configurá tu contraseña para acceder al panel de administración.
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {preview.email}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 mb-5 text-sm rounded-r">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] outline-none bg-gray-50 text-sm"
                placeholder="Juan"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Apellido
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] outline-none bg-gray-50 text-sm"
                placeholder="García"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] outline-none bg-gray-50"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Repetir contraseña
            </label>
            <input
              type="password"
              required
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#ccff00] outline-none bg-gray-50"
              placeholder="Repetir contraseña"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-lg hover:bg-black transition disabled:opacity-70 shadow-lg"
          >
            {submitting ? "Creando cuenta..." : "Crear cuenta y acceder"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-5">
          Este enlace expira el{" "}
          {new Date(preview.expires_at).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      </div>
    </div>
  );
}
