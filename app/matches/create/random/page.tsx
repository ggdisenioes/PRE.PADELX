"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";
import { notifyMatchCreated } from "../../../lib/notify";
import toast from "react-hot-toast";

type Player = {
  id: number;
  name: string;
};

export default function CreateRandomMatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("tournament");

  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [format, setFormat] = useState<string>("liga");

  useEffect(() => {
    if (!tournamentId) {
      router.push("/matches");
      return;
    }

    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name")
        .order("name", { ascending: true });

      if (!error && data) setPlayers(data);
    };

    fetchPlayers();
  }, [tournamentId, router]);

  if (roleLoading) return null;

  if (!isAdmin && !isManager) {
    return (
      <div className="p-6 text-red-600 font-semibold">
        ❌ No tenés permisos para crear partidos.
      </div>
    );
  }

  const togglePlayer = (id: number) => {
    setSelectedPlayers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Validation helpers
  const isOddSelection = selectedPlayers.length >= 4 && selectedPlayers.length % 2 === 1;
  const canPreviewPairs = selectedPlayers.length >= 4 && selectedPlayers.length % 2 === 0;

  // Preview pairs helper
  function previewPairs(): { name1: string; name2: string }[] {
    // Get selected Player objects
    const selectedObjs = players.filter((p) => selectedPlayers.includes(p.id));
    // Shuffle
    const arr = [...selectedObjs];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Group into pairs
    const pairs: { name1: string; name2: string }[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      pairs.push({ name1: arr[i].name, name2: arr[i + 1].name });
    }
    return pairs;
  }

  const generateMatches = async () => {
    if (!startTime) {
      toast.error("Seleccioná fecha y hora");
      return;
    }

    if (selectedPlayers.length < 4) {
      toast.error("Seleccioná al menos 4 jugadores");
      return;
    }

    if (selectedPlayers.length % 4 !== 0) {
      toast.error("La cantidad de jugadores debe ser múltiplo de 4");
      return;
    }

    setCreating(true);

    const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
    const matches = [];

    for (let i = 0; i < shuffled.length; i += 4) {
      const [a1, a2, b1, b2] = shuffled.slice(i, i + 4);

      matches.push({
        tournament_id: Number(tournamentId),
        player_1_a: a1,
        player_2_a: a2,
        player_1_b: b1,
        player_2_b: b2,
        start_time: startTime,
        winner: "pending",
      });
    }

    const { data: created, error } = await supabase.from("matches").insert(matches).select("id");

    setCreating(false);

    if (error) {
      console.error(error);
      toast.error("Error al crear partidos");
    } else {
      toast.success("Partidos creados");
      if (created) notifyMatchCreated(created.map((m: any) => m.id));
      router.push(`/tournaments/edit/${tournamentId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4">
      <h1 className="text-2xl font-semibold mb-6">Generar partidos</h1>

      <div className="bg-white rounded-2xl p-6 space-y-6 shadow-md">
        {/* Formato */}
        <div>
          <label className="block text-sm font-medium mb-1">Formato</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="w-full rounded-lg px-3 py-2 bg-gray-50 shadow-sm"
          >
            <option value="liga">Liga (todos contra todos)</option>
            {/* Opciones futuras */}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Todos los formatos generan partidos <strong>2vs2</strong> (las parejas se arman automáticamente).
          </p>
        </div>

        {/* Fecha inicio */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Fecha de inicio del torneo
          </label>
          <input
            type="date"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 shadow-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Necesaria porque <code>start_time</code> en matches no permite NULL.
          </p>
        </div>

        {/* Selección jugadores */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Seleccionar jugadores
          </label>

          <div className="rounded-lg p-3 max-h-80 overflow-auto space-y-2 bg-gray-50 shadow-inner">
            {players.map((p) => {
              const selected = selectedPlayers.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlayer(p.id)}
                  className={`w-full px-3 py-2 rounded-md text-left transition shadow-sm ${
                    selected
                      ? "bg-green-50 ring-2 ring-green-500"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between text-sm text-gray-500 mt-2">
            <span>Jugadores seleccionados: {selectedPlayers.length}</span>
            <span>
              Parejas estimadas: {Math.floor(selectedPlayers.length / 2)}
            </span>
          </div>
          {isOddSelection && (
            <div className="mt-2 text-orange-500 text-sm font-medium">
              Para 2vs2 necesitás un número <span className="font-bold">PAR</span> de jugadores (se arman parejas).
            </div>
          )}
        </div>

        {/* Vista previa */}
        <div className="pt-4">
          <h3 className="text-sm font-semibold mb-1">Vista previa de parejas</h3>
          {!canPreviewPairs && (
            <p className="text-sm text-gray-500">
              Seleccioná al menos 4 jugadores para armar parejas.
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Formato seleccionado: <strong>
              {format === "liga" ? "Liga (todos contra todos)" : format}
            </strong>
          </p>
          {canPreviewPairs && (
            <div className="mt-4 bg-gray-50 rounded-xl p-4 shadow-inner">
              <ul className="space-y-2">
                {previewPairs().map((pair, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-gray-700">
                    <span className="font-semibold">Pareja {idx + 1}:</span>
                    <span>{pair.name1}</span>
                    <span className="text-gray-400">/</span>
                    <span>{pair.name2}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Acción */}
        <div className="flex justify-end">
          <button
            onClick={generateMatches}
            disabled={creating}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {creating ? "Generando partidos..." : "Generar partidos"}
          </button>
        </div>
      </div>
    </div>
  );
}
