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

function getScopeDescription(isGeneralView: boolean, isMonthlyView: boolean, selectedMonthLabel: string) {
  if (isGeneralView) {
    return "Top 10 general histórico (sin filtro por fecha).";
  }
  if (isMonthlyView) {
    return `Top 10 mensual de ${selectedMonthLabel}.`;
  }
  return "Ranking del torneo seleccionado (solo jugadores con partidos asociados).";
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

export default function RankingPage() {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [tournaments, setTournaments] = useState<{ id: number; name: string }[]>([]);
  const monthOptions = useMemo(() => getMonthOptions(MONTH_OPTION_COUNT), []);
  const currentMonthKey = monthOptions[0]?.key || getMonthKey(new Date());
  const [selectedScope, setSelectedScope] = useState<string>("general");

  const isGeneralView = selectedScope === "general";
  const isMonthlyView = selectedScope.startsWith("month:");
  const selectedMonthKey = isMonthlyView ? selectedScope.slice("month:".length) : null;
  const selectedMonthLabel =
    monthOptions.find((month) => month.key === selectedMonthKey)?.label || "";

  // Cargar ranking desde Supabase usando solo partidos para garantizar
  // que aparezcan unicamente jugadores que tengan partidos en el filtro activo.
  const loadRanking = useCallback(async () => {
    setLoading(true);

    const [{ data: playerData, error: playerError }, { data: tournamentData }] = await Promise.all([
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

    setTournaments(tournamentData || []);

    const statsMap: Record<
      number,
      { wins: number; losses: number; played: number; games_for: number; games_against: number; points: number }
    > = {};

    let matchQuery = supabase
      .from("matches")
      .select("winner, player_1_a, player_2_a, player_1_b, player_2_b, tournament_id, score, start_time")
      .not("tournament_id", "is", null);

    if (selectedScope === "general") {
      // Top 10 general sin filtro por fecha
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
      if (!match.player_1_a || !match.player_2_a || !match.player_1_b || !match.player_2_b) return;
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
          statsMap[id] = { wins: 0, losses: 0, played: 0, games_for: 0, games_against: 0, points: 0 };
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

    // Ordenar por puntos desc, luego victorias, luego diferencia de games, luego games_for, luego nombre
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
  }, [currentMonthKey, selectedScope]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    loadRanking();

    // Recalcular ranking en tiempo real, con debounce para evitar ráfagas.
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

  const podium = players.slice(0, 3);
  const totalPoints = players.reduce((acc, player) => acc + player.points, 0);
  const leader = players[0] || null;
  const scopeDescription = getScopeDescription(isGeneralView, isMonthlyView, selectedMonthLabel);

  const handleRowClick = (id: number) => {
    // Lleva al perfil de jugador, accesible para cualquier usuario
    router.push(`/players/${id}`);
  };

  const renderAvatar = (player: RankedPlayer, sizeClass: string, textClass: string, borderClass?: string) => {
    if (player.avatar_url) {
      return (
        <img
          src={player.avatar_url}
          alt={player.name}
          className={`${sizeClass} rounded-full object-cover ${borderClass || ""}`}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = `https://placehold.co/120x120/111827/ccff00?text=${player.name
              .slice(0, 1)
              .toUpperCase()}`;
          }}
        />
      );
    }

    return (
      <div className={`${sizeClass} rounded-full bg-[#ccff00] text-gray-900 flex items-center justify-center font-bold ${textClass}`}>
        {player.name.slice(0, 1).toUpperCase()}
      </div>
    );
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <section className="max-w-6xl mx-auto space-y-5">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-6 md:px-7 md:py-7 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-300 font-semibold">Ranking</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-white tracking-wide">
            Ranking de Jugadores
          </h1>
          <p className="mt-2 text-sm text-slate-200">
            Vista comparativa con puntaje, rendimiento y tendencia de cada jugador.
          </p>
        </div>

        <Card className="!p-4 md:!p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-gray-500 font-semibold">Filtro activo</p>
              <p className="mt-1 text-sm text-gray-700">{scopeDescription}</p>
            </div>
            <div className="w-full md:w-[380px]">
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="general">Top 10 general (histórico)</option>
                <optgroup label="Top 10 mensual">
                  {monthOptions.map((month) => (
                    <option key={month.key} value={`month:${month.key}`}>
                      {`Top 10 - ${month.label}`}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Ranking por torneo">
                  {tournaments.map((t) => (
                    <option key={t.id} value={`tournament:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">Jugadores en ranking</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{players.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">Partidos evaluados</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{matchCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-gray-500 font-semibold">Puntos acumulados</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalPoints}</p>
            {leader && (
              <p className="mt-1 text-xs text-gray-500">Líder: {leader.name}</p>
            )}
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
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em]">
                  Podio
                </h2>
                <span className="text-xs text-gray-500">Top 3</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {podium.map((player, index) => {
                  const position = index + 1;
                  const style = getPodiumStyle(position);

                  return (
                    <button
                      key={player.id}
                      onClick={() => handleRowClick(player.id)}
                      className={`rounded-xl border p-4 text-left transition hover:shadow-md ${style.card}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full text-xs font-bold ${style.position}`}>
                          {position}°
                        </span>
                        <span className="text-xl">{style.emoji}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        {renderAvatar(player, "w-12 h-12 border-2", "text-sm", style.avatar)}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{player.name}</p>
                          <p className={`text-xs font-semibold ${style.points}`}>{player.points} pts</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                        <div>
                          <p className="uppercase tracking-wide">PJ</p>
                          <p className="font-bold text-slate-900">{player.played}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide">PG</p>
                          <p className="font-bold text-slate-900">{player.wins}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-wide">PP</p>
                          <p className="font-bold text-slate-900">{player.losses}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {podium.length === 0 && (
                  <p className="text-sm text-gray-500 md:col-span-3 text-center py-2">
                    Aún no hay jugadores en el podio.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em] mb-4">
                Tabla completa
              </h2>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      <th className="py-2 px-2 text-left font-semibold">Pos</th>
                      <th className="py-2 px-2 text-left font-semibold">Jugador</th>
                      <th className="py-2 px-2 text-center font-semibold">PJ</th>
                      <th className="py-2 px-2 text-center font-semibold">PG</th>
                      <th className="py-2 px-2 text-center font-semibold">PP</th>
                      <th className="py-2 px-2 text-center font-semibold">+/-</th>
                      <th className="py-2 px-2 text-center font-semibold">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => {
                      const position = index + 1;
                      const isTop3 = position <= 3;
                      return (
                        <tr
                          key={player.id}
                          className={`border-b border-gray-100 cursor-pointer transition hover:bg-gray-50 ${
                            isTop3 ? "bg-slate-50" : ""
                          }`}
                          onClick={() => handleRowClick(player.id)}
                        >
                          <td className="py-3 px-2 font-semibold text-slate-700">{position}º</td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              {renderAvatar(player, "w-8 h-8", "text-xs")}
                              <span className="font-medium text-slate-900">{player.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-slate-700">{player.played}</td>
                          <td className="py-3 px-2 text-center text-slate-700">{player.wins}</td>
                          <td className="py-3 px-2 text-center text-slate-700">{player.losses}</td>
                          <td className="py-3 px-2 text-center text-slate-700">{player.games_for - player.games_against}</td>
                          <td className="py-3 px-2 text-center font-bold text-slate-900">{player.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {players.map((player, index) => (
                  <button
                    key={player.id}
                    onClick={() => handleRowClick(player.id)}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-slate-900 text-white text-xs font-semibold">
                          {index + 1}
                        </span>
                        {renderAvatar(player, "w-9 h-9", "text-xs")}
                        <p className="text-sm font-semibold text-slate-900 truncate">{player.name}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{player.points} pts</p>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-gray-600">
                      <p>PJ: <span className="font-semibold text-slate-900">{player.played}</span></p>
                      <p>PG: <span className="font-semibold text-slate-900">{player.wins}</span></p>
                      <p>PP: <span className="font-semibold text-slate-900">{player.losses}</span></p>
                      <p>+/-: <span className="font-semibold text-slate-900">{player.games_for - player.games_against}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}
      </section>
    </main>
  );
}
