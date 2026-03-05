// ./app/ranking/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import Card from "../components/Card";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type RankedPlayer = {
  id: number;
  name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  played: number;
  games_for: number;
  games_against: number;
  points: number;
};

type ScopeMode = "general" | "month" | "tournament";

const MONTH_OPTION_COUNT = 12;

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthOptions(count: number) {
  const baseDate = new Date();
  baseDate.setDate(1);
  baseDate.setHours(0, 0, 0, 0);

  return Array.from({ length: count }).map((_, index) => {
    const d = new Date(baseDate);
    d.setMonth(baseDate.getMonth() - index);
    const key = getMonthKey(d);
    const label = d.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
    return { key, label };
  });
}

function getScopeDescription(
  scopeMode: ScopeMode,
  selectedMonthLabel: string,
  selectedTournamentName: string
) {
  if (scopeMode === "general") {
    return "Top 10 general histórico (sin filtro por fecha).";
  }
  if (scopeMode === "month") {
    return `Top 10 mensual de ${selectedMonthLabel}.`;
  }
  if (selectedTournamentName) {
    return `Ranking del torneo ${selectedTournamentName}.`;
  }
  return "Ranking del torneo seleccionado.";
}

function getPodiumStyle(position: number) {
  if (position === 1) {
    return {
      card: "border-lime-300 bg-gradient-to-br from-lime-50 to-cyan-50",
      position: "bg-lime-500 text-slate-900",
      points: "text-cyan-700",
      avatar: "border-lime-300",
      emoji: "🥇",
    };
  }
  if (position === 2) {
    return {
      card: "border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50",
      position: "bg-blue-600 text-white",
      points: "text-blue-700",
      avatar: "border-blue-300",
      emoji: "🥈",
    };
  }
  return {
    card: "border-orange-300 bg-gradient-to-br from-orange-50 to-red-50",
    position: "bg-orange-500 text-white",
    points: "text-orange-700",
    avatar: "border-orange-300",
    emoji: "🥉",
  };
}

function getWinRate(player: RankedPlayer) {
  if (!player.played) return 0;
  return Math.round((player.wins / player.played) * 100);
}

function getFormBadge(player: RankedPlayer) {
  const winRate = getWinRate(player);
  if (player.played < 3) {
    return {
      label: "Calentando",
      className: "bg-slate-100 text-slate-700 border border-slate-200",
    };
  }
  if (winRate >= 70) {
    return {
      label: "On Fire",
      className: "bg-lime-100 text-lime-800 border border-lime-300",
    };
  }
  if (winRate >= 55) {
    return {
      label: "Competitivo",
      className: "bg-cyan-100 text-cyan-800 border border-cyan-300",
    };
  }
  return {
    label: "Remontando",
    className: "bg-orange-100 text-orange-800 border border-orange-300",
  };
}

