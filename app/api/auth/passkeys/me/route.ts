import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseUserClient,
  extractBearerToken,
  getPasskeyContext,
} from "@/lib/passkeys";

type DeleteBody = {
  id?: number;
};

export async function GET(req: NextRequest) {
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

    const { data, error } = await supabaseAdmin
      .from("passkey_credentials")
      .select("id, device_name, created_at, last_used_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "storage_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ credentials: data || [] });
  } catch (error) {
    console.error("[passkeys/me:get]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

    const body = (await req.json().catch(() => ({}))) as DeleteBody;
    if (!body.id || !Number.isInteger(body.id)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("passkey_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (error) {
      return NextResponse.json(
        { error: "revoke_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[passkeys/me:delete]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
