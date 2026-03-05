// ./app/ranking/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import Card from "../components/Card";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { getClientCache, setClientCache } from "@/lib/clientCache";

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

type ScopeMode = "general" | "tournament";

function emptyRankingStats() {
  return {
    wins: 0,
    losses: 0,
    played: 0,
    games_for: 0,
    games_against: 0,
    points: 0,
  };
}

function getScopeDescription(
  scopeMode: ScopeMode,
  selectedTournamentName: string
) {
  if (scopeMode === "general") {
    return "Top 10 general histórico (sin filtro por fecha).";
  }
  if (selectedTournamentName) {
    return `Ranking del torneo ${selectedTournamentName}.`;
  }
  return "Ranking del torneo seleccionado.";
}

function getPodiumStyle(position: number) {
  if (position === 1) {
    return {
      card: "border-amber-300 bg-amber-50",
      position: "bg-amber-500 text-white",
      points: "text-amber-700",
      avatar: "border-amber-300",
      emoji: "🥇",
    };
  }
  if (position === 2) {
    return {
      card: "border-slate-300 bg-slate-50",
      position: "bg-slate-500 text-white",
      points: "text-slate-700",
      avatar: "border-slate-300",
      emoji: "🥈",
    };
  }
  return {
    card: "border-orange-300 bg-orange-50",
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
      label: "En juego",
      className: "bg-gray-100 text-gray-700 border border-gray-200",
    };
  }
  if (winRate >= 70) {
    return {
      label: "Elite",
      className: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    };
  }
  if (winRate >= 55) {
    return {
      label: "Firme",
      className: "bg-blue-100 text-blue-700 border border-blue-200",
    };
  }
  return {
    label: "En mejora",
    className: "bg-amber-100 text-amber-700 border border-amber-200",
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
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("general");
  const [selectedTournamentId, setSelectedTournamentId] = useState("");

  const isGeneralView = scopeMode === "general";
  const isTournamentView = scopeMode === "tournament";

  const selectedTournamentName =
    tournaments.find((t) => String(t.id) === selectedTournamentId)?.name || "";

  const selectedScope = useMemo(() => {
    if (scopeMode === "tournament") return `tournament:${selectedTournamentId}`;
    return "general";
  }, [scopeMode, selectedTournamentId]);
  const rankingCacheKey = `qa:ranking:${selectedScope}`;

  const scopeDescription = getScopeDescription(scopeMode, selectedTournamentName);
  const performanceTooltip =
    "Rendimiento = estado por porcentaje de victorias. En juego (<3 PJ), Elite (>=70%), Firme (55-69%), En mejora (<55%).";

  const loadRanking = useCallback(async () => {
    type RankingCachePayload = { players: RankedPlayer[]; matchCount: number };
    const cached = getClientCache<RankingCachePayload>(rankingCacheKey, 2 * 60 * 1000);
    if (cached) {
      setPlayers(cached.players || []);
      setMatchCount(cached.matchCount || 0);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      let availableTournaments = tournaments;
      if (!tournamentsLoaded) {
        const { data: tournamentData, error: tournamentError } = await supabase
          .from("tournaments")
          .select("id, name")
          .order("start_date", { ascending: false });

        if (tournamentError) {
          console.error("Error cargando torneos para ranking:", tournamentError);
        } else {
          availableTournaments = tournamentData || [];
          setTournaments(availableTournaments);
          setTournamentsLoaded(true);
        }
      }

      if (isTournamentView && !selectedTournamentId) {
        if (availableTournaments.length > 0) {
          setSelectedTournamentId(String(availableTournaments[0].id));
        }
        setPlayers([]);
        setMatchCount(0);
        return;
      }

      let rankingsQuery = supabase
        .from("tournament_rankings")
        .select("player_id, matches_won, matches_lost, points, games_for, games_against");

      let matchesCountQuery = supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .not("tournament_id", "is", null);

      if (selectedScope === "general") {
        // Top 10 general histórico sin filtro por fecha.
      } else if (selectedScope.startsWith("tournament:")) {
        const tournamentId = Number(selectedScope.slice("tournament:".length));
        if (!Number.isFinite(tournamentId)) {
          toast.error("Filtro de ranking inválido");
          setPlayers([]);
          setMatchCount(0);
          return;
        }
        rankingsQuery = rankingsQuery.eq("tournament_id", tournamentId);
        matchesCountQuery = matchesCountQuery.eq("tournament_id", tournamentId);
      } else {
        toast.error("Filtro de ranking inválido");
        setPlayers([]);
        setMatchCount(0);
        return;
      }

      const [
        { data: rankingRows, error: rankingError },
        { count: matchesCount, error: matchesCountError },
      ] = await Promise.all([rankingsQuery, matchesCountQuery]);

      if (matchesCountError) {
        console.error("Error contando partidos para ranking:", matchesCountError);
      }
      setMatchCount(matchesCount || 0);

      const statsMap: Record<number, RankedPlayer> = {};
      const getOrCreateStats = (playerId: number) => {
        if (!statsMap[playerId]) {
          statsMap[playerId] = {
            id: playerId,
            name: "",
            avatar_url: null,
            ...emptyRankingStats(),
          };
        }
        return statsMap[playerId];
      };

      if (rankingError) {
        console.warn("Error cargando tournament_rankings, usando fallback:", rankingError);

        let matchQuery = supabase
          .from("matches")
          .select("winner, player_1_a, player_2_a, player_1_b, player_2_b, tournament_id, score")
          .not("tournament_id", "is", null);

        if (selectedScope.startsWith("tournament:")) {
          const tournamentId = Number(selectedScope.slice("tournament:".length));
          if (Number.isFinite(tournamentId)) {
            matchQuery = matchQuery.eq("tournament_id", tournamentId);
          }
        }

        const { data: matches, error: matchError } = await matchQuery;
        if (matchError) {
          console.error("Error cargando ranking (fallback):", matchError);
          toast.error("No se pudo cargar el ranking");
          setPlayers([]);
          setMatchCount(0);
          return;
        }

        setMatchCount((matches || []).length);

        for (const match of (matches || []) as any[]) {
          if (
            !match.player_1_a ||
            !match.player_2_a ||
            !match.player_1_b ||
            !match.player_2_b
          ) {
            continue;
          }
          if (!match.winner || match.winner === "pending") continue;

          const teamA = [match.player_1_a, match.player_2_a] as number[];
          const teamB = [match.player_1_b, match.player_2_b] as number[];

          const sets = String(match.score || "").split(" ");
          let gamesA = 0;
          let gamesB = 0;

          for (const setScore of sets) {
            const [a, b] = setScore.split("-").map(Number);
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              gamesA += a;
              gamesB += b;
            }
          }

          for (const id of [...teamA, ...teamB]) {
            getOrCreateStats(id).played += 1;
          }

          for (const id of teamA) {
            const stats = getOrCreateStats(id);
            stats.games_for += gamesA;
            stats.games_against += gamesB;
          }

          for (const id of teamB) {
            const stats = getOrCreateStats(id);
            stats.games_for += gamesB;
            stats.games_against += gamesA;
          }

          if (match.winner === "A") {
            for (const id of teamA) {
              const stats = getOrCreateStats(id);
              stats.wins += 1;
              stats.points += 3;
            }
            for (const id of teamB) {
              const stats = getOrCreateStats(id);
              stats.losses += 1;
              stats.points += 1;
            }
          }

          if (match.winner === "B") {
            for (const id of teamB) {
              const stats = getOrCreateStats(id);
              stats.wins += 1;
              stats.points += 3;
            }
            for (const id of teamA) {
              const stats = getOrCreateStats(id);
              stats.losses += 1;
              stats.points += 1;
            }
          }
        }
      } else {
        for (const row of (rankingRows || []) as any[]) {
          const playerId = Number(row.player_id);
          if (!Number.isFinite(playerId)) continue;
          const stats = getOrCreateStats(playerId);
          const wins = Number(row.matches_won) || 0;
          const losses = Number(row.matches_lost) || 0;
          stats.wins += wins;
          stats.losses += losses;
          stats.played += wins + losses;
          stats.games_for += Number(row.games_for) || 0;
          stats.games_against += Number(row.games_against) || 0;
          stats.points += Number(row.points) || 0;
        }
      }

      const activePlayerIds = Object.entries(statsMap)
        .map(([id, stats]) => ({ id: Number(id), played: stats.played }))
        .filter((entry) => Number.isFinite(entry.id) && entry.played > 0)
        .map((entry) => entry.id);

      if (activePlayerIds.length === 0) {
        setPlayers([]);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, name, avatar_url")
        .eq("is_approved", true)
        .in("id", activePlayerIds);

      if (playerError) {
        console.error("Error cargando jugadores para ranking:", playerError);
        toast.error("No se pudieron cargar los jugadores");
        setPlayers([]);
        return;
      }

      let ranking: RankedPlayer[] = (playerData || [])
        .map((player: any) => {
          const stats = statsMap[player.id];
          if (!stats || stats.played === 0) return null;
          return {
            id: player.id,
            name: player.name,
            avatar_url: player.avatar_url,
            wins: stats.wins,
            losses: stats.losses,
            played: stats.played,
            games_for: stats.games_for,
            games_against: stats.games_against,
            points: stats.points,
          } as RankedPlayer;
        })
        .filter(Boolean) as RankedPlayer[];

      ranking.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        const diffA = a.games_for - a.games_against;
        const diffB = b.games_for - b.games_against;
        if (diffB !== diffA) return diffB - diffA;
        if (b.games_for !== a.games_for) return b.games_for - a.games_for;
        return a.name.localeCompare(b.name);
      });

      if (selectedScope === "general") {
        ranking = ranking.slice(0, 10);
      }

      setPlayers(ranking);
      setClientCache(rankingCacheKey, {
        players: ranking,
        matchCount: matchesCount || 0,
      });
    } catch (error) {
      console.error("Error inesperado cargando ranking:", error);
      toast.error("No se pudo cargar el ranking");
      setPlayers([]);
      setMatchCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    isTournamentView,
    rankingCacheKey,
    selectedScope,
    selectedTournamentId,
    tournaments,
    tournamentsLoaded,
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
      .channel("public:ranking-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_rankings" },
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
  const leaderByPoints = players[0] || null;
  const leaderByGamesWon = players.length
    ? players.reduce((best, current) => {
        if (current.games_for > best.games_for) return current;
        if (current.games_for < best.games_for) return best;
        if (current.points > best.points) return current;
        return best;
      }, players[0])
    : null;
  const leader = leaderByPoints;
  const totalPoints = players.reduce((acc, player) => acc + player.points, 0);

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
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-7 md:px-8 md:py-8 shadow-sm">
          <div className="pointer-events-none absolute -top-12 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-[#ccff00]/20 blur-2xl" />
          <p className="relative text-xs uppercase tracking-[0.18em] text-slate-300 font-semibold">
            Ranking Premium
          </p>
          <h1 className="relative mt-2 text-2xl md:text-3xl font-extrabold text-white tracking-wide">
            Ranking de Jugadores
          </h1>
          <p className="relative mt-2 text-sm text-slate-200">
            Visión ejecutiva del rendimiento: posición, efectividad y consistencia.
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white border border-white/20">
              {scopeDescription}
            </span>
          </div>
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs uppercase tracking-[0.16em] text-gray-500 font-semibold">
              Vista activa
            </p>
            <p className="mt-1 text-sm text-gray-700">{scopeDescription}</p>
          </div>
          <div className="px-5 py-4">
            <div className="inline-flex w-full md:w-auto rounded-xl bg-slate-100 p-1 gap-1">
              <button
                onClick={() => setScopeMode("general")}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  isGeneralView
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                General
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
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Torneo
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {isGeneralView && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Mostrando el Top 10 histórico, ideal para analizar consistencia de largo plazo.
                </div>
              )}

              {isTournamentView && (
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-gray-500 font-semibold">
                    Seleccionar torneo
                  </label>
                  <select
                    value={selectedTournamentId}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">
              Jugadores rankeados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{players.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">
              Partidos computados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{matchCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">
              Puntos acumulados
            </p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalPoints}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">
              Líder en puntos
            </p>
            <p className="mt-2 text-lg font-extrabold text-slate-900 truncate">
              {leaderByPoints ? leaderByPoints.name : "-"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {leaderByPoints ? `${leaderByPoints.points} pts` : "Sin referencia"}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">
              Líder en juegos ganados
            </p>
            <p className="mt-2 text-lg font-extrabold text-slate-900 truncate">
              {leaderByGamesWon ? leaderByGamesWon.name : "-"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {leaderByGamesWon
                ? `${leaderByGamesWon.games_for} juegos`
                : "Sin referencia"}
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
                : "No hay jugadores con puntos en ese torneo. Registrá algunos partidos."}
            </p>
          </Card>
        ) : (
          <>
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em]">
                  Podio Premium
                </h2>
                <span className="text-xs text-gray-500">Top 3 jugadores</span>
              </div>
              <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {leader && (
                  <button
                    onClick={() => handleRowClick(leader.id)}
                    className="lg:col-span-2 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5 text-left transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {renderAvatar(
                          leader,
                          "w-16 h-16 border-2 border-amber-300",
                          "text-base"
                        )}
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.12em] text-amber-700 font-semibold">
                            1° lugar
                          </p>
                          <p className="mt-1 text-xl font-extrabold text-slate-900 truncate">
                            {leader.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Win rate: {getWinRate(leader)}%
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl">🥇</span>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
                      <div className="rounded-lg bg-white border border-amber-100 px-3 py-2">
                        <p className="text-gray-500 uppercase tracking-wide">Puntos</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {leader.points}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-100 px-3 py-2">
                        <p className="text-gray-500 uppercase tracking-wide">PJ</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {leader.played}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-100 px-3 py-2">
                        <p className="text-gray-500 uppercase tracking-wide">PG</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {leader.wins}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-amber-100 px-3 py-2">
                        <p className="text-gray-500 uppercase tracking-wide">PP</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
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
                        className={`w-full rounded-xl border p-4 text-left transition hover:shadow-md ${style.card}`}
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
                    <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                      Sin jugadores suficientes para completar el podio.
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em]">
                    Tabla Pro
                  </h2>
                  <div className="relative group">
                    <button
                      type="button"
                      aria-label="Cómo se calcula el rendimiento"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-700"
                    >
                      i
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-[11px] normal-case font-medium text-slate-700 shadow-lg group-hover:block group-focus-within:block">
                      {performanceTooltip}
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-500">
                  No hay jugadores para el criterio de búsqueda.
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto max-h-[560px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                        <tr className="text-xs uppercase text-gray-500">
                          <th className="py-3 px-3 text-left font-semibold">Pos</th>
                          <th className="py-3 px-3 text-left font-semibold">Jugador</th>
                          <th className="py-3 px-3 text-center font-semibold">Rendimiento</th>
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
                              className={`border-b border-gray-100 cursor-pointer transition hover:bg-gray-50 ${
                                position <= 3 ? "bg-slate-50/70" : "bg-white"
                              }`}
                              onClick={() => handleRowClick(player.id)}
                            >
                              <td className="py-3 px-3 font-semibold text-slate-700">
                                {position}º
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {renderAvatar(player, "w-8 h-8", "text-xs")}
                                  <span className="font-medium text-slate-900">
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
                              <td className="py-3 px-3 text-center text-slate-700">
                                {player.played}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-700">
                                {player.wins}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-700">
                                {player.losses}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-700 font-semibold">
                                {getWinRate(player)}%
                              </td>
                              <td className="py-3 px-3 text-center text-slate-700">
                                {player.games_for - player.games_against}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-900">
                                {player.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden p-3 space-y-2">
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                      <span className="font-semibold text-slate-700">Rendimiento:</span>{" "}
                      {performanceTooltip.replace("Rendimiento = ", "")}
                    </p>
                    {filteredPlayers.map((player) => {
                      const position = positionByPlayerId[player.id] || 0;
                      const badge = getFormBadge(player);
                      return (
                        <button
                          key={player.id}
                          onClick={() => handleRowClick(player.id)}
                          className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-slate-900 text-white text-xs font-semibold">
                                {position}
                              </span>
                              {renderAvatar(player, "w-9 h-9", "text-xs")}
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {player.name}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-slate-900">
                              {player.points} pts
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <p className="text-[11px] text-gray-500">
                              Win rate:{" "}
                              <span className="font-semibold text-slate-900">
                                {getWinRate(player)}%
                              </span>
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-gray-600">
                            <p>
                              PJ:{" "}
                              <span className="font-semibold text-slate-900">
                                {player.played}
                              </span>
                            </p>
                            <p>
                              PG:{" "}
                              <span className="font-semibold text-slate-900">
                                {player.wins}
                              </span>
                            </p>
                            <p>
                              PP:{" "}
                              <span className="font-semibold text-slate-900">
                                {player.losses}
                              </span>
                            </p>
                            <p>
                              +/-:{" "}
                              <span className="font-semibold text-slate-900">
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
