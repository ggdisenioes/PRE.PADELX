// ./app/tournaments/[id]/edit/page.tsx

"use client";

import { useEffect, useState, FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter, useParams } from "next/navigation";
import Card from "../../../components/Card";
import toast from "react-hot-toast";
import { useRole } from "../../../hooks/useRole";

type TournamentForm = {
  name: string;
  category: string;
};

export default function EditTournamentPage() {
  const router = useRouter();
  const params = useParams();

  const rawId = (params as any)?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const idNum = Number(id);
  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const [formData, setFormData] = useState<TournamentForm>({
    name: "",
    category: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin && !isManager) {
      toast.error("No tenés permisos para editar torneos.");
      router.replace("/tournaments");
    }
  }, [isAdmin, isManager, roleLoading, router]);

  // Cargar torneo
  useEffect(() => {
    if (roleLoading || (!isAdmin && !isManager)) return;

    if (!id || Number.isNaN(idNum)) {
      toast.error("ID de torneo inválido.");
      router.push("/tournaments");
      return;
    }

    const fetchTournament = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, category")
        .eq("id", idNum)
        .single();

      if (error || !data) {
        console.error("Error cargando torneo:", error);
        toast.error("No se pudo cargar el torneo.");
        router.push("/tournaments");
        return;
      }

      setFormData({
        name: data.name ?? "",
        category: data.category ?? "",
      });

      setLoading(false);
    };

    fetchTournament();
  }, [id, idNum, router, isAdmin, isManager, roleLoading]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!id || Number.isNaN(idNum)) {
      toast.error("ID de torneo inválido.");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("El nombre del torneo es obligatorio.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("tournaments")
      .update({
        name: formData.name.trim(),
        category: formData.category.trim() || null,
      })
      .eq("id", idNum);

    setSaving(false);

    if (error) {
      console.error("Error actualizando torneo:", error);
      toast.error(`No se pudieron guardar los cambios: ${error.message}`);
      return;
    }

    toast.success("Torneo actualizado correctamente.");
    router.push("/tournaments");
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <main className="p-4 md:p-8 lg:p-10 pb-20 w-full overflow-x-hidden">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 text-gray-900">
          Editar Torneo
        </h1>

        {loading || roleLoading ? (
          <p className="text-gray-500">
            {roleLoading ? "Validando permisos..." : "Cargando datos del torneo..."}
          </p>
        ) : (
          <Card className="p-4 md:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nombre */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nombre del torneo
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="PadelX Tour 2025 / 2026"
                  required
                />
              </div>

              {/* Categoría */}
              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Categoría
                </label>
                <input
                  id="category"
                  name="category"
                  type="text"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Liga, Mixto, Empresa, etc."
                />
              </div>

              {/* Botones */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
