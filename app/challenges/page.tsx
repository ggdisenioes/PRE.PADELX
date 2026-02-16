"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../components/Card";
import toast from "react-hot-toast";

type Challenge = {
  id: number;
  challenger_id: number;
  challenger_partner_id: number | null;
  challenged_id: number;
  challenged_partner_id: number | null;
  status: string;
  message: string | null;
  created_at: string;
  expires_at: string;
  match_id: number | null;
  challenged_accepted: boolean | null;
  challenged_partner_accepted: boolean | null;
  scheduled_date: string | null;
  scheduled_court: string | null;
  scheduled_place: string | null;
};

type Player = {
  id: number;
  name: string;
};

type Court = {
  id: number;
  name: string;
};

export default function ChallengesPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    challenger_id: "",
    challenger_partner_id: "",
    challenged_id: "",
    challenged_partner_id: "",
    message: "",
  });
  const [scheduleForm, setScheduleForm] = useState<Record<number, { date: string; court: string; place: string }>>({});
  const [showSchedule, setShowSchedule] = useState<Record<number, boolean>>({});

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // Get my linked player
    const { data: myPlayer } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (myPlayer) {
      setMyPlayerId(myPlayer.id);
    }

    // Get all approved players
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, name")
      .eq("is_approved", true)
      .order("name");

    setPlayers(allPlayers || []);

    // Get courts
    const { data: allCourts } = await supabase
      .from("courts")
      .select("id, name")
      .order("name");

    setCourts(allCourts || []);

    fetchChallenges();
  };

  const fetchChallenges = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/challenges", { headers });
      const result = await response.json();

      if (response.ok) {
        setChallenges(result.challenges || []);
      }
    } catch (error) {
      console.error("Error fetching challenges:", error);
      toast.error("Error cargando desafíos");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.challenger_id || !formData.challenger_partner_id || !formData.challenged_id || !formData.challenged_partner_id) {
      toast.error("Todos los 4 jugadores son obligatorios");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/challenges", {
        method: "POST",
        headers,
        body: JSON.stringify({
          challenger_id: parseInt(formData.challenger_id),
          challenger_partner_id: formData.challenger_partner_id ? parseInt(formData.challenger_partner_id) : null,
          challenged_id: parseInt(formData.challenged_id),
          challenged_partner_id: formData.challenged_partner_id ? parseInt(formData.challenged_partner_id) : null,
          message: formData.message || null,
        }),
      });

      if (response.ok) {
        toast.success("¡Desafío creado!");
        setFormData({ challenger_id: "", challenger_partner_id: "", challenged_id: "", challenged_partner_id: "", message: "" });
        setShowForm(false);
        fetchChallenges();
      } else {
        const result = await response.json();
        toast.error(result.error || "Error al crear desafío");
      }
    } catch (error: any) {
      toast.error(error.message || "Error al crear desafío");
    }
  };

  const handleRespond = async (challengeId: number, playerId: number, response: "accept" | "decline") => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ action: "respond", player_id: playerId, response }),
      });

      if (res.ok) {
        toast.success(response === "accept" ? "¡Desafío aceptado!" : "Desafío rechazado");
        fetchChallenges();
      } else {
        const result = await res.json();
        toast.error(result.error || "Error al responder");
      }
    } catch {
      toast.error("Error al responder");
    }
  };

  const handleSchedule = async (challengeId: number) => {
    const form = scheduleForm[challengeId];
    if (!form?.date) {
      toast.error("La fecha y hora son obligatorias");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          action: "schedule",
          date: form.date,
          court: form.court || undefined,
          place: form.place || undefined,
        }),
      });

      if (res.ok) {
        toast.success("¡Propuesta enviada al administrador!");
        setShowSchedule((prev) => ({ ...prev, [challengeId]: false }));
        fetchChallenges();
      } else {
        const result = await res.json();
        toast.error(result.error || "Error al enviar propuesta");
      }
    } catch {
      toast.error("Error al enviar propuesta");
    }
  };

  const getPlayerName = (playerId: number) => {
    return players.find((p) => p.id === playerId)?.name || `Jugador ${playerId}`;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-200 text-yellow-800";
      case "accepted":
        return "bg-green-200 text-green-800";
      case "declined":
        return "bg-red-200 text-red-800";
      case "completed":
        return "bg-blue-200 text-blue-800";
      default:
        return "bg-gray-200 text-gray-800";
    }
  };

  const getStatusLabel = (challenge: Challenge) => {
    if (challenge.status === "pending") {
      const accepted = [challenge.challenged_accepted, challenge.challenged_partner_accepted].filter((v) => v === true).length;
      const total = challenge.challenged_partner_id ? 2 : 1;
      if (accepted > 0) return `Pendiente (${accepted}/${total} aceptaron)`;
      return "Pendiente";
    }
    if (challenge.status === "accepted") return "Aceptado";
    if (challenge.status === "declined") return "Rechazado";
    if (challenge.status === "completed") return "Completado";
    if (challenge.status === "cancelled") return "Cancelado";
    return challenge.status;
  };

  const renderPlayerStatus = (label: string, accepted: boolean | null) => {
    if (accepted === true) return <span className="text-green-600 font-semibold text-xs">{label}: Aceptó</span>;
    if (accepted === false) return <span className="text-red-600 font-semibold text-xs">{label}: Rechazó</span>;
    return <span className="text-yellow-600 font-semibold text-xs">{label}: Pendiente</span>;
  };

  if (loading) {
    return <div className="p-8 text-center">Cargando desafíos...</div>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Desafíos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? "Cancelar" : "+ Nuevo Desafío"}
        </button>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Crear Desafío 2vs2</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mi equipo (Retadores) */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-bold text-blue-600 mb-3">Mi Equipo (Retadores)</h3>

                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Jugador 1 *</label>
                  <select
                    value={formData.challenger_id}
                    onChange={(e) =>
                      setFormData({ ...formData, challenger_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Selecciona jugador 1</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Jugador 2 (Pareja) *</label>
                  <select
                    value={formData.challenger_partner_id}
                    onChange={(e) =>
                      setFormData({ ...formData, challenger_partner_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Selecciona jugador 2</option>
                    {players
                      .filter((p) => p.id !== parseInt(formData.challenger_id || "0"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Equipo Contrario (Retados) */}
              <div className="border-l-4 border-red-500 pl-4">
                <h3 className="font-bold text-red-600 mb-3">Equipo Contrario (Retados)</h3>

                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Jugador 1 *</label>
                  <select
                    value={formData.challenged_id}
                    onChange={(e) =>
                      setFormData({ ...formData, challenged_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Selecciona jugador 1</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Jugador 2 (Pareja) *</label>
                  <select
                    value={formData.challenged_partner_id}
                    onChange={(e) =>
                      setFormData({ ...formData, challenged_partner_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Selecciona jugador 2</option>
                    {players
                      .filter((p) => p.id !== parseInt(formData.challenged_id || "0"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Mensaje (opcional)
              </label>
              <textarea
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                placeholder="¿Quieres añadir un mensaje?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-20"
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Enviar Desafío
            </button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {challenges.length === 0 ? (
          <Card className="p-4 text-center text-gray-500">
            No hay desafíos aún. ¡Crea uno!
          </Card>
        ) : (
          challenges.map((challenge) => {
            const challengerTeam = challenge.challenger_partner_id
              ? `${getPlayerName(challenge.challenger_id)} y ${getPlayerName(challenge.challenger_partner_id)}`
              : getPlayerName(challenge.challenger_id);
            const challengedTeam = challenge.challenged_partner_id
              ? `${getPlayerName(challenge.challenged_id)} y ${getPlayerName(challenge.challenged_partner_id)}`
              : getPlayerName(challenge.challenged_id);

            // Am I a challenged player who hasn't responded yet?
            const iAmChallenged = myPlayerId === challenge.challenged_id && challenge.challenged_accepted === null;
            const iAmChallengedPartner = myPlayerId === challenge.challenged_partner_id && challenge.challenged_partner_accepted === null;
            const canRespond = challenge.status === "pending" && (iAmChallenged || iAmChallengedPartner);

            // Am I the challenger and challenge is accepted (can propose match)?
            const iAmChallenger = myPlayerId === challenge.challenger_id || myPlayerId === challenge.challenger_partner_id;
            const canPropose = challenge.status === "accepted" && iAmChallenger && !challenge.scheduled_date;

            const sf = scheduleForm[challenge.id] || { date: "", court: "", place: "" };

            return (
              <Card key={challenge.id} className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">
                        {challengerTeam} vs {challengedTeam}
                      </h3>

                      {challenge.message && (
                        <p className="text-sm text-gray-600 mt-2 italic">
                          &ldquo;{challenge.message}&rdquo;
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-3">
                        <span
                          className={`text-xs px-2 py-1 rounded font-semibold ${getStatusBadgeColor(
                            challenge.status
                          )}`}
                        >
                          {getStatusLabel(challenge)}
                        </span>
                        <p className="text-xs text-gray-500">
                          {new Date(challenge.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Individual acceptance status */}
                  {challenge.status === "pending" && (
                    <div className="flex gap-4 border-t pt-3">
                      {renderPlayerStatus(getPlayerName(challenge.challenged_id), challenge.challenged_accepted)}
                      {challenge.challenged_partner_id && renderPlayerStatus(getPlayerName(challenge.challenged_partner_id), challenge.challenged_partner_accepted)}
                    </div>
                  )}

                  {/* Respond buttons for challenged players */}
                  {canRespond && myPlayerId && (
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium mb-2">Tu respuesta:</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(challenge.id, myPlayerId, "accept")}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-semibold"
                        >
                          Aceptar
                        </button>
                        <button
                          onClick={() => handleRespond(challenge.id, myPlayerId, "decline")}
                          className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-semibold"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Propose match form for challenger when fully accepted */}
                  {canPropose && (
                    <div className="border-t pt-3">
                      {!showSchedule[challenge.id] ? (
                        <button
                          onClick={() => setShowSchedule((prev) => ({ ...prev, [challenge.id]: true }))}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-semibold"
                        >
                          Proponer Partido
                        </button>
                      ) : (
                        <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                          <h4 className="font-bold text-sm">Proponer Partido Amistoso</h4>
                          <p className="text-xs text-gray-500">Se enviará una notificación al administrador del club para que confirme y cree el partido.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1">Fecha y hora *</label>
                              <input
                                type="datetime-local"
                                value={sf.date}
                                onChange={(e) =>
                                  setScheduleForm((prev) => ({
                                    ...prev,
                                    [challenge.id]: { ...sf, date: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Pista</label>
                              <select
                                value={sf.court}
                                onChange={(e) =>
                                  setScheduleForm((prev) => ({
                                    ...prev,
                                    [challenge.id]: { ...sf, court: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="">Sin pista</option>
                                {courts.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Lugar (opcional)</label>
                            <input
                              type="text"
                              value={sf.place}
                              onChange={(e) =>
                                setScheduleForm((prev) => ({
                                  ...prev,
                                  [challenge.id]: { ...sf, place: e.target.value },
                                }))
                              }
                              placeholder="Ej: Club de Pádel Centro"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSchedule(challenge.id)}
                              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-semibold"
                            >
                              Enviar Propuesta
                            </button>
                            <button
                              onClick={() => setShowSchedule((prev) => ({ ...prev, [challenge.id]: false }))}
                              className="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-400"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show proposal sent confirmation */}
                  {challenge.status === "accepted" && challenge.scheduled_date && !challenge.match_id && (
                    <div className="border-t pt-3">
                      <p className="text-sm text-green-700 font-medium">
                        Propuesta enviada al administrador — pendiente de confirmación
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Fecha propuesta: {new Date(challenge.scheduled_date).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
                        {challenge.scheduled_court ? ` · ${challenge.scheduled_court}` : ""}
                        {challenge.scheduled_place ? ` · ${challenge.scheduled_place}` : ""}
                      </p>
                    </div>
                  )}

                  {/* Show match link if completed */}
                  {challenge.match_id && (
                    <div className="border-t pt-3">
                      <button
                        onClick={() => router.push("/matches")}
                        className="text-sm text-blue-600 hover:underline font-medium"
                      >
                        Ver partido creado
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
