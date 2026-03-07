"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";
import { notifyMatchCreated } from "../../../lib/notify";

type Player = {
  id: number;
  name: string;
};

type Court = {
  id: number;
  name: string;
  is_covered: boolean;
};

type TournamentRound = {
  id: number;
  round_number: number;
  round_name: string;
  start_at: string;
};

function toDateTimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function CreateMatchManualPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const tournamentId = searchParams.get("tournament");
  const requestedRoundId = searchParams.get("round_id") || searchParams.get("round");

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [courts, setCourts] = useState<Court[]>([]);
  const [occupiedCourtIds, setOccupiedCourtIds] = useState<Set<number>>(new Set());
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);

  const [form, setForm] = useState({
    round_name: "",
    round_id: "",
    place: "",
    start_time: "",
    duration_minutes: "60",
    court_id: "",
    player_1_a: "",
    player_2_a: "",
    player_1_b: "",
    player_2_b: "",
  });

  useEffect(() => {
    if (!tournamentId) return;

    const loadPlayers = async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name")
        .eq("is_approved", true)
        .order("name");

      if (error) {
        toast.error("No se pudieron cargar los jugadores");
        console.error(error);
        return;
      }

      setPlayers(data || []);
      setLoading(false);

      const { data: courtsData, error: courtsError } = await supabase
        .from("courts")
        .select("id, name, is_covered")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (courtsError) {
        toast.error("No se pudieron cargar las pistas");
        console.error(courtsError);
        setCourts([]);
      } else {
        setCourts((courtsData as Court[]) || []);
      }

      setLoadingCourts(false);

      const { data: roundsData, error: roundsError } = await supabase
        .from("tournament_rounds")
        .select("id, round_number, round_name, start_at")
        .eq("tournament_id", Number(tournamentId))
        .order("round_number", { ascending: true });

      if (roundsError) {
        console.error("[manual-create] error cargando jornadas:", roundsError);
        setRounds([]);
      } else {
        const nextRounds = (roundsData || []) as TournamentRound[];
        setRounds(nextRounds);
        if (nextRounds.length > 0) {
          const initialRound =
            nextRounds.find((round) => String(round.id) === requestedRoundId) || nextRounds[0];
          setForm((prev) => ({
            ...prev,
            round_id: String(initialRound.id),
            round_name: initialRound.round_name,
            start_time: prev.start_time || toDateTimeLocalValue(initialRound.start_at),
          }));
        }
      }
      setLoadingRounds(false);
    };

    loadPlayers();
  }, [tournamentId, requestedRoundId]);

  useEffect(() => {
    const computeAvailability = async () => {
      if (!form.start_time) {
        setOccupiedCourtIds(new Set());
        return;
      }

      const start = new Date(form.start_time);
      const duration = Number(form.duration_minutes || 60);
      const end = new Date(start.getTime() + duration * 60_000);

      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data, error } = await supabase
        .from("matches")
        .select("id, court_id, start_time, duration_minutes")
        .not("court_id", "is", null)
        .gte("start_time", dayStart.toISOString())
        .lt("start_time", dayEnd.toISOString());

      if (error) {
        console.error("[availability]", error);
        setOccupiedCourtIds(new Set());
        return;
      }

      const occupied = new Set<number>();

      (data || []).forEach((m: any) => {
        if (!m.court_id || !m.start_time || !m.duration_minutes) return;
        const mStart = new Date(m.start_time);
        const mEnd = new Date(mStart.getTime() + Number(m.duration_minutes) * 60_000);
        const overlaps = mStart < end && mEnd > start;
        if (overlaps) occupied.add(Number(m.court_id));
      });

      setOccupiedCourtIds(occupied);

      // Si la pista seleccionada ahora está ocupada, la limpiamos
      if (form.court_id) {
        const selectedId = Number(form.court_id);
        if (occupied.has(selectedId)) {
          setForm((prev) => ({ ...prev, court_id: "" }));
        }
      }
    };

    computeAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_time, form.duration_minutes]);

  if (!tournamentId) {
    return (
      <main className="p-8">
        <p className="text-red-600 font-semibold">
          ❌ Error: no se especificó un torneo válido.
        </p>
      </main>
    );
  }

  if (roleLoading || loading || loadingCourts || loadingRounds) {
    return (
      <main className="p-8">
        <p className="text-gray-500 animate-pulse">Cargando…</p>
      </main>
    );
  }

  if (!isAdmin && !isManager) {
    return (
      <main className="p-8">
        <p className="text-red-600 font-semibold">
          ❌ No tienes permisos para crear partidos.
        </p>
      </main>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "round_id") {
      const selectedRound = rounds.find((round) => String(round.id) === value);
      setForm((prev) => ({
        ...prev,
        round_id: value,
        round_name: selectedRound?.round_name || prev.round_name,
        start_time: selectedRound
          ? toDateTimeLocalValue(selectedRound.start_at)
          : prev.start_time,
      }));
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const {
      player_1_a,
      player_2_a,
      player_1_b,
      player_2_b,
    } = form;

    const ids = [
      player_1_a,
      player_2_a,
      player_1_b,
      player_2_b,
    ];

    if (new Set(ids).size !== 4) {
      toast.error("Los 4 jugadores deben ser distintos");
      return;
    }

    if (!form.start_time) {
      toast.error("La fecha y hora del partido es obligatoria");
      return;
    }

    if (rounds.length > 0 && !form.round_id) {
      toast.error("Selecciona una jornada para el partido");
      return;
    }

    if (!form.court_id) {
      toast.error("Selecciona una pista disponible");
      return;
    }

    const selectedCourt = courts.find((c) => c.id === Number(form.court_id));
    const selectedRound = rounds.find((round) => String(round.id) === form.round_id);

    const { data: created, error } = await supabase.from("matches").insert({
      tournament_id: Number(tournamentId),
      round_name: selectedRound?.round_name || form.round_name || "Partido",
      place: form.place || null,
      court_id: Number(form.court_id),
      duration_minutes: Number(form.duration_minutes || 60),
      court: selectedCourt?.name || null,
      start_time: new Date(form.start_time).toISOString(),
      player_1_a: Number(player_1_a),
      player_2_a: Number(player_2_a),
      player_1_b: Number(player_1_b),
      player_2_b: Number(player_2_b),
      winner: "pending",
    }).select("id");

    if (error) {
      console.error(error);
      toast.error("Error al crear el partido");
      return;
    }

    toast.success("Partido creado correctamente");
    if (created) notifyMatchCreated(created.map((m: any) => m.id));
    router.push(`/tournaments/${tournamentId}`);
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Crear partido del torneo
      </h1>

      <div className="bg-white rounded-2xl shadow-md p-8 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            {rounds.length > 0 && (
              <select
                name="round_id"
                value={form.round_id}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                onChange={handleChange}
              >
                <option value="">Seleccionar jornada</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {`${round.round_name} · ${new Date(round.start_at).toLocaleString("es-ES", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Madrid",
                    })}`}
                  </option>
                ))}
              </select>
            )}

            <input
              name="round_name"
              placeholder={rounds.length > 0 ? "Nombre de jornada" : "Ronda (opcional)"}
              value={form.round_name}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              onChange={handleChange}
            />

            <input
              type="datetime-local"
              name="start_time"
              required
              value={form.start_time}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              onChange={handleChange}
            />

            <select
              name="duration_minutes"
              value={form.duration_minutes}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="30">Duración: 30 min</option>
              <option value="60">Duración: 60 min</option>
              <option value="90">Duración: 90 min</option>
              <option value="120">Duración: 120 min</option>
            </select>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                name="place"
                placeholder="Lugar"
                className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                onChange={handleChange}
              />
              <select
                name="court_id"
                required
                value={form.court_id}
                onChange={handleChange}
                className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Seleccionar pista</option>
                {courts.map((c) => {
                  const occupied = occupiedCourtIds.has(c.id);
                  const labelBase = `${c.name} · ${c.is_covered ? "Cubierta" : "Descubierta"}`;
                  const label = occupied ? `${labelBase} · Ocupada` : labelBase;
                  return (
                    <option key={c.id} value={c.id} disabled={occupied}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-l-4 border-blue-500 bg-blue-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-blue-700">Pareja 1</h3>
              <select name="player_1_a" required onChange={handleChange} className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 w-full">
                <option value="">Jugador A1</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select name="player_2_a" required onChange={handleChange} className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 w-full">
                <option value="">Jugador A2</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="border-l-4 border-red-500 bg-red-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-red-700">Pareja 2</h3>
              <select name="player_1_b" required onChange={handleChange} className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 w-full">
                <option value="">Jugador B1</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select name="player_2_b" required onChange={handleChange} className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 w-full">
                <option value="">Jugador B2</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition"
            >
              Crear partido
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
