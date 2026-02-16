// ./app/tournaments/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { isAdminSession } from "../lib/admin";

type Tournament = {
  id: number;
  name: string;
  category: string | null;
  status: "en_curso" | "finalizado" | "proximo";
  start_date: string | null;
  end_date: string | null;
  teams_count: number;
  played_matches: number;
  total_matches: number;
  prize: string | null;
};

const STATUS_MAP = {
  en_curso: {
    label: "En curso",
    className: "bg-green-100 text-green-700",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-gray-200 text-gray-600",
  },
  proximo: {
    label: "Próximo",
    className: "bg-blue-100 text-blue-700",
  },
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsAdmin(isAdminSession(session));

      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) {
        toast.error("Error al cargar torneos");
        console.error(error);
      } else {
        const ids = (data ?? []).map((t: any) => t.id);
        const { data: stats } = await supabase
          .from("tournament_match_stats")
          .select("tournament_id, total_matches, played_matches")
          .in("tournament_id", ids);
        const statsMap = Object.fromEntries(
          (stats ?? []).map((s: any) => [s.tournament_id, s])
        );
        const normalized = (data || []).map((t: any) => ({
          ...t,
          total_matches: statsMap[t.id]?.total_matches ?? 0,
          played_matches: statsMap[t.id]?.played_matches ?? 0,
        }));
        setTournaments(normalized);
      }

      setLoading(false);
    };

    load();
  }, []);

  const handleDeleteTournament = async (id: number) => {
    const confirmed = window.confirm(
      "¿Eliminar este torneo? Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar el torneo");
      return;
    }

    setTournaments((prev) => prev.filter((t) => t.id !== id));
    toast.success("Torneo eliminado");
  };

  return (
    <main className="p-6 md:p-10 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Torneos
            </h1>
            <p className="text-sm text-gray-500">
              Gestioná las competiciones del club
            </p>
          </div>

          {isAdmin && (
            <Link
              href="/tournaments/create"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              ➕ Nuevo Torneo
            </Link>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total de torneos</p>
            <p className="text-2xl font-bold text-gray-900">{tournaments.length}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">En curso</p>
            <p className="text-2xl font-bold text-green-600">
              {tournaments.filter(t => t.status === "en_curso").length}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Finalizados</p>
            <p className="text-2xl font-bold text-gray-700">
              {tournaments.filter(t => t.status === "finalizado").length}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Próximos</p>
            <p className="text-2xl font-bold text-blue-600">
              {tournaments.filter(t => t.status === "proximo").length}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 animate-pulse">Cargando torneos...</p>
        ) : tournaments.length === 0 ? (
          <p className="text-gray-500">No hay torneos creados.</p>
        ) : (
          <div className={`grid gap-6 ${
            tournaments.length === 1
              ? "grid-cols-1"
              : tournaments.length === 2
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          }`}>
            {tournaments.map((t) => {
              const progress =
                t.total_matches > 0
                  ? Math.round(
                      (t.played_matches / t.total_matches) * 100
                    )
                  : 0;
              const isWide = tournaments.length <= 2;

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-6 flex flex-col gap-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-2xl shadow-md">
                        🏆
                      </div>
                      <div>
                        <h3 className={`font-bold text-gray-900 ${isWide ? "text-xl" : "text-base"}`}>
                          {t.name}
                        </h3>
                        {t.category && (
                          <span className="inline-block rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600 mt-1">
                            {t.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold shadow-sm ${
                        STATUS_MAP[t.status]?.className
                      }`}
                    >
                      {STATUS_MAP[t.status]?.label}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className={`grid gap-3 ${isWide ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"} mt-2`}>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Equipos</p>
                      <p className="text-lg font-bold text-gray-900">{t.teams_count}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Partidos</p>
                      <p className="text-lg font-bold text-gray-900">{t.played_matches}/{t.total_matches}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Inicio</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {t.start_date ? new Date(t.start_date).toLocaleDateString("es-ES") : "—"}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Fin</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {t.end_date ? new Date(t.end_date).toLocaleDateString("es-ES") : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-gray-600">Progreso del torneo</p>
                      <p className="text-xs font-bold text-gray-900">{progress}%</p>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Prize */}
                  {t.prize && (
                    <p className="text-sm text-gray-700 font-medium">🏅 {t.prize}</p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
                    <Link
                      href={`/tournaments/edit/${t.id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 transition"
                    >
                      Ver detalles →
                    </Link>

                    {isAdmin && (
                      <div className="flex gap-3 text-sm">
                        <Link
                          href={`/tournaments/edit/${t.id}`}
                          className="text-gray-500 hover:text-gray-900 transition"
                        >
                          Editar
                        </Link>
                        <button
                          onClick={() => handleDeleteTournament(t.id)}
                          className="text-red-500 hover:text-red-700 transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}