"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useTranslation } from "../i18n";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  // opcional: si existe en DB
  is_active?: boolean | null;
};

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const [tenantId, setTenantId] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const visibleTenants = useMemo(() => {
    // Reglas:
    // - Mostrar solo tenants activos (si existe is_active)
    // - Excluir tenants de pruebas (por slug)
    // Para este momento (según tu consigna), debería quedar solo PadelX.
    return tenants
      .filter((t) => (t.is_active ?? true) === true)
      .filter((t) => {
        const s = (t.slug || "").toLowerCase();
        if (s.includes("test") || s.includes("prueba") || s.includes("demo")) return false;
        return true;
      });
  }, [tenants]);

  useEffect(() => {
    const loadTenants = async () => {
      setTenantsLoading(true);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, is_active")
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        toast.error(t("auth.registerError"));
        setTenants([]);
        setTenantsLoading(false);
        return;
      }

      const list = (data as Tenant[]) || [];
      setTenants(list);

      // Auto-seleccionar si solo hay 1 visible (por ejemplo, PadelX)
      const filtered = (list as Tenant[])
        .filter((t) => (t.is_active ?? true) === true)
        .filter((t) => {
          const s = (t.slug || "").toLowerCase();
          if (s.includes("test") || s.includes("prueba") || s.includes("demo")) return false;
          return true;
        });

      if (filtered.length === 1) {
        setTenantId(filtered[0].id);
      }

      setTenantsLoading(false);
    };

    void loadTenants();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!tenantId) {
      toast.error(t("auth.emailAndPasswordRequired"));
      return;
    }

    if (!email.trim()) {
      toast.error(t("auth.emailAndPasswordRequired"));
      return;
    }

    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }

    if (password !== password2) {
      toast.error(t("auth.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    // IMPORTANTE: acá NO asignamos roles.
    // El rol SIEMPRE lo define el backend (trigger en auth.users -> profiles)
    // y debe ser 'user' + active=false (pendiente) para registro libre.
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          requested_tenant_id: tenantId,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        },
      },
    });

    if (error) {
      console.error(error);
      toast.error(error.message || t("auth.registerError"));
      setLoading(false);
      return;
    }

    toast.success(t("auth.registrationSuccess"));
    router.push("/login?error=aprobacion_en_curso");
  };

  return (
    <main className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl font-bold">{t("auth.register")}</h1>
          <p className="text-sm text-gray-600">
            {t("auth.registerSubtitle")}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Club</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={tenantsLoading}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
            >
              <option value="">
                {tenantsLoading ? t("common.loading") : t("common.selectOption")}
              </option>
              {visibleTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {t("auth.noClubHint")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t("auth.firstName")}</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Juan"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t("auth.lastName")}</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Martínez"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t("auth.email")}</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="tuemail@dominio.com"
              autoComplete="email"
              type="email"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t("auth.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder={t("auth.password")}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {t("auth.confirmPassword")}
            </label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder={t("auth.confirmPassword")}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || tenantsLoading}
            className="w-full bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? t("auth.registering") : t("auth.register")}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            {t("auth.hasAccount")}
          </button>
        </form>
      </div>
    </main>
  );
}