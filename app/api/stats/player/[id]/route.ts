import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado" },
        { status: 500 }
      );
    }

    const { id } = await params;
    const playerId = parseInt(id, 10);

    if (isNaN(playerId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verify user's tenant
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Get player basic info with tenant verification
    const { data: player, error: playerErr } = await supabaseClient
      .from("players")
      .select("id, name, level, avatar_url, tenant_id")
      .eq("id", playerId)
      .single();

    if (playerErr || !player) {
      return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
    }

    if (player.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
    }

    // Get advanced stats using database function
    const { data: advancedStats, error: statsErr } = await supabaseClient.rpc(
      "get_player_advanced_stats",
      { player_id_input: playerId }
    );

    if (statsErr) {
      console.error("Stats error:", statsErr);
      return NextResponse.json({ error: statsErr.message }, { status: 500 });
    }

    // Calculate additional metrics
    const stats = advancedStats || {
      total_matches: 0,
      wins: 0,
      losses: 0,
      pending_matches: 0,
    };

    const winRate =
      stats.total_matches > 0
        ? Math.round((stats.wins / (stats.total_matches - stats.pending_matches)) * 100)
        : 0;

    return NextResponse.json({
      player,
      stats: {
        ...stats,
        winRate,
      },
    });
  } catch (error) {
    console.error("PLAYER STATS GET ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
