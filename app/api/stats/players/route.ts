import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiTimingRating, recordPerformanceEvent } from "@/lib/performance";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type PlayerRow = {
  id: number;
  name: string;
  level: number | null;
  avatar_url: string | null;
};

type PendingMatchRow = {
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;
};

type FriendlyFinishedMatchRow = PendingMatchRow & {
  winner: string | null;
};

type TournamentRankingRow = {
  player_id: number;
  matches_won: number;
  matches_lost: number;
};

type MatchRow = {
  winner: string | null;
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;
};

type PlayerStats = {
  total_matches: number;
  wins: number;
  losses: number;
  pending_matches: number;
  winRate: number;
};

const emptyStats = (): PlayerStats => ({
  total_matches: 0,
  wins: 0,
  losses: 0,
  pending_matches: 0,
  winRate: 0,
});

function getResolvedId(legacyId: number | null, newId?: number | null): number | null {
  const value = legacyId ?? newId ?? null;
  if (!Number.isFinite(value as number)) return null;
  return value as number;
}

export async function GET(req: Request) {
  const startedAt = performance.now();
  let tenantId: string | null = null;
  let userId: string | null = null;

  const respond = (
    body: Record<string, unknown>,
    status = 200
  ) => {
    const durationMs = performance.now() - startedAt;
    const response = NextResponse.json(body, { status });
    response.headers.set("Server-Timing", `app;dur=${durationMs.toFixed(1)}`);

    void recordPerformanceEvent({
      metricType: "api_timing",
      path: "/api/stats/players",
      name: "GET",
      method: "GET",
      statusCode: status,
      value: durationMs,
      rating: getApiTimingRating(durationMs),
      tenantId,
      userId,
      sampleRate: 0.4,
      userAgent: req.headers.get("user-agent"),
    });

    return response;
  };

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return respond({ error: "Servidor mal configurado" }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    userId = user?.id ?? null;

    if (authError || !user) {
      return respond({ error: "No autorizado" }, 401);
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return respond({ error: "Perfil no encontrado" }, 404);
    }
    tenantId = profile.tenant_id;

    const [
      { data: playersData, error: playersErr },
      { data: rankingRows, error: rankingsErr },
      { data: pendingMatches, error: pendingErr },
      { data: friendlyFinishedMatches, error: friendlyFinishedErr },
    ] =
      await Promise.all([
        supabaseClient
          .from("players")
          .select("id, name, level, avatar_url")
          .eq("tenant_id", profile.tenant_id)
          .eq("is_approved", true)
          .order("level", { ascending: false }),
        supabaseClient
          .from("tournament_rankings")
          .select("player_id, matches_won, matches_lost"),
        supabaseClient
          .from("matches")
          .select(
            "player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id"
          )
          .eq("tenant_id", profile.tenant_id)
          .eq("winner", "pending"),
        supabaseClient
          .from("matches")
          .select(
            "winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id"
          )
          .eq("tenant_id", profile.tenant_id)
          .is("tournament_id", null)
          .in("winner", ["A", "B"]),
      ]);

    if (playersErr) {
      return respond({ error: playersErr.message }, 500);
    }

    let legacyMatches: MatchRow[] | null = null;
    if (rankingsErr) {
      console.warn("[stats/players] ranking query failed, using legacy fallback:", rankingsErr);
      const { data: matchesData, error: matchesErr } = await supabaseClient
        .from("matches")
        .select(
          "winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id"
        )
        .eq("tenant_id", profile.tenant_id);

      if (matchesErr) {
        return respond({ error: matchesErr.message }, 500);
      }

      legacyMatches = (matchesData || []) as MatchRow[];
    }

    if (pendingErr) {
      return respond({ error: pendingErr.message }, 500);
    }

    if (friendlyFinishedErr) {
      return respond({ error: friendlyFinishedErr.message }, 500);
    }

    const players = (playersData || []) as PlayerRow[];
    const statsByPlayer = new Map<number, PlayerStats>();

    for (const player of players) {
      statsByPlayer.set(player.id, emptyStats());
    }

    if (legacyMatches) {
      for (const match of legacyMatches) {
        const teamA = new Set<number>();
        const teamB = new Set<number>();

        const a1 = getResolvedId(match.player_1_a, match.player_1_a_id);
        const a2 = getResolvedId(match.player_2_a, match.player_2_a_id);
        const b1 = getResolvedId(match.player_1_b, match.player_1_b_id);
        const b2 = getResolvedId(match.player_2_b, match.player_2_b_id);

        if (a1) teamA.add(a1);
        if (a2) teamA.add(a2);
        if (b1) teamB.add(b1);
        if (b2) teamB.add(b2);

        const participants = new Set<number>([...teamA, ...teamB]);
        if (participants.size === 0) continue;

        const winner = (match.winner || "").toString().toUpperCase();
        const finished = winner === "A" || winner === "B";

        for (const playerId of participants) {
          const current = statsByPlayer.get(playerId);
          if (!current) continue;
          current.total_matches += 1;
          if (!finished) {
            current.pending_matches += 1;
            continue;
          }
          const won = (winner === "A" && teamA.has(playerId)) || (winner === "B" && teamB.has(playerId));
          if (won) current.wins += 1;
          else current.losses += 1;
        }
      }
    } else {
      for (const row of (rankingRows || []) as TournamentRankingRow[]) {
        const playerId = Number(row.player_id);
        const current = statsByPlayer.get(playerId);
        if (!current) continue;
        const wins = Number(row.matches_won) || 0;
        const losses = Number(row.matches_lost) || 0;
        current.wins += wins;
        current.losses += losses;
        current.total_matches += wins + losses;
      }

      for (const match of (pendingMatches || []) as PendingMatchRow[]) {
        const teamA = new Set<number>();
        const teamB = new Set<number>();

        const a1 = getResolvedId(match.player_1_a, match.player_1_a_id);
        const a2 = getResolvedId(match.player_2_a, match.player_2_a_id);
        const b1 = getResolvedId(match.player_1_b, match.player_1_b_id);
        const b2 = getResolvedId(match.player_2_b, match.player_2_b_id);

        if (a1) teamA.add(a1);
        if (a2) teamA.add(a2);
        if (b1) teamB.add(b1);
        if (b2) teamB.add(b2);

        const participants = new Set<number>([...teamA, ...teamB]);
        if (participants.size === 0) continue;

        for (const playerId of participants) {
          const current = statsByPlayer.get(playerId);
          if (!current) continue;
          current.total_matches += 1;
          current.pending_matches += 1;
        }
      }

      for (const match of (friendlyFinishedMatches || []) as MatchRow[]) {
        const teamA = new Set<number>();
        const teamB = new Set<number>();

        const a1 = getResolvedId(match.player_1_a, match.player_1_a_id);
        const a2 = getResolvedId(match.player_2_a, match.player_2_a_id);
        const b1 = getResolvedId(match.player_1_b, match.player_1_b_id);
        const b2 = getResolvedId(match.player_2_b, match.player_2_b_id);

        if (a1) teamA.add(a1);
        if (a2) teamA.add(a2);
        if (b1) teamB.add(b1);
        if (b2) teamB.add(b2);

        const participants = new Set<number>([...teamA, ...teamB]);
        if (participants.size === 0) continue;

        const winner = (match.winner || "").toString().toUpperCase();
        if (winner !== "A" && winner !== "B") continue;

        for (const playerId of participants) {
          const current = statsByPlayer.get(playerId);
          if (!current) continue;

          current.total_matches += 1;
          const won =
            (winner === "A" && teamA.has(playerId)) ||
            (winner === "B" && teamB.has(playerId));
          if (won) current.wins += 1;
          else current.losses += 1;
        }
      }
    }

    const playersWithStats = players.map((player) => {
      const stats = statsByPlayer.get(player.id) || emptyStats();
      const completed = stats.total_matches - stats.pending_matches;
      const winRate = completed > 0 ? Math.round((stats.wins / completed) * 100) : 0;

      return {
        ...player,
        stats: {
          ...stats,
          winRate,
        },
      };
    });

    return respond({ players: playersWithStats }, 200);
  } catch (error) {
    console.error("PLAYERS STATS GET ERROR:", error);
    return respond({ error: "Error interno del servidor" }, 500);
  }
}
