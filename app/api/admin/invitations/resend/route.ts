import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sendUserInvitationEmail } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INVITE_NETWORK_TIMEOUT_MS = Number(process.env.INVITE_NETWORK_TIMEOUT_MS || "25000");

const resendSchema = z
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
};

function getHost(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || "";
  return host.split(",")[0].trim().toLowerCase();
}

function getOrigin(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const host = getHost(req).split(":")[0];
  const proto = (req.headers.get("x-forwarded-proto") || "https")
    .split(",")[0]
    .trim();

  if (!host) return "https://twinco.padelx.es";
  return `${proto}://${host}`;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), INVITE_NETWORK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit(`resend-invitation:${ip}`, {
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
    const parsed = resendSchema.safeParse(body);
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
    const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
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
        { error: "Solo admins activos pueden reenviar invitaciones." },
        { status: 403 }
      );
    }

    const { user_id, email } = parsed.data;

    const baseQuery = supabaseAdmin
      .from("profiles")
      .select("id, email, role, first_name, last_name, active, deleted_at")
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
        { error: "No se puede reenviar invitación a un administrador." },
        { status: 409 }
      );
    }

    if (target.active === false || target.deleted_at) {
      return NextResponse.json(
        { error: "La invitación fue cancelada o el usuario está deshabilitado." },
        { status: 409 }
      );
    }

    const authLookup = await withTimeout(
      supabaseAdmin.auth.admin.getUserById(target.id),
      "get-user-by-id"
    ).catch((err) => {
      console.error("[resend-invitation] getUserById error", err);
      return null;
    });

    if (!authLookup?.data?.user) {
      return NextResponse.json(
        { error: "No se encontró la cuenta de autenticación para esta invitación." },
        { status: 404 }
      );
    }

    if (authLookup.data.user.last_sign_in_at) {
      return NextResponse.json(
        { error: "El usuario ya activó su cuenta. No corresponde reenviar invitación." },
        { status: 409 }
      );
    }

    const safeEmail = String(target.email || "").trim().toLowerCase();
    if (!safeEmail) {
      return NextResponse.json(
        { error: "La invitación no tiene email válido." },
        { status: 409 }
      );
    }

    const origin = getOrigin(req);
    const redirectTo = `${origin}/reset-password`;

    const linkResult = await withTimeout(
      supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: safeEmail,
        options: { redirectTo },
      }),
      "generate-link"
    ).catch((err) => {
      console.error("[resend-invitation] generate-link error", err);
      return null;
    });

    const actionLink = linkResult?.data?.properties?.action_link || null;

    const { data: tenantData } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", requesterProfile.tenant_id)
      .maybeSingle();

    const tenantName = String(tenantData?.name || "").trim();
    const host = getHost(req);
    const isTwincoTenant =
      host.includes("twinco.padelx.es") || tenantName.toLowerCase() === "twinco";
    const clubName = isTwincoTenant ? "Twinco Padel Manager" : tenantName || "PadelX";

    const invitedName = [target.first_name, target.last_name].filter(Boolean).join(" ").trim();

    let sent = false;
    if (actionLink) {
      sent = await withTimeout(
        sendUserInvitationEmail({
          to: safeEmail,
          inviteUrl: actionLink,
          clubName,
          fromName: clubName,
          invitedName: invitedName || undefined,
          invitedRole: targetRole || "user",
        }),
        "send-invitation-email"
      ).catch((mailErr) => {
        console.error("[resend-invitation] invitation email error", mailErr);
        return false;
      });
    }

    let deliveryStatus: "custom_invitation" | "supabase_default" | "failed" =
      sent ? "custom_invitation" : "failed";
    let delivered = sent;
    if (!delivered) {
      const fallback = await withTimeout(
        supabasePublic.auth.resetPasswordForEmail(safeEmail, { redirectTo }),
        "fallback-reset-email"
      ).catch((fallbackErr) => {
        console.error("[resend-invitation] fallback reset email error", fallbackErr);
        return null;
      });

      delivered = Boolean(fallback && !fallback.error);
      if (delivered) deliveryStatus = "supabase_default";
    }

    const requesterEmail = user.email || null;
    try {
      await supabaseAdmin.from("action_logs").insert({
        action: "ADMIN_RESEND_INVITATION",
        entity: "auth",
        entity_id: target.id,
        user_email: requesterEmail,
        tenant_id: requesterProfile.tenant_id,
        metadata: {
          invited_email: safeEmail,
          invited_role: targetRole || "user",
          invited_name: invitedName || null,
          delivery_status: deliveryStatus,
        },
      });
    } catch (logErr) {
      console.warn("[resend-invitation] non-blocking log insert error", logErr);
    }

    if (!delivered) {
      return NextResponse.json(
        { error: "No se pudo reenviar la invitación. Reintentá en unos segundos." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      resent: true,
      email_template: deliveryStatus,
      email: safeEmail,
      user_id: target.id,
    });
  } catch (error) {
    console.error("[resend-invitation] unexpected error", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
