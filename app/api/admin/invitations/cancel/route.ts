import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const cancelSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().trim().email().transform((v) => v.toLowerCase()).optional(),
  })
  .refine((v) => Boolean(v.user_id || v.email), {
    message: "Debe indicar user_id o email.",
  });

type RequesterProfile = {
  role: string | null;
  active: boolean | null;
  tenant_id: string | null;
};

type TargetProfile = {
  id: string;
  email: string | null;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  active: boolean | null;
  deleted_at: string | null;
  approval_status: string | null;
};

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit(`cancel-invitation:${ip}`, {
      maxRequests: 15,
      windowMs: 60_000,
    });
    if (!success) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intentá en un minuto." },
        { status: 429 }
      );
    }

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos." },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
    const accessToken = match[1].trim();

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
    }

    const { data: requester, error: requesterErr } = await supabaseAdmin
      .from("profiles")
      .select("role, active, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (requesterErr || !requester) {
      return NextResponse.json({ error: "Permisos insuficientes." }, { status: 403 });
    }

    const requesterProfile = requester as RequesterProfile;
    if (
      requesterProfile.active !== true ||
      requesterProfile.role !== "admin" ||
      !requesterProfile.tenant_id
    ) {
      return NextResponse.json(
        { error: "Solo admins activos pueden cancelar invitaciones." },
        { status: 403 }
      );
    }

    const { user_id, email } = parsed.data;

    const baseQuery = supabaseAdmin
      .from("profiles")
      .select("id, email, role, first_name, last_name, active, deleted_at, approval_status")
      .eq("tenant_id", requesterProfile.tenant_id);

    const profileRes = user_id
      ? await baseQuery.eq("id", user_id).maybeSingle()
      : await baseQuery.ilike("email", String(email || "")).maybeSingle();

    if (profileRes.error || !profileRes.data) {
      return NextResponse.json({ error: "Invitación no encontrada." }, { status: 404 });
    }

    const target = profileRes.data as TargetProfile;
    const targetRole = String(target.role || "").toLowerCase();
    if (targetRole === "admin") {
      return NextResponse.json(
        { error: "No se puede cancelar una invitación de administrador." },
        { status: 409 }
      );
    }

    if (target.deleted_at || target.active === false) {
      return NextResponse.json({
        ok: true,
        cancelled: false,
        already_cancelled: true,
        user_id: target.id,
        email: target.email,
      });
    }

    const authLookup = await supabaseAdmin.auth.admin.getUserById(target.id);
    if (authLookup.data?.user?.last_sign_in_at) {
      return NextResponse.json(
        { error: "El usuario ya activó su cuenta. No corresponde cancelar invitación." },
        { status: 409 }
      );
    }

    const { error: profileUpdateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        active: false,
        approval_status: "rejected",
        deleted_at: null,
      })
      .eq("id", target.id);

    if (profileUpdateErr) {
      return NextResponse.json(
        { error: "No se pudo cancelar la invitación." },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("players")
      .update({ user_id: null })
      .eq("tenant_id", requesterProfile.tenant_id)
      .eq("user_id", target.id);

    const invitedName = [target.first_name, target.last_name].filter(Boolean).join(" ").trim();
    const requesterEmail = user.email || null;
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "ADMIN_CANCEL_INVITATION",
        entity: "auth",
        entity_id: target.id,
        user_email: requesterEmail,
        tenant_id: requesterProfile.tenant_id,
        metadata: {
          invited_email: target.email || null,
          invited_role: targetRole || "user",
          invited_name: invitedName || null,
        },
      });
    } catch (logErr) {
      console.warn("[cancel-invitation] non-blocking log insert error", logErr);
    }

    return NextResponse.json({
      ok: true,
      cancelled: true,
      user_id: target.id,
      email: target.email,
    });
  } catch (error) {
    console.error("[cancel-invitation] unexpected error", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
