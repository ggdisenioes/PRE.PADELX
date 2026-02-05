"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import toast from "react-hot-toast";

type Court = {
  id: number;
  name: string;
  is_covered: boolean;
  created_at: string;
};

export default function CourtsPage() {
  const { role, isAdmin, isManager, loading: roleLoading } = useRole();

  const normalizedRole = (role || "").toLowerCase();
  const canWrite = normalizedRole === "admin" || normalizedRole === "manager" || isAdmin || isManager;

  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);

  const [name, setName] = useState("Pista 1");
  const [isCovered, setIsCovered] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCovered, setEditCovered] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const title = useMemo(() => {
    if (role === "user") return "Pistas disponibles";
    return "Administrador de Pistas";
  }, [role]);

  const fetchCourts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("courts")
      .select("id,name,is_covered,created_at")
      .order("id", { ascending: true });

    if (error) {
      console.error("[courts] fetch error", error);
      toast.error("No se pudieron cargar las pistas. Revisá los permisos (RLS).", { duration: 5000 });
      setCourts([]);
      setLoading(false);
      return;
    }

    setCourts((data as Court[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (roleLoading) return;
    fetchCourts();

    const channel = supabase
      .channel("public:courts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courts" },
        () => {
          fetchCourts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      toast.error("No tenés permisos para crear pistas");
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Ingresá un nombre de pista");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("courts").insert({
      name: trimmed,
      is_covered: isCovered,
    });

    if (error) {
      console.error("[courts] insert error", error);
      toast.error(`No se pudo crear la pista: ${error.message}`);
      setSaving(false);
      return;
    }

    toast.success("Pista creada");
    setSaving(false);
    setName("Pista " + (courts.length + 1));
    setIsCovered(false);
    fetchCourts();
  };

  const startEdit = (c: Court) => {
    if (!canWrite) return;
    setEditingId(c.id);
    setEditName(c.name);
    setEditCovered(!!c.is_covered);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCovered(false);
  };

  const saveEdit = async () => {
    if (!canWrite || editingId == null) return;

    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error("Ingresá un nombre de pista");
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase
      .from("courts")
      .update({ name: trimmed, is_covered: editCovered })
      .eq("id", editingId);

    if (error) {
      console.error("[courts] update error", error);
      toast.error(`No se pudo editar la pista: ${error.message}`);
      setSavingEdit(false);
      return;
    }

    toast.success("Pista actualizada");
    setSavingEdit(false);
    cancelEdit();
    fetchCourts();
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <section className="max-w-5xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-wide">
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {role === "user"
              ? "Podés ver las pistas para reservar."
              : "Creá y gestioná tus pistas. Los clientes las verán para reservar."}
          </p>
        </div>

        {canWrite && (
          <Card>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Ej: Pista 1"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
                <select
                  value={isCovered ? "covered" : "open"}
                  onChange={(e) => setIsCovered(e.target.value === "covered")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="open">Descubierta</option>
                  <option value="covered">Cubierta</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? "Creando..." : "Crear pista"}
              </button>
            </form>
          </Card>
        )}

        <Card>
          {loading ? (
            <p className="text-gray-400 text-center animate-pulse">Cargando pistas...</p>
          ) : courts.length === 0 ? (
            <p className="text-gray-500 text-center">Todavía no hay pistas creadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2">Pista</th>
                    <th className="py-2">Cubierta</th>
                    <th className="py-2">Estado</th>
                    {canWrite && <th className="py-2 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {courts.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="py-3 font-semibold text-gray-900">
                        {editingId === c.id ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-normal text-gray-900"
                          />
                        ) : (
                          c.name
                        )}
                      </td>

                      <td className="py-3 text-gray-700">
                        {editingId === c.id ? (
                          <select
                            value={editCovered ? "covered" : "open"}
                            onChange={(e) => setEditCovered(e.target.value === "covered")}
                            className="w-full max-w-[180px] rounded-lg border border-gray-300 px-3 py-2"
                          >
                            <option value="open">Descubierta</option>
                            <option value="covered">Cubierta</option>
                          </select>
                        ) : (
                          c.is_covered ? "Sí" : "No"
                        )}
                      </td>

                      <td className="py-3">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 border border-green-200">
                          Libre
                        </span>
                      </td>

                      {canWrite && (
                        <td className="py-3 text-right">
                          {editingId === c.id ? (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                disabled={savingEdit}
                                onClick={saveEdit}
                                className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
                              >
                                {savingEdit ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                disabled={savingEdit}
                                onClick={cancelEdit}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition disabled:opacity-60"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
