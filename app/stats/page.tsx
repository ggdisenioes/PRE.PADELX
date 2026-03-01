"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import Card from "../components/Card";
import { useTranslation } from "../i18n";

type Player = {
  id: number;
  name: string;
  level: number | null;
  avatar_url: string | null;
};

type PlayerWithStats = Player & {
  stats: {
    total_matches: number;
    wins: number;
    losses: number;
    pending_matches: number;
    winRate: number;
  };
};

const STATS_CACHE_KEY = "padelx-stats-players-v1";
const STATS_CACHE_TTL_MS = 60_000;

export default function StatsPage() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"level" | "matches" | "winRate">("level");

  useEffect(() => {
    fetchPlayersStats();
  }, []);

  const fetchPlayersStats = async () => {
    try {
      if (typeof window !== "undefined") {
        const cachedRaw = sessionStorage.getItem(STATS_CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as {
              ts: number;
              players: PlayerWithStats[];
            };
            if (Date.now() - cached.ts < STATS_CACHE_TTL_MS) {
              setPlayers(cached.players || []);
              setLoading(false);
              return;
            }
          } catch {
            // cache inválido: continuamos con fetch de red
          }
        }
      }

      // Batch fetch: one request for players + stats (avoids N+1 calls)
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/stats/players", { headers });
      if (!response.ok) {
        throw new Error("No se pudieron cargar estadísticas");
      }
      const result = await response.json();
      const nextPlayers = (result.players || []) as PlayerWithStats[];
      setPlayers(nextPlayers);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          STATS_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), players: nextPlayers })
        );
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  const sortedPlayers = useMemo(() => {
    const sorted = [...players];
    if (sortBy === "matches") {
      sorted.sort((a, b) => (b.stats.total_matches || 0) - (a.stats.total_matches || 0));
      return sorted;
    }
    if (sortBy === "winRate") {
      sorted.sort((a, b) => {
        const aCompleted = a.stats.total_matches - a.stats.pending_matches;
        const bCompleted = b.stats.total_matches - b.stats.pending_matches;
        const aRate = aCompleted > 0 ? a.stats.wins / aCompleted : 0;
        const bRate = bCompleted > 0 ? b.stats.wins / bCompleted : 0;
        return bRate - aRate;
      });
      return sorted;
    }
    sorted.sort((a, b) => (b.level || 0) - (a.level || 0));
    return sorted;
  }, [players, sortBy]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t("stats.loading")}</div>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">📈 {t("admin.analytics.title")}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy("level")}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === "level"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {t("stats.sortByLevel")}
          </button>
          <button
            onClick={() => setSortBy("matches")}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === "matches"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {t("stats.sortByMatches")}
          </button>
          <button
            onClick={() => setSortBy("winRate")}
            className={`px-3 py-1 rounded text-sm ${
              sortBy === "winRate"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {t("stats.sortByWinRate")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Card className="p-6">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2">{t("stats.player")}</th>
                <th className="text-center py-3 px-2">{t("stats.level")}</th>
                <th className="text-center py-3 px-2">{t("stats.matchesPlayed")}</th>
                <th className="text-center py-3 px-2">{t("stats.wins")}</th>
                <th className="text-center py-3 px-2">{t("stats.losses")}</th>
                <th className="text-center py-3 px-2">{t("stats.winRate")}</th>
                <th className="text-center py-3 px-2">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, idx) => {
                const completed = player.stats.total_matches - player.stats.pending_matches;
                const winRate =
                  completed > 0
                    ? Math.round((player.stats.wins / completed) * 100)
                    : 0;

                return (
                  <tr key={player.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        {player.avatar_url && (
                          <img
                            src={player.avatar_url}
                            alt={player.name}
                            className="w-8 h-8 rounded-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <span className="font-semibold">
                          #{idx + 1} {player.name}
                        </span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                        {player.level || "—"}
                      </span>
                    </td>
                    <td className="text-center py-3 px-2 font-semibold">
                      {player.stats.total_matches}
                    </td>
                    <td className="text-center py-3 px-2 text-green-600 font-semibold">
                      {player.stats.wins}
                    </td>
                    <td className="text-center py-3 px-2 text-red-600 font-semibold">
                      {player.stats.losses}
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="text-lg font-bold">{winRate}%</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Link
                        href={`/players/${player.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {t("dashboard.viewMore")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {sortedPlayers.length === 0 && (
        <Card className="p-8 text-center text-gray-500">
          {t("stats.emptyApproved")}
        </Card>
      )}
    </main>
  );
}
