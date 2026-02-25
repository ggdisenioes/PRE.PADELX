import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const exportSchema = z.object({
  type: z.enum(["player_stats", "tournament_results", "booking_report", "analytics"]),
  entity_id: z.number().int().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// Helper function to generate HTML for PDF
function generatePlayerStatsHTML(
  playerName: string,
  stats: any,
  matches: any[]
): string {
  const matchesHTML = matches
    .map(
      (m) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${m.dateLabel}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${m.partner}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">vs ${m.opponent}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; color: ${
        m.result === "Victoria" ? "green" : m.result === "Derrota" ? "red" : "gray"
      };">${m.result}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${m.score}</td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Estadísticas - ${playerName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #0b1220; padding-bottom: 20px; }
        .header h1 { margin: 0; color: #0b1220; }
        .header .subtitle { color: #666; font-size: 14px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
        .stat-card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-card .label { color: #666; font-size: 12px; text-transform: uppercase; }
        .stat-card .value { font-size: 32px; font-weight: bold; color: #0b1220; }
        .matches { margin-top: 40px; }
        .matches h2 { border-bottom: 2px solid #0b1220; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: #0b1220; color: white; padding: 12px; text-align: left; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Estadísticas de ${playerName}</h1>
        <div class="subtitle">Informe generado el ${new Date().toLocaleDateString("es-ES")}</div>
      </div>
      <div class="stats">
        <div class="stat-card">
          <div class="label">Partidos Totales</div>
          <div class="value">${stats.total_matches}</div>
        </div>
        <div class="stat-card">
          <div class="label">Victorias</div>
          <div class="value" style="color: green;">${stats.wins}</div>
        </div>
        <div class="stat-card">
          <div class="label">Derrotas</div>
          <div class="value" style="color: red;">${stats.losses}</div>
        </div>
        <div class="stat-card">
          <div class="label">% Victorias</div>
          <div class="value">${stats.winRate}%</div>
        </div>
      </div>
      <div class="matches">
        <h2>Últimos Partidos</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Compañero</th>
              <th>Oponentes</th>
              <th>Resultado</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${matchesHTML}
          </tbody>
        </table>
      </div>
      <div class="footer">
        <p>PadelX QA</p>
      </div>
    </body>
    </html>
  `;
}

function generateAnalyticsHTML(stats: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Informe Analytics</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #0b1220; padding-bottom: 20px; }
        .header h1 { margin: 0; color: #0b1220; }
        .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
        .metric { border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
        .metric .label { color: #666; font-size: 12px; text-transform: uppercase; }
        .metric .value { font-size: 28px; font-weight: bold; color: #0b1220; margin-top: 10px; }
        .section { margin-bottom: 40px; }
        .section h2 { border-bottom: 2px solid #0b1220; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: #0b1220; color: white; padding: 12px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Informe de Analytics</h1>
        <div class="subtitle">Reporte generado el ${new Date().toLocaleDateString("es-ES")}</div>
      </div>
      <div class="metrics">
        <div class="metric">
          <div class="label">Usuarios Totales</div>
          <div class="value">${stats.total_users}</div>
        </div>
        <div class="metric">
          <div class="label">Usuarios Activos</div>
          <div class="value">${stats.total_active_users}</div>
        </div>
        <div class="metric">
          <div class="label">Jugadores</div>
          <div class="value">${stats.total_players}</div>
        </div>
        <div class="metric">
          <div class="label">Partidos Totales</div>
          <div class="value">${stats.total_matches}</div>
        </div>
        <div class="metric">
          <div class="label">Partidos Completados</div>
          <div class="value">${stats.total_completed_matches}</div>
        </div>
        <div class="metric">
          <div class="label">Torneos</div>
          <div class="value">${stats.total_tournaments}</div>
        </div>
        <div class="metric">
          <div class="label">Reservas de Pistas</div>
          <div class="value">${stats.total_bookings}</div>
        </div>
        <div class="metric">
          <div class="label">Desafíos Pendientes</div>
          <div class="value">${stats.pending_challenges}</div>
        </div>
        <div class="metric">
          <div class="label">Noticias Publicadas</div>
          <div class="value">${stats.news_published}</div>
        </div>
      </div>
      <div class="footer">
        <p>PadelX QA</p>
      </div>
    </body>
    </html>
  `;
}

export async function POST(req: Request) {
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
      .select("role, tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return NextResponse.json(
        { error: "Solo admins/managers pueden exportar reportes" },
        { status: 403 }
      );
    }

    if (!profile.tenant_id) {
      return NextResponse.json(
        { error: "Tenant no encontrado" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validated = exportSchema.parse(body);

    let htmlContent = "";

    if (validated.type === "player_stats" && validated.entity_id) {
      // Get player data and matches
      const { data: player } = await supabaseClient
        .from("players")
        .select("name")
        .eq("id", validated.entity_id)
        .single();

      if (!player) {
        return NextResponse.json({ error: "Jugador no encontrado" }, { status: 404 });
      }

      // Get player stats
      const { data: stats } = await supabaseClient.rpc(
        "get_player_advanced_stats",
        { player_id_input: validated.entity_id }
      );

      htmlContent = generatePlayerStatsHTML(player.name, stats, []);
    } else if (validated.type === "analytics") {
      const { data: stats, error: statsError } = await supabaseClient.rpc(
        "get_platform_stats",
        { tenant_id_input: profile.tenant_id }
      );

      if (statsError || !stats) {
        return NextResponse.json(
          { error: "Error al obtener estadísticas: " + (statsError?.message || "datos no encontrados") },
          { status: 500 }
        );
      }

      // Keep analytics export aligned with UI cards: exclude soft-deleted players.
      const { count: activePlayersCount } = await supabaseClient
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", profile.tenant_id)
        .is("deleted_at", null);

      const normalizedStats = {
        ...(stats as any),
        total_players:
          typeof activePlayersCount === "number"
            ? activePlayersCount
            : Number((stats as any)?.total_players || 0),
      };

      htmlContent = generateAnalyticsHTML(normalizedStats);
    } else {
      return NextResponse.json(
        { error: "Tipo de reporte no soportado" },
        { status: 400 }
      );
    }

    // Return HTML that can be rendered or processed by client-side PDF library
    return NextResponse.json(
      {
        success: true,
        html: htmlContent,
        filename: `report-${validated.type}-${Date.now()}.html`,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    console.error("PDF EXPORT ERROR:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
