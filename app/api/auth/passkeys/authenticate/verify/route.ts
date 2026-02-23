import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  PASSKEY_AUTH_COOKIE,
  clearChallengeCookie,
  createSupabaseAdminClient,
  getPasskeyContext,
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
    const challenge = readChallengeCookie(req, PASSKEY_AUTH_COOKIE);
    if (!challenge) {
      return NextResponse.json({ error: "challenge_expired" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as VerifyBody;
    const credential = body.credential;
    const normalizedEmail = body.email?.trim().toLowerCase();

    if (!credential) {
      const response = NextResponse.json({ error: "missing_credential" }, { status: 400 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    if (challenge.email && normalizedEmail && challenge.email !== normalizedEmail) {
      const response = NextResponse.json({ error: "email_mismatch" }, { status: 403 });
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const context = getPasskeyContext();
    const supabaseAdmin = createSupabaseAdminClient(context);

    let credentialQuery = supabaseAdmin
      .from("passkey_credentials")
      .select("credential_id,public_key,counter,transports,user_id")
      .eq("credential_id", credential.id)
      .is("revoked_at", null);

    if (challenge.userId) {
      credentialQuery = credentialQuery.eq("user_id", challenge.userId);
    }

    const { data: row, error: rowError } = await credentialQuery.maybeSingle();

    if (rowError) {
      const response = NextResponse.json(
        { error: "credential_lookup_failed", message: rowError.message },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const stored = row as StoredPasskey | null;
    if (!stored) {
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
        .eq("id", stored.user_id)
        .maybeSingle();

      email = (profile as ProfileRow | null)?.email || null;
    }

    if (!email) {
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
      const response = NextResponse.json(
        { error: "magiclink_generation_failed", message: linkError.message },
        { status: 500 }
      );
      clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
      return response;
    }

    const otpToken = linkData?.properties?.email_otp;

    if (!otpToken) {
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

    clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
    return response;
  } catch (error) {
    console.error("[passkeys/authenticate/verify]", error);
    const response = NextResponse.json({ error: "internal_error" }, { status: 500 });
    clearChallengeCookie(response, PASSKEY_AUTH_COOKIE);
    return response;
  }
}
