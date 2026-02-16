"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";
import { logAction } from "../../lib/audit";
import { useTenantPlan } from "../../hooks/useTenantPlan";

type TournamentInsert = {
  name: string;
  category: string;
  status: string;
  start_date: string | null;
};

export default function CreateTournament() {
  const router = useRouter();
  const { loading: planLoading, plan, canCreateTournament, usage } = useTenantPlan();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Mixto A");
  const [status, setStatus] = useState("open");
  const [startDate, setStartDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Ingresá un nombre para el torneo");
      return;
    }

    if (!canCreateTournament) {
      toast.error(`Limite de torneos activos alcanzado (${usage.activeTournamentCount}/${plan?.max_concurrent_tournaments}). Finaliza un torneo o actualiza tu plan.`);
      return;
    }

    setLoading(true);

    const finalCategory = isCustomCategory
      ? customCategory.trim()
      : category;

    if (!finalCategory) {
      toast.error("Ingresá una categoría válida");
      setLoading(false);
      return;
    }

    const payload: TournamentInsert = {
      name: name.trim(),
      category: finalCategory,
      status,
      start_date: startDate ? startDate : null,
    };

    const { data, error } = await supabase
      .from("tournaments")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error(error);
      const msg = error.message?.includes('PLAN_LIMIT')
        ? error.message.replace('PLAN_LIMIT: ', '')
        : "Error al crear el torneo";
      toast.error(msg);
      setLoading(false);
      return;
    }

    // Log de auditoría
    try {
      await logAction({
        action: "CREATE_TOURNAMENT",
        entity: "tournament",
        entityId: data.id,
        metadata: payload,
      });
    } catch (e) {
      // No bloqueamos la UX si el log falla
      console.warn("No se pudo registrar la acción en auditoría", e);
    }

    toast.success("Torneo creado");
    setLoading(false);

    // Redirigir a edición del torneo recién creado
    router.push(`/tournaments/edit/${data.id}`);
  };

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Crear Torneo</h2>

      {!planLoading && !canCreateTournament && (
        <div className="max-w-3xl mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-sm">
          <strong>Limite alcanzado:</strong> Tu plan {plan?.name} permite hasta {plan?.max_concurrent_tournaments} torneo(s) activo(s) y ya tienes {usage.activeTournamentCount}. Finaliza un torneo o contacta al administrador para actualizar tu plan.
        </div>
      )}

      <Card className="max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="Ej: Torneo Apertura"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Categoría</label>
            <select
              value={isCustomCategory ? "__custom__" : category}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__custom__") {
                  setIsCustomCategory(true);
                  setCategory("");
                } else {
                  setIsCustomCategory(false);
                  setCategory(value);
                }
              }}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="Mixto A">Mixto A</option>
              <option value="Mixto B">Mixto B</option>
              <option value="Masculino A">Masculino A</option>
              <option value="Masculino B">Masculino B</option>
              <option value="Femenino A">Femenino A</option>
              <option value="Femenino B">Femenino B</option>
              <option value="__custom__">➕ Crear categoría</option>
            </select>
          </div>

          {isCustomCategory && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nombre de la nueva categoría
              </label>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Ej: Senior +40"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="open">Abierto (Inscripciones)</option>
              <option value="ongoing">En curso</option>
              <option value="finished">Finalizado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>

          <div className="flex items-center gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => router.push("/tournaments")}
              className="px-4 py-2 rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleCreate}
              className="px-5 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
              disabled={loading || !canCreateTournament}
            >
              {loading ? "Creando..." : "Crear torneo"}
            </button>
          </div>
        </div>
      </Card>
    </main>
  );
}