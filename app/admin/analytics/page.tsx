"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { useTranslation } from "../../i18n";

type Stats = {
  total_users: number;
  total_active_users: number;
  total_players: number;
  total_matches: number;
  total_completed_matches: number;
  total_tournaments: number;
  total_bookings: number;
  pending_challenges: number;
  news_published: number;
};

type TopPlayer = {
  id: number;
  name: string;
  level: number | null;
};

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      router.push("/");
      return;
    }

    fetchAnalytics();
  };

  const fetchAnalytics = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/stats/global", { headers });
      const result = await response.json();

      if (response.ok) {
        setStats(result.stats);
        setTopPlayers(result.topPlayers || []);
      } else {
        toast.error(t("admin.analytics.errorLoading"));
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error(t("admin.analytics.errorLoading"));
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "analytics" }),
      });

      if (response.ok) {
        const result = await response.json();

        if (!result.html) {
          toast.error(t("admin.analytics.errorGeneratingPdf"));
          return;
        }

        // Open in new tab for printing using Blob URL (avoids unsafe document.write)
        const blob = new Blob([result.html], { type: "text/html; charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, "_blank");
        if (newWindow) {
          setTimeout(() => {
            newWindow.print();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
          }, 500);
        } else {
          URL.revokeObjectURL(blobUrl);
        }

        toast.success(t("admin.analytics.pdfGenerated"));
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || t("admin.analytics.errorGeneratingPdf"));
      }
    } catch (error: any) {
      console.error("Export PDF error:", error);
      toast.error(error.message || t("admin.analytics.errorGeneratingPdf"));
    }
  };

  if (loading) {
    return <div className="p-8 text-center">{t("admin.analytics.loading")}</div>;
  }

  if (!stats) {
    return <div className="p-8 text-center text-gray-500">{t("admin.analytics.errorLoading")}</div>;
  }

  const metrics = [
    {
      label: t("admin.analytics.metricTotalUsers"),
      value: stats.total_users,
      color: "bg-blue-100 text-blue-800",
    },
    {
      label: t("admin.analytics.metricActiveUsers"),
      value: stats.total_active_users,
      color: "bg-green-100 text-green-800",
    },
    {
      label: t("admin.analytics.metricPlayers"),
      value: stats.total_players,
      color: "bg-purple-100 text-purple-800",
    },
    {
      label: t("admin.analytics.metricTotalMatches"),
      value: stats.total_matches,
      color: "bg-yellow-100 text-yellow-800",
    },
    {
      label: t("admin.analytics.metricCompletedMatches"),
      value: stats.total_completed_matches,
      color: "bg-orange-100 text-orange-800",
    },
    {
      label: t("admin.analytics.metricTournaments"),
      value: stats.total_tournaments,
      color: "bg-pink-100 text-pink-800",
    },
    {
      label: t("admin.analytics.metricBookings"),
      value: stats.total_bookings,
      color: "bg-indigo-100 text-indigo-800",
    },
    {
      label: t("admin.analytics.metricPendingChallenges"),
      value: stats.pending_challenges,
      color: "bg-red-100 text-red-800",
    },
    {
      label: t("admin.analytics.metricNewsPublished"),
      value: stats.news_published,
      color: "bg-cyan-100 text-cyan-800",
    },
  ];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">📊 {t("admin.analytics.title")}</h1>
        <button
          onClick={handleExportPDF}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          📥 {t("admin.analytics.exportPdf")}
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((metric, idx) => (
          <Card key={idx} className={`p-6 ${metric.color}`}>
            <p className="text-sm font-medium opacity-75">{metric.label}</p>
            <p className="text-3xl font-bold mt-2">{metric.value}</p>
          </Card>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">📈 {t("admin.analytics.ratiosTitle")}</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>{t("admin.analytics.userActivityRate")}</span>
              <span className="font-bold">
                {stats.total_users > 0
                  ? Math.round((stats.total_active_users / stats.total_users) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("admin.analytics.completedMatchesRate")}</span>
              <span className="font-bold">
                {stats.total_matches > 0
                  ? Math.round((stats.total_completed_matches / stats.total_matches) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("admin.analytics.avgMatchesPerUser")}</span>
              <span className="font-bold">
                {stats.total_players > 0
                  ? (stats.total_matches / stats.total_players).toFixed(1)
                  : 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">🎯 {t("admin.analytics.activitySummary")}</h2>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{stats.pending_challenges}</strong> {t("admin.analytics.challengesWaiting")}
            </p>
            <p>
              <strong>{stats.total_bookings}</strong> {t("admin.analytics.courtsBooked")}
            </p>
            <p>
              <strong>{stats.news_published}</strong> {t("admin.analytics.newsPublished")}
            </p>
            <p>
              <strong>{stats.total_tournaments}</strong> {t("admin.analytics.tournamentsCreated")}
            </p>
          </div>
        </Card>
      </div>

      {/* Top Players */}
      {topPlayers.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">🏆 {t("admin.analytics.topPlayersTitle")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">{t("admin.analytics.colPlayer")}</th>
                  <th className="text-right py-2">{t("admin.analytics.colLevel")}</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((player, idx) => (
                  <tr key={player.id} className="border-b">
                    <td className="py-2">
                      <span className="font-semibold">#{idx + 1}</span> {player.name}
                    </td>
                    <td className="text-right py-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {player.level || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="text-center text-xs text-gray-500 py-4">
        <p>Última actualización: {new Date().toLocaleString("es-ES")}</p>
      </div>
    </main>
  );
}
