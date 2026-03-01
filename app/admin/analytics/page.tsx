"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../../components/Card";
import toast from "react-hot-toast";

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

type WebVitalSummary = {
  key: string;
  path: string;
  name: string;
  samples: number;
  avg: number;
  p50: number;
  p95: number;
  poorRate: number;
};

type ApiTimingSummary = {
  key: string;
  path: string;
  method: string | null;
  samples: number;
  avg: number;
  p50: number;
  p95: number;
  poorRate: number;
  status5xxRate: number;
};

type PerformanceSummary = {
  generatedAt: string;
  hours: number;
  totalSamples: number;
  webVitals: WebVitalSummary[];
  apiTimings: ApiTimingSummary[];
};

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null);
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

      const [globalRes, perfRes] = await Promise.all([
        fetch("/api/stats/global", { headers }),
        fetch("/api/admin/performance/summary?hours=24", { headers }),
      ]);

      const globalResult = await globalRes.json();
      let perfResult: PerformanceSummary | null = null;
      if (perfRes.ok) {
        perfResult = (await perfRes.json()) as PerformanceSummary;
      }

      if (globalRes.ok) {
        setStats(globalResult.stats);
        setTopPlayers(globalResult.topPlayers || []);
        setPerformanceSummary(perfResult);
      } else {
        toast.error("Error cargando estadísticas");
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Error");
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
          toast.error("Error: No se generó contenido HTML");
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

        toast.success("PDF generado");
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "Error al generar PDF");
      }
    } catch (error: any) {
      console.error("Export PDF error:", error);
      toast.error(error.message || "Error al generar PDF");
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Cargando estadísticas...</div>;
  }

  if (!stats) {
    return <div className="p-8 text-center text-gray-500">Error cargando datos</div>;
  }

  const metrics = [
    {
      label: "Usuarios Totales",
      value: stats.total_users,
      color: "bg-blue-100 text-blue-800",
    },
    {
      label: "Usuarios Activos",
      value: stats.total_active_users,
      color: "bg-green-100 text-green-800",
    },
    {
      label: "Jugadores",
      value: stats.total_players,
      color: "bg-purple-100 text-purple-800",
    },
    {
      label: "Partidos Totales",
      value: stats.total_matches,
      color: "bg-yellow-100 text-yellow-800",
    },
    {
      label: "Partidos Completados",
      value: stats.total_completed_matches,
      color: "bg-orange-100 text-orange-800",
    },
    {
      label: "Torneos",
      value: stats.total_tournaments,
      color: "bg-pink-100 text-pink-800",
    },
    {
      label: "Reservas de Pistas",
      value: stats.total_bookings,
      color: "bg-indigo-100 text-indigo-800",
    },
    {
      label: "Desafíos Pendientes",
      value: stats.pending_challenges,
      color: "bg-red-100 text-red-800",
    },
    {
      label: "Noticias Publicadas",
      value: stats.news_published,
      color: "bg-cyan-100 text-cyan-800",
    },
  ];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">📊 Analytics Avanzado</h1>
        <button
          onClick={handleExportPDF}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          📥 Exportar PDF
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
          <h2 className="text-lg font-bold mb-4">📈 Ratios Importantes</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Tasa de Actividad de Usuarios</span>
              <span className="font-bold">
                {stats.total_users > 0
                  ? Math.round((stats.total_active_users / stats.total_users) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span>Tasa de Partidos Completados</span>
              <span className="font-bold">
                {stats.total_matches > 0
                  ? Math.round((stats.total_completed_matches / stats.total_matches) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span>Promedio de Partidos por Usuario</span>
              <span className="font-bold">
                {stats.total_players > 0
                  ? (stats.total_matches / stats.total_players).toFixed(1)
                  : 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">🎯 Resumen de Actividad</h2>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{stats.pending_challenges}</strong> desafíos esperando respuesta
            </p>
            <p>
              <strong>{stats.total_bookings}</strong> pistas reservadas en total
            </p>
            <p>
              <strong>{stats.news_published}</strong> noticias publicadas
            </p>
            <p>
              <strong>{stats.total_tournaments}</strong> torneos creados
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-bold mb-4">⚡ Performance (últimas 24h)</h2>
        {!performanceSummary ? (
          <p className="text-sm text-gray-500">
            Aún no hay suficientes métricas. Esperá unos minutos y refrescá.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="text-sm text-gray-600">
              Muestras capturadas: <strong>{performanceSummary.totalSamples}</strong>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Web Vitals (p95)</h3>
              {performanceSummary.webVitals.length === 0 ? (
                <p className="text-sm text-gray-500">Sin datos todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Métrica</th>
                        <th className="text-left py-2">Ruta</th>
                        <th className="text-right py-2">p95</th>
                        <th className="text-right py-2">Poor %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceSummary.webVitals.slice(0, 8).map((row) => (
                        <tr key={row.key} className="border-b">
                          <td className="py-2 font-medium">{row.name}</td>
                          <td className="py-2">{row.path}</td>
                          <td className="text-right py-2">{row.p95}</td>
                          <td className="text-right py-2">{row.poorRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">APIs más lentas (p95)</h3>
              {performanceSummary.apiTimings.length === 0 ? (
                <p className="text-sm text-gray-500">Sin datos todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Endpoint</th>
                        <th className="text-left py-2">Método</th>
                        <th className="text-right py-2">p95 ms</th>
                        <th className="text-right py-2">5xx %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceSummary.apiTimings.slice(0, 8).map((row) => (
                        <tr key={row.key} className="border-b">
                          <td className="py-2">{row.path}</td>
                          <td className="py-2">{row.method || "GET"}</td>
                          <td className="text-right py-2">{row.p95}</td>
                          <td className="text-right py-2">{row.status5xxRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Top Players */}
      {topPlayers.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">🏆 Top 10 Jugadores</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Jugador</th>
                  <th className="text-right py-2">Nivel</th>
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
