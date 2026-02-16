"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { supabase } from "../../../lib/supabase";
import Card from "../../../components/Card";
import { useRole } from "../../../hooks/useRole";

type LogRow = {
  id: number;
  created_at: string;
  user_email: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  metadata: any;
};

export default function AdminLogsPage() {
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("action_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      toast.error("Error cargando logs");
      setLoading(false);
      return;
    }

    setLogs(data || []);
    setLoading(false);
  };

  // Cargar logs SOLO si es admin
  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      router.push("/");
      return;
    }
    fetchLogs();
  }, [isAdmin, roleLoading, router]);

  // Realtime (solo admin)
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "action_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as LogRow, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // ⏳ Esperando rol
  if (roleLoading) {
    return (
      <main className="flex-1 p-8">
        <p className="text-gray-500 animate-pulse">
          Verificando permisos…
        </p>
      </main>
    );
  }

  // 🔐 No admin
  if (!isAdmin) {
    return (
      <main className="flex-1 p-8">
        <p className="text-red-600 font-semibold">
          No tenés permisos para ver esta sección.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8">
      <h1 className="text-3xl font-bold mb-6">
        Auditoría del Sistema
      </h1>

      <Card>
        {loading ? (
          <p className="text-gray-500 animate-pulse">
            Cargando logs…
          </p>
        ) : logs.length === 0 ? (
          <p className="text-gray-500">
            No hay logs registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-gray-600">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Usuario</th>
                  <th className="p-2">Acción</th>
                  <th className="p-2">Entidad</th>
                  <th className="p-2">ID</th>
                  <th className="p-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b">
                    <td className="p-2">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-2">
                      {log.user_email || "-"}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {log.action}
                    </td>
                    <td className="p-2">{log.entity}</td>
                    <td className="p-2">
                      {log.entity_id ?? "-"}
                    </td>
                    <td className="p-2">
                      <details>
                        <summary className="cursor-pointer text-blue-600">
                          Ver
                        </summary>
                        <pre className="bg-gray-100 p-2 mt-2 rounded text-xs max-w-lg overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}