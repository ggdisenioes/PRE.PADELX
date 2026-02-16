// supabase/functions/send-admin-invitation/index.ts
// Envía invitación por email al futuro admin de un tenant
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = env("SUPABASE_ANON_KEY");
    const resendApiKey = env("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? "noreply@padelx.es";

    // 1. Extraer JWT del caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // 2. Crear client con el JWT del caller (para auth.uid() en RPC)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // 3. Verificar super_admin via service client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    // 4. Parsear body
    const { tenant_id, tenant_slug, email, first_name, last_name } =
      await req.json();
    if (!tenant_id || !tenant_slug || !email) {
      return jsonResponse({ error: "missing_fields: tenant_id, tenant_slug, email required" }, 400);
    }

    // 5. Crear/refrescar invitación via RPC (con el user client para auth.uid())
    const { data: invite, error: rpcError } = await userClient.rpc(
      "create_tenant_invitation",
      {
        p_tenant_id: tenant_id,
        p_email: email,
        p_first_name: first_name ?? null,
        p_last_name: last_name ?? null,
      }
    );

    if (rpcError) throw new Error(rpcError.message);

    // 6. Construir URL de invitación
    const inviteUrl = `https://${tenant_slug}.padelx.es/accept-invitation?token=${invite.token}`;

    // 7. Construir email HTML
    const clubName = invite.tenant_name;
    const firstName = first_name ?? "";
    const expiresAt = new Date(invite.expires_at).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = buildInvitationEmail({
      inviteUrl,
      clubName,
      firstName,
      expiresAt,
      email,
    });

    // 8. Enviar via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `PadelX <${emailFrom}>`,
        to: email,
        subject: `Invitación para administrar ${clubName} en PadelX`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const txt = await resendRes.text();
      throw new Error(`Resend error ${resendRes.status}: ${txt}`);
    }

    // 9. Encolar WhatsApp si el tenant tiene teléfono (admin_phone)
    try {
      const { data: tenantData } = await adminClient
        .from("tenants")
        .select("phone")
        .eq("id", tenant_id)
        .single();

      if (tenantData?.phone) {
        await adminClient.from("whatsapp_queue").insert({
          tenant_id,
          to_phone: tenantData.phone,
          template_name: "admin_invitation",
          template_params: JSON.stringify([
            first_name ?? "Administrador",
            invite.tenant_name,
            inviteUrl,
          ]),
        });
      }
    } catch (waErr) {
      // No bloquear si falla el encolado de WhatsApp
      console.warn("WhatsApp enqueue failed (non-blocking):", waErr);
    }

    return jsonResponse({
      ok: true,
      invitation_id: invite.invitation_id,
      email,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-admin-invitation error:", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildInvitationEmail(opts: {
  inviteUrl: string;
  clubName: string;
  firstName: string;
  expiresAt: string;
  email: string;
}): string {
  const { inviteUrl, clubName, firstName, expiresAt, email } = opts;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invitación PadelX</title>
  <style>
    body { margin:0; padding:0; background:#f6f7fb; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .wrap { width:100%; padding:24px 12px; }
    .card { max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,.08); }
    .header { background:#05070b; padding:18px 20px; }
    .brand { color:#fff; font-weight:900; letter-spacing:.26em; font-size:12px; }
    .sub { color:#00b4ff; font-weight:700; letter-spacing:.32em; font-size:10px; margin-top:6px; text-transform:uppercase; }
    .content { padding:28px 24px; color:#0f172a; }
    .h1 { font-size:22px; font-weight:900; margin:0 0 12px; }
    .p { font-size:14px; line-height:1.6; margin:0 0 16px; color:#334155; }
    .cta { display:inline-block; background:#16a34a; color:#ffffff !important; text-decoration:none; font-weight:900; padding:14px 24px; border-radius:12px; font-size:15px; margin:8px 0 16px; }
    .warn { background:#fefce8; border:1px solid #fde047; border-radius:8px; padding:12px 16px; font-size:13px; color:#713f12; margin:16px 0; }
    .muted { color:#64748b; font-size:12px; }
    .footer { padding:16px 20px; background:#0b1220; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="brand">PADELX</div>
        <div class="sub">PADEL MANAGER</div>
      </div>
      <div class="content">
        <div class="h1">Bienvenido/a a PadelX${firstName ? `, ${firstName}` : ""}!</div>
        <p class="p">
          Has sido invitado/a para administrar <strong>${clubName}</strong> en PadelX.
          Haz clic en el botón de abajo para aceptar la invitación y crear tu contraseña.
        </p>
        <a class="cta" href="${inviteUrl}">Aceptar invitación y crear contraseña</a>
        <div class="warn">
          Este enlace es válido hasta el <strong>${expiresAt}</strong> (72 horas).
          Si no solicitaste esta invitación, puedes ignorar este email.
        </div>
        <p class="p muted">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <a href="${inviteUrl}" style="color:#2563eb; word-break:break-all;">${inviteUrl}</a>
        </p>
        <p class="p muted">Este email fue enviado a ${email}.</p>
      </div>
      <div class="footer">
        PadelX &middot; Si crees que recibiste este email por error, ignóralo.
      </div>
    </div>
  </div>
</body>
</html>`;
}
