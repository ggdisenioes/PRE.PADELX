"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../../app/hooks/useRole";
import toast from "react-hot-toast";
import { getFirstPasswordError, getPasswordRuleStatuses } from "../../../lib/password-policy";

type UserProfile = {
  id: string;
  email: string;
  role: "admin" | "manager" | "user";
  active: boolean;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
};

export default function AdminUsersManagePage() {
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Crear usuario (UI)
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<{
    email: string;
    password: string;
    role: "user" | "manager";
  }>({
    email: "",
    password: "",
    role: "user",
  });

  const createPasswordRuleStatuses = useMemo(
    () => getPasswordRuleStatuses(createForm.password),
    [createForm.password]
  );

  // Editar nombre/apellido
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    first_name: string;
    last_name: string;
  }>({
    first_name: "",
    last_name: "",
  });

  const loadUsers = async () => {
    if (role !== "admin") return;

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.warn("getUser error", authErr);
    }
    setCurrentUserId(authData?.user?.id ?? null);

    setLoading(true);
    setError(null);

    try {
      // Get current user's tenant to filter users
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", authData?.user?.id ?? "")
        .single();

      let query = supabase
        .from("profiles")
        .select("id,email,role,active,created_at,first_name,last_name")
        .order("created_at", { ascending: false });

      // Filter by tenant (only show same-tenant users)
      if (myProfile?.tenant_id) {
        query = query.eq("tenant_id", myProfile.tenant_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("loadUsers error", error);
        setError((error as any).message || "Error cargando usuarios");
        toast.error((error as any).message || "Error cargando usuarios");
      } else {
        setUsers((data as any) || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "admin") {
      router.push("/");
      return;
    }
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, roleLoading]);

  const updateRole = async (userId: string, newRole: "user" | "manager") => {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);

    if (error) {
      toast.error("No se pudo actualizar el rol");
    } else {
      toast.success("Rol actualizado");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    }
  };

  const toggleActive = async (userId: string, active: boolean) => {
    const { error } = await supabase.from("profiles").update({ active: !active }).eq("id", userId);

    if (error) {
      toast.error("No se pudo actualizar el estado");
    } else {
      toast.success(active ? "Usuario desactivado" : "Usuario activado");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, active: !active } : u)));
    }
  };

  const getDisplayName = (u: UserProfile) => {
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ");
    return full || u.email;
  };

  const deleteUser = async (u: UserProfile) => {
    if (u.role === "admin") {
      toast.error("No se puede eliminar un usuario admin");
      return;
    }

    if (currentUserId && u.id === currentUserId) {
      toast.error("No podés eliminar tu propio usuario");
      return;
    }

    const ok = window.confirm(
      `¿Seguro que querés eliminar a ${getDisplayName(u)}?\n\nEsta acción es permanente.`
    );
    if (!ok) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) {
      toast.error("Sesión inválida");
      return;
    }

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: u.id }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json?.error || `No se pudo eliminar el usuario (HTTP ${res.status})`);
      return;
    }

    toast.success("Usuario eliminado");
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  const createUser = async () => {
    const email = createForm.email.trim();
    const password = createForm.password;

    if (!email || !password) {
      toast.error("Completá email y contraseña");
      return;
    }
    const passwordError = getFirstPasswordError(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) {
      toast.error("Sesión inválida");
      return;
    }

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email,
        password,
        role: createForm.role,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json?.error || `No se pudo crear el usuario (HTTP ${res.status})`);
      return;
    }

    toast.success("Usuario creado");
    setCreateForm({ email: "", password: "", role: "user" });
    setShowCreate(false);

    await loadUsers();
  };

  const startEdit = (u: UserProfile) => {
    setEditingUserId(u.id);
    setEditForm({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
    });
  };

  const saveEdit = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
      })
      .eq("id", userId);

    if (error) {
      toast.error("No se pudo guardar los cambios");
    } else {
      toast.success("Cambios guardados");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, first_name: editForm.first_name, last_name: editForm.last_name }
            : u
        )
      );
      setEditingUserId(null);
    }
  };

  const cancelEdit = () => {
    setEditingUserId(null);
  };

  if (roleLoading) return <div className="p-6">Cargando...</div>;

  if (role !== "admin") {
    return <div className="p-6 text-red-600 font-semibold">No tenés permisos para ver esta sección.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Administración de usuarios</h1>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition"
        >
          + Crear usuario
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full border rounded px-3 py-2"
                placeholder="usuario@padel.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contraseña</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full border rounded px-3 py-2"
                placeholder="Mínimo 8 caracteres"
              />
              <ul className="mt-2 space-y-1">
                {createPasswordRuleStatuses.map((rule) => (
                  <li
                    key={rule.key}
                    className={`text-xs ${rule.ok ? "text-green-700" : "text-gray-500"}`}
                  >
                    {rule.ok ? "[OK]" : "[ ]"} {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rol</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as "user" | "manager" }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="user">user</option>
                <option value="manager">manager</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={createUser}
              className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-md font-medium transition"
            >
              Crear
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="border px-4 py-2 rounded-md font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div>Cargando usuarios...</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            {error && <div className="mb-4 text-red-600 font-medium">{error}</div>}

            <table className="min-w-full border rounded-lg bg-white">
              <thead className="bg-gray-50 text-sm">
                <tr>
                  <th className="px-4 py-2 text-left">Usuario</th>
                  <th className="px-4 py-2 text-left">Rol</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t text-sm">
                    <td className="px-4 py-2">
                      {editingUserId === u.id ? (
                        <>
                          <input
                            type="text"
                            placeholder="Nombre"
                            value={editForm.first_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                            className="border rounded px-2 py-1 mb-1 w-full"
                          />
                          <input
                            type="text"
                            placeholder="Apellido"
                            value={editForm.last_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                            className="border rounded px-2 py-1 mb-1 w-full"
                          />
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium">{getDisplayName(u)}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </>
                      )}
                    </td>

                    <td className="px-4 py-2 capitalize">
                      {u.role === "admin" ? (
                        <span className="font-semibold text-indigo-600">admin</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as "user" | "manager")}
                          className="border rounded px-2 py-1"
                        >
                          <option value="user">user</option>
                          <option value="manager">manager</option>
                        </select>
                      )}
                    </td>

                    <td className="px-4 py-2">
                      {u.active ? (
                        <span className="text-green-600 font-medium">Activo</span>
                      ) : (
                        <span className="text-gray-400 font-medium">Inactivo</span>
                      )}
                    </td>

                    <td className="px-4 py-2 space-x-2">
                      {editingUserId === u.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(u.id)}
                            className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {u.role !== "admin" && (
                            <>
                              <button
                                onClick={() => startEdit(u)}
                                className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => toggleActive(u.id, u.active)}
                                className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                              >
                                {u.active ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                onClick={() => deleteUser(u)}
                                className="text-xs border px-2 py-1 rounded hover:bg-red-50 text-red-700"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {error && <div className="mb-4 text-red-600 font-medium">{error}</div>}

            {users.map((u) => (
              <div key={u.id} className="border rounded-lg bg-white p-4 shadow">
                <div className="mb-2">
                  {editingUserId === u.id ? (
                    <>
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={editForm.first_name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                        className="border rounded px-2 py-1 mb-1 w-full"
                      />
                      <input
                        type="text"
                        placeholder="Apellido"
                        value={editForm.last_name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                        className="border rounded px-2 py-1 mb-1 w-full"
                      />
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-lg">{getDisplayName(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </>
                  )}
                </div>

                <div className="mb-2">
                  <span className="font-semibold">Rol: </span>
                  {u.role === "admin" ? (
                    <span className="text-indigo-600">admin</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value as "user" | "manager")}
                      className="border rounded px-2 py-1 w-full"
                    >
                      <option value="user">user</option>
                      <option value="manager">manager</option>
                    </select>
                  )}
                </div>

                <div className="mb-2">
                  <span className="font-semibold">Estado: </span>
                  {u.active ? (
                    <span className="text-green-600 font-medium">Activo</span>
                  ) : (
                    <span className="text-gray-400 font-medium">Inactivo</span>
                  )}
                </div>

                <div className="flex space-x-2">
                  {editingUserId === u.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(u.id)}
                        className="flex-1 text-xs border px-2 py-1 rounded hover:bg-gray-50"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 text-xs border px-2 py-1 rounded hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      {u.role !== "admin" && (
                        <>
                          <button
                            onClick={() => startEdit(u)}
                            className="flex-1 text-xs border px-2 py-1 rounded hover:bg-gray-50"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleActive(u.id, u.active)}
                            className="flex-1 text-xs border px-2 py-1 rounded hover:bg-gray-50"
                          >
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            onClick={() => deleteUser(u)}
                            className="flex-1 text-xs border px-2 py-1 rounded hover:bg-red-50 text-red-700"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
