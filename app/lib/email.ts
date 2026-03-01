const FROM_EMAIL = process.env.EMAIL_FROM || "PadelX <noreply@padelx.es>";
const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://twinco.padelx.es";
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_MAX_RETRIES = Number(process.env.RESEND_MAX_RETRIES || "3");
const RESEND_MIN_REQUEST_INTERVAL_MS = Number(
  process.env.RESEND_MIN_REQUEST_INTERVAL_MS || "600"
);
const EMAIL_REPLY_TO = String(process.env.EMAIL_REPLY_TO || "").trim();
const EMAIL_UNSUBSCRIBE_MAILTO = String(process.env.EMAIL_UNSUBSCRIBE_MAILTO || "").trim();

let lastResendRequestAt = 0;

type EmailTag = { name: string; value: string };
type SendEmailOptions = {
  fromName?: string | null;
  replyTo?: string | null;
  textBody?: string | null;
  tags?: EmailTag[];
};

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInt(value: string | null, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  const baseAddress = extractFromAddress(FROM_EMAIL);
  const safeName = sanitizeHeaderPart(String(displayName || ""));
  if (baseAddress && safeName) {
    return `${safeName} <${baseAddress}>`;
  }
  return FROM_EMAIL;
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

async function waitForResendRateWindow() {
  const now = Date.now();
  const waitMs = lastResendRequestAt + RESEND_MIN_REQUEST_INTERVAL_MS - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastResendRequestAt = Date.now();
}

function getTenantBaseDomain(): string | null {
  const explicit =
    process.env.EMAIL_TENANT_BASE_DOMAIN ||
    process.env.NEXT_PUBLIC_BASE_DOMAIN ||
    "";

  if (explicit.trim()) {
    return explicit
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }

  try {
    const host = new URL(DEFAULT_APP_URL).hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    ) {
      return null;
    }

    const parts = host.split(".");
    if (parts.length < 2) return null;
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  } catch {
    return null;
  }
}

function resolveTenantPathUrl(path: string, tenantSlug?: string | null): string | null {
  const slug = String(tenantSlug || "")
    .trim()
    .toLowerCase();

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return null;
  }

  const baseDomain = getTenantBaseDomain();
  if (!baseDomain) {
    return null;
  }

  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `https://${slug}.${baseDomain}${safePath}`;
}

