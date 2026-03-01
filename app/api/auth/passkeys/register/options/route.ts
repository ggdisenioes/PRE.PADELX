import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  applyPasskeyRateLimit,
  PASSKEY_REGISTER_COOKIE,
  createSupabaseAdminClient,
  createSupabaseUserClient,
  extractBearerToken,
  getPasskeyRequestContext,
  getPasskeyContext,
  getPasskeyRPName,
  logPasskeyAuditEvent,
  resolvePasskeyOrigin,
  resolvePasskeyRPID,
  setChallengeCookie,
  toUserIDBuffer,
} from "@/lib/passkeys";

type StoredPasskey = {
  credential_id: string;
  revoked_at: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const reqContext = getPasskeyRequestContext(req);
    const context = getPasskeyContext();
    const supabaseAdmin = createSupabaseAdminClient(context);
    const ipLimit = applyPasskeyRateLimit(`passkeys:register:options:ip:${reqContext.ip}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!ipLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_OPTIONS_RATE_LIMIT",
        metadata: {
          endpoint: "register/options",
          limiter: "ip",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseUser = createSupabaseUserClient(context, token);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "invalid_session" }, { status: 401 });
    }

    const userLimit = applyPasskeyRateLimit(`passkeys:register:options:user:${user.id}`, {
      maxRequests: 10,
      windowMs: 60_000,
    });
    if (!userLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_OPTIONS_RATE_LIMIT",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/options",
          limiter: "user",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    if (!user.email) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_OPTIONS_REJECTED",
        userId: user.id,
        metadata: {
          endpoint: "register/options",
          reason: "missing_email",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "missing_email", message: "El usuario no tiene email asociado." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && profile.active === false) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_OPTIONS_REJECTED",
        userId: user.id,
        userEmail: user.email,
        metadata: {
          endpoint: "register/options",
          reason: "user_inactive",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "user_inactive" }, { status: 403 });
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("passkey_credentials")
      .select("credential_id, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (existingError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_OPTIONS_REJECTED",
        userId: user.id,
        userEmail: user.email,
        metadata: {
          endpoint: "register/options",
          reason: "storage_error",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "storage_error", message: existingError.message },
        { status: 500 }
      );
    }

    const rpID = resolvePasskeyRPID(req);
    const expectedOrigin = resolvePasskeyOrigin(req);

    const existing = ((existingRows || []) as StoredPasskey[])
      .filter((row) => !row.revoked_at)
      .map((row) => ({ id: row.credential_id }));

    const options = await generateRegistrationOptions({
      rpName: getPasskeyRPName(),
      rpID,
      userName: user.email,
      userDisplayName:
        (user.user_metadata?.full_name as string | undefined) || user.email,
      userID: toUserIDBuffer(user.id),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: existing,
    });

    const response = NextResponse.json({ options });
    setChallengeCookie(response, PASSKEY_REGISTER_COOKIE, {
      challenge: options.challenge,
      userId: user.id,
      email: user.email,
      rpID,
      origin: expectedOrigin,
    });

    await logPasskeyAuditEvent({
      supabaseAdmin,
      action: "PASSKEY_REGISTER_OPTIONS_ISSUED",
      userId: user.id,
      userEmail: user.email,
      metadata: {
        endpoint: "register/options",
        existing_credentials: existing.length,
        ip: reqContext.ip,
        user_agent: reqContext.userAgent,
      },
    });

    return response;
  } catch (error) {
    console.error("[passkeys/register/options]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
