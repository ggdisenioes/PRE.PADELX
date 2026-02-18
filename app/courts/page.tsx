"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import toast from "react-hot-toast";
import { useTranslation } from "../i18n";

type Court = {
  id: number;
  name: string;
  is_covered: boolean;
  created_at: string;
};

export default function CourtsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { role, isAdmin, isManager, loading: roleLoading } = useRole();

  const normalizedRole = (role || "").toLowerCase();
  const canWrite = normalizedRole === "admin" || normalizedRole === "manager" || isAdmin || isManager;
  const canDelete = normalizedRole === "admin" || isAdmin;

  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);

  // Redirect non-admin/non-manager users away from this admin page
  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin && !isManager) {
      router.push("/");
    }
  }, [roleLoading, isAdmin, isManager, router]);

  const [name, setName] = useState("Pista 1");
  const [isCovered, setIsCovered] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCovered, setEditCovered] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const title = useMemo(() => {
    if (role === "user") return t("courts.availableTitle");
    return t("nav.courtAdmin");
  }, [role, t]);

  const fetchCourts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("courts")
      .select("id,name,is_covered,created_at")
      .order("id", { ascending: true });

    if (error) {
      console.error("[courts] fetch error", error);
      toast.error(t("courts.errorLoading"), { duration: 5000 });
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
      toast.error(t("courts.noPermissionCreate"));
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("courts.nameRequired"));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("courts").insert({
      name: trimmed,
      is_covered: isCovered,
    });

    if (error) {
      console.error("[courts] insert error", error);
      toast.error(`${t("courts.errorCreating")}: ${error.message}`);
      setSaving(false);
      return;
    }

    toast.success(t("courts.created"));
    setSaving(false);
    setName(`${t("bookings.court")} ${courts.length + 1}`);
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
      toast.error(t("courts.nameRequired"));
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase
      .from("courts")
      .update({ name: trimmed, is_covered: editCovered })
      .eq("id", editingId);

    if (error) {
      console.error("[courts] update error", error);
      toast.error(`${t("courts.errorSaving")}: ${error.message}`);
      setSavingEdit(false);
      return;
    }

    toast.success(t("courts.saved"));
    setSavingEdit(false);
    cancelEdit();
    fetchCourts();
  };

  const deleteCourt = async (c: Court) => {
    if (!canDelete) {
      toast.error(t("courts.noPermissionDelete"));
      return;
    }

    const ok = window.confirm(t("courts.deleteConfirmNamed", { name: c.name }));
    if (!ok) return;

    setDeletingId(c.id);
    const { error } = await supabase.from("courts").delete().eq("id", c.id);

    if (error) {
      console.error("[courts] delete error", error);
      toast.error(`${t("courts.errorDeleting")}: ${error.message}`);
      setDeletingId(null);
      return;
    }

    toast.success(t("courts.deleted"));
    setDeletingId(null);
    // Si estaba en edición, salimos
    if (editingId === c.id) cancelEdit();
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
              ? t("courts.userSubtitle")
              : t("courts.adminSubtitle")}
          </p>
        </div>

        {canWrite && (
          <Card>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("common.name")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder={t("courts.namePlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t("courts.surface")}</label>
                <select
                  value={isCovered ? "covered" : "open"}
                  onChange={(e) => setIsCovered(e.target.value === "covered")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="open">{t("courts.uncovered")}</option>
                  <option value="covered">{t("courts.covered")}</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
              >
                {saving ? t("courts.creating") : t("courts.create")}
              </button>
            </form>
          </Card>
        )}

        <Card>
          {loading ? (
            <p className="text-gray-400 text-center animate-pulse">{t("courts.loading")}</p>
          ) : courts.length === 0 ? (
            <p className="text-gray-500 text-center">{t("courts.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2">{t("bookings.court")}</th>
                    <th className="py-2">{t("courts.covered")}</th>
                    <th className="py-2">{t("common.status")}</th>
                    {canWrite && <th className="py-2 text-right">{t("common.actions")}</th>}
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
                            <option value="open">{t("courts.uncovered")}</option>
                            <option value="covered">{t("courts.covered")}</option>
                          </select>
                        ) : (
                          c.is_covered ? t("common.yes") : t("common.no")
                        )}
                      </td>

                      <td className="py-3">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 border border-green-200">
                          {t("courts.available")}
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
                                {savingEdit ? t("common.loading") : t("common.save")}
                              </button>
                              <button
                                type="button"
                                disabled={savingEdit}
                                onClick={cancelEdit}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition disabled:opacity-60"
                              >
                                {t("common.cancel")}
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
                              >
                                {t("common.edit")}
                              </button>

                              {canDelete && (
                                <button
                                  type="button"
                                  disabled={deletingId === c.id}
                                  onClick={() => deleteCourt(c)}
                                  className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
                                >
                                  {deletingId === c.id ? t("common.loading") : t("common.delete")}
                                </button>
                              )}
                            </div>
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
