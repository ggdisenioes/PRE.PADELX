"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useRole } from "../../hooks/useRole";
import { formatDateTimeMadrid } from "@/lib/dates";
import Link from "next/link";
import { useTranslation } from "../../i18n";

type AuditLog = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | null;
  user_email: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

export default function AdminLogsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin, loading: roleLoading } = useRole();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      router.push("/");
      return;
    }

    const loadLogs = async () => {
      const { data, error } = await supabase
        .from("action_logs")
        .select("id, action, entity, entity_id, user_email, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error) {
        setLogs(data || []);
      }

      setLoading(false);
    };

    loadLogs();
  }, [isAdmin]);

  // Protección dura
  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold">{t("admin.logs.accessDenied")}</h1>
        <p className="text-gray-600">
          {t("admin.logs.noPermission")}
        </p>
        <Link href="/" className="text-indigo-600 underline mt-4 inline-block">
          {t("admin.logs.backToDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <main className="px-6 py-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("admin.logs.title")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("admin.logs.subtitle")}
          </p>
        </div>

        <Link
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {t("admin.logs.backToDashboard")}
        </Link>
      </header>

      <div className="bg-white rounded-xl border shadow-sm divide-y">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">{t("admin.logs.loading")}</p>
        ) : logs.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            {t("admin.logs.empty")}
          </p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="p-4 flex gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-green-500" />

              <div className="flex-1">
                <p className="text-sm text-gray-800">
                  <span className="font-semibold">
                    {log.user_email ?? t("admin.logs.system")}
                  </span>{" "}
                  {t("admin.logs.performed")}{" "}
                  <span className="font-semibold">
                    {log.action.replace(/_/g, " ").toLowerCase()}
                  </span>
                  {log.entity && (
                    <>
                      {" "}
                      {t("admin.logs.in")} <span className="font-semibold">{log.entity}</span>
                    </>
                  )}
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  {formatDateTimeMadrid(log.created_at)}
                </p>

                {log.metadata && (
                  <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 text-gray-700 overflow-x-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
