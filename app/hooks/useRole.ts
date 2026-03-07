"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { getClientCache, setClientCache } from "../lib/clientCache";

export type UserRole = "admin" | "manager" | "super_admin" | "user";

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

type RoleCachePayload = {
  role: UserRole;
  userId: string;
};

const ROLE_CACHE_KEY = "qa:auth:role:v1";
const ROLE_CACHE_TTL_MS = 10 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSessionWithRetry(retries = 12, delayMs = 180) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return session;
    if (attempt < retries) {
      await sleep(delayMs);
    }
  }
  return null;
}

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

function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "user") {
    return normalized as UserRole;
  }
  if (normalized === "super_admin" || normalized === "super-admin" || normalized === "superadmin") {
    return "super_admin";
  }
  return null;
}

export function useRole() {
  const cachedRole = getClientCache<RoleCachePayload>(ROLE_CACHE_KEY, ROLE_CACHE_TTL_MS);
  const [role, setRole] = useState<UserRole>(cachedRole?.role || "user");
  const [loading, setLoading] = useState(!cachedRole);

  useEffect(() => {
    let active = true;

    const loadRole = async () => {
      try {
        const session = await getSessionWithRetry(12, 180);

        if (!session?.user?.id) {
          if (active) {
            setRole("user");
            setLoading(false);
          }
          setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
            role: "user",
            userId: "",
          });
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
          toast.error("Tu cuenta fue desactivada. Contacta al administrador.");
          await supabase.auth.signOut();
          try {
            sessionStorage.setItem("auth_disabled", "1");
          } catch {}
          if (typeof window !== "undefined") {
            window.location.href = "/login?disabled=1";
          }
          return;
        }

        const normalizedTokenRole = normalizeRole(roleFromToken);
        if (normalizedTokenRole && normalizedTokenRole !== "user") {
          if (active) {
            setRole(normalizedTokenRole);
            setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
              role: normalizedTokenRole,
              userId: session.user.id,
            });
          }
          // Si el token ya trae privilegios, no hace falta pegarle a la DB.
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
          const fallbackRole = normalizedTokenRole || "user";
          if (active) {
            setRole(fallbackRole);
            setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
              role: fallbackRole,
              userId,
            });
          }
          return;
        }

        if (data.active === false) {
          console.warn("[useRole] inactive user, signing out", userId);
          toast.error("Tu cuenta fue desactivada. Contacta al administrador.");
          await supabase.auth.signOut();
          try { sessionStorage.setItem("auth_disabled", "1"); } catch {}
          if (typeof window !== "undefined") {
            window.location.href = "/login?disabled=1";
          }
          return;
        }

        const normalizedDbRole = normalizeRole(data.role);
        if (normalizedDbRole) {
          if (active) {
            setRole(normalizedDbRole);
            setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
              role: normalizedDbRole,
              userId,
            });
          }
        } else {
          console.warn("[useRole] invalid role value", data.role);
          const fallbackRole = normalizedTokenRole || "user";
          if (active) {
            setRole(fallbackRole);
            setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
              role: fallbackRole,
              userId,
            });
          }
        }
      } catch (err) {
        console.error("[useRole] unexpected error:", err);
        if (active) setRole("user");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "SIGNED_OUT"
      ) {
        if (event === "SIGNED_OUT") {
          setClientCache<RoleCachePayload>(ROLE_CACHE_KEY, {
            role: "user",
            userId: "",
          });
        }
        void loadRole();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    role,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    isManager: role === "manager",
    isUser: role === "user",
    loading,
  };
}
