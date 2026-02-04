// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

function isPublicPath(pathname: string) {
  return (
    // Common auth callback / confirm routes
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    // Next.js assets
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  );
}

function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for as a comma-separated list. We take the left-most.
  const xff = req.headers.get("x-forwarded-for");
  const ipFromXff = xff?.split(",")[0]?.trim();
  // NextRequest.ip exists in some Next versions/runtimes
  const anyReq = req as unknown as { ip?: string };
  return ipFromXff || anyReq.ip || "0.0.0.0";
}

const rateLimitEnabled = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

// NOTE: These instances are created once per runtime instance (recommended by Upstash)
// and are safe for Edge/Middleware.
const loginRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(30, "5 m"),
  prefix: "rl:login",
});

const adminRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "rl:admin",
});

function tooManyRequestsResponse(reset: number, asJson: boolean) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  const headers = new Headers({ "Retry-After": retryAfter.toString() });

  if (asJson) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: retryAfter },
      { status: 429, headers }
    );
  }

  return new NextResponse("Too many requests", { status: 429, headers });
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // --- Rate limiting (Vercel KV + Upstash Ratelimit) ---
  // Protege /login de brute force y /admin + /api/admin de abuso.
  // Si KV env vars no están configuradas, esto es un no-op.
  if (rateLimitEnabled) {
    const ip = getClientIp(req);

    if (pathname === "/login") {
      const result = await loginRatelimit.limit(`ip:${ip}`);
      if (!result.success) {
        return tooManyRequestsResponse(result.reset, false);
      }
    }

    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      const result = await adminRatelimit.limit(`ip:${ip}`);
      if (!result.success) {
        return tooManyRequestsResponse(result.reset, pathname.startsWith("/api/"));
      }
    }
  }

  // Dejar pasar paths públicos
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // NO bloqueamos páginas /admin acá para evitar loops por sesiones en localStorage.
  if (pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // NO bloqueamos APIs acá: cada route handler valida auth/rol y la DB aplica RLS.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};