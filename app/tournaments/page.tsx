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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const progress =
                t.total_matches > 0
                  ? Math.round(
                      (t.played_matches / t.total_matches) * 100
                    )
                  : 0;

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-5 flex flex-col gap-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-lg">🏆</span>
                      <h3 className="font-semibold text-gray-900">
                        {t.name}
                      </h3>
                    </div>

                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium shadow-sm ${
                        STATUS_MAP[t.status]?.className
                      }`}
                    >
                      {STATUS_MAP[t.status]?.label}
                    </span>
                  </div>

                  {/* Category */}
                  {t.category && (
                    <span className="inline-block w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {t.category}
                    </span>
                  )}

                  {/* Dates */}
                  <p className="text-sm text-gray-600">
                    📅{" "}
                    {t.start_date
                      ? new Date(t.start_date).toLocaleDateString("es-ES")
                      : "—"}{" "}
                    –{" "}
                    {t.end_date
                      ? new Date(t.end_date).toLocaleDateString("es-ES")
                      : "—"}
                  </p>

                  {/* Meta */}
                  <div className="text-sm text-gray-600">
                    👥 {t.teams_count} equipos
                  </div>

                  <div className="text-sm text-gray-600">
                    {t.played_matches} / {t.total_matches} partidos
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Progreso del torneo · {progress}%
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-700">
                      {t.prize && <>🏅 {t.prize}</>}
                    </p>

                    <Link
                      href={`/tournaments/edit/${t.id}`}
                      className="text-sm font-semibold text-green-600 hover:text-green-700 transition flex items-center gap-1"
                    >
                      Ver detalles →
                    </Link>
                  </div>

                  {isAdmin && (
                    <div className="flex justify-end gap-3 text-xs pt-2">
                      <Link
                        href={`/tournaments/edit/${t.id}`}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => handleDeleteTournament(t.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}