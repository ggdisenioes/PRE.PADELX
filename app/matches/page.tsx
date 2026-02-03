"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";

import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import MatchCard from "../components/matches/MatchCard";

type PlayerRef = {
  id: number;
  name: string;
};

type Match = {
  id: number;
  start_time: string | null;
  tournament_id: number | null;
  round_name: string | null;
  score: string | null;
  winner: string | null;
  player_1_a: PlayerRef | null;
  player_2_a: PlayerRef | null;
  player_1_b: PlayerRef | null;
  player_2_b: PlayerRef | null;
};

type Tournament = {
  id: number;
  name: string;
  category: string | null;
};

type View = "pending" | "finished" | "all";

export default function MatchesPage() {
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const searchParams = useSearchParams();

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("pending");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filterTournament, setFilterTournament] = useState<string>("all");
  const [filterRound, setFilterRound] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [openResultMatch, setOpenResultMatch] = useState<Match | null>(null);

  // Si entran con /matches?status=pending, forzamos la vista pendientes
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "pending") setView("pending");
    if (status === "finished") setView("finished");
    if (status === "all") setView("all");
  }, [searchParams]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const { data: matchesData, error: matchError } = await supabase
        .from("matches")
        .select(`
          id,
          start_time,
          tournament_id,
          round_name,
          score,
          winner,
          player_1_a:players!matches_player_1_a_fkey ( id, name ),
          player_2_a:players!matches_player_2_a_fkey ( id, name ),
          player_1_b:players!matches_player_1_b_fkey ( id, name ),
          player_2_b:players!matches_player_2_b_fkey ( id, name )
        `)
        .order("start_time", { ascending: true })
        .returns<Match[]>();

      if (matchError) {
        console.error(matchError);
        toast.error("No se pudieron cargar los partidos.");
        setMatches([]);
        setLoading(false);
        return;
      }

      const { data: tournamentsData } = await supabase
        .from("tournaments")
        .select("id, name, category")
        .order("name");

      setTournaments(tournamentsData ?? []);

      setMatches((matchesData ?? []) as Match[]);
      setLoading(false);
    };

    loadData();

    // Realtime: cuando cambie un partido, refrescamos la lista
    const channel = supabase
      .channel("matches_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isPlayed = (m: Match) => !!m.score && !!m.winner && String(m.winner).toLowerCase() !== "pending";

  const formatScoreForDisplay = (raw: string | null) => {
    if (!raw) return "";
    // Accept formats like "6-4 4-6" or "6 4" and normalize spacing
    return raw.replace(/\s+/g, " ").trim();
  };

  // 1️⃣ AGREGAR FUNCIÓN handleDeleteMatch
  const handleDeleteMatch = async (matchId: number) => {
    const confirmed = window.confirm(
      "¿Estás seguro? El partido se eliminará definitivamente y quedará registrado en los logs."
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      console.error(error);
      toast.error("No se pudo eliminar el partido");
      return;
    }

    toast.success("Partido eliminado");
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  };

  const filteredMatches = useMemo(() => {
    let result = matches;

    if (view === "finished") result = result.filter(isPlayed);
    if (view === "pending") result = result.filter((m) => !isPlayed(m));

    if (filterTournament !== "all") {
      if (filterTournament === "friendly") {
        result = result.filter((m) => m.tournament_id === null);
      } else {
        result = result.filter(
          (m) => String(m.tournament_id) === filterTournament
        );
      }
    }

    if (filterRound !== "all") {
      result = result.filter(
        (m) => m.round_name?.toLowerCase() === filterRound.toLowerCase()
      );
    }

    if (filterCategory !== "all") {
      const tournamentIds = tournaments
        .filter(
          (t) =>
            t.category?.toLowerCase() === filterCategory.toLowerCase()
        )
        .map((t) => t.id);

      result = result.filter(
        (m) => m.tournament_id && tournamentIds.includes(m.tournament_id)
      );
    }

    return result;
  }, [matches, view, filterTournament, filterRound, filterCategory, tournaments]);

  if (roleLoading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <p className="text-gray-500 animate-pulse">Cargando permisos…</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-2xl font-bold">Partidos</h1>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setView("pending")}
            className={`px-3 py-1 rounded border ${view === "pending" ? "bg-black text-white" : "bg-white"}`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setView("finished")}
            className={`px-3 py-1 rounded border ${view === "finished" ? "bg-black text-white" : "bg-white"}`}
          >
            Finalizados
          </button>
          <button
            onClick={() => setView("all")}
            className={`px-3 py-1 rounded border ${view === "all" ? "bg-black text-white" : "bg-white"}`}
          >
            Todos
          </button>
          {(isAdmin || isManager) && (
            <Link
              href="/matches/create"
              className="bg-green-600 text-white px-4 py-1 rounded border border-green-600 hover:bg-green-700 transition text-sm font-semibold"
            >
              + Crear partido
            </Link>
          )}
          {(isAdmin || isManager) && (
            <Link
              href="/matches/friendly/create"
              className="bg-green-600 text-white px-4 py-1 rounded border border-green-600 hover:bg-green-700 transition text-sm font-semibold"
            >
              + Crear partido amistoso
            </Link>
          )}
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
          Filtros
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Torneo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Torneo
            </label>
            <select
              value={filterTournament}
              onChange={(e) => setFilterTournament(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todos</option>
              <option value="friendly">Amistosos</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ronda / Fase */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Ronda / Fase
            </label>
            <select
              value={filterRound}
              onChange={(e) => setFilterRound(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas</option>
              <option value="grupos">Grupos</option>
              <option value="cuartos">Cuartos</option>
              <option value="semifinal">Semifinal</option>
              <option value="final">Final</option>
              <option value="amistoso">Amistoso</option>
            </select>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Categoría
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas</option>
              <option value="grupos">Grupos</option>
              <option value="cuartos">Cuartos</option>
              <option value="semifinal">Semifinal</option>
              <option value="final">Final</option>
              <option value="amistoso">Amistoso</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando partidos…</p>
      ) : filteredMatches.length === 0 ? (
        <p className="text-gray-500">No hay partidos para mostrar.</p>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((m) => (
            <div key={m.id} className="space-y-2">
              {/* Card clickeable para abrir modal */}
              <div
                onClick={() => setOpenResultMatch(m)}
                className="cursor-pointer"
              >
                <MatchCard match={m} playersMap={{}} showActions={false} />
              </div>

              {/* Acciones */}
              {(isAdmin || isManager) && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Link
                    href={`/matches/edit/${m.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    Editar partido
                  </Link>

                  <Link
                    href={`/matches/score/${m.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 transition"
                  >
                    {isPlayed(m) ? "Editar resultado" : "Cargar resultado"}
                  </Link>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMatch(m.id);
                      }}
                      className="bg-red-100 text-red-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-red-200 transition"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openResultMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#0F172A] w-[92vw] max-w-sm rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 relative text-white overflow-hidden">
            <button
              onClick={() => setOpenResultMatch(null)}
              className="absolute top-3 right-3 text-white/60 hover:text-white"
            >
              ✕
            </button>

            {/* LOGO */}
            <div className="flex flex-col items-center gap-1">
              <img
                src="/logo.svg"
                alt="DEMO Padel Manager"
                className="h-8 w-auto object-contain"
              />
              <span className="text-xs tracking-widest text-green-400">
                PADEL MANAGER
              </span>
            </div>

            {/* RESULT */}
            <div className="text-center space-y-3 mt-2">
              {isPlayed(openResultMatch) ? (
                <>
                  {/* WINNERS */}
                  <p className="text-lg font-semibold">
                    {openResultMatch.winner === "A"
                      ? `${openResultMatch.player_1_a?.name}${openResultMatch.player_2_a ? " / " + openResultMatch.player_2_a.name : ""}`
                      : `${openResultMatch.player_1_b?.name}${openResultMatch.player_2_b ? " / " + openResultMatch.player_2_b.name : ""}`}
                  </p>

                  {/* SCORE */}
                  <p className="text-5xl font-extrabold my-2">
                    {formatScoreForDisplay(openResultMatch.score)}
                  </p>

                  {/* LOSERS */}
                  <p className="text-sm text-white/70">
                    {openResultMatch.winner === "A"
                      ? `${openResultMatch.player_1_b?.name}${openResultMatch.player_2_b ? " / " + openResultMatch.player_2_b.name : ""}`
                      : `${openResultMatch.player_1_a?.name}${openResultMatch.player_2_a ? " / " + openResultMatch.player_2_a.name : ""}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/60">
                  Resultado todavía no cargado
                </p>
              )}
            </div>

            {/* SHARE */}
            <button
              disabled={!isPlayed(openResultMatch)}
              onClick={async () => {
                if (!isPlayed(openResultMatch)) return;

                const teamA = `${openResultMatch.player_1_a?.name || ""}${openResultMatch.player_2_a ? " / " + openResultMatch.player_2_a.name : ""}`.trim();
                const teamB = `${openResultMatch.player_1_b?.name || ""}${openResultMatch.player_2_b ? " / " + openResultMatch.player_2_b.name : ""}`.trim();
                const score = formatScoreForDisplay(openResultMatch.score);

                const text = `DEMO PADEL MANAGER\n\n${teamA}\n${score}\n${teamB}`;

                try {
                  if (navigator.share) {
                    await navigator.share({ text });
                    return;
                  }
                  await navigator.clipboard.writeText(text);
                  toast.success("Resultado copiado");
                } catch (err: any) {
                  if (err?.name === "AbortError") return;
                  toast.error("No se pudo compartir");
                }
              }}
              className={`w-full mt-4 py-3 rounded-xl font-semibold transition ${
                isPlayed(openResultMatch)
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }`}
            >
              Compartir resultado
            </button>
          </div>
        </div>
      )}
    </main>
  );
}