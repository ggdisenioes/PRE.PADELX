import { NextRequest, NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  applyPasskeyRateLimit,
  PASSKEY_REGISTER_COOKIE,
  clearChallengeCookie,
  createSupabaseAdminClient,
  createSupabaseUserClient,
  extractBearerToken,
  getPasskeyRequestContext,
  getPasskeyContext,
  logPasskeyAuditEvent,
  readChallengeCookie,
} from "@/lib/passkeys";

type ExistingCredential = {
  user_id: string;
};

type VerifyBody = {
  credential?: RegistrationResponseJSON;
  deviceName?: string;
};

export async function POST(req: NextRequest) {
  try {
    const reqContext = getPasskeyRequestContext(req);
    const context = getPasskeyContext();
    const supabaseAdmin = createSupabaseAdminClient(context);

    const ipLimit = applyPasskeyRateLimit(`passkeys:register:verify:ip:${reqContext.ip}`, {
      maxRequests: 20,
      windowMs: 60_000,
    });
    if (!ipLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_RATE_LIMIT",
        metadata: {
          endpoint: "register/verify",
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

    const userLimit = applyPasskeyRateLimit(`passkeys:register:verify:user:${user.id}`, {
      maxRequests: 10,
      windowMs: 60_000,
    });
    if (!userLimit.success) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_RATE_LIMIT",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
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

    const challenge = readChallengeCookie(req, PASSKEY_REGISTER_COOKIE);
    if (!challenge) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "challenge_expired",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "challenge_expired" }, { status: 400 });
    }

    if (challenge.userId !== user.id) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "challenge_user_mismatch",
          challenge_user_id: challenge.userId,
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      return NextResponse.json({ error: "challenge_user_mismatch" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as VerifyBody;
    const credential = body.credential;
    if (!credential) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "missing_credential",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "missing_credential" }, { status: 400 });
      clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
      return response;
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "verification_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json({ error: "verification_failed" }, { status: 401 });
      clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
      return response;
    }

    const registrationInfo = verification.registrationInfo;
    const credentialId = registrationInfo.credential.id;
    const publicKeyBase64Url = isoBase64URL.fromBuffer(
      registrationInfo.credential.publicKey
    );
    const counter = registrationInfo.credential.counter;

    const transports = Array.isArray(credential.response.transports)
      ? credential.response.transports.filter(
          (transport): transport is AuthenticatorTransportFuture =>
            typeof transport === "string"
        )
      : [];

    const sanitizedDeviceName =
      typeof body.deviceName === "string" && body.deviceName.trim().length > 0
        ? body.deviceName.trim().slice(0, 120)
        : null;

    const { data: existingByCredential, error: existingError } = await supabaseAdmin
      .from("passkey_credentials")
      .select("user_id")
      .eq("credential_id", credentialId)
      .maybeSingle();

    if (existingError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "storage_error",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "storage_error", message: existingError.message },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
      return response;
    }

    const existing = existingByCredential as ExistingCredential | null;

    if (existing && existing.user_id !== user.id) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "credential_already_bound",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
      const response = NextResponse.json(
        { error: "credential_already_bound" },
        { status: 409 }
      );
      clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
      return response;
    }

    const payload = {
      user_id: user.id,
      credential_id: credentialId,
      public_key: publicKeyBase64Url,
      counter,
      transports,
      device_name: sanitizedDeviceName,
      aaguid: registrationInfo.aaguid,
      revoked_at: null,
      last_used_at: new Date().toISOString(),
    };

    const mutation = existing
      ? supabaseAdmin
          .from("passkey_credentials")
          .update(payload)
          .eq("credential_id", credentialId)
          .eq("user_id", user.id)
      : supabaseAdmin.from("passkey_credentials").insert(payload);

    const { error: saveError } = await mutation;

    const response = saveError
      ? NextResponse.json(
          { error: "save_failed", message: saveError.message },
          { status: 500 }
        )
      : NextResponse.json({ success: true });

    if (saveError) {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_FAILED",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          reason: "save_failed",
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
    } else {
      await logPasskeyAuditEvent({
        supabaseAdmin,
        action: "PASSKEY_REGISTER_VERIFY_SUCCESS",
        userId: user.id,
        userEmail: user.email || null,
        metadata: {
          endpoint: "register/verify",
          device_name: sanitizedDeviceName,
          ip: reqContext.ip,
          user_agent: reqContext.userAgent,
        },
      });
    }

    clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
    return response;
  } catch (error) {
    console.error("[passkeys/register/verify]", error);
    const response = NextResponse.json({ error: "internal_error" }, { status: 500 });
    clearChallengeCookie(response, PASSKEY_REGISTER_COOKIE);
    return response;
  }
}

export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
