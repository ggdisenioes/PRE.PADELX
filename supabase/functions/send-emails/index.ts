// supabase/functions/send-emails/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_VERSION = "2026-03-01-02";
const DEBUG_LOGS = (Deno.env.get("DEBUG_SEND_EMAILS") || "").toLowerCase() === "true";
const DEFAULT_FROM = Deno.env.get("EMAIL_FROM") || "PadelX <noreply@padelx.es>";
const EMAIL_REPLY_TO = (Deno.env.get("EMAIL_REPLY_TO") || "").trim();
const EMAIL_UNSUBSCRIBE_MAILTO = (Deno.env.get("EMAIL_UNSUBSCRIBE_MAILTO") || "").trim();

type OutboxRow = {
  id: number;
  tenant_id: string;
  match_id: number;
  to_email: string;
  template: "match_created" | "match_reminder_24h";
  payload: any;
};

function env(name: string) {
  const v = Deno.env.get(name);
  if (v) return v;

  // Diagnóstico: a veces se pasa el valor del secret como "name" (ej: re_xxx o JWT)
  const looksLikeResendKey = /^re_[A-Za-z0-9_-]{10,}$/.test(name);
  const looksLikeJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(name);

  if (looksLikeResendKey) {
    throw new Error(
      `Falta secret/env: RESEND_API_KEY (parece que se está usando el valor del API key como nombre del secret). Version: ${FUNCTION_VERSION}`
    );
  }

  if (looksLikeJwt) {
    throw new Error(
      `Falta secret/env: SUPABASE_SERVICE_ROLE_KEY (parece que se está usando un JWT como nombre del secret). Version: ${FUNCTION_VERSION}`
    );
  }

  throw new Error(`Falta secret/env: ${name}. Version: ${FUNCTION_VERSION}`);
}

function formatDateTimeES(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBaseDomain(appUrl: string): string | null {
  try {
    const host = new URL(appUrl).hostname.toLowerCase();
    const parts = host.split(".");
    if (parts.length < 2) return null;
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  } catch {
    return null;
  }
}

function normalizeSlug(value: string | null | undefined): string | null {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  return slug;
}

function extractFromAddress(value: string): string | null {
  const inBrackets = value.match(/<([^<>]+)>/)?.[1]?.trim();
  if (inBrackets && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inBrackets)) {
    return inBrackets;
  }
  const plain = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(plain)) {
    return plain;
  }
  return null;
}

