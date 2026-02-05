// ./app/page.tsx
// ./app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";
import MatchCard from "@/components/matches/MatchCard";
import toast from "react-hot-toast";
import MatchShareCard from "./components/matches/MatchShareCard";

type PlayerMap = {
  [key: number]: string;
};

type TournamentMap = {
  [key: number]: string;
};

type UpcomingMatch = {
  id: number;
  start_time: string | null;
  tournament_id: number | null;
  round_name: string | null;
  place: string | null;
  court: string | null;
  // Esquema anterior
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;

  // Nuevo esquema (amistosos)
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  winner: string | null;
  score: string | null;
};

type AuditLog = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | null;
  user_email: string | null;
  created_at: string;
};

type AlertItem = {
  id: string;
  type: "warning" | "info";
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

// --- Dashboard extra types ---
type RankingItem = {
  player_id: number;
  name: string;
  points: number;
  wins: number;
  played: number;
  losses: number;
  games_for: number;
  games_against: number;
};

type FinishedMatch = {
  id: number;
  tournament_id: number | null;
  start_time: string | null;
  score: string | null;
  winner: string | null;
  // Esquema anterior
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;

  // Nuevo esquema (amistosos)
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  created_at: string;
};

type RankingMatchRow = {
  winner: "A" | "B" | string | null;
  // Esquema anterior
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;

  // Nuevo esquema (amistosos)
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  score: string | null;
  tournament_id: number | null;
};


export default function DashboardPage() {
  const [countPlayers, setCountPlayers] = useState(0);
  const [countTournaments, setCountTournaments] = useState(0);
  const [countPendingMatches, setCountPendingMatches] = useState(0);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([]);
  const [playerMap, setPlayerMap] = useState<PlayerMap>({});
  const [tournamentMap, setTournamentMap] = useState<TournamentMap>({});
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const { isAdmin, isManager } = useRole();
  const isUser = !isAdmin && !isManager;

  const [topRanking, setTopRanking] = useState<RankingItem[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [recentResults, setRecentResults] = useState<FinishedMatch[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [chart7d, setChart7d] = useState<
    { key: string; label: string; pending: number; finished: number; total: number }[]
  >([]);

  const [openResultMatch, setOpenResultMatch] = useState<FinishedMatch | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const normalizePlayersFromIds = <T extends {
    player_1_a: number | null;
    player_2_a: number | null;
    player_1_b: number | null;
    player_2_b: number | null;
    player_1_a_id?: number | null;
    player_2_a_id?: number | null;
    player_1_b_id?: number | null;
    player_2_b_id?: number | null;
  }>(m: T): T => {
    return {
      ...m,
      player_1_a: m.player_1_a ?? (m.player_1_a_id ?? null),
      player_2_a: m.player_2_a ?? (m.player_2_a_id ?? null),
      player_1_b: m.player_1_b ?? (m.player_1_b_id ?? null),
      player_2_b: m.player_2_b ?? (m.player_2_b_id ?? null),
    };
  };


  // Función para calcular alertas inteligentes (estable para hooks/realtime)
  const calculateAlerts = useCallback(async () => {
    const alertsList: AlertItem[] = [];
    const now = new Date();

    // 1️⃣ Partido atrasado
    const { data: overdueMatches, error: overdueErr } = await supabase
      .from("matches")
      .select("id, start_time")
      .eq("winner", "pending")
      .lt("start_time", now.toISOString());

    if (!overdueErr && overdueMatches && overdueMatches.length > 0) {
      alertsList.push({
        id: "overdue-matches",
        type: "warning",
        message: `⚠️ Hay ${overdueMatches.length} partido(s) atrasado(s) sin resultado.`,
        actionLabel: "Cargar resultados",
        actionHref: "/matches?status=pending",
      });
    }

    // 2️⃣ Torneos sin partidos
    const { data: tournaments, error: tErr } = await supabase
      .from("tournaments")
      .select("id, name");

    if (!tErr && tournaments) {
      for (const t of tournaments) {
        const { count } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .eq("tournament_id", t.id);

        if (!count || count === 0) {
          alertsList.push({
            id: `tournament-${t.id}`,
            type: "info",
            message: `ℹ️ El torneo "${t.name}" no tiene partidos cargados.`,
            actionLabel: "Crear partido",
            actionHref: `/matches/create?tournament=${t.id}`,
          });
        }
      }
    }

    // 3️⃣ Jugadores inactivos
    const { data: players, error: pErr } = await supabase
      .from("players")
      .select("id, name")
      .eq("is_approved", true);

    if (!pErr && players) {
      for (const p of players) {
        const { count } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .or(
            `player_1_a.eq.${p.id},player_2_a.eq.${p.id},player_1_b.eq.${p.id},player_2_b.eq.${p.id},` +
            `player_1_a_id.eq.${p.id},player_2_a_id.eq.${p.id},player_1_b_id.eq.${p.id},player_2_b_id.eq.${p.id}`
          );

        if (!count || count === 0) {
          alertsList.push({
            id: `player-${p.id}`,
            type: "info",
            message: `ℹ️ El jugador "${p.name}" aún no tiene partidos jugados.`,
            actionLabel: "Asignar partido",
            actionHref: `/matches/create?player=${p.id}`,
          });
        }
      }
    }

    setAlerts(alertsList.slice(0, 4));
  }, []);


  useEffect(() => {
    const loadData = async () => {
      // 1) Contadores
      const [{ count: pendingCount }, { count: playersCount }, { count: tournamentsCount }] =
        await Promise.all([
          supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .eq("winner", "pending"),
          supabase
            .from("players")
            .select("*", { count: "exact", head: true })
            .eq("is_approved", true),
          supabase.from("tournaments").select("*", { count: "exact", head: true }),
        ]);

      setCountPendingMatches(pendingCount || 0);
      setCountPlayers(playersCount || 0);
      setCountTournaments(tournamentsCount || 0);

      // 2) Jugadores (mapa id -> nombre)
      const { data: players } = await supabase
        .from("players")
        .select("id, name")
        .eq("is_approved", true);

      const pMap: PlayerMap = {};
      (players || []).forEach((p: { id: number; name: string }) => {
        pMap[p.id] = p.name;
      });
      setPlayerMap(pMap);
      // Guardamos el mapa local para usarlo en el ranking (evita estado stale)
      const localPlayerMap = pMap;

      // 3) Torneos (mapa id -> nombre)
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, name");

      const tMap: TournamentMap = {};
      (tournaments || []).forEach((t: { id: number; name: string }) => {
        tMap[t.id] = t.name;
      });
      setTournamentMap(tMap);

      // 4) Partidos pendientes
      const { data: matches } = await supabase
        .from("matches")
        .select(
          "id, start_time, tournament_id, round_name, place, court, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, winner, score"
        )
        .eq("winner", "pending")
        .order("start_time", { ascending: true })
        .limit(5);

      setUpcomingMatches((matches || []).map((m: any) => normalizePlayersFromIds(m)));

      // 4.25) Gráfico simple (últimos 7 días): partidos pendientes vs finalizados
      const start7d = new Date();
      start7d.setDate(start7d.getDate() - 6);
      start7d.setHours(0, 0, 0, 0);

      const { data: matches7d, error: m7Err } = await supabase
        .from("matches")
        .select("start_time, winner")
        .gte("start_time", start7d.toISOString());

      const days: { key: string; date: Date; label: string }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start7d);
        d.setDate(start7d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("es-ES", { weekday: "short" });
        days.push({ key, date: d, label });
      }

      const byDay: Record<
        string,
        { key: string; label: string; pending: number; finished: number; total: number }
      > = {};
      days.forEach((d) => {
        byDay[d.key] = { key: d.key, label: d.label, pending: 0, finished: 0, total: 0 };
      });

      if (!m7Err && matches7d) {
        for (const row of matches7d as { start_time: string | null; winner: string | null }[]) {
          if (!row.start_time) continue;
          const k = new Date(row.start_time).toISOString().slice(0, 10);
          if (!byDay[k]) continue;

          const isPending = !row.winner || String(row.winner).toLowerCase() === "pending";
          if (isPending) byDay[k].pending += 1;
          else byDay[k].finished += 1;
          byDay[k].total += 1;
        }
      }

      setChart7d(days.map((d) => byDay[d.key]));

      // 4.5) Resultados recientes
      const { data: finishedMatches } = await supabase
        .from("matches")
        .select("id, tournament_id, start_time, round_name, court, score, winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, created_at")
        .neq("winner", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      setRecentResults((finishedMatches || []).map((m: any) => normalizePlayersFromIds(m)));

      // 5) Logs iniciales
      const { data: logs } = await supabase
        .from("action_logs")
        .select("id, action, entity, entity_id, user_email, created_at")
        .order("created_at", { ascending: false })
        .limit(6);

      setRecentLogs(logs || []);

      // 5.5) Ranking real (3 pts victoria, 1 pt derrota)
      const { data: rankingMatches } = await supabase
        .from("matches")
        .select("winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, score, tournament_id")
        .neq("winner", "pending");

      // Filter by tournament if selected
      const filteredRankingMatches = selectedTournamentId
        ? (rankingMatches || []).filter((m) => m.tournament_id === selectedTournamentId)
        : rankingMatches || [];

      const normalizedRankingMatches = filteredRankingMatches.map((m: any) => normalizePlayersFromIds(m));

      const rankingMap: Record<number, RankingItem> = {};

      (normalizedRankingMatches).forEach((m: RankingMatchRow) => {
        const teamA = [m.player_1_a, m.player_2_a].filter(Boolean) as number[];
        const teamB = [m.player_1_b, m.player_2_b].filter(Boolean) as number[];

        const winners = m.winner === "A" ? teamA : m.winner === "B" ? teamB : [];
        const losers = m.winner === "A" ? teamB : m.winner === "B" ? teamA : [];

        // Parse score for games_for/games_against
        // Accepts "6-4", "6 4", "6:4", "6,4" etc, only first two numbers
        let teamAScore = 0, teamBScore = 0;
        if (typeof m.score === "string") {
          const match = m.score.match(/(\d+)[\s\-:,]+(\d+)/);
          if (match) {
            teamAScore = parseInt(match[1], 10);
            teamBScore = parseInt(match[2], 10);
          }
        }
        // Winners
        winners.forEach((pid) => {
          if (!rankingMap[pid]) {
            rankingMap[pid] = {
              player_id: pid,
              name: localPlayerMap[pid] || `Jugador ${pid}`,
              points: 0,
              wins: 0,
              played: 0,
              losses: 0,
              games_for: 0,
              games_against: 0,
            };
          }
          rankingMap[pid].wins += 1;
          rankingMap[pid].points += 3;
          rankingMap[pid].played += 1;
          // Games for/against
          if (m.winner === "A") {
            rankingMap[pid].games_for += teamAScore;
            rankingMap[pid].games_against += teamBScore;
          } else if (m.winner === "B") {
            rankingMap[pid].games_for += teamBScore;
            rankingMap[pid].games_against += teamAScore;
          }
        });
        // Losers
        losers.forEach((pid) => {
          if (!rankingMap[pid]) {
            rankingMap[pid] = {
              player_id: pid,
              name: localPlayerMap[pid] || `Jugador ${pid}`,
              points: 0,
              wins: 0,
              played: 0,
              losses: 0,
              games_for: 0,
              games_against: 0,
            };
          }
          rankingMap[pid].points += 1;
          rankingMap[pid].played += 1;
          rankingMap[pid].losses += 1;
          // Games for/against
          if (m.winner === "A") {
            rankingMap[pid].games_for += teamBScore;
            rankingMap[pid].games_against += teamAScore;
          } else if (m.winner === "B") {
            rankingMap[pid].games_for += teamAScore;
            rankingMap[pid].games_against += teamBScore;
          }
        });
      });

      setTopRanking(
        Object.values(rankingMap)
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const diffA = a.games_for - a.games_against;
            const diffB = b.games_for - b.games_against;
            if (diffB !== diffA) return diffB - diffA;
            if (b.games_for !== a.games_for) return b.games_for - a.games_for;
            return b.wins - a.wins;
          })
      );

      // 6) Alertas inteligentes
      await calculateAlerts();

      setLoadingDashboard(false);
    };

    loadData();
  }, [calculateAlerts, selectedTournamentId]);


  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("realtime-action-logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "action_logs",
        },
        (payload: { new: AuditLog }) => {
          const newLog = payload.new as AuditLog;

          setRecentLogs((prev) => {
            const updated = [newLog, ...prev];
            return updated.slice(0, 6);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  useEffect(() => {
    // KPIs en tiempo real (admin y manager)
    const channel = supabase
      .channel("realtime-kpis")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        async () => {
          const { count } = await supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .eq("winner", "pending");

          setCountPendingMatches(count || 0);
          // Dashboard PRO v2: recalcular resumen últimos 30 días
          // await fetchSummary30d(); // <-- eliminado: no actualizar gráficos desde realtime
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          const { count } = await supabase
            .from("players")
            .select("*", { count: "exact", head: true })
            .eq("is_approved", true);

          setCountPlayers(count || 0);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments" },
        async () => {
          const { count } = await supabase
            .from("tournaments")
            .select("*", { count: "exact", head: true });

          setCountTournaments(count || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const getPlayerName = (id: number | null) =>
    id && playerMap[id] ? playerMap[id] : id ? `ID ${id}` : "-";

  const isPlayed = (m: FinishedMatch) =>
    !!m.score && !!m.winner && String(m.winner).toLowerCase() !== "pending";

  const formatScoreForDisplay = (raw: string | null) => {
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
  };

  const buildTeamNameFromIds = (p1: number | null, p2: number | null) => {
    const a = getPlayerName(p1);
    const b = getPlayerName(p2);
    const joined = [a, b].filter((x) => x && x !== "-").join(" / ");
    return joined || "Por definir";
  };

  const getWinnerLoserTeams = (m: FinishedMatch) => {
    const teamA = buildTeamNameFromIds(m.player_1_a, m.player_2_a);
    const teamB = buildTeamNameFromIds(m.player_1_b, m.player_2_b);
    const score = formatScoreForDisplay(m.score);

    if (m.winner === "A") return { winnerTeam: teamA, loserTeam: teamB, score };
    if (m.winner === "B") return { winnerTeam: teamB, loserTeam: teamA, score };
    return { winnerTeam: teamA, loserTeam: teamB, score };
  };

  // Helper: Genera PNG desde el shareCardRef usando html2canvas (devuelve Blob + URL)
  const generatePngFromShareRef = async () => {
  if (!shareCardRef.current) return null;

  try {
    const canvas = await html2canvas(shareCardRef.current, {
      backgroundColor: "#020617",
      scale: 2,
      useCORS: true,
      foreignObjectRendering: true,
    } as any);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });

    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    return { blob, url };
  } catch (err) {
    console.error("Error generando imagen:", err);
    return null;
  }
};


  if (isUser) {
    // Usuario cliente: solo vista informativa
  }
  return (
    <main className="w-full overflow-x-hidden px-4 py-6 md:px-8 lg:px-10 lg:py-8">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Panel General</h1>
            <p className="text-sm text-gray-500 mt-1">Resumen de tu club en tiempo real.</p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-500 shadow-sm w-fit">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </div>
        </header>

        {/* GRID PRINCIPAL (estilo dashboard con panel derecho) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUMNA IZQUIERDA */}
          <div className="lg:col-span-8 space-y-6">
            {/* KPIs */}
            {(isAdmin || isManager) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Resumen
                  </h2>
                  <Link
                    href="/matches"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver partidos →
                  </Link>
                </div>

                {loadingDashboard ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="h-24 bg-gray-100 animate-pulse rounded-xl"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Torneos</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {countTournaments}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">Activos / creados</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        🏆
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Pendientes</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {countPendingMatches}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">Sin resultado</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        🎾
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Jugadores</p>
                        <p className="text-2xl font-extrabold text-gray-900">{countPlayers}</p>
                        <p className="text-[11px] text-gray-500 mt-1">Aprobados</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        👥
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Próximo</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {upcomingMatches[0]?.start_time
                            ? new Date(upcomingMatches[0].start_time).toLocaleTimeString("es-ES", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">Hora del partido</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        📅
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GRÁFICO (últimos 7 días) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Actividad (7 días)
                </h2>
                <span className="text-xs text-gray-400">Pendientes vs finalizados</span>
              </div>

              {chart7d.length === 0 ? (
                <div className="h-40 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-500">
                  No hay datos para graficar.
                </div>
              ) : (
                (() => {
                  const max = Math.max(1, ...chart7d.map((d) => d.total));
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-7 gap-2 items-end h-44">
                        {chart7d.map((d) => {
                          const hTotal = Math.round((d.total / max) * 100);
                          const hPending = d.total ? Math.round((d.pending / max) * 100) : 0;
                          const hFinished = d.total ? Math.round((d.finished / max) * 100) : 0;

                          return (
                            <div key={d.key} className="flex flex-col items-center gap-2">
                              <div className="w-full flex items-end justify-center gap-1 h-36">
                                <div
                                  className="w-3 rounded-t bg-yellow-300"
                                  style={{ height: `${Math.max(2, hPending)}%` }}
                                  title={`${d.pending} pendientes`}
                                />
                                <div
                                  className="w-3 rounded-t bg-green-400"
                                  style={{ height: `${Math.max(2, hFinished)}%` }}
                                  title={`${d.finished} finalizados`}
                                />
                              </div>
                              <div className="text-[11px] text-gray-500 capitalize">{d.label}</div>
                              <div className="text-[11px] font-semibold text-gray-700">{d.total}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-yellow-300" />
                          Pendientes
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-green-400" />
                          Finalizados
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* ALERTAS */}
            {(isAdmin || isManager) && alerts.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Alertas
                  </h2>
                  <span className="text-xs text-gray-400">Sugerencias inteligentes</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border p-4 text-sm shadow-sm flex items-start justify-between gap-4 ${
                        alert.type === "warning"
                          ? "bg-yellow-50 border-yellow-300 text-yellow-900"
                          : "bg-blue-50 border-blue-300 text-blue-900"
                      }`}
                    >
                      <p>{alert.message}</p>
                      {alert.actionHref && alert.actionLabel && (
                        <Link
                          href={alert.actionHref}
                          className="shrink-0 inline-flex items-center rounded-md bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-white transition"
                        >
                          {alert.actionLabel} →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PRÓXIMOS PARTIDOS */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Próximos partidos
                </h2>
                <Link
                  href="/matches"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Ver todos →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingMatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                    No hay partidos pendientes para mostrar.
                  </div>
                ) : (
                  upcomingMatches.map((m: UpcomingMatch) => {
                    const matchWithName: any = {
                      ...m,
                      tournament_name: m.tournament_id
                        ? tournamentMap[m.tournament_id]
                        : undefined,
                    };
                    const clickable =
                      !!m.score &&
                      !!m.winner &&
                      String(m.winner).toLowerCase() !== "pending";

                    return (
                      <div
                        key={m.id}
                        className={clickable ? "cursor-pointer" : ""}
                        onClick={() => {
                          if (clickable)
                            setOpenResultMatch(matchWithName as any);
                        }}
                      >
                        <MatchCard
                          match={matchWithName}
                          playersMap={playerMap}
                          showActions={false}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RESULTADOS + RANKING */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Resultados recientes */}
              <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Resultados recientes
                  </h2>
                  <Link
                    href="/matches?status=finished"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver historial →
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentResults.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                      Todavía no hay resultados cargados.
                    </div>
                  ) : (
                    recentResults.map((m: FinishedMatch) => {
                      const matchWithName: any = {
                        ...m,
                        tournament_name: m.tournament_id
                          ? tournamentMap[m.tournament_id]
                          : undefined,
                      };
                      return (
                        <div
                          key={m.id}
                          className="cursor-pointer"
                          onClick={() => setOpenResultMatch(matchWithName)}
                        >
                          <MatchCard
                            match={matchWithName}
                            playersMap={playerMap}
                            showActions={false}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Ranking */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Ranking
                  </h2>
                  <span className="text-xs text-gray-400">3 pts victoria / 1 derrota</span>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="tournament-selector"
                    className="block text-xs font-medium text-gray-500 mb-1"
                  >
                    Torneo
                  </label>
                  <select
                    id="tournament-selector"
                    value={selectedTournamentId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTournamentId(val === "" ? null : Number(val));
                    }}
                    className="w-full rounded-md border-gray-300 py-1.5 px-2 text-sm"
                  >
                    <option value="">Todos los torneos</option>
                    {Object.entries(tournamentMap).map(([tid, tname]) => (
                      <option key={tid} value={tid}>
                        {tname}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex font-semibold text-[11px] text-gray-600 px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <div className="w-6 text-center">#</div>
                    <div className="flex-1">Jugador</div>
                    <div className="w-10 text-center">Pts</div>
                  </div>

                  {topRanking.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">
                      No hay datos de ranking para mostrar.
                    </div>
                  ) : (
                    topRanking.slice(0, 8).map((r: RankingItem, idx: number) => {
                      const medal =
                        idx === 0
                          ? "🥇"
                          : idx === 1
                          ? "🥈"
                          : idx === 2
                          ? "🥉"
                          : null;

                      return (
                        <Link
                          key={r.player_id}
                          href={`/players/${r.player_id}`}
                          className="flex items-center px-3 py-2 border-b last:border-b-0 border-gray-100 hover:bg-gray-50 transition"
                        >
                          <div className="w-6 text-center text-sm font-bold text-gray-500">
                            {medal ?? idx + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-semibold text-sm text-gray-900">
                              {r.name}
                            </span>
                            <div className="text-[11px] text-gray-500">
                              PJ {r.played} · PG {r.wins} · PP {r.losses}
                            </div>
                          </div>
                          <div className="w-10 text-center font-extrabold text-green-700">
                            {r.points}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA */}
          <aside className="lg:col-span-4 space-y-6">
            {/* ACCIONES RÁPIDAS */}
            {(isAdmin || isManager) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Acciones rápidas
                </h2>

                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href="/matches/create"
                    className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                  >
                    <span>➕ Crear partido</span>
                    <span className="text-gray-400">→</span>
                  </Link>

                  <Link
                    href="/matches?status=pending"
                    className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                  >
                    <span>🎯 Cargar resultados</span>
                    <span className="text-gray-400">→</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/tournaments/create"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                    >
                      <span>🏆 Crear torneo</span>
                      <span className="text-gray-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/users/manage?crear=1"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 transition"
                    >
                      <span>👤 Crear usuario</span>
                      <span className="text-indigo-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/users/manage"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 shadow-sm hover:bg-purple-100 transition"
                    >
                      <span>🛠️ Administrar usuarios</span>
                      <span className="text-purple-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/logs"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                    >
                      <span>📜 Ver logs</span>
                      <span className="text-gray-400">→</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVIDAD RECIENTE */}
            {isAdmin && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                <div className="p-5 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Actividad reciente
                  </h2>
                </div>

                <div className="divide-y">
                  {recentLogs.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No hay actividad registrada.</p>
                  ) : (
                    recentLogs.map((log) => (
                      <div key={log.id} className="p-4 flex items-start gap-3">
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-green-500" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">
                            <span className="font-semibold">
                              {log.user_email ?? "Sistema"}
                            </span>{" "}
                            realizó{" "}
                            <span className="font-semibold">
                              {log.action.replace(/_/g, " ").toLowerCase()}
                            </span>
                            {log.entity && (
                              <>
                                {" "}
                                en <span className="font-semibold">{log.entity}</span>
                              </>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(log.created_at).toLocaleString("es-ES")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* AYUDA RÁPIDA */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Atajos
              </h2>
              <div className="text-sm text-gray-600 space-y-2">
                <Link href="/players" className="block hover:text-gray-900">
                  Jugadores →
                </Link>
                <Link href="/tournaments" className="block hover:text-gray-900">
                  Torneos →
                </Link>
                <Link href="/matches" className="block hover:text-gray-900">
                  Partidos →
                </Link>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {/* Render oculto para generar imagen (Instagram 1:1) */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {openResultMatch && isPlayed(openResultMatch) && (
          <div ref={shareCardRef}>
            {(() => {
              const t = getWinnerLoserTeams(openResultMatch);
              return (
                <MatchShareCard
                  winnerTeam={t.winnerTeam}
                  loserTeam={t.loserTeam}
                  score={t.score}
                />
              );
            })()}
          </div>
        )}
      </div>

      {openResultMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#0F172A] w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 relative text-white">
            <button
              onClick={() => setOpenResultMatch(null)}
              className="absolute top-3 right-3 text-white/60 hover:text-white"
            >
              ✕
            </button>

            <div className="flex flex-col items-center gap-1">
              <img
                src="/logo.svg"
                alt="DEMO Padel Manager"
                className="h-8 w-auto object-contain"
              />
              <span className="text-xs tracking-widest text-green-400">PADEL MANAGER</span>
            </div>

            <div className="text-center space-y-2 mt-4">
              {isPlayed(openResultMatch) ? (
                <>
                  <p className="text-lg font-semibold">
                    {openResultMatch.winner === "A"
                      ? buildTeamNameFromIds(
                          openResultMatch.player_1_a,
                          openResultMatch.player_2_a
                        )
                      : buildTeamNameFromIds(
                          openResultMatch.player_1_b,
                          openResultMatch.player_2_b
                        )}
                  </p>

                  <p className="text-5xl font-extrabold my-2">
                    {formatScoreForDisplay(openResultMatch.score)}
                  </p>

                  <p className="text-sm text-white/70">
                    {openResultMatch.winner === "A"
                      ? buildTeamNameFromIds(
                          openResultMatch.player_1_b,
                          openResultMatch.player_2_b
                        )
                      : buildTeamNameFromIds(
                          openResultMatch.player_1_a,
                          openResultMatch.player_2_a
                        )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/60">Resultado todavía no cargado</p>
              )}
            </div>

            <div className="space-y-2">
              <button
                disabled={!isPlayed(openResultMatch)}
                onClick={async () => {
                  if (!isPlayed(openResultMatch)) return;
                  try {
                    const result = await generatePngFromShareRef();
                    if (!result) {
                      toast.error("No se pudo generar la imagen");
                      return;
                    }

                    const { blob, url } = result;
                    const file = new File([blob], "resultado-twinco.png", {
                      type: "image/png",
                    });

                    if (navigator.share) {
                      try {
                        await navigator.share({
                          files: [file],
                          title: "Resultado del partido",
                          text: "Resultado DEMO Padel Manager",
                        });
                        toast.success("¡Imagen compartida!");
                        URL.revokeObjectURL(url);
                        return;
                      } catch (err: any) {
                        if (
                          err?.name === "AbortError" ||
                          err?.message === "Share canceled"
                        ) {
                          URL.revokeObjectURL(url);
                          return;
                        }
                        // si share falla, caemos al download
                      }
                    }

                    // Fallback: descargar
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "resultado-twinco.png";
                    a.click();
                    toast.success("Imagen descargada");
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                    toast.error("No se pudo generar la imagen");
                  }
                }}
                className={`w-full mt-2 py-2 rounded-xl font-semibold transition ${
                  isPlayed(openResultMatch)
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
              >
                Compartir imagen
              </button>

              <button
                disabled={!isPlayed(openResultMatch)}
                onClick={async () => {
                  if (!isPlayed(openResultMatch)) return;
                  try {
                    const result = await generatePngFromShareRef();
                    if (!result) {
                      toast.error("No se pudo generar la imagen");
                      return;
                    }

                    const { url } = result;
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "resultado-twinco.png";
                    a.click();
                    toast.success("Imagen descargada");
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                    toast.error("No se pudo generar la imagen");
                  }
                }}
                className={`w-full py-2 rounded-xl font-semibold transition ${
                  isPlayed(openResultMatch)
                    ? "bg-white/10 hover:bg-white/20 text-white"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}
              >
                Descargar imagen
              </button>

              <p className="text-center text-xs text-white/60">
                Ideal para WhatsApp e Instagram.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}