export default function RankingPage() {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState("");
  const router = useRouter();

  const [tournaments, setTournaments] = useState<{ id: number; name: string }[]>(
    []
  );
  const monthOptions = useMemo(() => getMonthOptions(MONTH_OPTION_COUNT), []);
  const currentMonthKey = monthOptions[0]?.key || getMonthKey(new Date());

  const [scopeMode, setScopeMode] = useState<ScopeMode>("general");
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");

  const isGeneralView = scopeMode === "general";
  const isMonthlyView = scopeMode === "month";
  const isTournamentView = scopeMode === "tournament";

  const selectedMonthLabel =
    monthOptions.find((month) => month.key === selectedMonthKey)?.label ||
    "mes seleccionado";

  const selectedTournamentName =
    tournaments.find((t) => String(t.id) === selectedTournamentId)?.name || "";

  const selectedScope = useMemo(() => {
    if (scopeMode === "month") return `month:${selectedMonthKey}`;
    if (scopeMode === "tournament") return `tournament:${selectedTournamentId}`;
    return "general";
  }, [scopeMode, selectedMonthKey, selectedTournamentId]);

  const scopeDescription = getScopeDescription(
    scopeMode,
    selectedMonthLabel,
    selectedTournamentName
  );

  const loadRanking = useCallback(async () => {
    setLoading(true);

    const [{ data: playerData, error: playerError }, { data: tournamentData }] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, name, avatar_url")
          .eq("is_approved", true),
        supabase
          .from("tournaments")
          .select("id, name")
          .order("start_date", { ascending: false }),
      ]);

    if (playerError) {
      console.error("Error cargando jugadores:", playerError);
      toast.error("No se pudieron cargar los jugadores");
      setLoading(false);
      return;
    }

    const availableTournaments = tournamentData || [];
    setTournaments(availableTournaments);

    if (isTournamentView && !selectedTournamentId) {
      if (availableTournaments.length > 0) {
        setSelectedTournamentId(String(availableTournaments[0].id));
      }
      setPlayers([]);
      setMatchCount(0);
      setLoading(false);
      return;
    }

    const statsMap: Record<
      number,
      {
        wins: number;
        losses: number;
        played: number;
        games_for: number;
        games_against: number;
        points: number;
      }
    > = {};

    let matchQuery = supabase
      .from("matches")
      .select(
        "winner, player_1_a, player_2_a, player_1_b, player_2_b, tournament_id, score, start_time"
      )
      .not("tournament_id", "is", null);

    if (selectedScope === "general") {
      // Top 10 general sin filtro por fecha.
    } else if (selectedScope.startsWith("month:")) {
      const monthKey = selectedScope.slice("month:".length) || currentMonthKey;
      const [yearRaw, monthRaw] = monthKey.split("-");
      const year = Number(yearRaw);
      const month = Number(monthRaw);

      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        toast.error("Mes seleccionado inválido");
        setLoading(false);
        return;
      }

      const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const nextMonthStart = new Date(year, month, 1, 0, 0, 0, 0);
      matchQuery = matchQuery
        .gte("start_time", monthStart.toISOString())
        .lt("start_time", nextMonthStart.toISOString());
    } else if (selectedScope.startsWith("tournament:")) {
      const tournamentId = Number(selectedScope.slice("tournament:".length));
      if (!Number.isFinite(tournamentId)) {
        setPlayers([]);
        setMatchCount(0);
        setLoading(false);
        return;
      }
      matchQuery = matchQuery.eq("tournament_id", tournamentId);
    } else {
      toast.error("Filtro de ranking inválido");
      setLoading(false);
      return;
    }

    const { data: matches, error: matchError } = await matchQuery;

    if (matchError) {
      console.error("Error cargando ranking:", matchError);
      toast.error("No se pudo cargar el ranking");
      setLoading(false);
      return;
    }

    setMatchCount((matches || []).length);

    (matches || []).forEach((match: any) => {
      if (
        !match.player_1_a ||
        !match.player_2_a ||
        !match.player_1_b ||
        !match.player_2_b
      )
        return;
      if (!match.winner || match.winner === "pending") return;

      const teamA = [match.player_1_a, match.player_2_a];
      const teamB = [match.player_1_b, match.player_2_b];

      const sets = String(match.score || "").split(" ");
      let gamesA = 0;
      let gamesB = 0;

      sets.forEach((set: string) => {
        const [a, b] = set.split("-").map(Number);
        if (!isNaN(a) && !isNaN(b)) {
          gamesA += a;
          gamesB += b;
        }
      });

      [...teamA, ...teamB].forEach((id: number) => {
        if (!statsMap[id]) {
          statsMap[id] = {
            wins: 0,
            losses: 0,
            played: 0,
            games_for: 0,
            games_against: 0,
            points: 0,
          };
        }
        statsMap[id].played += 1;
      });

      teamA.forEach((id: number) => {
        statsMap[id].games_for += gamesA;
        statsMap[id].games_against += gamesB;
      });

      teamB.forEach((id: number) => {
        statsMap[id].games_for += gamesB;
        statsMap[id].games_against += gamesA;
      });

      if (match.winner === "A") {
        teamA.forEach((id: number) => {
          statsMap[id].wins += 1;
          statsMap[id].points += 3;
        });
        teamB.forEach((id: number) => {
          statsMap[id].losses += 1;
          statsMap[id].points += 1;
        });
      }

      if (match.winner === "B") {
        teamB.forEach((id: number) => {
          statsMap[id].wins += 1;
          statsMap[id].points += 3;
        });
        teamA.forEach((id: number) => {
          statsMap[id].losses += 1;
          statsMap[id].points += 1;
        });
      }
    });

    let ranking: RankedPlayer[] = (playerData || [])
      .filter((p: any) => Boolean(statsMap[p.id]))
      .map((p: any) => {
        const stats = statsMap[p.id] || {
          wins: 0,
          losses: 0,
          played: 0,
          games_for: 0,
          games_against: 0,
          points: 0,
        };

        return {
          id: p.id,
          name: p.name,
          avatar_url: p.avatar_url,
          wins: stats.wins,
          losses: stats.losses,
          played: stats.played,
          games_for: stats.games_for,
          games_against: stats.games_against,
          points: stats.points,
        };
      });

    ranking.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const diffA = a.games_for - a.games_against;
      const diffB = b.games_for - b.games_against;
      if (diffB !== diffA) return diffB - diffA;
      if (b.games_for !== a.games_for) return b.games_for - a.games_for;
      return a.name.localeCompare(b.name);
    });

    if (selectedScope === "general" || selectedScope.startsWith("month:")) {
      ranking = ranking.slice(0, 10);
    }

    setPlayers(ranking);
    setLoading(false);
  }, [
    currentMonthKey,
    isTournamentView,
    selectedScope,
    selectedTournamentId,
  ]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    loadRanking();

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void loadRanking();
      }, 400);
    };

    const channel = supabase
      .channel("public:matches-ranking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      supabase.removeChannel(channel);
    };
  }, [loadRanking]);

  useEffect(() => {
    if (!isTournamentView || tournaments.length === 0) return;
    const exists = tournaments.some((t) => String(t.id) === selectedTournamentId);
    if (!exists) {
      setSelectedTournamentId(String(tournaments[0].id));
    }
  }, [isTournamentView, selectedTournamentId, tournaments]);

  const podium = players.slice(0, 3);
  const leader = players[0] || null;
  const totalPoints = players.reduce((acc, player) => acc + player.points, 0);
  const leaderGap =
    players.length > 1 && leader ? leader.points - players[1].points : null;

  const handleRowClick = (id: number) => {
    router.push(`/players/${id}`);
  };

  const renderAvatar = (
    player: RankedPlayer,
    sizeClass: string,
    textClass: string,
    borderClass?: string
  ) => {
    if (player.avatar_url) {
      return (
        <img
          src={player.avatar_url}
          alt={player.name}
          className={`${sizeClass} rounded-full object-cover ${borderClass || ""}`}
          onError={(e: any) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = `https://placehold.co/120x120/111827/ccff00?text=${player.name
              .slice(0, 1)
              .toUpperCase()}`;
          }}
        />
      );
    }

    return (
      <div
        className={`${sizeClass} rounded-full bg-[#ccff00] text-gray-900 flex items-center justify-center font-bold ${textClass}`}
      >
        {player.name.slice(0, 1).toUpperCase()}
      </div>
    );
  };

  const filteredPlayers = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    if (!term) return players;
    return players.filter((player) => player.name.toLowerCase().includes(term));
  }, [players, tableSearch]);

  const positionByPlayerId = useMemo(() => {
    const positions: Record<number, number> = {};
    players.forEach((player, index) => {
      positions[player.id] = index + 1;
    });
    return positions;
  }, [players]);

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <section className="max-w-6xl mx-auto space-y-5">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#071428] via-[#0d2f55] to-[#0f766e] px-6 py-7 md:px-8 md:py-8 shadow-lg">
          <div className="pointer-events-none absolute -top-16 right-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-lime-300/25 blur-3xl" />
          <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-lime-300/80 to-transparent" />
          <p className="relative text-xs uppercase tracking-[0.22em] text-cyan-200 font-semibold">
            Ranking Deportivo
          </p>
          <h1 className="relative mt-2 text-2xl md:text-3xl font-extrabold text-white tracking-wide">
            Ranking de Jugadores
          </h1>
          <p className="relative mt-2 text-sm text-cyan-100/90">
            Ritmo competitivo, rendimiento en pista y posición en tiempo real.
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-cyan-100 border border-cyan-300/35">
              {scopeDescription}
            </span>
            <span className="rounded-full bg-lime-300/20 px-3 py-1 text-xs font-semibold text-lime-200 border border-lime-300/30">
              Modo Competencia
            </span>
          </div>
        </div>

        <Card className="!p-0 overflow-hidden !bg-[#0c1b2d] !border-[#1e3a5f]">
          <div className="px-5 py-4 border-b border-[#1e3a5f]">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80 font-semibold">
              Vista activa
            </p>
            <p className="mt-1 text-sm text-slate-100">{scopeDescription}</p>
          </div>
          <div className="px-5 py-4">
            <div className="inline-flex w-full md:w-auto rounded-xl bg-[#0a2746] p-1 gap-1 border border-[#214d78]">
              <button
                onClick={() => setScopeMode("general")}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isGeneralView
                    ? "bg-lime-300 text-slate-900 shadow-sm"
                    : "text-cyan-100/80 hover:text-cyan-100"
                }`}
              >
                General
              </button>
              <button
                onClick={() => setScopeMode("month")}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isMonthlyView
                    ? "bg-lime-300 text-slate-900 shadow-sm"
                    : "text-cyan-100/80 hover:text-cyan-100"
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => {
                  if (!selectedTournamentId && tournaments.length > 0) {
                    setSelectedTournamentId(String(tournaments[0].id));
                  }
                  setScopeMode("tournament");
                }}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isTournamentView
                    ? "bg-lime-300 text-slate-900 shadow-sm"
                    : "text-cyan-100/80 hover:text-cyan-100"
                }`}
              >
                Torneo
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {isGeneralView && (
                <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  Mostrando el Top 10 histórico, ideal para analizar consistencia de largo plazo.
                </div>
              )}

              {isMonthlyView && (
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-cyan-200/80 font-semibold">
                    Seleccionar mes
                  </label>
                  <select
                    value={selectedMonthKey}
                    onChange={(e) => setSelectedMonthKey(e.target.value)}
                    className="w-full border border-[#2b5b8f] rounded-lg px-3 py-2 text-sm bg-[#0a2746] text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  >
                    {monthOptions.map((month) => (
                      <option key={month.key} value={month.key}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isTournamentView && (
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-cyan-200/80 font-semibold">
                    Seleccionar torneo
                  </label>
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                    className="w-full border border-[#2b5b8f] rounded-lg px-3 py-2 text-sm bg-[#0a2746] text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  >
                    {tournaments.length === 0 ? (
                      <option value="">No hay torneos disponibles</option>
                    ) : (
                      tournaments.map((tournament) => (
                        <option key={tournament.id} value={String(tournament.id)}>
                          {tournament.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border border-cyan-300/30 bg-gradient-to-br from-[#0f2d4f] to-[#123f6b] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200 font-semibold">
              Jugadores rankeados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-white">{players.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/30 bg-gradient-to-br from-[#0f5132] to-[#0f766e] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-emerald-100 font-semibold">
              Partidos computados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-white">{matchCount}</p>
          </div>
          <div className="rounded-xl border border-lime-300/30 bg-gradient-to-br from-[#355e1f] to-[#3f7d20] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-lime-100 font-semibold">
              Puntos acumulados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-white">{totalPoints}</p>
          </div>
          <div className="rounded-xl border border-orange-300/30 bg-gradient-to-br from-[#7c2d12] to-[#b45309] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100 font-semibold">
              Liderazgo
            </p>
            <p className="mt-2 text-lg font-extrabold text-white truncate">
              {leader ? leader.name : "-"}
            </p>
            <p className="mt-1 text-xs text-orange-100/90">
              {leaderGap !== null ? `Ventaja: +${leaderGap} pts` : "Sin referencia"}
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="text-center text-gray-500">
            <p className="animate-pulse">Cargando ranking...</p>
          </Card>
        ) : players.length === 0 ? (
          <Card className="text-center text-gray-500">
            <p>
              {isGeneralView
                ? "No hay jugadores con puntos todavía. Registrá algunos partidos."
                : isMonthlyView
                ? "No hay jugadores con puntos en ese mes. Elegí otro mes del selector."
                : "No hay jugadores con puntos en ese torneo. Registrá algunos partidos."}
            </p>
          </Card>
        ) : (
          <>
            <Card className="!p-0 overflow-hidden !bg-[#0c1b2d] !border-[#1e3a5f]">
              <div className="px-5 py-4 border-b border-[#1e3a5f] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-cyan-200/80 uppercase tracking-[0.18em]">
                  Podio Elite
                </h2>
                <span className="text-xs text-cyan-100/70">Top 3 jugadores</span>
              </div>
              <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {leader && (
                  <button
                    onClick={() => handleRowClick(leader.id)}
                    className="lg:col-span-2 rounded-2xl border border-lime-300/40 bg-gradient-to-br from-[#123a56] via-[#155c76] to-[#0f766e] p-5 text-left transition hover:shadow-md hover:scale-[1.01]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {renderAvatar(
                          leader,
                          "w-16 h-16 border-2 border-lime-300",
                          "text-base"
                        )}
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.12em] text-lime-200 font-semibold">
                            1° lugar
                          </p>
                          <p className="mt-1 text-xl font-extrabold text-white truncate">
                            {leader.name}
                          </p>
                          <p className="mt-1 text-sm text-cyan-100/90">
                            Win rate: {getWinRate(leader)}%
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl">🥇</span>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
                      <div className="rounded-lg bg-white/10 border border-lime-300/20 px-3 py-2">
                        <p className="text-cyan-100/80 uppercase tracking-wide">Puntos</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {leader.points}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/10 border border-lime-300/20 px-3 py-2">
                        <p className="text-cyan-100/80 uppercase tracking-wide">PJ</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {leader.played}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/10 border border-lime-300/20 px-3 py-2">
                        <p className="text-cyan-100/80 uppercase tracking-wide">PG</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {leader.wins}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/10 border border-lime-300/20 px-3 py-2">
                        <p className="text-cyan-100/80 uppercase tracking-wide">PP</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {leader.losses}
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                <div className="space-y-3">
                  {podium.slice(1, 3).map((player, index) => {
                    const position = index + 2;
                    const style = getPodiumStyle(position);
                    return (
                      <button
                        key={player.id}
                        onClick={() => handleRowClick(player.id)}
                        className={`w-full rounded-xl border p-4 text-left transition hover:shadow-md hover:scale-[1.01] ${style.card}`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full text-xs font-bold ${style.position}`}
                          >
                            {position}°
                          </span>
                          <span className="text-xl">{style.emoji}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          {renderAvatar(
                            player,
                            "w-11 h-11 border-2",
                            "text-sm",
                            style.avatar
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {player.name}
                            </p>
                            <p className={`text-xs font-semibold ${style.points}`}>
                              {player.points} pts
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {podium.length < 2 && (
                    <div className="rounded-xl border border-dashed border-cyan-300/30 p-4 text-sm text-cyan-100/80">
                      Sin jugadores suficientes para completar el podio.
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden !bg-[#0c1b2d] !border-[#1e3a5f]">
              <div className="px-5 py-4 border-b border-[#1e3a5f] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <h2 className="text-sm font-semibold text-cyan-200/80 uppercase tracking-[0.18em]">
                  Tabla Pro
                </h2>
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="w-full md:w-64 border border-[#2b5b8f] rounded-lg px-3 py-2 text-sm bg-[#0a2746] text-slate-100 placeholder:text-cyan-100/50 focus:outline-none focus:ring-2 focus:ring-lime-300"
                />
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-cyan-100/70">
                  No hay jugadores para el criterio de búsqueda.
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto max-h-[560px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#0e243b] z-10 shadow-[0_1px_0_0_rgba(30,58,95,1)]">
                        <tr className="text-xs uppercase text-cyan-200/75">
                          <th className="py-3 px-3 text-left font-semibold">Pos</th>
                          <th className="py-3 px-3 text-left font-semibold">Jugador</th>
                          <th className="py-3 px-3 text-center font-semibold">Forma</th>
                          <th className="py-3 px-3 text-center font-semibold">PJ</th>
                          <th className="py-3 px-3 text-center font-semibold">PG</th>
                          <th className="py-3 px-3 text-center font-semibold">PP</th>
                          <th className="py-3 px-3 text-center font-semibold">Win%</th>
                          <th className="py-3 px-3 text-center font-semibold">+/-</th>
                          <th className="py-3 px-3 text-center font-semibold">Puntos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlayers.map((player) => {
                          const position = positionByPlayerId[player.id] || 0;
                          const badge = getFormBadge(player);
                          return (
                            <tr
                              key={player.id}
                              className={`border-b border-[#1e3a5f] cursor-pointer transition hover:bg-[#12314d] ${
                                position <= 3 ? "bg-[#102844]" : "bg-[#0c1b2d]"
                              }`}
                              onClick={() => handleRowClick(player.id)}
                            >
                              <td className="py-3 px-3 font-semibold text-lime-300">
                                {position}º
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {renderAvatar(player, "w-8 h-8", "text-xs")}
                                  <span className="font-medium text-white">
                                    {player.name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center text-cyan-100/90">
                                {player.played}
                              </td>
                              <td className="py-3 px-3 text-center text-cyan-100/90">
                                {player.wins}
                              </td>
                              <td className="py-3 px-3 text-center text-cyan-100/90">
                                {player.losses}
                              </td>
                              <td className="py-3 px-3 text-center text-cyan-100/90 font-semibold">
                                {getWinRate(player)}%
                              </td>
                              <td className="py-3 px-3 text-center text-cyan-100/90">
                                {player.games_for - player.games_against}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-lime-300">
                                {player.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden p-3 space-y-2">
                    {filteredPlayers.map((player) => {
                      const position = positionByPlayerId[player.id] || 0;
                      const badge = getFormBadge(player);
                      return (
                        <button
                          key={player.id}
                          onClick={() => handleRowClick(player.id)}
                          className="w-full rounded-xl border border-[#214d78] bg-[#0f243b] p-3 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-lime-300 text-slate-900 text-xs font-semibold">
                                {position}
                              </span>
                              {renderAvatar(player, "w-9 h-9", "text-xs")}
                              <p className="text-sm font-semibold text-white truncate">
                                {player.name}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-lime-300">
                              {player.points} pts
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <p className="text-[11px] text-cyan-100/75">
                              Win rate:{" "}
                              <span className="font-semibold text-white">
                                {getWinRate(player)}%
                              </span>
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-cyan-100/80">
                            <p>
                              PJ:{" "}
                              <span className="font-semibold text-white">
                                {player.played}
                              </span>
                            </p>
                            <p>
                              PG:{" "}
                              <span className="font-semibold text-white">
                                {player.wins}
                              </span>
                            </p>
                            <p>
                              PP:{" "}
                              <span className="font-semibold text-white">
                                {player.losses}
                              </span>
                            </p>
                            <p>
                              +/-:{" "}
                              <span className="font-semibold text-white">
                                {player.games_for - player.games_against}
                              </span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </section>
    </main>
  );
}
