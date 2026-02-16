"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { useRole } from "../../hooks/useRole";
import Link from "next/link";
import Card from "../../components/Card";
import { createUserSchema } from "../../lib/validation";
import { z } from "zod";
import { useTranslation } from "../../i18n";

type TabType = "create" | "manage" | "logs";

type ProfileRow = {
  id: string;
  email: string | null;
  role: "admin" | "manager" | "user" | string;
  active: boolean | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

type AuditLog = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | null;
  user_email: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

export default function AdminManagementPage() {
  const { t } = useTranslation();
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const [activeTab, setActiveTab] = useState<TabType>("manage");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Form crear usuario
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    role: "user" as "user" | "manager",
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Form editar usuario
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    role: "user" as "user" | "manager" | "admin",
    active: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Form cambiar contraseña
  const [changingPasswordUserId, setChangingPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Protección
  if (!roleLoading && !isAdmin && !isManager) {
    return (
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold text-red-600">{t("admin.logs.accessDenied")}</h1>
        <p className="text-gray-600 mt-2">{t("admin.users.noPermission")}</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
          {t("admin.logs.backToDashboard")}
        </Link>
      </main>
    );
  }

  // Cargar datos
  useEffect(() => {
    if (roleLoading) return;

    const load = async () => {
      setLoading(true);

      // Obtener mi ID
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      // Cargar usuarios
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id,email,role,active,created_at,first_name,last_name")
        .order("created_at", { ascending: false });

      setUsers((usersData as ProfileRow[]) || []);

      // Cargar logs (solo admin)
      if (isAdmin) {
        const { data: logsData } = await supabase
          .from("action_logs")
          .select("id, action, entity, entity_id, user_email, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        setLogs((logsData as AuditLog[]) || []);
      }

      setLoading(false);
    };

    load();
  }, [roleLoading, isAdmin]);

  // Crear usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);

    try {
      // Validar
      const validated = createUserSchema.parse({
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
      });

      // Llamar API
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
        },
        body: JSON.stringify(validated),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("admin.users.errorCreating"));
      }

      toast.success(t("admin.users.userCreated"));
      setCreateForm({ email: "", password: "", role: "user" });

      // Recargar usuarios
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id,email,role,active,created_at,first_name,last_name")
        .order("created_at", { ascending: false });
      setUsers((usersData as ProfileRow[]) || []);
    } catch (error: any) {
      toast.error(error.message || t("admin.users.errorCreating"));
    } finally {
      setCreatingUser(false);
    }
  };

  // Editar usuario
  const handleEditUser = async (userId: string) => {
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editForm.first_name || null,
          last_name: editForm.last_name || null,
          role: editForm.role,
          active: editForm.active,
        })
        .eq("id", userId);

      if (error) throw error;

      toast.success(t("admin.users.changesSaved"));
      setEditingUserId(null);

      // Recargar
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id,email,role,active,created_at,first_name,last_name")
        .order("created_at", { ascending: false });
      setUsers((usersData as ProfileRow[]) || []);
    } catch (error: any) {
      toast.error(error.message || t("admin.users.errorSavingChanges"));
    } finally {
      setSavingEdit(false);
    }
  };

  // Cambiar contraseña (solo admin)
  const handleChangePassword = async (userId: string, email: string) => {
    if (!isAdmin) {
      toast.error(t("admin.users.errorChangingPassword"));
      return;
    }

    // Validar password
    try {
      const schema = z.object({
        password: z.string()
          .min(8, "Mínimo 8 caracteres")
          .regex(/[A-Z]/, "Debe contener una mayúscula")
          .regex(/[a-z]/, "Debe contener una minúscula")
          .regex(/[0-9]/, "Debe contener un número")
          .regex(/[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/, "Debe contener un carácter especial"),
      });

      schema.parse({ password: newPassword });
    } catch (error: any) {
      toast.error(error.errors?.[0]?.message || t("admin.users.errorChangingPassword"));
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
        },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("admin.users.errorChangingPassword"));
      }

      toast.success(t("admin.users.passwordChanged", { email }));
      setChangingPasswordUserId(null);
      setNewPassword("");
    } catch (error: any) {
      toast.error(error.message || t("admin.users.errorChangingPassword"));
    } finally {
      setChangingPassword(false);
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (userId: string, email: string) => {
    if (userId === currentUserId) {
      toast.error(t("admin.users.cantDeleteSelf"));
      return;
    }

    if (!confirm(t("admin.users.confirmDelete", { name: email }))) return;

    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!response.ok) {
        throw new Error(t("admin.users.errorDeleting"));
      }

      toast.success(t("admin.users.userDeleted"));

      // Recargar
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id,email,role,active,created_at,first_name,last_name")
        .order("created_at", { ascending: false });
      setUsers((usersData as ProfileRow[]) || []);
    } catch (error: any) {
      toast.error(error.message || t("admin.users.errorDeleting"));
    }
  };

  const displayName = (u: ProfileRow) => {
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return full || u.email || "Sin nombre";
  };

  const getRoleBadgeColor = (role: string) => {
    if (role === "admin") return "bg-red-100 text-red-800";
    if (role === "manager") return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t("admin.management.title")}</h1>
        <p className="text-gray-600 mb-6">{t("admin.users.title")}</p>

        {/* TABS */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("manage")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "manage"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            👥 {t("admin.management.tabs.all")}
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "create"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            ➕ {t("admin.users.createButton")}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-4 py-3 font-semibold border-b-2 transition ${
                activeTab === "logs"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              📋 {t("admin.logs.title")}
            </button>
          )}
        </div>

        {/* CONTENT */}
        {loading ? (
          <p className="text-gray-500 animate-pulse">{t("common.loading")}</p>
        ) : (
          <>
            {/* TAB: CREAR USUARIO */}
            {activeTab === "create" && (
              <Card className="p-6 max-w-2xl">
                <h2 className="text-xl font-bold mb-4">{t("admin.users.createButton")}</h2>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("admin.users.emailField")}</label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("admin.users.passwordField")}</label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, password: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={t("admin.users.passwordPlaceholder")}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t("admin.users.roleField")}</label>
                    <select
                      value={createForm.role}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          role: e.target.value as "user" | "manager",
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="user">Usuario</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                  >
                    {creatingUser ? t("common.loading") : t("admin.users.create")}
                  </button>
                </form>
              </Card>
            )}

            {/* TAB: ADMINISTRAR USUARIOS */}
            {activeTab === "manage" && (
              <div className="space-y-4">
                {users.length === 0 ? (
                  <p className="text-gray-500">{t("common.noData")}</p>
                ) : (
                  users.map((user) => (
                    <Card key={user.id} className="p-4">
                      {editingUserId === user.id ? (
                        // MODO EDICIÓN
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={editForm.first_name}
                              onChange={(e) =>
                                setEditForm({ ...editForm, first_name: e.target.value })
                              }
                              placeholder={t("auth.firstName")}
                              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={editForm.last_name}
                              onChange={(e) =>
                                setEditForm({ ...editForm, last_name: e.target.value })
                              }
                              placeholder={t("auth.lastName")}
                              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <select
                              value={editForm.role}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  role: e.target.value as any,
                                })
                              }
                              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="user">Usuario</option>
                              <option value="manager">Manager</option>
                              {isAdmin && <option value="admin">Admin</option>}
                            </select>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={editForm.active}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, active: e.target.checked })
                                }
                                className="rounded"
                              />
                              <span className="text-sm">{t("admin.users.active")}</span>
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditUser(user.id)}
                              disabled={savingEdit}
                              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
                            >
                              {savingEdit ? t("common.loading") : t("admin.users.save")}
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
                            >
                              {t("admin.users.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : changingPasswordUserId === user.id ? (
                        // MODO CAMBIAR CONTRASEÑA (solo admin)
                        <div className="space-y-3">
                          <p className="text-sm font-semibold">{t("admin.users.changePassword")} {user.email}</p>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t("admin.users.newPassword")}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleChangePassword(user.id, user.email || "usuario")}
                              disabled={changingPassword || !newPassword}
                              className="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition"
                            >
                              {changingPassword ? t("common.loading") : t("admin.users.changePassword")}
                            </button>
                            <button
                              onClick={() => {
                                setChangingPasswordUserId(null);
                                setNewPassword("");
                              }}
                              className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 transition"
                            >
                              {t("admin.users.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // MODO VISUALIZACIÓN
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-semibold">{displayName(user)}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            <div className="flex gap-2 mt-2">
                              <span className={`text-xs px-2 py-1 rounded font-bold ${getRoleBadgeColor(user.role as string)}`}>
                                {(user.role as string).toUpperCase()}
                              </span>
                              {!user.active && (
                                <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-bold">
                                  {t("admin.users.inactive").toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            <button
                              onClick={() => {
                                setEditingUserId(user.id);
                                setEditForm({
                                  first_name: user.first_name || "",
                                  last_name: user.last_name || "",
                                  role: (user.role as any) || "user",
                                  active: user.active ?? true,
                                });
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                            >
                              {t("admin.users.edit")}
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => setChangingPasswordUserId(user.id)}
                                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm"
                              >
                                🔑 {t("admin.users.changePassword")}
                              </button>
                            )}
                            <button
                              onClick={() =>
                                handleDeleteUser(user.id, user.email || "usuario")
                              }
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                            >
                              {t("admin.users.delete")}
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* TAB: LOGS */}
            {activeTab === "logs" && isAdmin && (
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <p className="text-gray-500">{t("admin.logs.empty")}</p>
                ) : (
                  logs.map((log) => (
                    <Card key={log.id} className="p-4">
                      <div className="flex gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">
                            <span className="font-semibold">{log.user_email ?? t("admin.logs.system")}</span>{" "}
                            {t("admin.logs.performed")}{" "}
                            <span className="font-semibold">
                              {log.action.replace(/_/g, " ").toLowerCase()}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
