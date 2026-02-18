"use client";

import { useEffect, useState } from "react";
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
  stats?: {
    total_matches: number;
    wins: number;
    losses: number;
    pending_matches: number;
    winRate?: number;
  };
};

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
      // Get approved players
      const { data: playersData } = await supabase
        .from("players")
        .select("id, name, level, avatar_url")
        .eq("is_approved", true)
        .order("level", { ascending: false });

      if (!playersData) return;

      // Get stats for each player
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const playersWithStats = await Promise.all(
        playersData.map(async (player) => {
          try {
            const response = await fetch(`/api/stats/player/${player.id}`, { headers });
            const result = await response.json();

            return {
              ...player,
              stats: result.stats || {
                total_matches: 0,
                wins: 0,
                losses: 0,
                pending_matches: 0,
              },
            };
          } catch {
            return {
              ...player,
              stats: {
                total_matches: 0,
                wins: 0,
                losses: 0,
                pending_matches: 0,
              },
            };
          }
        })
      );

      // Sort based on selected criteria
      let sorted = [...playersWithStats];
      if (sortBy === "matches") {
        sorted.sort((a, b) => (b.stats?.total_matches || 0) - (a.stats?.total_matches || 0));
      } else if (sortBy === "winRate") {
        sorted.sort((a, b) => {
          const aWins = a.stats?.wins || 0;
          const aTotal = a.stats?.total_matches || 0;
          const bWins = b.stats?.wins || 0;
          const bTotal = b.stats?.total_matches || 0;

          const aRate = aTotal > 0 ? aWins / (aTotal - (a.stats?.pending_matches || 0)) : 0;
          const bRate = bTotal > 0 ? bWins / (bTotal - (b.stats?.pending_matches || 0)) : 0;

          return bRate - aRate;
        });
      }

      setPlayers(sorted);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

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
              {players.map((player, idx) => {
                const completed = (player.stats?.total_matches || 0) - (player.stats?.pending_matches || 0);
                const winRate =
                  completed > 0
                    ? Math.round(((player.stats?.wins || 0) / completed) * 100)
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
                      {player.stats?.total_matches || 0}
                    </td>
                    <td className="text-center py-3 px-2 text-green-600 font-semibold">
                      {player.stats?.wins || 0}
                    </td>
                    <td className="text-center py-3 px-2 text-red-600 font-semibold">
                      {player.stats?.losses || 0}
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

      {players.length === 0 && (
        <Card className="p-8 text-center text-gray-500">
          {t("stats.emptyApproved")}
        </Card>
      )}
    </main>
  );
}
