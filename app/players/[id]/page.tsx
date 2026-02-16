"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";
import { formatDateMadrid } from "@/lib/dates";

type Player = {
  id: number;
  name: string;
  level: number | null;
  avatar_url: string | null;
};

type Winner = "A" | "B" | "pending";

type PlayerRef = { id: number; name: string } | null;

type MatchRow = {
  id: number;
  score: string | null;
  winner: Winner | null;
  start_time: string | null;
  player_1_a: PlayerRef;
  player_2_a: PlayerRef;
  player_1_b: PlayerRef;
  player_2_b: PlayerRef;
};

type HistoryItem = {
  id: number;
  partner: string;
  opponent: string;
  result: "Victoria" | "Derrota" | "Pendiente";
  score: string;
  ts: number; // timestamp para ordenar
  dateLabel: string; // para mostrar
};

export default function PlayerStatsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const playerId = useMemo(() => {
    const raw = params?.id;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, total: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const winRate = useMemo(() => {
    if (!stats.total) return 0;
    return Math.round((stats.wins / stats.total) * 100);
  }, [stats.losses, stats.total, stats.wins]);

  useEffect(() => {
    if (!playerId || Number.isNaN(playerId)) {
      router.push("/players");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // 1) Player (solo aprobados para vista pública)
      const { data: playerData, error: playerErr } = await supabase
        .from("players")
        .select("id,name,level,avatar_url")
        .eq("id", playerId)
        .eq("is_approved", true)
        .maybeSingle();

      if (cancelled) return;

      if (playerErr || !playerData) {
        // si no existe o no está aprobado, volvemos a lista
        router.push("/players");
        return;
      }

      setPlayer(playerData);

      // 2) Matches del jugador (solo lectura)
      const { data: matchesData, error: matchesErr } = await supabase
        .from("matches")
        .select(
          `
          id,
          score,
          winner,
          start_time,
          player_1_a (id, name),
          player_2_a (id, name),
          player_1_b (id, name),
          player_2_b (id, name)
        `
        )
        .or(
          `player_1_a.eq.${playerId},player_2_a.eq.${playerId},player_1_b.eq.${playerId},player_2_b.eq.${playerId}`
        );

      if (cancelled) return;

      if (matchesErr) {
        console.warn("[PlayerStats] matches error:", matchesErr);
      }

      const rows = (matchesData ?? []) as unknown as MatchRow[];

      let wins = 0;
      let losses = 0;
      const historyData: HistoryItem[] = [];

      for (const match of rows) {
        // identificar equipo del jugador
        let team: "A" | "B" | null = null;

        if (match.player_1_a?.id === playerId || match.player_2_a?.id === playerId) {
          team = "A";
        } else if (match.player_1_b?.id === playerId || match.player_2_b?.id === playerId) {
          team = "B";
        }

        if (!team) continue;

        const w = match.winner ?? "pending";
        const isFinal = w !== "pending";
        const isWin = isFinal ? team === w : false;
        if (isFinal) {
          if (isWin) wins++;
          else losses++;
        }

        // compañero
        const mate =
          team === "A"
            ? (match.player_1_a?.id === playerId ? match.player_2_a?.name : match.player_1_a?.name)
            : (match.player_1_b?.id === playerId ? match.player_2_b?.name : match.player_1_b?.name);

        const partner = mate || "(Sin compañero)";

        // oponentes (ambos nombres)
        const opp1 =
          team === "A" ? match.player_1_b?.name : match.player_1_a?.name;
        const opp2 =
          team === "A" ? match.player_2_b?.name : match.player_2_a?.name;

        // Formato mejorado: "Miguel y Juan" en lugar de "Miguel / Juan"
        const opponents = [opp1, opp2].filter(Boolean);
        const opponent = opponents.length === 2
          ? `${opponents[0]} y ${opponents[1]}`
          : opponents[0] || "Oponente";

        const ts = match.start_time ? Date.parse(match.start_time) : 0;
        const dateLabel = match.start_time
          ? formatDateMadrid(match.start_time)
          : "—";

        historyData.push({
          id: match.id,
          partner,
          opponent,
          result: !isFinal ? "Pendiente" : (isWin ? "Victoria" : "Derrota"),
          score: match.score ?? "-",
          ts,
          dateLabel,
        });
      }

      setStats({ wins, losses, total: wins + losses });

      // ordenar por fecha real (desc)
      historyData.sort((a, b) => b.ts - a.ts);
      setHistory(historyData);

      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [playerId, router]);

  if (loading) {
    return <p className="p-8 text-gray-500">Cargando estadísticas…</p>;
  }

  if (!player) {
    return <p className="p-8">Jugador no encontrado</p>;
  }

  return (
    <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
      {/* Back link */}
      <Link href="/players" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition">
        ← Volver a jugadores
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="h-32 bg-gradient-to-r from-[#0b1220] via-[#1a2740] to-[#0e1626] rounded-t-2xl" />
        <div className="px-6 pb-6 pt-3 flex flex-col sm:flex-row sm:items-center gap-4">
          <img
            src={player.avatar_url || "https://placehold.co/200x200?text=Jugador"}
            alt={`Avatar de ${player.name}`}
            className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-lg shrink-0 bg-white -mt-16"
            loading="lazy"
          />
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{player.name}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full">
                Nivel {player.level ?? "—"}
              </span>
              {stats.total > 0 && (
                <span className="text-sm text-gray-500">
                  {stats.total} {stats.total === 1 ? "partido" : "partidos"} jugados
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-blue-600 text-lg">🎾</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Partidos</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Victorias</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{stats.wins}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-red-500 text-lg">✗</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Derrotas</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{stats.losses}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-amber-600 text-lg">%</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">% Victorias</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{winRate}%</p>
          {stats.total > 0 && (
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all"
                style={{ width: `${winRate}%` }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Match history */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de partidos</h2>

        {history.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-gray-400">Sin partidos registrados.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
            {history.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50/50 transition">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-1 h-10 rounded-full shrink-0 ${
                    m.result === "Victoria"
                      ? "bg-green-500"
                      : m.result === "Derrota"
                      ? "bg-red-500"
                      : "bg-gray-300"
                  }`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      Con {m.partner}
                    </p>
                    <p className="text-sm text-gray-500 truncate">vs {m.opponent}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      m.result === "Victoria"
                        ? "text-green-600"
                        : m.result === "Derrota"
                        ? "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {m.result}
                    </p>
                    <p className="text-sm font-mono text-gray-700">{m.score}</p>
                  </div>
                  <p className="text-xs text-gray-400 w-20 text-right">{m.dateLabel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}