function sanitizeHeaderPart(value: string): string {
  return value.replace(/[\r\n<>"]/g, " ").replace(/\s+/g, " ").trim();
}

function isValidEmail(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function buildFromHeader(displayName?: string | null): string {
  const baseAddress = extractFromAddress(DEFAULT_FROM);
  const safeName = sanitizeHeaderPart(String(displayName || ""));
  if (baseAddress && safeName) {
    return `${safeName} <${baseAddress}>`;
  }
  return DEFAULT_FROM;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildEmailHeaders() {
  const headers: Record<string, string> = {
    "X-Auto-Response-Suppress": "All",
  };

  const unsubscribeTargets: string[] = [];
  if (isValidEmail(EMAIL_UNSUBSCRIBE_MAILTO)) {
    const subject = encodeURIComponent("Unsubscribe");
    unsubscribeTargets.push(`<mailto:${EMAIL_UNSUBSCRIBE_MAILTO}?subject=${subject}>`);
  }

  if (unsubscribeTargets.length > 0) {
    headers["List-Unsubscribe"] = unsubscribeTargets.join(", ");
  }

  return headers;
}

function baseEmailLayout(opts: {
  title: string;
  preheader: string;
  bodyHtml: string;
}) {
  const { title, preheader, bodyHtml } = opts;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; padding:0; background:#f6f7fb; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .wrap { width:100%; padding:24px 12px; }
    .card { max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,.08); }
    .header { background:#05070b; padding:18px 20px; }
    .brand { color:#fff; font-weight:900; letter-spacing:.26em; font-size:12px; }
    .sub { color:#ccff00; font-weight:700; letter-spacing:.32em; font-size:10px; margin-top:6px; text-transform:uppercase; }
    .content { padding:20px; color:#0f172a; }
    .h1 { font-size:18px; font-weight:900; margin:0 0 8px; }
    .p { font-size:14px; line-height:1.55; margin:0 0 14px; color:#334155; }
    .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:#f1f5f9; color:#0f172a; font-weight:700; font-size:12px; }
    .grid { margin-top:14px; border:1px solid #e6e8ef; border-radius:14px; overflow:hidden; }
    .row { padding:12px 14px; border-top:1px solid #eef2ff; }
    .row:first-child{ border-top:none; }
    .k { color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
    .v { color:#0f172a; font-size:14px; font-weight:800; margin-top:4px; }
    .cta { display:inline-block; background:#16a34a; color:#ffffff !important; text-decoration:none; font-weight:900; padding:12px 16px; border-radius:12px; }
    .muted { color:#64748b; font-size:12px; }
    .footer { padding:16px 20px; background:#0b1220; color:#94a3b8; font-size:12px; }
    .preheader { display:none!important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden; }
  </style>
</head>
<body>
  <span class="preheader">${escapeHtml(preheader)}</span>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="brand">PADELX</div>
        <div class="sub">PÁDEL MANAGER</div>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="footer">
        Este email fue enviado automáticamente por PadelX. Si creés que es un error, contactá con el administrador del club.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function emailMatchCreated(opts: {
  matchWhen: string;
  whereText: string;
  teamsText: string;
  moreInfo?: string;
  ctaUrl?: string | null;
}) {
  const when = formatDateTimeES(opts.matchWhen);
  const title = "Partido creado ✅";
  const preheader = `Tenés un partido programado: ${when}`;

  const bodyHtml = `
    <div class="h1">Partido creado ✅</div>
    <div class="p">Ya quedó agendado tu partido. Te dejamos toda la info:</div>

    <div class="grid">
      <div class="row">
        <div class="k">Cuándo</div>
        <div class="v">${escapeHtml(when)}</div>
      </div>
      <div class="row">
        <div class="k">Con quién</div>
        <div class="v">${escapeHtml(opts.teamsText)}</div>
      </div>
      <div class="row">
        <div class="k">Dónde</div>
        <div class="v">${escapeHtml(opts.whereText || "Por confirmar")}</div>
      </div>
      ${
        opts.moreInfo
          ? `<div class="row">
               <div class="k">Detalles</div>
               <div class="v">${escapeHtml(opts.moreInfo)}</div>
             </div>`
          : ""
      }
    </div>

    ${
      opts.ctaUrl
        ? `<div style="margin-top:16px;">
             <a class="cta" href="${escapeHtml(opts.ctaUrl)}">Ver partido</a>
           </div>`
        : `<div class="p muted" style="margin-top:14px;">
             Este email es informativo. Ingresá desde el enlace habitual de tu club para ver el detalle.
           </div>`
    }

    <div class="p muted" style="margin-top:14px;">
      Tip: si algo cambió (pista/horario), vas a recibir una actualización.
    </div>
  `;

  return {
    subject: `Partido creado · ${when}`,
    html: baseEmailLayout({ title, preheader, bodyHtml }),
  };
}

function emailReminder24h(opts: {
  matchWhen: string;
  whereText: string;
  teamsText: string;
  ctaUrl?: string | null;
}) {
  const when = formatDateTimeES(opts.matchWhen);
  const title = "Recordatorio: tu partido es mañana 🎾";
  const preheader = `Mañana jugás: ${when}`;

  const bodyHtml = `
    <div class="h1">Recordatorio 🎾</div>
    <div class="p">Tu partido es <span class="pill">mañana</span>. No te lo pierdas:</div>

    <div class="grid">
      <div class="row">
        <div class="k">Cuándo</div>
        <div class="v">${escapeHtml(when)}</div>
      </div>
      <div class="row">
        <div class="k">Con quién</div>
        <div class="v">${escapeHtml(opts.teamsText)}</div>
      </div>
      <div class="row">
        <div class="k">Dónde</div>
        <div class="v">${escapeHtml(opts.whereText || "Por confirmar")}</div>
      </div>
    </div>

    ${
      opts.ctaUrl
        ? `<div style="margin-top:16px;">
             <a class="cta" href="${escapeHtml(opts.ctaUrl)}">Ver partido</a>
           </div>`
        : `<div class="p muted" style="margin-top:14px;">
             Este email es informativo. Ingresá desde el enlace habitual de tu club para ver el detalle.
           </div>`
    }

    <div class="p muted" style="margin-top:14px;">
      Recomendación: llegá 10 minutos antes para calentar.
    </div>
  `;

  return {
    subject: `Recordatorio · ${when}`,
    html: baseEmailLayout({ title, preheader, bodyHtml }),
  };
}

async function sendWithResend(
  to: string,
  subject: string,
  html: string,
  options: { fromName?: string | null } = {}
) {
  const apiKey = env("RESEND_API_KEY");
  const from = buildFromHeader(options.fromName);
  const text = htmlToText(html);
  const replyTo = isValidEmail(EMAIL_REPLY_TO) ? EMAIL_REPLY_TO : undefined;
  const headers = buildEmailHeaders();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      headers,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
}

serve(async (req) => {
  if (DEBUG_LOGS) {
    console.log(
      `[send-emails] HIT version=${FUNCTION_VERSION} method=${req.method} ts=${new Date().toISOString()} ua=${req.headers.get("user-agent") || ""}`
    );
  }

  // Seguridad: por defecto SOLO permite llamadas internas desde la DB (cron) con header x-internal-secret.
  // Para pruebas manuales, seteá ALLOW_MANUAL_INVOKE=true en Secrets.
  const expected = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "";
  const provided = req.headers.get("x-internal-secret") || "";
  const allowManual = (Deno.env.get("ALLOW_MANUAL_INVOKE") || "").toLowerCase() === "true";

  if (DEBUG_LOGS) {
    console.log(
      `[send-emails] AUTH expected_set=${Boolean(expected)} allowManual=${allowManual} provided_len=${provided.length}`
    );
  }

  if (expected && !allowManual && provided !== expected) {
    if (DEBUG_LOGS) {
      console.warn(
        `[send-emails] UNAUTHORIZED version=${FUNCTION_VERSION} provided_len=${provided.length}`
      );
    }
    return new Response(JSON.stringify({ ok: false, version: FUNCTION_VERSION, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Aceptamos solo POST para evitar crawlers
  if (req.method !== "POST") {
    if (DEBUG_LOGS) {
      console.warn(`[send-emails] METHOD_NOT_ALLOWED version=${FUNCTION_VERSION} method=${req.method}`);
    }
    return new Response(JSON.stringify({ ok: false, version: FUNCTION_VERSION, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {

    const supabaseUrl = env("SUPABASE_URL");
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = env("APP_PUBLIC_URL");

    const supabase = createClient(supabaseUrl, serviceRole);
    const appBaseDomain = getBaseDomain(appUrl);
    const tenantMetaCache = new Map<string, { slug: string | null; name: string | null }>();

    // 1) Traer pendientes
    const { data, error } = await supabase
      .from("email_outbox")
      .select("id, tenant_id, match_id, to_email, template, payload")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("id", { ascending: true })
      .limit(50);

    if (error) throw error;

    const rows = (data ?? []) as OutboxRow[];
    if (DEBUG_LOGS) {
      console.log(`[send-emails] FETCH pending_rows=${rows.length}`);
    }
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const payload = row.payload ?? {};
        const start_time: string | undefined = payload.start_time;

        // Texto "dónde"
        let whereText =
          [payload.location, payload.court].filter(Boolean).join(" · ") ||
          payload.where ||
          "";

        // Texto "con quién" — siempre buscar nombres reales desde la DB
        let teamsText = "Partido programado";

        if (row.match_id) {
          // Fetch match data with player names from DB
          const { data: match } = await supabase
            .from("matches")
            .select("player_1_a, player_2_a, player_1_b, player_2_b, court, place, court_id")
            .eq("id", row.match_id)
            .single();

          if (match) {
            const playerIds = [match.player_1_a, match.player_2_a, match.player_1_b, match.player_2_b]
              .filter((id: number | null): id is number => id != null);

            if (playerIds.length > 0) {
              const { data: players } = await supabase
                .from("players")
                .select("id, name")
                .in("id", playerIds);

              const getName = (id: number | null) =>
                players?.find((p: any) => p.id === id)?.name || "—";

              const teamA = `${getName(match.player_1_a)} y ${getName(match.player_2_a)}`;
              const teamB = `${getName(match.player_1_b)} y ${getName(match.player_2_b)}`;
              teamsText = `${teamA} vs ${teamB}`;
            }

            // Also use match court/place if whereText is empty
            if (!whereText) {
              const parts: string[] = [];
              if (match.court) parts.push(match.court);
              if (match.place) parts.push(match.place);
              if (parts.length > 0) whereText = parts.join(" · ");

              // Try court name from courts table if court_id exists
              if (!whereText && match.court_id) {
                const { data: court } = await supabase
                  .from("courts")
                  .select("name")
                  .eq("id", match.court_id)
                  .single();
                if (court?.name) whereText = court.name;
              }
            }
          }
        }

        // Fallback to payload if DB lookup didn't produce results
        if (teamsText === "Partido programado") {
          teamsText =
            payload.teamsText ||
            payload.teams ||
            "Partido programado";
        }

        let ctaUrl: string | null = null;
        let tenantName: string | null = null;
        let tenantMeta = tenantMetaCache.get(row.tenant_id);
        if (!tenantMeta) {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("slug, name")
            .eq("id", row.tenant_id)
            .maybeSingle();

          const tenant = (tenantRow as { slug?: string | null; name?: string | null } | null) || null;
          tenantMeta = {
            slug: normalizeSlug(tenant?.slug || null),
            name: tenant?.name || null,
          };
          tenantMetaCache.set(row.tenant_id, tenantMeta);
        }

        tenantName = tenantMeta.name;
        if (appBaseDomain && tenantMeta.slug) {
          ctaUrl = `https://${tenantMeta.slug}.${appBaseDomain}/matches`;
        }

        let subject = "";
        let html = "";

        if (row.template === "match_created") {
          if (!start_time) throw new Error("payload.start_time faltante");
          const out = emailMatchCreated({
            matchWhen: start_time,
            whereText,
            teamsText,
            moreInfo: payload.moreInfo,
            ctaUrl,
          });
          subject = out.subject;
          html = out.html;
        } else if (row.template === "match_reminder_24h") {
          if (!start_time) throw new Error("payload.start_time faltante");
          const out = emailReminder24h({
            matchWhen: start_time,
            whereText,
            teamsText,
            ctaUrl,
          });
          subject = out.subject;
          html = out.html;
        } else {
          throw new Error(`template no soportado: ${row.template}`);
        }

        await sendWithResend(row.to_email, subject, html, {
          fromName: tenantName || "PadelX",
        });

        // marcar sent
        const { error: upErr } = await supabase
          .from("email_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("id", row.id);

        if (upErr) throw upErr;

        sent++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        await supabase
          .from("email_outbox")
          .update({ status: "failed", error: msg })
          .eq("id", row.id);
      }
    }

    if (DEBUG_LOGS) {
      console.log(
        `[send-emails] DONE processed=${rows.length} sent=${sent} failed=${failed}`
      );
    }

    return new Response(
      JSON.stringify({ ok: true, version: FUNCTION_VERSION, processed: rows.length, sent, failed }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (DEBUG_LOGS) {
      console.error(`[send-emails] ERROR version=${FUNCTION_VERSION} msg=${msg}`);
    }
    return new Response(
      JSON.stringify({ ok: false, version: FUNCTION_VERSION, error: msg }),
      {
        headers: { "content-type": "application/json" },
        status: 500,
      }
    );
  }
});
