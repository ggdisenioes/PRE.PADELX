"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";

type Player = {
  id: number;
  name: string;
};

export default function CreateMatchManualPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const tournamentId = searchParams.get("tournament");

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    round_name: "",
    place: "",
    court: "",
    start_time: "",
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
    };

    loadPlayers();
  }, [tournamentId]);

  if (!tournamentId) {
    return (
      <main className="p-8">
        <p className="text-red-600 font-semibold">
          ❌ Error: no se especificó un torneo válido.
        </p>
      </main>
    );
  }

  if (roleLoading || loading) {
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
          ❌ No tenés permisos para crear partidos.
        </p>
      </main>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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

    const { error } = await supabase.from("matches").insert({
      tournament_id: Number(tournamentId),
      round_name: form.round_name || "Partido",
      place: form.place || null,
      court: form.court || null,
      start_time: form.start_time,
      player_1_a: Number(player_1_a),
      player_2_a: Number(player_2_a),
      player_1_b: Number(player_1_b),
      player_2_b: Number(player_2_b),
      winner: "pending",
    });

    if (error) {
      console.error(error);
      toast.error("Error al crear el partido");
      return;
    }

    toast.success("Partido creado correctamente");
    router.push("/matches");
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Crear partido del torneo
      </h1>

      <div className="bg-white rounded-2xl shadow-md p-8 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            <input
              name="round_name"
              placeholder="Ronda (opcional)"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              onChange={handleChange}
            />

            <input
              type="datetime-local"
              name="start_time"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              onChange={handleChange}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                name="place"
                placeholder="Lugar"
                className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                onChange={handleChange}
              />
              <input
                name="court"
                placeholder="Cancha"
                className="border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                onChange={handleChange}
              />
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