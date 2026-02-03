// ./app/courts/page.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Card from "../components/Card";
import { useRole } from "../hooks/useRole";
import { supabase } from "../lib/supabase";

type Court = {
  id: number;
  name: string;
  is_covered: boolean;
  sort_order: number;
  is_active: boolean;
  tenant_id: string;
  created_at: string;
  updated_at?: string | null;
};

type NewCourt = {
  name: string;
  is_covered: boolean;
};

function friendlyErrorMessage(error: unknown): string {
  const msg = (error as any)?.message ? String((error as any).message) : String(error);
  if (msg.includes("max_courts_reached")) return "Ya alcanzaste el máximo de 10 pistas.";
  if (msg.includes("tenant_no_asignado")) return "Tu usuario no tiene club asignado. Contactá al administrador.";
  return msg;
}

export default function CourtsPage() {
  const { role, isAdmin, isManager, loading: roleLoading } = useRole();
  const canEdit = isAdmin || isManager;

  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newCourt, setNewCourt] = useState<NewCourt>({
    name: "",
    is_covered: false,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<NewCourt>({ name: "", is_covered: false });
  const [editingActive, setEditingActive] = useState<boolean>(true);

  const courtsCount = courts.length;

  const fetchCourts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("courts")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error al cargar pistas:", error);
      toast.error(`Error al cargar pistas: ${error.message}`);
      setCourts([]);
    } else {
      setCourts((data as Court[]) ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    fetchCourts();
  }, [fetchCourts, roleLoading]);

  useEffect(() => {
    if (roleLoading) return;

    const channel = supabase
      .channel("courts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courts" },
        () => {
          // Para evitar inconsistencias con sort_order, volvemos a pedir la lista.
          fetchCourts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCourts, roleLoading]);

  const sortedCourts = useMemo(() => {
    return [...courts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [courts]);

  const startEdit = (court: Court) => {
    setEditingId(court.id);
    setEditing({ name: court.name, is_covered: court.is_covered });
    setEditingActive(Boolean(court.is_active));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditing({ name: "", is_covered: false });
    setEditingActive(true);
  };

  const handleCreate = async () => {
    if (!canEdit) return;

    const name = newCourt.name.trim();
    if (!name) {
      toast.error("Ingresá un nombre para la pista.");
      return;
    }

    if (courtsCount >= 10) {
      toast.error("Ya alcanzaste el máximo de 10 pistas.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("courts")
      .insert([{ name, is_covered: newCourt.is_covered }]);

    if (error) {
      console.error("Error creando pista:", error);
      toast.error(`No se pudo crear la pista: ${friendlyErrorMessage(error)}`);
    } else {
      toast.success("Pista creada.");
      setNewCourt({ name: "", is_covered: false });
      // El realtime refresca; pero también refrescamos por si acaso.
      fetchCourts();
    }
    setSaving(false);
  };

  const handleUpdate = async (courtId: number) => {
    if (!canEdit) return;

    const name = editing.name.trim();
    if (!name) {
      toast.error("El nombre no puede estar vacío.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("courts")
      .update({
        name,
        is_covered: editing.is_covered,
        is_active: editingActive,
      })
      .eq("id", courtId);

    if (error) {
      console.error("Error actualizando pista:", error);
      toast.error(`No se pudo actualizar: ${friendlyErrorMessage(error)}`);
    } else {
      toast.success("Pista actualizada.");
      cancelEdit();
      fetchCourts();
    }
    setSaving(false);
  };

  const handleDelete = async (courtId: number) => {
    if (!isAdmin) return;

    const court = courts.find((c) => c.id === courtId);
    const label = court ? court.name : "esta pista";

    if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;

    setSaving(true);
    const { error } = await supabase.from("courts").delete().eq("id", courtId);

    if (error) {
      console.error("Error eliminando pista:", error);
      toast.error(`No se pudo eliminar: ${friendlyErrorMessage(error)}`);
    } else {
      toast.success("Pista eliminada.");
      fetchCourts();
    }
    setSaving(false);
  };

  const swapSortOrder = async (a: Court, b: Court) => {
    // swap en 2 updates; trigger de update no toca sort_order
    setSaving(true);

    const { error: err1 } = await supabase
      .from("courts")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);

    if (err1) {
      setSaving(false);
      toast.error(`No se pudo reordenar: ${friendlyErrorMessage(err1)}`);
      return;
    }

    const { error: err2 } = await supabase
      .from("courts")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);

    setSaving(false);

    if (err2) {
      toast.error(`No se pudo reordenar: ${friendlyErrorMessage(err2)}`);
      fetchCourts();
      return;
    }

    toast.success("Orden actualizado.");
    fetchCourts();
  };

  const moveUp = async (courtId: number) => {
    const idx = sortedCourts.findIndex((c) => c.id === courtId);
    if (idx <= 0) return;
    await swapSortOrder(sortedCourts[idx], sortedCourts[idx - 1]);
  };

  const moveDown = async (courtId: number) => {
    const idx = sortedCourts.findIndex((c) => c.id === courtId);
    if (idx < 0 || idx >= sortedCourts.length - 1) return;
    await swapSortOrder(sortedCourts[idx], sortedCourts[idx + 1]);
  };

  if (roleLoading) {
    return (
      <main className="flex-1 p-8">
        <p className="text-gray-500 animate-pulse">Cargando permisos…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Administrador de Pistas</h2>
          <p className="text-sm text-gray-500 mt-1">
            {role === "user"
              ? "Acá podés ver las pistas disponibles del club."
              : "Creá y administrá las pistas del club (máximo 10)."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
            {courtsCount}/10 pistas
          </span>
        </div>
      </div>

      {canEdit && (
        <Card title="Nueva pista" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre</label>
              <input
                value={newCourt.name}
                onChange={(e) => setNewCourt((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ej: Pista 1"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#07fdbb]"
                disabled={saving}
                maxLength={50}
              />
              <p className="text-xs text-gray-500 mt-1">Sugerencia: Pista 1, Pista 2…</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
              <select
                value={newCourt.is_covered ? "covered" : "open"}
                onChange={(e) => setNewCourt((s) => ({ ...s, is_covered: e.target.value === "covered" }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#07fdbb]"
                disabled={saving}
              >
                <option value="open">Descubierta</option>
                <option value="covered">Cubierta</option>
              </select>
              <button
                onClick={handleCreate}
                disabled={saving || !newCourt.name.trim() || courtsCount >= 10}
                className="mt-3 w-full rounded-xl bg-[#010e35] text-white py-3 font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Crear pista"}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Listado de pistas">
        {loading ? (
          <p className="text-gray-500 animate-pulse">Cargando pistas…</p>
        ) : sortedCourts.length === 0 ? (
          <div className="text-gray-600">
            <p className="font-semibold">Todavía no hay pistas cargadas.</p>
            {canEdit ? (
              <p className="text-sm text-gray-500 mt-1">Creá la primera pista arriba para empezar.</p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Contactá al administrador para que cargue las pistas del club.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b">
                  <th className="py-3 pr-3">Orden</th>
                  <th className="py-3 pr-3">Nombre</th>
                  <th className="py-3 pr-3">Tipo</th>
                  <th className="py-3 pr-3">Estado</th>
                  {canEdit && <th className="py-3 pr-3">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {sortedCourts.map((court, index) => {
                  const isEditing = editingId === court.id;
                  const tipo = court.is_covered ? "Cubierta" : "Descubierta";

                  return (
                    <tr key={court.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-3 text-sm text-gray-700 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 text-xs font-bold">
                            {court.sort_order ?? index + 1}
                          </span>

                          {canEdit && (
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => moveUp(court.id)}
                                disabled={saving || index === 0}
                                className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveDown(court.id)}
                                disabled={saving || index === sortedCourts.length - 1}
                                className="mt-1 text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                              >
                                ▼
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-sm text-gray-800">
                        {isEditing ? (
                          <input
                            value={editing.name}
                            onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#07fdbb]"
                            disabled={saving}
                            maxLength={50}
                          />
                        ) : (
                          <span className="font-semibold">{court.name}</span>
                        )}
                      </td>

                      <td className="py-3 pr-3 text-sm text-gray-700">
                        {isEditing ? (
                          <select
                            value={editing.is_covered ? "covered" : "open"}
                            onChange={(e) => setEditing((s) => ({ ...s, is_covered: e.target.value === "covered" }))}
                            className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#07fdbb]"
                            disabled={saving}
                          >
                            <option value="open">Descubierta</option>
                            <option value="covered">Cubierta</option>
                          </select>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-semibold">
                            {tipo}
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-3 text-sm text-gray-700">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editingActive}
                              onChange={(e) => setEditingActive(e.target.checked)}
                              disabled={saving}
                            />
                            Activa
                          </label>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold ${
                              court.is_active
                                ? "bg-green-50 border-green-200 text-green-700"
                                : "bg-red-50 border-red-200 text-red-700"
                            }`}
                          >
                            {court.is_active ? "Activa" : "Inactiva"}
                          </span>
                        )}
                      </td>

                      {canEdit && (
                        <td className="py-3 pr-3 text-sm text-gray-700 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleUpdate(court.id)}
                                disabled={saving}
                                className="px-3 py-2 rounded-lg bg-[#07fdbb] text-[#010e35] font-bold hover:opacity-90 disabled:opacity-50"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => startEdit(court)}
                                disabled={saving}
                                className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Editar
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => handleDelete(court.id)}
                                  disabled={saving}
                                  className="px-3 py-2 rounded-lg bg-red-600/10 text-red-700 font-semibold hover:bg-red-600/20 disabled:opacity-50"
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!canEdit && (
              <p className="text-xs text-gray-500 mt-4">
                * Para modificar pistas, contactá al administrador del club.
              </p>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
