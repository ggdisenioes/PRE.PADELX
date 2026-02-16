"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";
import { notifyMatchCreated } from "../../../lib/notify";

type Player = {
  id: number;
  name: string;
  is_approved?: boolean;
};

type Court = {
  id: number;
  name: string;
  is_covered: boolean;
  sort_order?: number;
};

type MatchInsert = {
  tournament_id: number | null;
  round_name: string | null;
  start_time: string | null;
  duration_minutes: number;
  place: string | null;
  court_id: number | null;
  court: string | null;
  winner: string;
  score: string | null;
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;
};

function shuffleCopy(ids: number[]) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Helper para datetime-local: convierte ISO (UTC) a string local para input
function isoToDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  // Pasar a string de input local (sin Z) => corrige el -1h/+2h según DST
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function CreateFriendlyMatchPage() {
  const router = useRouter();
  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);

  const [selected, setSelected] = useState<number[]>([]);
  const [shuffledSelected, setShuffledSelected] = useState<number[]>([]);

  const [form, setForm] = useState({
    start_time: "",
    duration_minutes: "60",
    place: "",
    court_id: "",
    court_text: "", // fallback manual si no hay pistas o no querés usar court_id
  });

  const canAccess = isAdmin || isManager;

  const isOdd = selected.length % 2 !== 0;
  const canCreate = selected.length >= 4 && !isOdd;
  const matchesCount = Math.floor(selected.length / 4);

  const selectedCourt = useMemo(() => {
    const id = Number(form.court_id);
    if (!id) return null;
    return courts.find((c) => c.id === id) || null;
  }, [courts, form.court_id]);

  const loadData = useCallback(async () => {
    const { data: playersData, error: playersError } = await supabase
      .from("players")
      .select("id, name, is_approved")
      .eq("is_approved", true)
      .order("name");

    if (playersError) {
      console.error(playersError);
      toast.error("No se pudieron cargar los jugadores");
      setPlayers([]);
    } else {
      setPlayers((playersData as Player[]) || []);
    }

    const { data: courtsData, error: courtsError } = await supabase
      .from("courts")
      .select("id, name, is_covered, sort_order")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (courtsError) {
      console.error(courtsError);
      toast.error("No se pudieron cargar las pistas");
      setCourts([]);
    } else {
      setCourts((courtsData as Court[]) || []);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Shuffle estable para que la vista previa coincida con lo que se crea
  useEffect(() => {
    if (selected.length === 0) {
      setShuffledSelected([]);
      return;
    }
    setShuffledSelected((prev) => {
      const a = [...prev].sort((x, y) => x - y).join(",");
      const b = [...selected].sort((x, y) => x - y).join(",");
      if (a === b && prev.length === selected.length) return prev;
      return shuffleCopy(selected);
    });
  }, [selected]);

  const togglePlayer = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const previewPairs = useMemo(() => {
    if (!canCreate) return [] as number[][];
    const base = shuffledSelected.length ? shuffledSelected : selected;
    const out: number[][] = [];
    for (let i = 0; i < base.length; i += 4) {
      const g = base.slice(i, i + 4);
      if (g.length === 4) out.push(g);
    }
    return out;
  }, [canCreate, selected, shuffledSelected]);

  const handleCreate = async () => {
    if (!canAccess) {
      toast.error("No tenés permisos para crear amistosos.");
      return;
    }

    if (!canCreate) {
      toast.error("Para 2vs2 necesitás un número PAR de jugadores (mínimo 4).");
      return;
    }

    if (!form.start_time) {
      toast.error("Seleccioná día y horario");
      return;
    }

    // Si hay pistas cargadas, recomendamos elegir una pista, pero permitimos fallback texto.
    if (courts.length > 0 && !form.court_id && !form.court_text) {
      toast.error("Seleccioná una pista o completá la pista manualmente");
      return;
    }

    setLoading(true);

    try {
      const baseStart = new Date(form.start_time);
      const duration = Number(form.duration_minutes || 60);

      const basePlayers = shuffledSelected.length ? shuffledSelected : shuffleCopy(selected);

      const inserts: MatchInsert[] = [];

      const computedCourtName = form.court_id
        ? (courts.find((c) => String(c.id) === String(form.court_id))?.name || form.court_text || null)
        : (form.court_text || null);

      for (let i = 0; i < basePlayers.length; i += 4) {
        const group = basePlayers.slice(i, i + 4);
        if (group.length < 4) break;

        const matchIndex = i / 4;
        const start = new Date(baseStart.getTime() + matchIndex * duration * 60_000);

        inserts.push({
          tournament_id: null,
          round_name: null,
          start_time: start.toISOString(),
          duration_minutes: duration,
          place: form.place ? form.place : null,
          court_id: form.court_id ? Number(form.court_id) : null,
          court: computedCourtName,
          winner: "pending",
          score: null,
          player_1_a: group[0] ?? null,
          player_2_a: group[1] ?? null,
          player_1_b: group[2] ?? null,
          player_2_b: group[3] ?? null,
        });
      }

      const { data: created, error: bulkErr } = await supabase.from("matches").insert(inserts).select("id");

      if (bulkErr) {
        console.error("[friendly] INSERT bulk error", bulkErr);
        const code = (bulkErr as any)?.code ? ` [${(bulkErr as any).code}]` : "";
        const details = (bulkErr as any)?.details ? ` · ${(bulkErr as any).details}` : "";
        toast.error(`Error al crear amistosos${code}: ${bulkErr.message}${details}`);
        setLoading(false);
        return;
      }

      toast.success("Partidos amistosos creados");
      if (created) notifyMatchCreated(created.map((m: any) => m.id));
      router.push("/matches");
    } catch (e: any) {
      console.error(e);
      toast.error("Error inesperado al crear amistosos");
      setLoading(false);
    }
  };

  if (roleLoading) {
    return <p className="text-gray-500">Cargando permisos…</p>;
  }

  if (!canAccess) {
    return <p className="text-red-600 font-semibold">No tenés permisos para crear partidos amistosos.</p>;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Crear partido amistoso</h1>
        <p className="text-sm text-gray-500">Los partidos amistosos no pertenecen a ningún torneo.</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        <section>
          <h2 className="font-semibold mb-2">Detalles y horario</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="datetime-local"
              name="start_time"
              value={form.start_time}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <select
              name="duration_minutes"
              value={form.duration_minutes}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="30">Duración: 30 min</option>
              <option value="60">Duración: 60 min</option>
              <option value="90">Duración: 90 min</option>
              <option value="120">Duración: 120 min</option>
            </select>

            <select
              name="court_id"
              value={form.court_id}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Seleccionar pista</option>
              {courts.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} · {c.is_covered ? "Cubierta" : "Descubierta"}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <input
              type="text"
              name="place"
              placeholder="Lugar (opcional)"
              value={form.place}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <input
              type="text"
              name="court_text"
              placeholder="Pista manual (opcional si elegís pista)"
              value={form.court_text}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {matchesCount > 1 && (
            <p className="text-xs text-gray-600 mt-2">
              Se van a crear <strong>{matchesCount}</strong> partidos consecutivos en la misma pista, sumando un total de{" "}
              <strong>{matchesCount * Number(form.duration_minutes || 60)}</strong> minutos.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">Seleccioná jugadores (mínimo 4, número par)</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlayer(p.id)}
                className={`px-3 py-2 rounded-md border text-sm text-left transition ${
                  selected.includes(p.id)
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {isOdd && (
            <p className="mt-3 text-sm text-orange-600 font-medium">
              Para 2vs2 necesitás un número PAR de jugadores (se arman parejas).
            </p>
          )}
        </section>

        {canCreate && previewPairs.length > 0 && (
          <section className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Vista previa de parejas</h3>
            <ul className="space-y-2 text-sm">
              {previewPairs.map((g, idx) => (
                <li key={idx}>
                  <strong>Partido {idx + 1}:</strong> {players.find((p) => p.id === g[0])?.name} &{" "}
                  {players.find((p) => p.id === g[1])?.name} vs {players.find((p) => p.id === g[2])?.name} &{" "}
                  {players.find((p) => p.id === g[3])?.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => router.back()}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-200 transition"
          >
            Cancelar
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "Creando…" : "Crear partidos amistosos"}
          </button>
        </div>
      </div>
    </main>
  );
}