// ./app/lib/admin.ts
// Centraliza la lógica de permisos para que sea escalable.
//
// Soporta:
// - Múltiples emails admin vía NEXT_PUBLIC_ADMIN_EMAILS (separados por coma)
// - Roles en Supabase Auth (app_metadata / user_metadata) con role = 'admin'

import type { Session, User } from "@supabase/supabase-js";

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getRole(user: User | null | undefined): string | null {
  if (!user) return null;
  const appRole = (user.app_metadata as any)?.role;
  const userRole = (user.user_metadata as any)?.role;
  return (appRole || userRole || null) as string | null;
}

/**
 * Determina si el usuario actual es admin.
 *
 * Reglas (en orden):
 * 1) role === 'admin' en metadata
 * 2) email incluido en NEXT_PUBLIC_ADMIN_EMAILS
 *
 * ✅ FIXED: Removed hardcoded "admin@padel.com" fallback
 * All admin detection must be explicit via metadata or env variables
 */
export function isAdminSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  const role = getRole(user)?.toLowerCase();
  if (role === "admin") return true;

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const email = (user?.email || "").toLowerCase();
  if (email && adminEmails.has(email)) return true;

  // ✅ FIXED: No fallback to hardcoded email
  return false;
}
