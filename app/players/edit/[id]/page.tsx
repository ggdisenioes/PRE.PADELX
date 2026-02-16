// app/players/edit/[id]/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";

import Card from "../../../components/Card";
import { logAction } from "../../../lib/audit";
import { formatDateMadrid } from "@/lib/dates";
import { isAdminSession } from "../../../lib/admin";
// ⚠️ Supabase client está en /lib/supabase.ts (raíz del proyecto)
import { supabase } from "../../../lib/supabase";

type PlayerStats = {
  wins: number;
  losses: number;
  totalMatches: number;
};

type MatchHistoryItem = {
  id: number;
  opponent: string;
  result: "Victoria" | "Derrota";
  score: string;
  date: string; // yyyy-mm-dd / locale
};

type PlayerForm = {
  name: string;
  email: string;
  phone: string;
  notify_email: boolean;
  notify_whatsapp: boolean;
  level: number;
  avatar_url: string;
  is_approved: boolean;
  stats: PlayerStats;
  matchHistory: MatchHistoryItem[];
};

type OriginalComparable = {
  name: string;
  email: string;
  phone: string;
  notify_email: boolean;
  notify_whatsapp: boolean;
  level: number;
  avatar_url: string;
  is_approved: boolean;
};

export default function EditPlayerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const playerIdStr = params?.id;

  const playerId = useMemo(() => Number(playerIdStr), [playerIdStr]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [originalData, setOriginalData] = useState<OriginalComparable | null>(null);

  const [formData, setFormData] = useState<PlayerForm>({
    name: "",
    email: "",
    phone: "",
    notify_email: true,
    notify_whatsapp: false,
    level: 4.0,
    avatar_url: "",
    is_approved: false,
    stats: { wins: 0, losses: 0, totalMatches: 0 },
    matchHistory: [],
  });

  const winPercentage = useMemo(() => {
    if (!formData.stats.totalMatches) return 0;
    return Math.round((formData.stats.wins / formData.stats.totalMatches) * 100);
  }, [formData.stats]);

  const getChangedFields = () => {
    if (!originalData) return {};

    const current: OriginalComparable = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      notify_email: formData.notify_email,
      notify_whatsapp: formData.notify_whatsapp,
      level: formData.level,
      avatar_url: formData.avatar_url,
      is_approved: formData.is_approved,
    };

    const changes: Record<string, { before: any; after: any }> = {};

    (Object.keys(originalData) as (keyof OriginalComparable)[]).forEach((key) => {
      if (originalData[key] !== current[key]) {
        changes[key] = { before: originalData[key], after: current[key] };
      }
    });

    return changes;
  };

  // --- FUNCIÓN CENTRAL DE CÁLCULO DE ESTADÍSTICAS ---
  const calculateStatsAndHistory = (matchesData: any[]) => {
    let wins = 0;
    let losses = 0;
    const history: MatchHistoryItem[] = [];

    const currentPlayerId = playerId;

    for (const match of matchesData) {
      let team: "A" | "B" | null = null;

      // Relaciones (player_1_a, etc.) devuelven objeto {name,id} si están bien configuradas
      if (match.player_1_a?.id === currentPlayerId || match.player_2_a?.id === currentPlayerId) {
        team = "A";
      } else if (match.player_1_b?.id === currentPlayerId || match.player_2_b?.id === currentPlayerId) {
        team = "B";
      }

      if (team && match.winner && match.winner !== "pending") {
        const isWinner = team === match.winner;
        if (isWinner) wins++;
        else losses++;

        // Obtener el equipo del jugador actual
        let partner = null;
        if (team === "A") {
          partner = match.player_1_a?.id === currentPlayerId
            ? match.player_2_a?.name
            : match.player_1_a?.name;
        } else {
          partner = match.player_1_b?.id === currentPlayerId
            ? match.player_2_b?.name
            : match.player_1_b?.name;
        }

        // Obtener ambos oponentes
        const opponentTeamLetter = team === "A" ? "B" : "A";
        const opp1 = match[`player_1_${opponentTeamLetter.toLowerCase()}`]?.name;
        const opp2 = match[`player_2_${opponentTeamLetter.toLowerCase()}`]?.name;
        const opponents = [opp1, opp2].filter(Boolean);
        const opponentText = opponents.length === 2
          ? `${opponents[0]} y ${opponents[1]}`
          : opponents[0] || "[Oponentes Desconocidos]";

        history.push({
          id: match.id ?? 0,
          opponent: `Con ${partner || "(Sin compañero)"} vs ${opponentText}`,
          result: isWinner ? "Victoria" : "Derrota",
          score: match.score || "N/A",
          date: match.start_time ? formatDateMadrid(match.start_time) : "-",
        });
      }
    }

    return {
      stats: {
        wins,
        losses,
        totalMatches: wins + losses,
      },
      matchHistory: history,
    };
  };

  useEffect(() => {
    if (!playerIdStr) return;
    if (!playerId || Number.isNaN(playerId)) return;

    const load = async () => {
      setLoading(true);

      // 1) Rol admin
      const { data: sessionRes } = await supabase.auth.getSession();
      setIsAdmin(isAdminSession(sessionRes.session));

      // 2) Perfil jugador
      const { data: playerData, error: profileError } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (profileError) {
        console.error(profileError);
        toast.error("Error cargando datos del jugador.");
        router.push("/players");
        setLoading(false);
        return;
      }

      // 3) Partidos jugador
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(
          `
          id,
          score,
          winner,
          start_time,
          player_1_a (name, id),
          player_2_a (name, id),
          player_1_b (name, id),
          player_2_b (name, id)
        `
        )
        .or(
          `player_1_a.eq.${playerId},player_2_a.eq.${playerId},player_1_b.eq.${playerId},player_2_b.eq.${playerId}`
        )
        .order("start_time", { ascending: false });

      if (matchesError) {
        console.error("Error cargando partidos:", matchesError);
        toast.error("Error al cargar el historial de partidos.", { duration: 4000 });
      }

      const { stats, matchHistory } = calculateStatsAndHistory(matchesData || []);

      const nextForm: PlayerForm = {
        name: playerData?.name || "",
        email: playerData?.email || "",
        phone: playerData?.phone || "",
        notify_email: playerData?.notify_email ?? true,
        notify_whatsapp: playerData?.notify_whatsapp ?? false,
        level: typeof playerData?.level === "number" ? playerData.level : 4.0,
        avatar_url: playerData?.avatar_url || "",
        is_approved: !!playerData?.is_approved,
        stats,
        matchHistory,
      };

      setFormData(nextForm);
      setOriginalData({
        name: nextForm.name,
        email: nextForm.email,
        phone: nextForm.phone,
        notify_email: nextForm.notify_email,
        notify_whatsapp: nextForm.notify_whatsapp,
        level: nextForm.level,
        avatar_url: nextForm.avatar_url,
        is_approved: nextForm.is_approved,
      });

      setLoading(false);
    };

    load();
  }, [playerIdStr, playerId, router]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!e.target.files || e.target.files.length === 0) {
        toast.error("Por favor selecciona una imagen.");
        return;
      }

      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setFormData((prev) => ({ ...prev, avatar_url: data.publicUrl }));
      toast.success("Imagen subida correctamente.");
    } catch (error: any) {
      toast.error("Error subiendo imagen: " + (error?.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("El nombre del jugador es obligatorio.");
      return;
    }

    setLoading(true);

    const updateData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone || null,
      notify_email: formData.notify_email,
      notify_whatsapp: formData.notify_whatsapp,
      level: formData.level,
      avatar_url: formData.avatar_url,
      is_approved: formData.is_approved,
    };

    const { error } = await supabase.from("players").update(updateData).eq("id", playerId);

    if (error) {
      console.error(error);
      if (error.code === "23505") {
        toast.error("Error: Ya existe un jugador con ese nombre.");
      } else {
        toast.error("Error al actualizar: " + error.message);
      }
      setLoading(false);
      return;
    }

    const changes = getChangedFields();

    await logAction({
      action: "UPDATE_PLAYER",
      entity: "player",
      entityId: playerId,
      metadata: {
        playerName: formData.name,
        changes,
      },
    });

    toast.success("¡Jugador actualizado correctamente!");
    router.push("/players");
    router.refresh();
    setLoading(false);
  };

  if (loading || !playerIdStr) {
    return (
      <main className="flex-1 overflow-y-auto p-8">
        <p className="text-gray-500 animate-pulse">Cargando datos del jugador...</p>
      </main>
    );
  }

  const mainGridClasses = isAdmin ? "grid lg:grid-cols-3 gap-8" : "flex flex-col gap-8 items-center";
  const statsClasses = isAdmin ? "lg:col-span-2 space-y-8" : "w-full max-w-4xl space-y-8";
  const titleText = isAdmin ? `Editar Jugador: ${formData.name}` : `Perfil de Jugador: ${formData.name}`;

  return (
    <main className={`flex-1 overflow-y-auto p-8 ${mainGridClasses}`}>
      {/* COLUMNA 1: Formulario de Edición (SOLO ADMIN) */}
      {isAdmin && (
        <div className="lg:col-span-1">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">{titleText}</h2>
          <Card className="max-w-xl mx-auto lg:mx-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* FOTO DE PERFIL */}
              <div className="flex flex-col items-center mb-6 gap-4">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 relative">
                  {formData.avatar_url ? (
                    <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl text-gray-300">👤</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white text-xs">
                      Subiendo...
                    </div>
                  )}
                </div>

                <label className="cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded text-sm font-bold hover:bg-blue-100 transition">
                  Cambiar Foto
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading || loading}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Ale Galán"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Opcional)</label>
                <input
                  type="email"
                  className="w-full p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp (Opcional)</label>
                <input
                  type="tel"
                  className="w-full p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: +34612345678"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              {/* Preferencias de Notificación */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notificaciones</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.notify_email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notify_email: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Recibir notificaciones por Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.notify_whatsapp}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notify_whatsapp: e.target.checked }))}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">Recibir notificaciones por WhatsApp</span>
                  </label>
                </div>
                {formData.notify_whatsapp && !formData.phone && (
                  <p className="text-xs text-amber-600 mt-1">Ingresá un número de WhatsApp para recibir notificaciones.</p>
                )}
              </div>

              {/* Nivel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de Juego (1.0 - 7.0)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="7"
                    step="0.5"
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    value={formData.level}
                    onChange={(e) => setFormData((prev) => ({ ...prev, level: parseFloat(e.target.value) }))}
                  />
                  <span className="text-xl font-bold text-blue-600 w-12 text-center">{formData.level}</span>
                </div>
              </div>

              {/* Estado de Aprobación */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado de Aprobación</label>
                <select
                  className="w-full p-2 border border-gray-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.is_approved ? "approved" : "pending"}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_approved: e.target.value === "approved" }))}
                >
                  <option value="approved">Aprobado (Visible)</option>
                  <option value="pending">Pendiente (Oculto)</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => router.push("/players")}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || uploading || !formData.name}
                  className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* COLUMNA 2/3: Perfil Público y Estadísticas */}
      <div className={statsClasses}>
        {/* Cabecera del Perfil (Solo para No-Admin) */}
        {!isAdmin && (
          <div className="text-center mb-8">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 mx-auto mb-4">
              {formData.avatar_url ? (
                <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl text-gray-300">👤</span>
              )}
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900">{formData.name}</h1>
            <p className="text-lg text-blue-600 font-semibold mt-1">Nivel de Juego: {formData.level}</p>
          </div>
        )}

        <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">{isAdmin ? "Estadísticas" : "Rendimiento y Estadísticas"}</h3>

        {/* Tarjetas de Estadísticas Principales */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <Card className="p-4 bg-white border border-green-200">
            <p className="text-3xl font-bold text-green-600">{formData.stats.wins}</p>
            <p className="text-sm text-gray-500">Victorias</p>
          </Card>
          <Card className="p-4 bg-white border border-red-200">
            <p className="text-3xl font-bold text-red-600">{formData.stats.losses}</p>
            <p className="text-sm text-gray-500">Derrotas</p>
          </Card>
          <Card className="p-4 bg-white border border-blue-200">
            <p className="text-3xl font-bold text-blue-600">{formData.stats.totalMatches}</p>
            <p className="text-sm text-gray-500">Total Partidos</p>
          </Card>
        </div>

        {/* Progreso de Porcentaje de Victorias */}
        <Card className="p-4 space-y-2">
          <p className="font-semibold text-gray-700 flex justify-between">
            Porcentaje de Victorias:
            <span className="font-bold text-blue-700">{winPercentage}%</span>
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${winPercentage}%` }}
            ></div>
          </div>
        </Card>

        {/* Historial de Partidos */}
        <h3 className="text-xl font-bold text-gray-800 border-b pb-2 pt-4">Historial de Partidos</h3>
        <div className="space-y-3">
          {formData.matchHistory.length === 0 ? (
            <Card className="p-3 text-gray-500">No se encontraron partidos para este jugador.</Card>
          ) : (
            formData.matchHistory.map((match, index) => (
              <React.Fragment key={`${match.id}-${match.date}-${index}`}>
                <Card
                  className={`p-3 flex justify-between items-center ${
                    match.result === "Victoria" ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 text-xs font-bold rounded ${
                        match.result === "Victoria" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                      }`}
                    >
                      {match.result.slice(0, 3)}
                    </span>
                    <div>
                      <p className="font-semibold">{match.opponent}</p>
                      <p className="text-xs text-gray-600">{match.date}</p>
                    </div>
                  </div>
                  <p className={`font-bold ${match.result === "Victoria" ? "text-green-700" : "text-red-700"}`}>{match.score}</p>
                </Card>
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </main>
  );
}