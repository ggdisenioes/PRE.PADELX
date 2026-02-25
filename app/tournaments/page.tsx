// ./app/tournaments/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { isAdminSession } from "../lib/admin";
import { useTranslation } from "../i18n";

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

export default function TournamentsPage() {
  const { t, locale } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const dateLocale = locale === "en" ? "en-US" : "es-ES";

  const STATUS_MAP = {
    en_curso: {
      label: t("tournaments.statusEnCurso"),
      className: "bg-green-100 text-green-700",
    },
    finalizado: {
      label: t("tournaments.statusFinalizado"),
      className: "bg-gray-200 text-gray-600",
    },
    proximo: {
      label: t("tournaments.statusProximo"),
      className: "bg-blue-100 text-blue-700",
    },
  };

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
        toast.error(t("tournaments.errorLoading"));
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
  }, [t]);

  const handleDeleteTournament = async (id: number) => {
    const confirmed = window.confirm(t("tournaments.deleteConfirm"));
    if (!confirmed) return;

    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) {
      toast.error(t("tournaments.errorDeleting"));
      return;
    }

    setTournaments((prev) => prev.filter((t) => t.id !== id));
    toast.success(t("tournaments.deleted"));
  };

  return (
    <main className="p-6 md:p-10 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {t("tournaments.title")}
            </h1>
            <p className="text-sm text-gray-500">
              {t("tournaments.subtitle")}
            </p>
          </div>

          {isAdmin && (
            <Link
              href="/tournaments/create"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              ➕ {t("tournaments.create")}
            </Link>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t("tournaments.totalCount")}</p>
            <p className="text-2xl font-bold text-gray-900">{tournaments.length}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t("tournaments.statusEnCurso")}</p>
            <p className="text-2xl font-bold text-green-600">
              {tournaments.filter(t => t.status === "en_curso").length}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t("tournaments.statusFinalizado")}</p>
            <p className="text-2xl font-bold text-gray-700">
              {tournaments.filter(t => t.status === "finalizado").length}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t("tournaments.statusProximo")}</p>
            <p className="text-2xl font-bold text-blue-600">
              {tournaments.filter(t => t.status === "proximo").length}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 animate-pulse">{t("tournaments.loading")}</p>
        ) : tournaments.length === 0 ? (
          <p className="text-gray-500">{t("tournaments.empty")}</p>
        ) : (
          <div className={`grid gap-6 ${
            tournaments.length === 1
              ? "grid-cols-1"
              : tournaments.length === 2
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          }`}>
            {tournaments.map((tournament) => {
              const progress =
                tournament.total_matches > 0
                  ? Math.round(
                      (tournament.played_matches / tournament.total_matches) * 100
                    )
                  : 0;
              const isWide = tournaments.length <= 2;

              return (
                <div
                  key={tournament.id}
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
                          {tournament.name}
                        </h3>
                        {tournament.category && (
                          <span className="inline-block rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600 mt-1">
                            {tournament.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold shadow-sm ${
                        STATUS_MAP[tournament.status]?.className
                      }`}
                    >
                      {STATUS_MAP[tournament.status]?.label}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className={`grid gap-3 ${isWide ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"} mt-2`}>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">{t("tournaments.teams")}</p>
                      <p className="text-lg font-bold text-gray-900">{tournament.teams_count}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">{t("tournaments.matches")}</p>
                      <p className="text-lg font-bold text-gray-900">{tournament.played_matches}/{tournament.total_matches}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">{t("tournaments.startDateShort")}</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {tournament.start_date ? new Date(tournament.start_date).toLocaleDateString(dateLocale) : "—"}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">{t("tournaments.endDateShort")}</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {tournament.end_date ? new Date(tournament.end_date).toLocaleDateString(dateLocale) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-gray-600">{t("tournaments.progress")}</p>
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
                  {tournament.prize && (
                    <p className="text-sm text-gray-700 font-medium">🏅 {tournament.prize}</p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 transition"
                    >
                      {t("common.details")} →
                    </Link>

                    {isAdmin && (
                      <div className="flex gap-3 text-sm">
                        <Link
                          href={`/tournaments/edit/${tournament.id}`}
                          className="text-gray-500 hover:text-gray-900 transition"
                        >
                          {t("common.edit")}
                        </Link>
                        <button
                          onClick={() => handleDeleteTournament(tournament.id)}
                          className="text-red-500 hover:text-red-700 transition"
                        >
                          {t("common.delete")}
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
