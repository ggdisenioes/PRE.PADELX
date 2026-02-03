"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { isAdminSession } from "../lib/admin";
import Card from "../components/Card";
import Badge from "../components/Badge";
import toast from "react-hot-toast";

type Tournament = {
  id: number;
  name: string;
  category: string;
  start_date: string | null;
  status: string;
  created_at?: string;
};

export function TournamentListClient() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const router = useRouter();

  // --- CARGA INICIAL + TIEMPO REAL ---
  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsAdmin(isAdminSession(session));

      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando torneos:", error);
        toast.error("Error cargando torneos");
      } else {
        setTournaments(data ?? []);
      }

      setLoading(false);
    };

    const setupRealtime = () => {
      const subscription = supabase
        .channel("public:tournaments")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tournaments" },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setTournaments((prev) => [payload.new as Tournament, ...prev]);
            } else if (payload.eventType === "UPDATE") {
              setTournaments((prev) =>
                prev.map((t) =>
                  t.id === (payload.new as Tournament).id
                    ? (payload.new as Tournament)
                    : t
                )
              );
            } else if (payload.eventType === "DELETE") {
              setTournaments((prev) =>
                prev.filter(
                  (t) => t.id !== (payload.old as Tournament).id
                )
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    };

    fetchData();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  // --- ELIMINAR TORNEO ---
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !confirm(
        "¿Estás seguro de eliminar este torneo? También se eliminarán sus partidos."
      )
    ) {
      return;
    }

    // ON DELETE CASCADE en la FK se encarga de borrar los matches
    const { error } = await supabase
      .from("tournaments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Error al borrar torneo:",
        error,
        JSON.stringify(error, null, 2)
      );
      toast.error(
        "Error al eliminar torneo: " +
          (error.message || "Error desconocido")
      );
    } else {
      toast.success("Torneo y partidos asociados eliminados correctamente");
    }
  };

  const handleEdit = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/tournaments/edit/${id}`);
  };

  // --- FILTRADO ---
  const filteredTournaments = tournaments.filter((t) => {
    const term = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      t.category.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800">
          Torneos
        </h2>

        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 md:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <i className="fas fa-search" />
            </span>
            <input
              type="text"
              placeholder="Buscar torneo..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none transition text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {isAdmin && (
            <Link
              href="/tournaments/create"
              className="bg-gray-900 text-white px-4 py-2 rounded-lg shadow-sm font-bold flex justify-center items-center gap-2 text-sm"
            >
              <span>+</span> Crear Torneo
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-600">Cargando torneos...</p>
      ) : filteredTournaments.length === 0 ? (
        <p className="text-gray-600">
          No hay torneos aún. Crea uno nuevo si eres admin.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTournaments.map((tournament) => (
            <Card
              key={tournament.id}
              className="cursor-pointer hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-900">
                  {tournament.name}
                </h3>
                <Badge>{tournament.status}</Badge>
              </div>

              <p className="text-sm text-gray-600 mb-1">
                Categoría: {tournament.category}
              </p>
              <p className="text-sm text-gray-600 mb-1">
                Fecha:{" "}
                {tournament.start_date
                  ? new Date(tournament.start_date).toLocaleDateString()
                  : "Sin fecha"}
              </p>

              {isAdmin && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={(e) => handleEdit(e, tournament.id)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, tournament.id)}
                    className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}