"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";

type ApprovalStatus = "pending" | "approved" | "rejected";

type ProfileRow = {
  id: string;
  email: string | null;
  role: "admin" | "manager" | "user" | string;
  tenant_id: string | null;
  active: boolean | null;
  approval_status: ApprovalStatus | null;
  deleted_at: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

type PlayerOption = {
  id: number;
  name: string;
  user_id: string | null;
};

type AuditLog = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | string | null;
  user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type StatusTabKey = "pending" | "approved" | "rejected" | "deleted" | "all";
type MainTabKey = "manage" | "create" | "invites" | "logs";

type PendingInvitationRow = {
  user_id: string | null;
  name: string;
  email: string;
  role: string;
  invited_at: string;
  last_sign_in_at: string | null;
};

function displayName(u: ProfileRow) {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || "Sin nombre";
}

function statusFromRow(u: ProfileRow): "pending" | "approved" | "rejected" | "deleted" {
  if (u.deleted_at) return "deleted";
  const s = (u.approval_status ?? "").toString().toLowerCase();
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return u.active ? "approved" : "pending";
}

export default function AdminUsersPage() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [canAdminActions, setCanAdminActions] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTabKey>("pending");
  const [mainTab, setMainTab] = useState<MainTabKey>("manage");
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitationRow[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationActionKey, setInvitationActionKey] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    role: "user" as "user" | "manager",
  });
  const [sendingInvitation, setSendingInvitation] = useState(false);

  const filtered = useMemo(() => {
    if (statusTab === "all") return rows;
    return rows.filter((r) => statusFromRow(r) === statusTab);
  }, [rows, statusTab]);

  const userPlayerMap = useMemo(() => {
    const map: Record<string, number> = {};
    players.forEach((p) => {
      if (p.user_id) map[p.user_id] = p.id;
    });
    return map;
  }, [players]);

  const playerNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    players.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [players]);

  const load = async () => {
    setLoading(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setLoading(false);
      setCanAccess(false);
      setCanAdminActions(false);
      toast.error("No se pudo leer tu sesión.");
      return;
    }

    setMeId(user.id);

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, tenant_id, role, active, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr || !me) {
      console.warn("[admin/users] could not read my profile", { meErr, userId: user.id });
      setLoading(false);
      setCanAccess(false);
      setCanAdminActions(false);
      toast.error(
        "No se pudo determinar tu club (tenant). Verifica que exista tu fila en public.profiles y que tenga tenant_id asignado."
      );
      return;
    }

    const role = (me.role ?? "").toString().toLowerCase();
    const allowed = role === "admin" || role === "manager";
    const isAdmin = role === "admin";

    setCanAccess(allowed);
    setCanAdminActions(isAdmin);

    if (!allowed) {
      setRows([]);
      setPlayers([]);
      setLogs([]);
      setLoading(false);
      return;
    }

    if (!me.tenant_id) {
      setRows([]);
      setPlayers([]);
      setLogs([]);
      setLoading(false);
      toast.error("Tu perfil no tiene tenant_id asignado.");
      return;
    }

    const logsPromise = isAdmin
      ? supabase
          .from("action_logs")
          .select("id, action, entity, entity_id, user_email, metadata, created_at")
          .eq("tenant_id", me.tenant_id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as AuditLog[], error: null });

    const [usersRes, playersRes, logsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,role,tenant_id,active,approval_status,deleted_at,first_name,last_name,created_at")
        .eq("tenant_id", me.tenant_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("players")
        .select("id, name, user_id")
        .eq("tenant_id", me.tenant_id)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      logsPromise,
    ]);

    if (usersRes.error) {
      console.error(usersRes.error);
      toast.error("No se pudieron cargar los usuarios.");
      setRows([]);
      setLoading(false);
      return;
    }

    if (playersRes.error) {
      console.error(playersRes.error);
      toast.error("No se pudieron cargar los jugadores.");
    }

    if (logsRes.error) {
      console.error(logsRes.error);
      toast.error("No se pudieron cargar los logs.");
    }

    setRows((usersRes.data as ProfileRow[]) || []);
    setPlayers((playersRes.data as PlayerOption[]) || []);
    setLogs((logsRes.data as AuditLog[]) || []);
    setLoading(false);
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAdminActions) {
      toast.error("Solo admins pueden crear usuarios.");
      return;
    }

    const name = inviteForm.name.trim();
    if (!name) {
      toast.error("Completa el nombre.");
      return;
    }

    setSendingInvitation(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Sesión inválida.");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/admin/send-invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          first_name: name,
          email: inviteForm.email.trim().toLowerCase(),
          role: inviteForm.role,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Error enviando invitación");
      }

      toast.success("Invitación enviada.");
      setInviteForm({ name: "", email: "", role: "user" });
      setMainTab("manage");
      void load();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.error("La invitación tardó demasiado. Reintentá.");
      } else {
        toast.error(error instanceof Error ? error.message : "Error enviando invitación.");
      }
    } finally {
      setSendingInvitation(false);
    }
  };

  const loadPendingInvitations = async () => {
    if (!canAccess) return;

    setLoadingInvitations(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Sesión inválida.");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/admin/invitations/pending", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Error cargando invitaciones.");
      }

      setPendingInvitations(
        Array.isArray(payload.invitations) ? (payload.invitations as PendingInvitationRow[]) : []
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.error("La carga de invitaciones tardó demasiado. Reintentá.");
      } else {
        toast.error(error instanceof Error ? error.message : "Error cargando invitaciones.");
      }
    } finally {
      setLoadingInvitations(false);
    }
  };

  const getInvitationKey = (inv: PendingInvitationRow) =>
    inv.user_id || inv.email.trim().toLowerCase();

  const handleResendInvitation = async (inv: PendingInvitationRow) => {
    if (!canAdminActions) {
      toast.error("Solo admins pueden reenviar invitaciones.");
      return;
    }

    const key = getInvitationKey(inv);
    setInvitationActionKey(`resend:${key}`);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión inválida.");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/admin/invitations/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: inv.user_id || undefined,
          email: inv.email.trim().toLowerCase(),
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo reenviar la invitación.");
      }

      toast.success("Invitación reenviada.");
      await loadPendingInvitations();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.error("El reenvío tardó demasiado. Reintentá.");
      } else {
        toast.error(error instanceof Error ? error.message : "Error reenviando invitación.");
      }
    } finally {
      setInvitationActionKey(null);
    }
  };

  const handleCancelInvitation = async (inv: PendingInvitationRow) => {
    if (!canAdminActions) {
      toast.error("Solo admins pueden cancelar invitaciones.");
      return;
    }

    const confirmed = window.confirm(
      `¿Cancelar la invitación para ${inv.email}? Esta acción deshabilita el acceso hasta que se vuelva a invitar.`
    );
    if (!confirmed) return;

    const key = getInvitationKey(inv);
    setInvitationActionKey(`cancel:${key}`);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión inválida.");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/admin/invitations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: inv.user_id || undefined,
          email: inv.email.trim().toLowerCase(),
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cancelar la invitación.");
      }

      toast.success(payload.already_cancelled ? "La invitación ya estaba cancelada." : "Invitación cancelada.");
      await loadPendingInvitations();
      void load();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.error("La cancelación tardó demasiado. Reintentá.");
      } else {
        toast.error(error instanceof Error ? error.message : "Error cancelando invitación.");
      }
    } finally {
      setInvitationActionKey(null);
    }
  };

  const approve = async (userId: string) => {
    const { error } = await supabase.rpc("approve_user", { p_user_id: userId });
    if (error) {
      console.error(error);
      toast.error("No se pudo aprobar el usuario.");
      return;
    }
    toast.success("Usuario aprobado.");
    void load();
  };

  const reject = async (userId: string) => {
    const { error } = await supabase.rpc("reject_user", { p_user_id: userId });
    if (error) {
      console.error(error);
      toast.error("No se pudo rechazar el usuario.");
      return;
    }
    toast.success("Usuario rechazado.");
    void load();
  };

  const softDelete = async (userId: string) => {
    if (!canAdminActions) {
      toast.error("Solo admins pueden eliminar usuarios.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ active: false, deleted_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("[admin/users] softDelete error", error);
      toast.error(`No se pudo eliminar (deshabilitar) el usuario. ${error.message ?? ""}`.trim());
      return;
    }

    toast.success("Usuario eliminado (deshabilitado).");
    void load();
  };

  const setActive = async (userId: string, active: boolean) => {
    const patch: Partial<ProfileRow> = active
      ? ({ active: true, deleted_at: null, approval_status: "approved" } as Partial<ProfileRow>)
      : ({ active: false } as Partial<ProfileRow>);

    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);

    if (error) {
      console.error("[admin/users] setActive error", error);
      toast.error(active ? "No se pudo habilitar el usuario." : "No se pudo deshabilitar el usuario.");
      return;
    }

    toast.success(active ? "Usuario habilitado." : "Usuario deshabilitado.");
    void load();
  };

  const changeRole = async (userId: string, newRole: "user" | "manager") => {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    if (error) {
      console.error(error);
      toast.error("No se pudo actualizar el rol.");
      return;
    }
    toast.success("Rol actualizado.");
    void load();
  };

  const linkPlayer = async (userId: string, playerId: number | null) => {
    const { error: unlinkErr } = await supabase
      .from("players")
      .update({ user_id: null })
      .eq("user_id", userId);

    if (unlinkErr) {
      console.error("[admin/users] unlink error", unlinkErr);
      toast.error("Error al desvincular el jugador anterior.");
      return;
    }

    if (playerId) {
      const { error: linkErr } = await supabase
        .from("players")
        .update({ user_id: userId })
        .eq("id", playerId);

      if (linkErr) {
        console.error("[admin/users] link error", linkErr);
        toast.error("Error al vincular el jugador.");
        return;
      }
      toast.success("Jugador vinculado correctamente.");
    } else {
      toast.success("Jugador desvinculado.");
    }

    void load();
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "create") {
      setMainTab("create");
      return;
    }
    if (tabParam === "invites") {
      setMainTab("invites");
      return;
    }
    if (tabParam === "logs" && canAdminActions) {
      setMainTab("logs");
      return;
    }
    if (tabParam === "manage") {
      setMainTab("manage");
    }
  }, [searchParams, canAdminActions]);

  useEffect(() => {
    if (mainTab === "invites" && canAccess) {
      void loadPendingInvitations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, canAccess]);

  if (loading) {
    return <p className="p-6 text-gray-500">Cargando…</p>;
  }

  if (!canAccess) {
    return (
      <p className="p-6 text-red-600 font-semibold">
        No tienes permisos para gestionar usuarios.
      </p>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
          <p className="text-sm text-gray-600">
            Administra usuarios del club (aprobar/rechazar, habilitar/deshabilitar, rol, vincular jugador).
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="w-full sm:w-auto bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-200 transition"
        >
          Actualizar
        </button>
      </header>

      <div className="border-b border-gray-200 pb-2 sm:pb-0">
        <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4">
          <button
            onClick={() => setMainTab("manage")}
            className={`w-full whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base font-semibold border rounded-md sm:rounded-none sm:border-0 sm:border-b-2 transition ${
              mainTab === "manage"
                ? "border-blue-600 text-blue-600 bg-blue-50 sm:bg-transparent"
                : "border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 sm:border-transparent sm:hover:bg-transparent"
            }`}
          >
            👥 Administrar Usuarios
          </button>
          <button
            onClick={() => setMainTab("create")}
            className={`w-full whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base font-semibold border rounded-md sm:rounded-none sm:border-0 sm:border-b-2 transition ${
              mainTab === "create"
                ? "border-blue-600 text-blue-600 bg-blue-50 sm:bg-transparent"
                : "border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 sm:border-transparent sm:hover:bg-transparent"
            }`}
          >
            ➕ Crear Usuario
          </button>
          <button
            onClick={() => setMainTab("invites")}
            className={`w-full whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base font-semibold border rounded-md sm:rounded-none sm:border-0 sm:border-b-2 transition ${
              mainTab === "invites"
                ? "border-blue-600 text-blue-600 bg-blue-50 sm:bg-transparent"
                : "border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 sm:border-transparent sm:hover:bg-transparent"
            }`}
          >
            📨 Invitaciones enviadas
          </button>
          {canAdminActions && (
            <button
              onClick={() => setMainTab("logs")}
              className={`w-full whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base font-semibold border rounded-md sm:rounded-none sm:border-0 sm:border-b-2 transition ${
                mainTab === "logs"
                  ? "border-blue-600 text-blue-600 bg-blue-50 sm:bg-transparent"
                  : "border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 sm:border-transparent sm:hover:bg-transparent"
              }`}
            >
              📋 Logs
            </button>
          )}
        </div>
      </div>

      {mainTab === "create" && (
        <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          {canAdminActions ? (
            <>
              <h2 className="text-lg sm:text-xl font-bold mb-2">Invitar nuevo usuario</h2>
              <p className="text-sm text-gray-600 mb-4">
                Envía una invitación por email para que el usuario cree su contraseña y acceda.
              </p>
              <form onSubmit={handleSendInvitation} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre</label>
                  <input
                    type="text"
                    value={inviteForm.name}
                    onChange={(e) =>
                      setInviteForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="usuario@padel.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rol</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        role: e.target.value as "user" | "manager",
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="user">Usuario</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={sendingInvitation}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                >
                  {sendingInvitation ? "Enviando..." : "Enviar invitación"}
                </button>
              </form>
            </>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Solo admins pueden crear usuarios.
            </div>
          )}
        </div>
      )}

      {mainTab === "invites" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-4 sm:px-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Invitaciones enviadas</h2>
              <p className="text-sm text-gray-600">
                Usuarios invitados que todavía no ingresaron a la plataforma.
              </p>
            </div>
            <button
              onClick={() => void loadPendingInvitations()}
              disabled={loadingInvitations}
              className="w-full sm:w-auto bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-sm font-semibold hover:bg-gray-200 disabled:opacity-60 transition"
            >
              {loadingInvitations ? "Actualizando..." : "Actualizar"}
            </button>
          </div>

          {loadingInvitations ? (
            <div className="p-6 text-gray-500">Cargando invitaciones...</div>
          ) : pendingInvitations.length === 0 ? (
            <div className="p-6 text-gray-500">No hay invitaciones pendientes.</div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 px-4 py-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                <div className="col-span-3">Nombre</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-1">Rol</div>
                <div className="col-span-2">Invitación</div>
                <div className="col-span-1">Estado</div>
                <div className="col-span-2">Acciones</div>
              </div>

              {pendingInvitations.map((inv) => {
                const rowKey = getInvitationKey(inv);
                const isResending = invitationActionKey === `resend:${rowKey}`;
                const isCancelling = invitationActionKey === `cancel:${rowKey}`;
                const isBusy = isResending || isCancelling;

                return (
                  <div
                    key={`${inv.user_id || inv.email}-${inv.invited_at}`}
                    className="grid grid-cols-1 md:grid-cols-12 px-4 py-4 border-b border-gray-100 gap-3 md:items-center"
                  >
                    <div className="md:col-span-3">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Nombre</p>
                      <p className="text-sm font-semibold text-gray-900">{inv.name || "Sin nombre"}</p>
                      <p className="text-xs text-gray-500 break-all">{inv.user_id || "Sin user_id"}</p>
                    </div>

                    <div className="md:col-span-3 text-sm text-gray-700 break-all">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Email</p>
                      {inv.email}
                    </div>

                    <div className="md:col-span-1">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Rol</p>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 uppercase">
                        {inv.role === "manager" ? "Manager" : "Usuario"}
                      </span>
                    </div>

                    <div className="md:col-span-2 text-sm text-gray-700">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Invitación</p>
                      {new Date(inv.invited_at).toLocaleString()}
                    </div>

                    <div className="md:col-span-1">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Estado</p>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        Pendiente
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Acciones</p>
                      {canAdminActions ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={() => void handleResendInvitation(inv)}
                            disabled={isBusy}
                            className="w-full sm:w-auto bg-blue-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            {isResending ? "Reenviando..." : "Reenviar"}
                          </button>
                          <button
                            onClick={() => void handleCancelInvitation(inv)}
                            disabled={isBusy}
                            className="w-full sm:w-auto bg-white text-red-700 border border-red-200 px-3 py-2 rounded-md text-xs font-semibold hover:bg-red-50 transition disabled:opacity-50"
                          >
                            {isCancelling ? "Cancelando..." : "Cancelar"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Solo admin</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {mainTab === "logs" && canAdminActions && (
        <div className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-gray-500">No hay logs registrados.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      <span className="font-semibold">{log.user_email ?? "Sistema"}</span>{" "}
                      realizó{" "}
                      <span className="font-semibold">
                        {log.action.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {log.entity ? (
                        <>
                          {" "}
                          en <span className="font-semibold">{log.entity}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {mainTab === "manage" && (
        <>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {([
              ["pending", "Pendientes"],
              ["approved", "Aprobados"],
              ["rejected", "Rechazados"],
              ["deleted", "Eliminados"],
              ["all", "Todos"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setStatusTab(k)}
                className={`w-full sm:w-auto px-3 py-2 rounded-md text-sm font-semibold border ${
                  statusTab === k
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="hidden md:grid grid-cols-12 px-4 py-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <div className="col-span-3">Usuario</div>
              <div className="col-span-2">Email</div>
              <div className="col-span-1">Rol</div>
              <div className="col-span-1">Estado</div>
              <div className="col-span-3">Jugador vinculado</div>
              <div className="col-span-2 text-right">Acciones</div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-6 text-gray-500">No hay usuarios en esta sección.</div>
            ) : (
              <div className="p-3 md:p-0 space-y-3 md:space-y-0">
                {filtered.map((u) => {
                  const status = statusFromRow(u);
                  const isMe = meId === u.id;
                  const isTargetAdmin = (u.role ?? "").toString().toLowerCase() === "admin";
                  const linkedPlayerId = userPlayerMap[u.id] ?? null;
                  const availablePlayers = players.filter(
                    (p) => p.user_id === null || p.user_id === u.id
                  );

                  return (
                    <div
                      key={u.id}
                      className="grid grid-cols-1 md:grid-cols-12 px-4 py-4 border border-gray-100 rounded-lg md:rounded-none md:border-0 md:border-b md:border-gray-100 items-start md:items-center gap-3"
                    >
                      <div className="md:col-span-3">
                        <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                          {displayName(u)}
                          {isMe && (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                              Vos
                            </span>
                          )}
                          {isTargetAdmin && (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                              Admin
                            </span>
                          )}
                          {u.active === false && (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-red-100 text-red-700">
                              {u.deleted_at ? "Eliminado" : "Deshabilitado"}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 break-all md:truncate">{u.id}</p>
                      </div>

                      <div className="md:col-span-2 text-sm text-gray-700 min-w-0">
                        <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Email</p>
                        <p className="break-all">{u.email ?? "—"}</p>
                      </div>

                      <div className="md:col-span-1">
                        <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Rol</p>
                        {isTargetAdmin ? (
                          <span className="text-sm text-gray-700">admin</span>
                        ) : (
                          <select
                            value={(u.role ?? "user").toString().toLowerCase()}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "manager" || v === "user") void changeRole(u.id, v);
                            }}
                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          >
                            <option value="user">user</option>
                            <option value="manager">manager</option>
                          </select>
                        )}
                      </div>

                      <div className="md:col-span-1">
                        <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">Estado</p>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : status === "approved"
                              ? "bg-green-100 text-green-800"
                              : status === "deleted"
                              ? "bg-gray-200 text-gray-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {status === "pending"
                            ? "Pendiente"
                            : status === "approved"
                            ? "Aprobado"
                            : status === "rejected"
                            ? "Rechazado"
                            : "Eliminado"}
                        </span>
                      </div>

                      <div className="md:col-span-3">
                        <p className="md:hidden text-[11px] font-bold uppercase text-gray-500 mb-1">
                          Jugador vinculado
                        </p>
                        {status === "approved" || status === "pending" ? (
                          <select
                            value={linkedPlayerId ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              void linkPlayer(u.id, val ? Number(val) : null);
                            }}
                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          >
                            <option value="">Sin vincular</option>
                            {availablePlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : linkedPlayerId ? (
                          <span className="text-sm text-gray-600">{playerNameMap[linkedPlayerId]}</span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>

                      <div className="md:col-span-2 flex flex-col sm:flex-row md:justify-end gap-2 flex-wrap">
                        <p className="md:hidden text-[11px] font-bold uppercase text-gray-500">Acciones</p>
                        {status === "pending" && (
                          <>
                            <button
                              onClick={() => approve(u.id)}
                              className="w-full sm:w-auto bg-green-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-green-700 transition"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => reject(u.id)}
                              className="w-full sm:w-auto bg-red-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-red-700 transition"
                            >
                              Rechazar
                            </button>
                          </>
                        )}

                        {status === "deleted" && (
                          <button
                            onClick={() => setActive(u.id, true)}
                            className="w-full sm:w-auto bg-green-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-green-700 transition"
                          >
                            Rehabilitar
                          </button>
                        )}

                        {status !== "pending" && status !== "deleted" && (
                          <>
                            {u.active === false ? (
                              <button
                                onClick={() => setActive(u.id, true)}
                                className="w-full sm:w-auto bg-green-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-green-700 transition"
                              >
                                Habilitar
                              </button>
                            ) : (
                              <button
                                onClick={() => setActive(u.id, false)}
                                disabled={isMe || isTargetAdmin}
                                title={
                                  isMe
                                    ? "No puedes deshabilitarte a ti mismo"
                                    : isTargetAdmin
                                    ? "No se deshabilita el admin principal desde aquí"
                                    : ""
                                }
                                className="w-full sm:w-auto bg-gray-900 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-black transition disabled:opacity-40"
                              >
                                Deshabilitar
                              </button>
                            )}

                            {canAdminActions && !u.deleted_at && u.active !== false && (
                              <button
                                onClick={() => softDelete(u.id)}
                                disabled={isMe || isTargetAdmin}
                                title={
                                  isMe
                                    ? "No puedes eliminarte a ti mismo"
                                    : isTargetAdmin
                                    ? "No se elimina el admin principal desde aquí"
                                    : "Eliminar = deshabilitar (reversible)"
                                }
                                className="w-full sm:w-auto bg-red-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-red-700 transition disabled:opacity-40"
                              >
                                Eliminar
                              </button>
                            )}

                            {status === "rejected" && (
                              <button
                                onClick={() => approve(u.id)}
                                className="w-full sm:w-auto bg-green-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-green-700 transition"
                              >
                                Aprobar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Nota: &quot;Eliminar&quot; es una baja lógica (reversible). El usuario pasa a la pestaña
            &quot;Eliminados&quot; y puede ser rehabilitado.
          </p>
        </>
      )}
    </main>
  );
}
