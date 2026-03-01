import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  applyPasskeyRateLimit,
  PASSKEY_AUTH_COOKIE,
  clearChallengeCookie,
  createSupabaseAdminClient,
  getPasskeyRequestContext,
  getPasskeyContext,
  logPasskeyAuditEvent,
  readChallengeCookie,
} from "@/lib/passkeys";

type VerifyBody = {
  email?: string;
  credential?: AuthenticationResponseJSON;
};

type StoredPasskey = {
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  user_id: string;
};

type ProfileRow = {
  email: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const context = getPasskeyContext();
    const supabaseAdmin = createSupabaseAdminClient(context);
    const reqContext = getPasskeyRequestContext(req);

    const ipLimit = applyPasskeyRateLimit(`passkeys:auth:verify:ip:${reqContext.ip}`, {
      maxRequests: 20,
      windowMs: 60_000,
    });
    if (!ipLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_RATE_LIMIT",
        metadata: {
          endpoint: "authenticate/verify",
          limiter: "ip",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const challenge = readChallengeCookie(req, PASSKEY_AUTH_COOKIE);
    if (!challenge) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        metadata: {
          endpoint: "authenticate/verify",
          reason: "challenge_expired",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "challenge_expired" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as VerifyBody;
    const credential = body.credential;
    const normalizedEmail = body.email?.trim().toLowerCase();

    const userLimit = applyPasskeyRateLimit(
      `passkeys:auth:verify:user:${challenge.userId}`,
      { maxRequests: 10, windowMs: 60_000 }
    );
    if (!userLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_RATE_LIMIT",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          limiter: "user",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    if (!credential) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "missing_credential",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "missing_credential" }, { status: 400 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    if (challenge.email && normalizedEmail && challenge.email !== normalizedEmail) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "email_mismatch",
          attempted_email: normalizedEmail,
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "email_mismatch" }, { status: 403 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const { data: row, error: rowError } = await supabaseAdmin
      .from("passkey_credentials")
      .select("credential_id,public_key,counter,transports,user_id")
      .eq("credential_id", credential.id)
      .eq("user_id", challenge.userId)
      .is("revoked_at", null)
      .maybeSingle();

    if (rowError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "credential_lookup_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "credential_lookup_failed", message: rowError.message },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const stored = row as StoredPasskey | null;
    if (!stored) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "credential_not_found",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "credential_not_found" }, { status: 404 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const transports = Array.isArray(stored.transports)
      ? stored.transports.filter(
          (transport): transport is AuthenticatorTransportFuture =>
            typeof transport === "string"
        )
      : undefined;

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpID,
      credential: {
        id: stored.credential_id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: Number(stored.counter || 0),
        transports,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "verification_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "verification_failed" }, { status: 401 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const newCounter = verification.authenticationInfo.newCounter;

    await supabaseAdmin
      .from("passkey_credentials")
      .update({
        counter: newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("credential_id", stored.credential_id)
      .eq("user_id", stored.user_id);

    let email = challenge.email || normalizedEmail || null;

    if (!email) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", challenge.userId)
        .maybeSingle();

      email = (profile as ProfileRow | null)?.email || null;
    }

    if (!email) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: challenge.email || normalizedEmail || null,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "email_not_found_for_user",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "email_not_found_for_user" },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const redirectTo = `${challenge.origin.replace(/\/+$/, "")}/login`;
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: email,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "magiclink_generation_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "magiclink_generation_failed", message: linkError.message },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const otpToken = linkData?.properties?.email_otp;

    if (!otpToken) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_AUTH_VERIFY_FAILED",
        userId: challenge.userId,
        userEmail: email,
        metadata: {
          endpoint: "authenticate/verify",
          reason: "otp_not_available",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "otp_not_available" }, { status: 500 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      email,
      otpToken,
      otpType: "magiclink",
    });

    await logPasskeyAuditEvent({
      supabaseAdmin,
      action: "PASSKEY_AUTH_VERIFY_SUCCESS",
      userId: challenge.userId,
      userEmail: email,
      metadata: {
        endpoint: "authenticate/verify",
        ip: reqContext.ip,
        user_agent: reqContext.userAgent,
      },
    });

    clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
    return response;
  } catch (error) {
    console.error("[passkeys/authenticate/verify]", error);
    const response = NextResponse.json({ error: "internal_error" }, { status: 500 });
    clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
    return response;
  }
}
