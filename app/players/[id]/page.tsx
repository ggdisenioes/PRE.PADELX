"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";

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

        // oponentes (mejor: ambos nombres)
        const opp1 =
          team === "A" ? match.player_1_b?.name : match.player_1_a?.name;
        const opp2 =
          team === "A" ? match.player_2_b?.name : match.player_2_a?.name;

        const opponent = [opp1, opp2].filter(Boolean).join(" / ") || "Oponente";

        const ts = match.start_time ? Date.parse(match.start_time) : 0;
        const dateLabel = match.start_time
          ? new Date(match.start_time).toLocaleDateString()
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
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <img
          src={player.avatar_url || "https://placehold.co/200x200?text=Jugador"}
          alt={`Avatar de ${player.name}`}
          className="w-20 h-20 rounded-full object-cover border"
          loading="lazy"
        />
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-sm text-gray-500">Nivel {player.level ?? "—"}</p>
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center p-4">
          <p className="text-sm text-gray-500">Partidos</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-sm text-gray-500">Victorias</p>
          <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-sm text-gray-500">Derrotas</p>
          <p className="text-2xl font-bold text-red-600">{stats.losses}</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-sm text-gray-500">% Victorias</p>
          <p className="text-2xl font-bold">{winRate}%</p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Últimos partidos</h2>

        {history.length === 0 ? (
          <Card className="p-4">Sin partidos registrados.</Card>
        ) : (
          history.map((m) => (
            <Card key={m.id} className="p-4 flex justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold truncate">Con {m.partner}</p>
                <p className="text-sm text-gray-700 truncate">vs {m.opponent}</p>
                <p className="text-xs text-gray-500">{m.dateLabel}</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`font-bold ${
                    m.result === "Victoria"
                      ? "text-green-700"
                      : m.result === "Derrota"
                      ? "text-red-700"
                      : "text-gray-500"
                  }`}
                >
                  {m.result}
                </p>
                <p className="text-sm">{m.score}</p>
              </div>
            </Card>
          ))
        )}
      </section>

      <div className="pt-4">
        <Link href="/players" className="text-sm text-gray-600 hover:underline">
          ← Volver a jugadores
        </Link>
      </div>
    </main>
  );
}