function baseLayout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f6f7fb; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .wrap { width:100%; padding:24px 12px; }
    .card { max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8ef; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,.08); }
    .header { background:#05070b; padding:18px 20px; }
    .brand { color:#fff; font-weight:900; letter-spacing:.26em; font-size:14px; font-style:italic; }
    .sub { color:#ccff00; font-weight:700; letter-spacing:.32em; font-size:10px; margin-top:4px; }
    .content { padding:24px; color:#0f172a; }
    h2 { font-size:20px; font-weight:800; margin:0 0 12px; }
    p { font-size:14px; line-height:1.6; margin:0 0 12px; color:#334155; }
    .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
    .info-table td { padding:8px 12px; font-size:14px; border-bottom:1px solid #f1f5f9; }
    .info-table td:first-child { font-weight:700; color:#64748b; width:120px; }
    .info-table td:last-child { color:#0f172a; font-weight:600; }
    .btn { display:inline-block; background:#16a34a; color:#ffffff !important; text-decoration:none; font-weight:700; padding:12px 24px; border-radius:10px; margin-top:8px; }
    .footer { padding:16px 20px; background:#0b1220; color:#94a3b8; font-size:11px; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="brand">TWINCO</div>
        <div class="sub">PÁDEL MANAGER</div>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="footer">
        Este email fue enviado automáticamente por TWINCO Pádel Manager.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  options: SendEmailOptions = {}
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured, skipping email to:", to);
    return false;
  }

  const from = buildFromHeader(options.fromName);
  const text = String(options.textBody || "").trim() || htmlToText(htmlBody);
  const replyTo = isValidEmail(options.replyTo || EMAIL_REPLY_TO)
    ? String(options.replyTo || EMAIL_REPLY_TO).trim()
    : undefined;
  const tags = (options.tags || []).filter((t) => t?.name && t?.value).slice(0, 10);
  const headers = buildEmailHeaders();

  for (let attempt = 1; attempt <= RESEND_MAX_RETRIES; attempt++) {
    try {
      await waitForResendRateWindow();

      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          html: htmlBody,
          text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(tags.length ? { tags } : {}),
          headers,
        }),
      });

      const raw = await response.text();
      let payload: { id?: string; message?: string; error?: { message?: string } } = {};
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }

      if (response.ok) {
        console.log(`[email] Sent to ${to} (id: ${payload?.id || "n/a"})`);
        return true;
      }

      const status = response.status;
      const retryAfterMs = toInt(response.headers.get("retry-after")) * 1000;
      const message =
        payload?.message ||
        payload?.error?.message ||
        raw ||
        `HTTP ${status}`;

      const shouldRetry =
        (status === 429 || status >= 500) && attempt < RESEND_MAX_RETRIES;

      if (shouldRetry) {
        const backoffMs = Math.max(retryAfterMs, 600 * attempt);
        console.warn(
          `[email] Resend transient error to ${to} (status ${status}). Retry ${attempt}/${RESEND_MAX_RETRIES} in ${backoffMs}ms.`
        );
        await sleep(backoffMs);
        continue;
      }

      console.error(
        `[email] Resend error sending to ${to} (status ${status}): ${message}`
      );
      return false;
    } catch (err) {
      const transient = attempt < RESEND_MAX_RETRIES;
      console.error(
        `[email] Failed to send to ${to} (attempt ${attempt}/${RESEND_MAX_RETRIES}):`,
        err
      );
      if (transient) {
        await sleep(600 * attempt);
        continue;
      }
      return false;
    }
  }

  return false;
}

function renderMatchCta(url: string | null, label: string) {
  if (!url) {
    return `<p class="muted">Este correo es informativo. Ingresá desde el enlace habitual de tu club para ver el detalle.</p>`;
  }
  return `<a class="btn" href="${esc(url)}">${esc(label)}</a>`;
}

export type MatchNotificationResult = {
  attempted: number;
  sent: number;
  failed: number;
};

function emptyResult(): MatchNotificationResult {
  return { attempted: 0, sent: 0, failed: 0 };
}

async function sendMatchEmails(
  playerEmails: { name: string; email: string | null }[],
  subject: string,
  buildBody: (playerName: string) => string,
  emailOptions: SendEmailOptions = {}
): Promise<MatchNotificationResult> {
  const result = emptyResult();

  for (const player of playerEmails) {
    if (!player.email) continue;

    result.attempted += 1;
    const ok = await sendEmail(player.email, subject, buildBody(player.name), emailOptions);
    if (ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

export async function sendChallengeNotification(opts: {
  challengerName: string;
  challengerEmail?: string | null;
  challengerPartnerName?: string | null;
  challengerPartnerEmail?: string | null;
  challengedName: string;
  challengedEmail: string | null;
  challengedPartnerName?: string | null;
  challengedPartnerEmail?: string | null;
  message?: string | null;
  clubName?: string;
}) {
  const {
    challengerName,
    challengerEmail,
    challengerPartnerName,
    challengerPartnerEmail,
    challengedName,
    challengedEmail,
    challengedPartnerName,
    challengedPartnerEmail,
    message,
    clubName = "TWINCO",
  } = opts;

  const safeChallenger = esc(challengerName);
  const safePartner = esc(challengerPartnerName);
  const safeChallenged = esc(challengedName);
  const safeChallengedPartner = esc(challengedPartnerName);
  const safeClub = esc(clubName);
  const safeMessage = esc(message);

  const retadores = safePartner
    ? `${safeChallenger} y ${safePartner}`
    : safeChallenger;

  const retados = safeChallengedPartner
    ? `${safeChallenged} y ${safeChallengedPartner}`
    : safeChallenged;

  // Email al retador principal (confirmación)
  if (challengerEmail) {
    const subjectChallenger = `Has desafiado a ${retados}`;
    const body = baseLayout(
      subjectChallenger,
      `<h2>¡Desafío Enviado!</h2>
      <p>Hola <strong>${safeChallenger}</strong>, tu desafío a <strong>${retados}</strong> ha sido enviado en <strong>${safeClub}</strong>.</p>
      ${safeMessage ? `<p style="background:#f8fafc;padding:12px;border-radius:8px;border-left:3px solid #16a34a;"><em>"${safeMessage}"</em></p>` : ""}
      <a class="btn" href="${DEFAULT_APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengerEmail, subjectChallenger, body, {
      fromName: clubName,
      tags: [{ name: "template", value: "challenge_created" }],
    });
  }

  // Email al compañero del retador
  if (challengerPartnerEmail) {
    const subjectPartner = `${safeChallenger} ha enviado un desafío a ${retados}`;
    const body = baseLayout(
      subjectPartner,
      `<h2>¡Desafío Enviado!</h2>
      <p>Hola, <strong>${safeChallenger}</strong> te ha incluido en un desafío contra <strong>${retados}</strong> en <strong>${safeClub}</strong>.</p>
      ${safeMessage ? `<p style="background:#f8fafc;padding:12px;border-radius:8px;border-left:3px solid #16a34a;"><em>"${safeMessage}"</em></p>` : ""}
      <a class="btn" href="${DEFAULT_APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengerPartnerEmail, subjectPartner, body, {
      fromName: clubName,
      tags: [{ name: "template", value: "challenge_created" }],
    });
  }

  // Email al desafiado principal
  if (challengedEmail) {
    const subjectChallenged = `${retadores} te ${safePartner ? "han" : "ha"} retado`;
    const body = baseLayout(
      subjectChallenged,
      `<h2>¡Te han retado!</h2>
      <p>Hola <strong>${safeChallenged}</strong>!</p>
      <p><strong>${retadores}</strong> te ${safePartner ? "han" : "ha"} retado${safeChallengedPartner ? ` junto con <strong>${safeChallengedPartner}</strong>` : ""} en <strong>${safeClub}</strong>.</p>
      <p style="font-size:16px;font-weight:700;color:#0f172a;">¿Aceptás el desafío?</p>
      ${safeMessage ? `<p style="background:#f8fafc;padding:12px;border-radius:8px;border-left:3px solid #16a34a;"><em>"${safeMessage}"</em></p>` : ""}
      <a class="btn" href="${DEFAULT_APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengedEmail, subjectChallenged, body, {
      fromName: clubName,
      tags: [{ name: "template", value: "challenge_created" }],
    });
  }

  // Email al compañero del desafiado
  if (challengedPartnerEmail && challengedPartnerName) {
    const subjectPartner = `${retadores} te ${safePartner ? "han" : "ha"} retado`;
    const body = baseLayout(
      subjectPartner,
      `<h2>¡Te han retado!</h2>
      <p>Hola <strong>${safeChallengedPartner}</strong>!</p>
      <p><strong>${retadores}</strong> te ${safePartner ? "han" : "ha"} retado junto con <strong>${safeChallenged}</strong> en <strong>${safeClub}</strong>.</p>
      <p style="font-size:16px;font-weight:700;color:#0f172a;">¿Aceptás el desafío?</p>
      ${safeMessage ? `<p style="background:#f8fafc;padding:12px;border-radius:8px;border-left:3px solid #16a34a;"><em>"${safeMessage}"</em></p>` : ""}
      <a class="btn" href="${DEFAULT_APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengedPartnerEmail, subjectPartner, body, {
      fromName: clubName,
      tags: [{ name: "template", value: "challenge_created" }],
    });
  }
}

export async function sendMatchNotification(opts: {
  playerEmails: { name: string; email: string | null }[];
  teamA: string;
  teamB: string;
  matchDate: string;
  court?: string;
  clubName?: string;
  tenantSlug?: string | null;
}): Promise<MatchNotificationResult> {
  const {
    playerEmails,
    teamA,
    teamB,
    matchDate,
    court,
    clubName = "TWINCO",
    tenantSlug,
  } = opts;

  const safeClub = esc(clubName);
  const safeTeamA = esc(teamA);
  const safeTeamB = esc(teamB);
  const safeDate = esc(matchDate);
  const safeCourt = esc(court);
  const matchUrl = resolveTenantPathUrl("/matches", tenantSlug);
  const subject = `Nuevo partido programado en ${safeClub}`;

  return sendMatchEmails(
    playerEmails,
    subject,
    (playerName) => {
      const safeName = esc(playerName);
      return baseLayout(
        subject,
        `<h2>¡Nuevo Partido!</h2>
        <p>Hola <strong>${safeName}</strong>, tenés un nuevo partido programado.</p>
        <table class="info-table">
          <tr><td>Equipo A</td><td>${safeTeamA}</td></tr>
          <tr><td>Equipo B</td><td>${safeTeamB}</td></tr>
          <tr><td>Fecha</td><td>${safeDate}</td></tr>
          ${court ? `<tr><td>Pista</td><td>${safeCourt}</td></tr>` : ""}
        </table>
        ${renderMatchCta(matchUrl, "Ver partido")}`
      );
    },
    {
      fromName: clubName,
      tags: [{ name: "template", value: "match_created" }],
    }
  );
}

export async function sendMatchReminderNotification(opts: {
  playerEmails: { name: string; email: string | null }[];
  teamA: string;
  teamB: string;
  matchDate: string;
  court?: string;
  clubName?: string;
  tenantSlug?: string | null;
}): Promise<MatchNotificationResult> {
  const {
    playerEmails,
    teamA,
    teamB,
    matchDate,
    court,
    clubName = "TWINCO",
    tenantSlug,
  } = opts;

  const safeClub = esc(clubName);
  const safeTeamA = esc(teamA);
  const safeTeamB = esc(teamB);
  const safeDate = esc(matchDate);
  const safeCourt = esc(court);
  const matchUrl = resolveTenantPathUrl("/matches", tenantSlug);
  const subject = `Recordatorio de partido en ${safeClub}`;

  return sendMatchEmails(
    playerEmails,
    subject,
    (playerName) => {
      const safeName = esc(playerName);
      return baseLayout(
        subject,
        `<h2>Recordatorio de Partido</h2>
        <p>Hola <strong>${safeName}</strong>, este es un recordatorio de tu partido.</p>
        <table class="info-table">
          <tr><td>Equipo A</td><td>${safeTeamA}</td></tr>
          <tr><td>Equipo B</td><td>${safeTeamB}</td></tr>
          <tr><td>Fecha</td><td>${safeDate}</td></tr>
          ${court ? `<tr><td>Pista</td><td>${safeCourt}</td></tr>` : ""}
        </table>
        ${renderMatchCta(matchUrl, "Ver partido")}`
      );
    },
    {
      fromName: clubName,
      tags: [{ name: "template", value: "match_reminder" }],
    }
  );
}

export async function sendMatchFinishedNotification(opts: {
  playerEmails: { name: string; email: string | null }[];
  winners: string;
  losers: string;
  score: string;
  matchDate: string;
  court?: string;
  roundName?: string;
  clubName?: string;
  tenantSlug?: string | null;
}): Promise<MatchNotificationResult> {
  const {
    playerEmails,
    winners,
    losers,
    score,
    matchDate,
    court,
    roundName,
    clubName = "TWINCO",
    tenantSlug,
  } = opts;

  const safeClub = esc(clubName);
  const safeWinners = esc(winners);
  const safeLosers = esc(losers);
  const safeScore = esc(score);
  const safeDate = esc(matchDate);
  const safeCourt = esc(court);
  const safeRound = esc(roundName);
  const matchUrl = resolveTenantPathUrl("/matches", tenantSlug);
  const subject = `Partido finalizado en ${safeClub}`;

  return sendMatchEmails(
    playerEmails,
    subject,
    (playerName) => {
      const safeName = esc(playerName);
      return baseLayout(
        subject,
        `<h2>Partido finalizado</h2>
        <p>Hola <strong>${safeName}</strong>.</p>
        <p><strong>Felicitaciones ${safeWinners}</strong>.</p>
        <table class="info-table">
          <tr><td>Ganadores</td><td>${safeWinners}</td></tr>
          <tr><td>Perdedores</td><td>${safeLosers}</td></tr>
          <tr><td>Resultado</td><td>${safeScore}</td></tr>
          <tr><td>Fecha</td><td>${safeDate}</td></tr>
          ${safeRound ? `<tr><td>Ronda</td><td>${safeRound}</td></tr>` : ""}
          ${court ? `<tr><td>Pista</td><td>${safeCourt}</td></tr>` : ""}
        </table>
        ${renderMatchCta(matchUrl, "Ver partido")}`
      );
    },
    {
      fromName: clubName,
      tags: [{ name: "template", value: "match_finished" }],
    }
  );
}

export async function sendMatchProposalNotification(opts: {
  adminEmails: { name: string; email: string }[];
  teamA: string;
  teamB: string;
  matchDate: string;
  court?: string;
  clubName?: string;
}) {
  const { adminEmails, teamA, teamB, matchDate, court, clubName = "TWINCO" } = opts;

  const safeClub = esc(clubName);
  const safeTeamA = esc(teamA);
  const safeTeamB = esc(teamB);
  const safeDate = esc(matchDate);
  const safeCourt = esc(court);
  const subject = `Propuesta de partido amistoso en ${safeClub}`;

  for (const admin of adminEmails) {
    const safeName = esc(admin.name);
    const body = baseLayout(
      subject,
      `<h2>Propuesta de Partido Amistoso</h2>
      <p>Hola <strong>${safeName}</strong>, los jugadores de un desafío aceptado han propuesto un partido amistoso.</p>
      <table class="info-table">
        <tr><td>Equipo A</td><td>${safeTeamA}</td></tr>
        <tr><td>Equipo B</td><td>${safeTeamB}</td></tr>
        <tr><td>Fecha</td><td>${safeDate}</td></tr>
        ${court ? `<tr><td>Pista</td><td>${safeCourt}</td></tr>` : ""}
      </table>
      <p>Por favor, revisá la propuesta y creá el partido desde el panel de administración.</p>
      <a class="btn" href="${DEFAULT_APP_URL}/matches/friendly/create">Crear Partido Amistoso</a>`
    );

    await sendEmail(admin.email, subject, body, {
      fromName: clubName,
      tags: [{ name: "template", value: "match_proposal" }],
    });
  }
}
