"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";
import { formatDateTimeMadrid } from "@/lib/dates";

type LogRow = {
  id: number;
  created_at: string;
  user_email: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
};

type LogCategory = "all" | "approval" | "auth" | "security" | "other";
type LogTone = "neutral" | "info" | "success" | "warning" | "danger";

const CATEGORY_LABELS: Record<LogCategory, string> = {
  all: "Todos",
  approval: "Aprobaciones",
  auth: "Autenticación",
  security: "Seguridad",
  other: "Otros",
};

const TONE_CLASSES: Record<LogTone, string> = {
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
};

function normalizeActionLabel(action: string) {
  return action.replace(/_/g, " ").toLowerCase();
}

function getActionCategory(action: string): LogCategory {
  const normalized = action.toUpperCase();
  if (
    normalized.includes("APPROVE") ||
    normalized.includes("REJECT") ||
    normalized.includes("PENDING_USER") ||
    normalized.includes("PLAYER")
  ) {
    return "approval";
  }
  if (
    normalized.includes("PASSKEY") ||
    normalized.includes("LOGIN") ||
    normalized.includes("AUTH") ||
    normalized.includes("PASSWORD")
  ) {
    return "auth";
  }
  if (
    normalized.includes("RATE_LIMIT") ||
    normalized.includes("FAILED") ||
    normalized.includes("REJECTED") ||
    normalized.includes("FORBIDDEN")
  ) {
    return "security";
  }
  return "other";
}

function getActionTone(action: string): LogTone {
  const normalized = action.toUpperCase();
  if (normalized.includes("SUCCESS") || normalized.includes("APPROVED")) return "success";
  if (normalized.includes("RATE_LIMIT")) return "warning";
  if (normalized.includes("FAILED") || normalized.includes("REJECTED") || normalized.includes("ERROR")) {
    return "danger";
  }
  if (
    normalized.includes("PASSKEY") ||
    normalized.includes("AUTH") ||
    normalized.includes("LOGIN")
  ) {
    return "info";
  }
  return "neutral";
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function metadataToSearchString(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  try {
    return JSON.stringify(metadata).toLowerCase();
  } catch {
    return "";
  }
}

export default function PlayersApprovalLogsPage() {
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LogCategory>("all");

  const fetchLogs = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("action_logs")
      .select("id, created_at, user_email, action, entity, entity_id, metadata")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error(error);
      toast.error("Error cargando logs");
      setLoading(false);
      return;
    }

    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      router.push("/");
      return;
    }
    void fetchLogs();
  }, [isAdmin, roleLoading, router]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "action_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as LogRow, ...prev].slice(0, 250));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return logs.filter((log) => {
      const logCategory = getActionCategory(log.action);
      if (category !== "all" && logCategory !== category) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        log.action.toLowerCase(),
        log.entity?.toLowerCase() || "",
        log.user_email?.toLowerCase() || "",
        String(log.entity_id ?? ""),
        metadataToSearchString(log.metadata),
      ].join(" ");

      return haystack.includes(normalizedSearch);
    });
  }, [logs, search, category]);

  const summary = useMemo(() => {
    const total = logs.length;
    const approvals = logs.filter((log) => getActionCategory(log.action) === "approval").length;
    const security = logs.filter((log) => getActionCategory(log.action) === "security").length;
    return { total, approvals, security };
  }, [logs]);

  if (roleLoading) {
    return (
      <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
        <p className="text-gray-500 animate-pulse">Verificando permisos...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
        <p className="text-red-600 font-semibold">No tenés permisos para ver esta sección.</p>
      </main>
    );
  }

  return (
    <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditoría de Aprobaciones</h1>
          <p className="text-sm text-gray-500">
            Historial de acciones del flujo de aprobación y eventos relacionados.
          </p>
        </div>

        <Link
          href="/admin/players-approval"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Volver a aprobaciones
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total eventos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Aprobaciones</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{summary.approvals}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Seguridad</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary.security}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-white shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por acción, usuario, entidad o detalle"
            className="w-full lg:flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as LogCategory)}
            className="w-full lg:w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="w-full lg:w-auto rounded-lg bg-gray-900 text-white text-sm font-semibold px-4 py-2 hover:bg-black transition disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Mostrando {filteredLogs.length} de {logs.length} registros
        </p>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
            Cargando logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-500 shadow-sm">
            No hay registros para el filtro aplicado.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const actionTone = getActionTone(log.action);
            const actionCategory = getActionCategory(log.action);
            const metadataEntries = log.metadata ? Object.entries(log.metadata) : [];
            const visibleMetadata = metadataEntries.slice(0, 8);

            return (
              <article key={log.id} className="rounded-xl border bg-white shadow-sm p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[actionTone]}`}
                      >
                        {normalizeActionLabel(log.action)}
                      </span>

                      <span className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        {CATEGORY_LABELS[actionCategory]}
                      </span>

                      {log.entity && (
                        <span className="inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {log.entity}
                          {log.entity_id !== null ? ` #${log.entity_id}` : ""}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-gray-800 break-words">
                      <span className="font-semibold">{log.user_email ?? "Sistema"}</span>
                    </p>
                  </div>

                  <p className="text-xs text-gray-500 shrink-0">
                    {formatDateTimeMadrid(log.created_at)}
                  </p>
                </div>

                {visibleMetadata.length > 0 && (
                  <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-gray-600">
                      Ver detalle técnico
                    </summary>
                    <div className="px-3 pb-3">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                        {visibleMetadata.map(([key, value]) => (
                          <div key={key} className="min-w-0">
                            <dt className="text-[11px] uppercase tracking-wide text-gray-500">
                              {key}
                            </dt>
                            <dd className="text-xs text-gray-700 break-words">
                              {serializeValue(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      {metadataEntries.length > visibleMetadata.length && (
                        <p className="mt-2 text-[11px] text-gray-500">
                          +{metadataEntries.length - visibleMetadata.length} campos adicionales
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
