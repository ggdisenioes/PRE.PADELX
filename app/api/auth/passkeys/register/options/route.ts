import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import {
  PASSKEY_REGISTER_COOKIE,
  createSupabaseAdminClient,
  createSupabaseUserClient,
  extractBearerToken,
  getPasskeyContext,
  getPasskeyRPName,
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
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const context = getPasskeyContext();
    const supabaseUser = createSupabaseUserClient(context, token);
    const supabaseAdmin = createSupabaseAdminClient(context);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "invalid_session" }, { status: 401 });
    }

    if (!user.email) {
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
      return NextResponse.json({ error: "user_inactive" }, { status: 403 });
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("passkey_credentials")
      .select("credential_id, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (existingError) {
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

    return response;
  } catch (error) {
    console.error("[passkeys/register/options]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
