import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sendAdminPendingRegistrationEmail } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  first_name: z.string().trim().max(100).optional().nullable(),
  last_name: z.string().trim().max(100).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
});

type PendingProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  approval_status: string | null;
  role: string | null;
  tenant_id: string | null;
  created_at: string | null;
  active: boolean | null;
  deleted_at: string | null;
};

type AdminRecipient = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

function getOrigin(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost || req.headers.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = (req.headers.get("x-forwarded-proto") || "https")
    .split(",")[0]
    .trim();

  if (!host) return "https://twinco.padelx.es";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit(`register-admin-notify:${ip}`, {
      maxRequests: 12,
      windowMs: 60_000,
    });
    if (!success) {
      return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado (env faltante)." },
        { status: 500 }
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos." },
        { status: 400 }
      );
    }

    const { tenant_id, email, first_name, last_name, user_id } = parsed.data;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let profileQuery = supabaseAdmin
      .from("profiles")
      .select(
        "id, email, first_name, last_name, approval_status, role, tenant_id, created_at, active, deleted_at"
      )
      .eq("tenant_id", tenant_id)
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (user_id) {
      profileQuery = profileQuery.eq("id", user_id);
    }

    const { data: profileRows, error: profileErr } = await profileQuery;
    if (profileErr) {
      console.error("[register/admin-notify] profile lookup error", profileErr);
      return NextResponse.json({ error: "No se pudo preparar la notificación." }, { status: 500 });
    }

    const pendingProfile = (profileRows?.[0] || null) as PendingProfile | null;
    if (!pendingProfile) {
      return NextResponse.json(
        { success: true, sent: 0, skipped: true, reason: "profile_not_found" },
        { status: 202 }
      );
    }

    const status = String(pendingProfile.approval_status || "").toLowerCase();
    const isPending = status === "pending" || pendingProfile.active === false;
    if (!isPending || pendingProfile.deleted_at) {
      return NextResponse.json(
        { success: true, sent: 0, skipped: true, reason: "not_pending" },
        { status: 202 }
      );
    }

    const thresholdIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingLog } = await supabaseAdmin
      .from("action_logs")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("action", "USER_REGISTRATION_PENDING_NOTIFICATION")
      .eq("user_id", pendingProfile.id)
      .gte("created_at", thresholdIso)
      .limit(1);

    if (Array.isArray(existingLog) && existingLog.length > 0) {
      return NextResponse.json(
        { success: true, sent: 0, skipped: true, reason: "already_notified_recently" },
        { status: 200 }
      );
    }

    const { data: tenantData } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .maybeSingle();

    const { data: adminRows, error: adminsErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("tenant_id", tenant_id)
      .eq("role", "admin")
      .eq("active", true)
      .is("deleted_at", null)
      .not("email", "is", null);

    if (adminsErr) {
      console.error("[register/admin-notify] admin recipients lookup error", adminsErr);
      return NextResponse.json({ error: "No se pudieron obtener admins." }, { status: 500 });
    }

    const recipients = ((adminRows || []) as AdminRecipient[]).filter((row) => !!row.email);
    if (recipients.length === 0) {
      return NextResponse.json(
        { success: true, sent: 0, skipped: true, reason: "no_admin_recipients" },
        { status: 200 }
      );
    }

    const clubName = String(tenantData?.name || "PadelX").trim() || "PadelX";
    const origin = getOrigin(req);
    const manageUrl = `${origin}/admin/users?tab=manage`;
    const registrantName =
      [pendingProfile.first_name || first_name, pendingProfile.last_name || last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Sin nombre";
    const registrantEmail = String(pendingProfile.email || email).trim().toLowerCase();

    let sent = 0;
    for (const admin of recipients) {
      const adminName = [admin.first_name, admin.last_name].filter(Boolean).join(" ").trim() || "Admin";
      const ok = await sendAdminPendingRegistrationEmail({
        to: String(admin.email).trim().toLowerCase(),
        adminName,
        clubName,
        registrantName,
        registrantEmail,
        manageUrl,
      });
      if (ok) sent += 1;
    }

    await supabaseAdmin
      .from("action_logs")
      .insert({
        user_id: pendingProfile.id,
        user_email: registrantEmail,
        action: "USER_REGISTRATION_PENDING_NOTIFICATION",
        entity: "profiles",
        entity_id: null,
        tenant_id,
        metadata: {
          registered_user_id: pendingProfile.id,
          sent_to_admins: sent,
          total_admins: recipients.length,
        },
      })
      .catch((err) => {
        console.warn("[register/admin-notify] action log warning", err);
      });

    return NextResponse.json({
      success: true,
      sent,
      total_admins: recipients.length,
    });
  } catch (error) {
    console.error("[register/admin-notify] error", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
