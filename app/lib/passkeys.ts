import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

const CHALLENGE_TTL_SECONDS = 5 * 60;

export const PASSKEY_REGISTER_COOKIE = "passkey_reg_challenge";
export const PASSKEY_AUTH_COOKIE = "passkey_auth_challenge";

export type PasskeyChallengePayload = {
  challenge: string;
  userId: string;
  email?: string;
  rpID: string;
  origin: string;
  expiresAt: number;
};

type PasskeyContext = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
};

export function getPasskeyContext(): PasskeyContext {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables for passkeys");
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
}

export function createSupabaseAdminClient(context: PasskeyContext) {
  return createClient(context.supabaseUrl, context.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseUserClient(
  context: PasskeyContext,
  accessToken: string
) {
  return createClient(context.supabaseUrl, context.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

function getHost(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || "";
  return host.split(",")[0].trim().split(":")[0].trim();
}

export function resolvePasskeyRPID(req: Request): string {
  const configured = process.env.PASSKEY_RP_ID?.trim();
  if (configured) return configured;

  const host = getHost(req);
  if (!host) {
    throw new Error("Could not resolve RP ID from request host");
  }
  return host;
}

export function resolvePasskeyOrigin(req: Request): string {
  const configured = process.env.PASSKEY_ORIGIN?.trim();
  if (configured) return configured;

  const origin = req.headers.get("origin")?.trim();
  if (origin) return origin;

  const proto = (req.headers.get("x-forwarded-proto") || "https")
    .split(",")[0]
    .trim();
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) {
    throw new Error("Could not resolve passkey origin from request headers");
  }
  return `${proto}://${host.split(",")[0].trim()}`;
}

export function getPasskeyRPName() {
  return process.env.PASSKEY_RP_NAME?.trim() || "PadelX QA";
}

export function encodeBase64Url(data: string) {
  return Buffer.from(data, "utf8").toString("base64url");
}

export function decodeBase64Url(data: string) {
  return Buffer.from(data, "base64url").toString("utf8");
}

export function setChallengeCookie(
  response: NextResponse,
  cookieName: string,
  payload: Omit<PasskeyChallengePayload, "expiresAt">
) {
  const fullPayload: PasskeyChallengePayload = {
    ...payload,
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  };

  response.cookies.set({
    name: cookieName,
    value: encodeBase64Url(JSON.stringify(fullPayload)),
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

export function clearChallengeCookie(response: NextResponse, cookieName: string) {
  response.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}

export function readChallengeCookie(
  req: NextRequest,
  cookieName: string
): PasskeyChallengePayload | null {
  const raw = req.cookies.get(cookieName)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as PasskeyChallengePayload;
    if (!parsed?.challenge || !parsed?.userId || !parsed?.rpID || !parsed?.origin) {
      return null;
    }
    if (parsed.expiresAt < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toUserIDBuffer(userId: string) {
  return new TextEncoder().encode(userId);
}
