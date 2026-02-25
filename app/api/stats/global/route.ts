import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Solo admins/managers pueden ver estadísticas globales" },
        { status: 403 }
      );
    }

    // Get platform stats using database function
    const { data: platformStats, error: statsErr } = await supabaseClient.rpc(
      "get_platform_stats",
      { tenant_id_input: profile.tenant_id }
    );

    if (statsErr) {
      console.error("Platform stats error:", statsErr);
      return NextResponse.json({ error: statsErr.message }, { status: 500 });
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

    return NextResponse.json({
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
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
