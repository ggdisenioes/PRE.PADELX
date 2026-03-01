import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiTimingRating, recordPerformanceEvent } from "@/lib/performance";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
      path: "/api/stats/global",
      name: "GET",
      method: "GET",
      statusCode: status,
      value: durationMs,
      rating: getApiTimingRating(durationMs),
      tenantId,
      userId,
      sampleRate: 0.6,
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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    userId = user?.id ?? null;

    if (authError || !user) {
      return respond({ error: "No autorizado" }, 401);
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return respond(
        { error: "Solo admins/managers pueden ver estadísticas globales" },
        403
      );
    }
    tenantId = profile.tenant_id;

    // Get platform stats using database function
    const { data: platformStats, error: statsErr } = await supabaseClient.rpc(
      "get_platform_stats",
      { tenant_id_input: profile.tenant_id }
    );

    if (statsErr) {
      console.error("Platform stats error:", statsErr);
      return respond({ error: statsErr.message }, 500);
    }

    // Count only active (non-deleted) players for analytics cards.
    const { count: activePlayersCount } = await supabaseClient
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .is("deleted_at", null);

    // Get top players
    const { data: topPlayers } = await supabaseClient
      .from("players")
      .select("id, name, level, avatar_url")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_approved", true)
      .is("deleted_at", null)
      .order("level", { ascending: false })
      .limit(10);

    // Get recent matches
    const { data: recentMatches } = await supabaseClient
      .from("matches")
      .select(
        "id, score, winner, start_time, player_1_a (name), player_2_a (name)"
      )
      .eq("tenant_id", profile.tenant_id)
      .order("start_time", { ascending: false })
      .limit(10);

    // Get booking stats by court
    const { data: bookingsByCourtRaw } = await supabaseClient
      .from("bookings")
      .select("court_id, id")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "confirmed");

    const bookingsByCourt: Record<string, number> = {};
    bookingsByCourtRaw?.forEach((booking) => {
      const courtId = booking.court_id.toString();
      bookingsByCourt[courtId] = (bookingsByCourt[courtId] || 0) + 1;
    });

    const normalizedStats = {
      ...(platformStats || {}),
      total_players:
        typeof activePlayersCount === "number"
          ? activePlayersCount
          : Number((platformStats as any)?.total_players || 0),
    };

    return respond({
      stats: Object.keys(normalizedStats).length > 0 ? normalizedStats : {
        total_users: 0,
        total_active_users: 0,
        total_players: 0,
        total_matches: 0,
        total_completed_matches: 0,
        total_tournaments: 0,
        total_bookings: 0,
        pending_challenges: 0,
        news_published: 0,
      },
      topPlayers: topPlayers || [],
      recentMatches: recentMatches || [],
      bookingsByCourt,
    });
  } catch (error) {
    console.error("GLOBAL STATS GET ERROR:", error);
    return respond({ error: "Error interno del servidor" }, 500);
  }
}
