import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM_EMAIL = process.env.EMAIL_FROM || "PadelX <noreply@padelx.es>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://qa.padelx.es";

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    .sub { color:#00b4ff; font-weight:700; letter-spacing:.32em; font-size:10px; margin-top:4px; }
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
        <div class="brand">PadelX QA</div>
        <div class="sub">PÁDEL MANAGER</div>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="footer">
        Este email fue enviado automáticamente por PadelX QA.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendEmail(to: string, subject: string, htmlBody: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured, skipping email to:", to);
    return;
  }

  try {
    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: htmlBody,
    });

    if (error) {
      console.error("[email] Resend error:", error);
    }
  } catch (err) {
    console.error("[email] Failed to send email:", err);
  }
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
    clubName = "PadelX QA",
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
      <a class="btn" href="${APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengerEmail, subjectChallenger, body);
  }

  // Email al compañero del retador
  if (challengerPartnerEmail) {
    const subjectPartner = `${safeChallenger} ha enviado un desafío a ${retados}`;
    const body = baseLayout(
      subjectPartner,
      `<h2>¡Desafío Enviado!</h2>
      <p>Hola, <strong>${safeChallenger}</strong> te ha incluido en un desafío contra <strong>${retados}</strong> en <strong>${safeClub}</strong>.</p>
      ${safeMessage ? `<p style="background:#f8fafc;padding:12px;border-radius:8px;border-left:3px solid #16a34a;"><em>"${safeMessage}"</em></p>` : ""}
      <a class="btn" href="${APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengerPartnerEmail, subjectPartner, body);
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
      <a class="btn" href="${APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengedEmail, subjectChallenged, body);
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
      <a class="btn" href="${APP_URL}/challenges">Ver desafío</a>`
    );
    await sendEmail(challengedPartnerEmail, subjectPartner, body);
  }
}

export async function sendMatchNotification(opts: {
  playerEmails: { name: string; email: string | null }[];
  teamA: string;
  teamB: string;
  matchDate: string;
  court?: string;
  clubName?: string;
}) {
  const { playerEmails, teamA, teamB, matchDate, court, clubName = "PadelX QA" } = opts;

  const safeClub = esc(clubName);
  const safeTeamA = esc(teamA);
  const safeTeamB = esc(teamB);
  const safeDate = esc(matchDate);
  const safeCourt = esc(court);
  const subject = `Nuevo partido programado en ${safeClub}`;

  for (const player of playerEmails) {
    if (!player.email) continue;

    const safeName = esc(player.name);
    const body = baseLayout(
      subject,
      `<h2>¡Nuevo Partido!</h2>
      <p>Hola <strong>${safeName}</strong>, tenés un nuevo partido programado.</p>
      <table class="info-table">
        <tr><td>Equipo A</td><td>${safeTeamA}</td></tr>
        <tr><td>Equipo B</td><td>${safeTeamB}</td></tr>
        <tr><td>Fecha</td><td>${safeDate}</td></tr>
        ${court ? `<tr><td>Pista</td><td>${safeCourt}</td></tr>` : ""}
      </table>
      <a class="btn" href="${APP_URL}/matches">Ver partido</a>`
    );

    await sendEmail(player.email, subject, body);
  }
}

export async function sendMatchProposalNotification(opts: {
  adminEmails: { name: string; email: string }[];
  teamA: string;
  teamB: string;
  matchDate: string;
  court?: string;
  clubName?: string;
}) {
  const { adminEmails, teamA, teamB, matchDate, court, clubName = "PadelX QA" } = opts;

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
      <a class="btn" href="${APP_URL}/matches/friendly/create">Crear Partido Amistoso</a>`
    );

    await sendEmail(admin.email, subject, body);
  }
}
