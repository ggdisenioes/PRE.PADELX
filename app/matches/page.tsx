"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";

import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import MatchCard from "../components/matches/MatchCard";
import { formatDateMadrid, formatTimeMadrid } from "@/lib/dates";

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
  court: string | null;
  place: string | null;

  // Nuevo esquema (amistosos): ids numéricos
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  // Esquema anterior (joins): refs cargadas vía FK
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
  const [playersMapObj, setPlayersMapObj] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("pending");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filterTournament, setFilterTournament] = useState<string>("all");
  const [filterRound, setFilterRound] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [openResultMatch, setOpenResultMatch] = useState<Match | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

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

      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, name")
        .order("name");

      if (playersError) {
        console.error(playersError);
        toast.error("No se pudieron cargar los jugadores.");
      }

      const playersMap = new Map<number, string>(
        (playersData ?? []).map((p: any) => [Number(p.id), String(p.name)])
      );

      const playersMapObj: Record<number, string> = {};
      for (const [k, v] of playersMap.entries()) playersMapObj[k] = v;
      setPlayersMapObj(playersMapObj);

      const { data: matchesData, error: matchError } = await supabase
        .from("matches")
        .select(`
          id,
          start_time,
          tournament_id,
          round_name,
          score,
          winner,
          court,
          place,
          player_1_a_id,
          player_2_a_id,
          player_1_b_id,
          player_2_b_id,
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

      const normalizedMatches = (matchesData ?? []).map((m: any) => {
        const resolve = (id: any) => {
          const n = Number(id);
          if (!Number.isFinite(n)) return null;
          const name = playersMap.get(n);
          if (!name) return null;
          return { id: n, name } as PlayerRef;
        };

        return {
          ...m,
          player_1_a: m.player_1_a ?? resolve(m.player_1_a_id),
          player_2_a: m.player_2_a ?? resolve(m.player_2_a_id),
          player_1_b: m.player_1_b ?? resolve(m.player_1_b_id),
          player_2_b: m.player_2_b ?? resolve(m.player_2_b_id),
        } as Match;
      });

      setMatches(normalizedMatches);
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

  const formatLocalDate = (iso: string | null) => {
    if (!iso) return undefined;
    return formatDateMadrid(iso);
  };

  const formatLocalTime = (iso: string | null) => {
    if (!iso) return undefined;
    return formatTimeMadrid(iso);
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
                <MatchCard
                  match={m}
                  playersMap={playersMapObj}
                  showActions={false}
                  date={formatLocalDate(m.start_time)}
                  time={formatLocalTime(m.start_time)}
                />
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

      {openResultMatch && isPlayed(openResultMatch) && (() => {
        const m = openResultMatch;
        const winnerTeam = m.winner === "A"
          ? `${m.player_1_a?.name || ""}${m.player_2_a ? " y " + m.player_2_a.name : ""}`.trim()
          : `${m.player_1_b?.name || ""}${m.player_2_b ? " y " + m.player_2_b.name : ""}`.trim();
        const loserTeam = m.winner === "A"
          ? `${m.player_1_b?.name || ""}${m.player_2_b ? " y " + m.player_2_b.name : ""}`.trim()
          : `${m.player_1_a?.name || ""}${m.player_2_a ? " y " + m.player_2_a.name : ""}`.trim();
        const score = formatScoreForDisplay(m.score);
        const matchType = m.tournament_id
          ? (tournaments.find(t => t.id === m.tournament_id)?.name || "Torneo")
          : "Partido Amistoso";
        const dateStr = m.start_time ? formatDateMadrid(m.start_time) : "";
        const timeStr = m.start_time ? formatTimeMadrid(m.start_time) : "";
        const courtPlace = [m.court, m.place].filter(Boolean).join(" · ");

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 relative shadow-2xl">
              <button
                onClick={() => setOpenResultMatch(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl"
              >
                ✕
              </button>

              {/* Share card (rendered for screenshot) — scaled to fit modal */}
              <div style={{ overflow: "hidden", borderRadius: 16 }}>
                <div ref={shareCardRef} style={{
                  width: 480, height: 520, backgroundColor: "#0b1220",
                  borderRadius: 0, padding: "28px 32px", color: "#fff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  transform: "scale(0.82)", transformOrigin: "top left",
                  marginBottom: -90,
                }}>
                  {/* Header with logo */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 3, fontStyle: "italic", color: "#ffffff" }}>
                      PadelX QA
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 5, color: "#00b4ff", marginTop: 3 }}>
                      PÁDEL MANAGER
                    </div>
                  </div>

                  {/* Match type badge */}
                  <div style={{ textAlign: "center", marginTop: 14 }}>
                    <span style={{
                      display: "inline-block",
                      backgroundColor: m.tournament_id ? "#1a3a2a" : "#1a2a3a",
                      color: m.tournament_id ? "#4ade80" : "#60a5fa",
                      fontSize: 11, fontWeight: 700, padding: "5px 16px", borderRadius: 20,
                      letterSpacing: 1, textTransform: "uppercase" as const,
                    }}>
                      {matchType}
                    </span>
                  </div>

                  {/* Main content */}
                  <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                    {/* Winners */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 3, marginBottom: 6 }}>
                        GANADORES
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                        {winnerTeam}
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 4, color: "#00b4ff", margin: "8px 0" }}>
                      {score}
                    </div>

                    {/* Losers */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#666", letterSpacing: 3, marginBottom: 6 }}>
                        PERDEDORES
                      </div>
                      <div style={{ fontSize: 16, color: "#999" }}>
                        {loserTeam}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div>
                    <div style={{ height: 1, backgroundColor: "#1e293b", marginBottom: 12 }} />
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 11, color: "#64748b" }}>
                      {dateStr && <span>{dateStr}</span>}
                      {timeStr && <span>{timeStr}h</span>}
                      {courtPlace && <span>{courtPlace}</span>}
                    </div>
                    <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, color: "#334155" }}>
                      {process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "padelx.es"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const el = shareCardRef.current;
                    if (!el) return;
                    // Temporarily reset scale for full-resolution capture
                    const origTransform = el.style.transform;
                    const origMargin = el.style.marginBottom;
                    el.style.transform = "none";
                    el.style.marginBottom = "0";
                    try {
                      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2, width: 480, height: 520 });
                      const link = document.createElement("a");
                      link.download = `PadelXQA_Partido_${m.id}.png`;
                      link.href = dataUrl;
                      link.click();
                      toast.success("Imagen descargada");
                    } catch (err) {
                      console.error("toPng error:", err);
                      toast.error("Error al generar imagen");
                    } finally {
                      el.style.transform = origTransform;
                      el.style.marginBottom = origMargin;
                    }
                  }}
                  className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-semibold hover:bg-black transition text-sm"
                >
                  Descargar imagen
                </button>
              </div>

              <button
                onClick={() => setOpenResultMatch(null)}
                className="w-full border border-gray-200 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        );
      })()}
    </main>
  );
}