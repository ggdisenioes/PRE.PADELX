"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type UserRole = "admin" | "manager" | "user";

type TokenClaims = {
  // Compatibilidad: hay proyectos que usan role/active y otros user_role/user_active
  role?: string;
  active?: boolean;
  user_role?: string;
  user_active?: boolean;
  app_metadata?: {
    role?: string;
    active?: boolean;
    user_role?: string;
    user_active?: boolean;
  };
};

function decodeJwtPayload<T = unknown>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);

    const json = atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function useRole() {
  const [role, setRole] = useState<UserRole>("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadRole = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (active) {
            setRole("user");
            setLoading(false);
          }
          return;
        }

        // 1) Preferimos claims del JWT (no depende de RLS)
        const token = session.access_token;
        const claims = token ? decodeJwtPayload<TokenClaims>(token) : null;
        const roleFromToken =
          claims?.role ??
          claims?.user_role ??
          claims?.app_metadata?.role ??
          claims?.app_metadata?.user_role;

        const activeFromToken =
          claims?.active ??
          claims?.user_active ??
          claims?.app_metadata?.active ??
          claims?.app_metadata?.user_active;

        if (activeFromToken === false) {
          console.warn("[useRole] inactive user (JWT claim), signing out", session.user.id);
          toast.error("Tu cuenta fue desactivada. Contactá al administrador.");
          await supabase.auth.signOut();
          try {
            sessionStorage.setItem("auth_disabled", "1");
          } catch {}
          if (typeof window !== "undefined") {
            window.location.href = "/login?disabled=1";
          }
          return;
        }

        const validRoles: UserRole[] = ["admin", "manager", "user"];
        if (typeof roleFromToken === "string" && validRoles.includes(roleFromToken as UserRole)) {
          if (active) setRole(roleFromToken as UserRole);
          // Si ya tenemos el rol del token, evitamos pegarle a la DB.
          return;
        }

        const userId = session.user.id;

        // 2) Fallback a DB (por si el hook de claims todavía no está activo)
        const { data, error } = await supabase
          .from("profiles")
          .select("role, active")
          .eq("id", userId)
          .single();

        if (error || !data) {
          console.warn("[useRole] failed to fetch role from profiles", error);
          if (active) setRole("user");
          return;
        }

        if (data.active === false) {
          console.warn("[useRole] inactive user, signing out", userId);
          toast.error("Tu cuenta fue desactivada. Contactá al administrador.");
          await supabase.auth.signOut();
          try { sessionStorage.setItem("auth_disabled", "1"); } catch {}
          if (typeof window !== "undefined") {
            window.location.href = "/login?disabled=1";
          }
          return;
        }

        if (validRoles.includes(data.role)) {
          if (active) setRole(data.role);
        } else {
          console.warn("[useRole] invalid role value", data.role);
          if (active) setRole("user");
        }
      } catch (err) {
        console.error("[useRole] unexpected error:", err);
        if (active) setRole("user");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  return {
    role,
    isAdmin: role === "admin",
    isManager: role === "manager",
    isUser: role === "user",
    loading,
  };
}