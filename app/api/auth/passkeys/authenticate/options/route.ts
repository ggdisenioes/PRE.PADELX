import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import {
  applyPasskeyRateLimit,
  PASSKEY_AUTH_COOKIE,
  createSupabaseAdminClient,
  getPasskeyRequestContext,
  getPasskeyContext,
  logPasskeyAuditEvent,
  resolvePasskeyOrigin,
  resolvePasskeyRPID,
  setChallengeCookie,
} from "@/lib/passkeys";

type ProfileRow = {
  id: string;
  email: string | null;
  active: boolean | null;
};

type StoredPasskey = {
  credential_id: string;
  transports: string[] | null;
};

type OptionsBody = {
  email?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as OptionsBody;
    const normalizedEmail = body.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: "missing_email" }, { status: 400 });
    }

    const context = getPasskeyContext();
    const supabaseAdmin = createSupabaseAdminClient(context);
    const reqContext = getPasskeyRequestContext(req);

    const ipLimit = applyPasskeyRateLimit(
      `passkeys:auth:options:ip:${reqContext.ip}`,
      { maxRequests: 30, windowMs: 60_000 }
    );
    if (!ipLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_RATE_LIMIT",
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
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

    const emailLimit = applyPasskeyRateLimit(
      `passkeys:auth:options:email:${normalizedEmail}`,
      { maxRequests: 8, windowMs: 60_000 }
    );
    if (!emailLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_RATE_LIMIT",
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
          limiter: "email",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,email,active")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (profileError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_REJECTED",
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
          reason: "profile_lookup_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "profile_lookup_failed", message: profileError.message },
        { status: 500 }
      );
    }

    const profile = profileRow as ProfileRow | null;

    if (!profile || !profile.id || profile.active === false) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_REJECTED",
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
          reason: "passkey_unavailable",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "passkey_unavailable" }, { status: 404 });
    }

    const { data: passkeyRows, error: passkeyError } = await supabaseAdmin
      .from("passkey_credentials")
      .select("credential_id, transports")
      .eq("user_id", profile.id)
      .is("revoked_at", null);

    if (passkeyError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_REJECTED",
        userId: profile.id,
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
          reason: "passkey_lookup_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json(
        { error: "passkey_lookup_failed", message: passkeyError.message },
        { status: 500 }
      );
    }

    const passkeys = (passkeyRows || []) as StoredPasskey[];
    if (!passkeys.length) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_OPTIONS_REJECTED",
        userId: profile.id,
        userEmail: normalizedEmail,
        metadata: {
          endpoint: "authenticate/options",
          reason: "no_passkeys_registered",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "no_passkeys_registered" }, { status: 404 });
    }

    const rpID = resolvePasskeyRPID(req);
    const expectedOrigin = resolvePasskeyOrigin(req);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: passkeys.map((row) => {
        const transports = Array.isArray(row.transports)
          ? row.transports.filter(
              (transport): transport is AuthenticatorTransportFuture =>
                typeof transport === "string"
            )
          : undefined;

        return {
          id: row.credential_id,
          transports,
        };
      }),
    });

    const response = NextResponse.json({ options });
    setChallengeCookie(response, PASSKEY_AUTH_COOKIE, {
      challenge: options.challenge,
      userId: profile.id,
      email: normalizedEmail,
      rpID,
      origin: expectedOrigin,
    });

    await logPasskeyAuditEvent({
      supabaseAdmin,
      action: "PASSKEY_AUTH_OPTIONS_ISSUED",
      userId: profile.id,
      userEmail: normalizedEmail,
      metadata: {
        endpoint: "authenticate/options",
        credentials_available: passkeys.length,
        ip: reqContext.ip,
        user_agent: reqContext.userAgent,
      },
    });

    return response;
  } catch (error) {
    console.error("[passkeys/authenticate/options]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
