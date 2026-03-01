import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /super-admin routes server-side
  if (pathname.startsWith("/super-admin") || pathname.startsWith("/api/super-admin")) {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Extract access token from cookies (Supabase stores it in sb-*-auth-token)
    const authCookie = req.cookies.getAll().find((c) => c.name.includes("-auth-token"));

    if (!authCookie) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      // Parse the cookie value to get access_token
      let accessToken: string | null = null;
      try {
        const parsed = JSON.parse(authCookie.value);
        accessToken = parsed?.access_token || parsed?.[0]?.access_token || null;
      } catch {
        // Cookie might be base64 encoded or chunked
        const decoded = decodeURIComponent(authCookie.value);
        const parsed = JSON.parse(decoded);
        accessToken = parsed?.access_token || parsed?.[0]?.access_token || null;
      }

      if (!accessToken) {
        return NextResponse.redirect(new URL("/login", req.url));
      }

      // Verify user with service role
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (error || !user) {
        return NextResponse.redirect(new URL("/login", req.url));
      }

      // Check role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super-admin/:path*", "/api/super-admin/:path*"],
};
