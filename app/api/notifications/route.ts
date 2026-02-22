export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendMatchFinishedNotification,
  sendMatchNotification,
  sendMatchReminderNotification,
} from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
type NotificationType = "match_created" | "match_finished" | "match_reminder";

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // Authenticate the caller
    const supabaseClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const callerRole = String(callerProfile?.role || "").toLowerCase();
    if (!["admin", "manager", "super_admin"].includes(callerRole)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const body = await req.json();
    const { type, match_id, match_ids } = body as {
      type?: NotificationType;
      match_id?: number;
      match_ids?: number[];
    };

    if (type !== "match_created" && type !== "match_finished" && type !== "match_reminder") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Support single or multiple match IDs
    const ids: number[] = match_ids
      ? (match_ids as number[])
      : match_id
      ? [match_id]
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "No match IDs" }, { status: 400 });
    }

    // Fetch all matches
    const { data: matches, error: matchError } = await supabaseAdmin
      .from("matches")
      .select("id, player_1_a, player_2_a, player_1_b, player_2_b, start_time, court, place, tenant_id, score, winner, round_name")
      .in("id", ids);

    if (matchError || !matches || matches.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // Collect all unique player IDs
    const allPlayerIds = new Set<number>();
    for (const m of matches) {
      [m.player_1_a, m.player_2_a, m.player_1_b, m.player_2_b]
        .filter((id): id is number => id != null)
        .forEach((id) => allPlayerIds.add(id));
    }

    if (allPlayerIds.size === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // Fetch all players at once
    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, name, email, notify_email")
      .in("id", Array.from(allPlayerIds));

    if (!players || players.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    // Get tenant name (from first match)
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", matches[0].tenant_id)
      .single();

    let totalSent = 0;
    let totalAttempted = 0;

    // Send notifications for each match
    for (const match of matches) {
      const getName = (id: number | null) => players.find((p: any) => p.id === id)?.name || "—";

      const teamA = `${getName(match.player_1_a)} y ${getName(match.player_2_a)}`;
      const teamB = `${getName(match.player_1_b)} y ${getName(match.player_2_b)}`;
      const winners = match.winner === "A" ? teamA : match.winner === "B" ? teamB : "";
      const losers = match.winner === "A" ? teamB : match.winner === "B" ? teamA : "";
      const scoreText = match.score || "Resultado pendiente";

      let matchDate = "Fecha por confirmar";
      if (match.start_time) {
        matchDate = new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }).format(new Date(match.start_time));
      }

      const courtText = [match.court, match.place].filter(Boolean).join(" · ") || undefined;

      // Players in THIS match
      const matchPlayerIds = [match.player_1_a, match.player_2_a, match.player_1_b, match.player_2_b]
        .filter((id): id is number => id != null);

      const matchPlayers = players.filter((p: any) => matchPlayerIds.includes(p.id));
      const skipped = matchPlayers.filter(
        (p: any) => p.notify_email === false || !p.email
      );
      if (skipped.length > 0) {
        console.warn(
          `[notifications] Match ${match.id}: skipped recipients`,
          skipped.map((p: any) => ({
            id: p.id,
            name: p.name,
            email: p.email || "(vacío)",
            reason: !p.email ? "sin email" : "notify_email=false",
          }))
        );
      }

      // Send to ALL eligible players (one email per player, even if same email address)
      const playerEmails = matchPlayers
        .filter((p: any) => p.notify_email !== false && p.email)
        .map((p: any) => ({ name: p.name, email: p.email as string }));

      console.log(
        `[notifications] Match ${match.id}: recipients`,
        playerEmails.map((p, i) => `${i + 1}. ${p.name} <${p.email}>`)
      );

      if (playerEmails.length > 0) {
        let delivery = { sent: 0, attempted: 0 };
        if (type === "match_created") {
          delivery = await sendMatchNotification({
            playerEmails,
            teamA,
            teamB,
            matchDate,
            court: courtText,
            clubName: tenant?.name || "PadelX QA",
          });
        } else if (type === "match_reminder") {
          delivery = await sendMatchReminderNotification({
            playerEmails,
            teamA,
            teamB,
            matchDate,
            court: courtText,
            clubName: tenant?.name || "PadelX QA",
          });
        } else {
          if (!winners) {
            console.warn(`[notifications] Match ${match.id}: winner is missing, skipping match_finished notification`);
            continue;
          }

          delivery = await sendMatchFinishedNotification({
            playerEmails,
            winners,
            losers,
            score: scoreText,
            matchDate,
            court: courtText,
            roundName: match.round_name || undefined,
            clubName: tenant?.name || "PadelX QA",
          });
        }
        totalSent += delivery.sent;
        totalAttempted += delivery.attempted;
        console.log(
          `[notifications] Match ${match.id}: delivery summary sent=${delivery.sent} attempted=${delivery.attempted}`
        );
      }
    }

    return NextResponse.json({ ok: true, sent: totalSent, attempted: totalAttempted });
  } catch (error) {
    console.error("Notification error:", error);
    return NextResponse.json({ error: "Error sending notifications" }, { status: 500 });
  }
}
