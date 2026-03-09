export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type CookieToSet = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    secure?: boolean;
    sameSite?: boolean | "lax" | "strict" | "none";
  };
};

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const cookieRes = NextResponse.next();
  const withSupabaseCookies = (out: NextResponse) => {
    cookieRes.cookies.getAll().forEach((c) => out.cookies.set(c));
    return out;
  };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const sameSite =
            options?.sameSite === true
              ? "strict"
              : options?.sameSite === false
                ? undefined
                : options?.sameSite;

          cookieRes.cookies.set({
            name,
            value,
            ...(options ?? {}),
            ...(sameSite ? { sameSite } : {}),
          });
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return withSupabaseCookies(
      NextResponse.json({
        authenticated: false,
        active: false,
        role: "user",
        can_manage_tournaments: false,
      })
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizeRole(profile?.role);
  const active = Boolean(profile?.active);
  const canManage = active && (role === "admin" || role === "manager" || role === "super_admin");

  return withSupabaseCookies(
    NextResponse.json({
      authenticated: true,
      active,
      role: role || "user",
      can_manage_tournaments: canManage,
    })
  );
}
