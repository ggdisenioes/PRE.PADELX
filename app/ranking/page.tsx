// ./app/ranking/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function RankingPage() {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [tournaments, setTournaments] = useState<{ id: number; name: string }[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<number | "all">("all");

  // Cargar ranking desde Supabase (jugadores + partidos)
  const loadRanking = useCallback(async () => {
    setLoading(true);

    // Jugadores aprobados
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("id, name, avatar_url")
      .eq("is_approved", true);

    if (playerError) {
      console.error("Error cargando jugadores:", playerError);
      toast.error("No se pudieron cargar los jugadores");
      setLoading(false);
      return;
    }

    const { data: tournamentData } = await supabase
      .from("tournaments")
      .select("id, name")
      .order("start_date", { ascending: false });

    setTournaments(tournamentData || []);

    let matchQuery = supabase
      .from("matches")
      .select("winner, player_1_a, player_2_a, player_1_b, player_2_b, tournament_id, score");

    if (selectedTournament !== "all") {
      matchQuery = matchQuery.eq("tournament_id", selectedTournament);
    } else {
      // IMPORTANTE: el ranking es POR TORNEO. Los amistosos (tournament_id null) NO cuentan.
      matchQuery = matchQuery.not("tournament_id", "is", null);
    }

    const { data: matches, error: matchError } = await matchQuery;

    if (matchError) {
      console.error("Error cargando partidos:", matchError);
      toast.error("No se pudieron cargar los partidos");
      setLoading(false);
      return;
    }

    // Contar partidos jugados, victorias y derrotas por jugador
    const statsMap: Record<
      number,
      { wins: number; losses: number; played: number; games_for: number; games_against: number }
    > = {};

    (matches || []).forEach((match: any) => {
      if (!match.player_1_a || !match.player_2_a || !match.player_1_b || !match.player_2_b) return;
      if (!match.winner || match.winner === "pending") return;

      const teamA = [match.player_1_a, match.player_2_a];
      const teamB = [match.player_1_b, match.player_2_b];

      const sets = match.score?.split(" ") || [];
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
          statsMap[id] = { wins: 0, losses: 0, played: 0, games_for: 0, games_against: 0 };
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
        });
        teamB.forEach((id: number) => {
          statsMap[id].losses += 1;
        });
      }

      if (match.winner === "B") {
        teamB.forEach((id: number) => {
          statsMap[id].wins += 1;
        });
        teamA.forEach((id: number) => {
          statsMap[id].losses += 1;
        });
      }
    });

    const ranking: RankedPlayer[] = (playerData || []).map((p: any) => {
      const stats = statsMap[p.id] || { wins: 0, losses: 0, played: 0, games_for: 0, games_against: 0 };
      const points = stats.wins * 3 + stats.losses * 1;

      return {
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url,
        wins: stats.wins,
        losses: stats.losses,
        played: stats.played,
        games_for: stats.games_for,
        games_against: stats.games_against,
        points,
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

    setPlayers(ranking);
    setLoading(false);
  }, [selectedTournament]);

  useEffect(() => {
    loadRanking();

    // Recalcular ranking en tiempo real cuando cambien los partidos
    const channel = supabase
      .channel("public:matches-ranking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          loadRanking();
          toast.success("Ranking actualizado");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRanking]);

  const podium = players.slice(0, 3);
  const rest = players.slice(3);

  const handleRowClick = (id: number) => {
    // Lleva al perfil de jugador, accesible para cualquier usuario
    router.push(`/players/${id}`);
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <section className="max-w-5xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-wide">
            Ranking de Jugadores
          </h1>
          <div className="mt-4 flex justify-center">
            <select
              value={selectedTournament}
              onChange={(e) =>
                setSelectedTournament(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="all">Todos los torneos</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Puntos calculados automáticamente: 3 por victoria y 1 por derrota.
          </p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center animate-pulse">
            Cargando ranking...
          </p>
        ) : players.length === 0 ? (
          <p className="text-gray-400 text-center">
            Todavía no hay jugadores con puntos. ¡Registrá algunos partidos!
          </p>
        ) : (
          <>
            {/* 🔝 PODIO TOP 3 */}
            <Card className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em] mb-4 text-center">
                Podio
              </h2>
              <div className="grid grid-cols-3 gap-3 items-end">
                {podium.map((player, index) => (
                  <button
                    key={player.id}
                    onClick={() => handleRowClick(player.id)}
                    className={`flex flex-col items-center rounded-2xl px-3 py-4 transition hover:bg-gray-100 hover:scale-[1.02] ${
                      index === 0 ? "md:scale-105" : ""
                    }`}
                  >
                    <div className="text-sm font-bold text-[#ccff00] mb-1">
                      {index + 1}º
                    </div>
                    <div className="text-2xl mb-1">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                    </div>

                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-[#ccff00]"
                        onError={(e: any) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `https://placehold.co/80x80/111827/ccff00?text=${player.name
                            .slice(0, 1)
                            .toUpperCase()}`;
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#ccff00] text-gray-900 flex items-center justify-center font-bold">
                        {player.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <span className="mt-2 text-sm font-semibold text-gray-900 text-center">
                      {player.name}
                    </span>
                    <span className="mt-1 text-xs text-gray-600">
                      {player.points} pts · {player.wins} victoria
                      {player.wins === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
                {podium.length === 0 && (
                  <p className="col-span-3 text-center text-gray-400 text-sm">
                    Aún no hay jugadores en el podio.
                  </p>
                )}
              </div>
            </Card>

            {/* 📋 TABLA DEL 4º EN ADELANTE */}
            {rest.length > 0 && (
              <Card>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-[0.18em] mb-3">
                  Resto del ranking
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs uppercase text-gray-400">
                        <th className="py-2 pr-2 text-left font-semibold">
                          Posición
                        </th>
                        <th className="py-2 pr-2 text-left font-semibold">
                          Jugador
                        </th>
                        <th className="py-2 pr-2 text-center font-semibold">
                          PJ
                        </th>
                        <th className="py-2 pr-2 text-center font-semibold">
                          PG
                        </th>
                        <th className="py-2 pr-2 text-center font-semibold">
                          PP
                        </th>
                        <th className="py-2 pr-2 text-center font-semibold">
                          +/-
                        </th>
                        <th className="py-2 text-center font-semibold">
                          Puntos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rest.map((player, idx) => (
                        <tr
                          key={player.id}
                          className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900/70 cursor-pointer transition"
                          onClick={() => handleRowClick(player.id)}
                        >
                          <td className="py-2 pr-2 text-gray-400">
                            {idx + 4}º
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2">
                              {player.avatar_url ? (
                                <img
                                  src={player.avatar_url}
                                  alt={player.name}
                                  className="w-7 h-7 rounded-full object-cover"
                                  onError={(e: any) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = `https://placehold.co/60x60/111827/ccff00?text=${player.name
                                      .slice(0, 1)
                                      .toUpperCase()}`;
                                  }}
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#ccff00] text-gray-900 flex items-center justify-center text-xs font-bold">
                                  {player.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {player.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-2 text-center text-gray-700 dark:text-gray-200">
                            {player.played}
                          </td>
                          <td className="py-2 pr-2 text-center text-gray-700 dark:text-gray-200">
                            {player.wins}
                          </td>
                          <td className="py-2 pr-2 text-center text-gray-700 dark:text-gray-200">
                            {player.losses}
                          </td>
                          <td className="py-2 pr-2 text-center text-gray-700 dark:text-gray-200">
                            {player.games_for - player.games_against}
                          </td>
                          <td className="py-2 text-center font-bold text-gray-900 dark:text-white">
                            {player.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </section>
    </main>
  );
}