// ./app/players/page.tsx

"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useRole } from "../hooks/useRole";
import Card from "../components/Card";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useTranslation } from "../i18n";

type PlayerRow = {
  id: number;
  name: string;
  email: string | null;
  level: number | null;
  avatar_url?: string | null;
  is_approved: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

const logAction = async ({
  action,
  entity,
  entityId,
  metadata = {},
}: {
  action: string;
  entity: string;
  entityId?: number;
  metadata?: any;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.from("action_logs").insert([
    {
      user_id: user.id,
      user_email: user.email,
      action,
      entity,
      entity_id: entityId,
      metadata,
    },
  ]);
};

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isArchivedPlayer(player: PlayerRow) {
  return Boolean(player.deleted_at);
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export default function PlayersPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const { role, isAdmin, isManager, loading: roleLoading } = useRole();

  const fetchPlayers = useCallback(async () => {
    setLoading(true);

    let query = supabase.from("players").select("*").order("name", { ascending: true });

    if (role === "user") {
      query = query.eq("is_approved", true).is("deleted_at", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error al cargar jugadores:", error);
      toast.error(`${t("players.errorLoading")}: ${error.message}`, { duration: 5000 });
      setPlayers([]);
    } else {
      setPlayers((data as PlayerRow[]) || []);
    }
    setLoading(false);
  }, [role, t]);

  useEffect(() => {
    if (roleLoading) return;
    void fetchPlayers();
  }, [fetchPlayers, roleLoading, role]);

  useEffect(() => {
    const subscription = supabase
      .channel("players_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "players" },
        (payload) => {
          const updated = payload.new as PlayerRow;
          setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players" },
        () => {
          void fetchPlayers();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "players" },
        (payload) => {
          const removed = payload.old as PlayerRow;
          setPlayers((prev) => prev.filter((p) => p.id !== removed.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchPlayers]);

  const archivePlayer = useCallback(
    async ({
      playerId,
      playerName,
      source,
      errorMessage,
      successMessage,
    }: {
      playerId: number;
      playerName: string;
      source: "reject" | "delete";
      errorMessage: string;
      successMessage: string;
    }) => {
      const previousPlayers = players;
      const nowIso = new Date().toISOString();
      const currentUserId = await getCurrentUserId();

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, is_approved: false, deleted_at: nowIso, deleted_by: currentUserId }
            : p
        )
      );

      const { error } = await supabase
        .from("players")
        .update({
          is_approved: false,
          deleted_at: nowIso,
          deleted_by: currentUserId,
        })
        .eq("id", playerId);

      if (error) {
        setPlayers(previousPlayers);
        toast.error(errorMessage);
        return false;
      }

      await logAction({
        action: source === "reject" ? "REJECT_PLAYER" : "ARCHIVE_PLAYER",
        entity: "player",
        entityId: playerId,
        metadata: { playerName, source, archived: true },
      });

      toast.success(successMessage);
      return true;
    },
    [players]
  );

  const handleApprove = async (playerId: number, playerName: string) => {
    const { error } = await supabase
      .from("players")
      .update({ is_approved: true, deleted_at: null, deleted_by: null })
      .eq("id", playerId);

    if (error) {
      toast.error(t("admin.playersApproval.errorApproving", { name: playerName }));
      return;
    }

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, is_approved: true, deleted_at: null, deleted_by: null } : p
      )
    );

    await logAction({
      action: "APPROVE_PLAYER",
      entity: "player",
      entityId: playerId,
      metadata: { playerName },
    });

    toast.success(t("admin.playersApproval.approved", { name: playerName }));
  };

  const handleReject = async (playerId: number, playerName: string) => {
    if (!isAdmin) {
      toast.error(t("players.onlyAdminCanArchive"));
      return;
    }
    if (!confirm(t("admin.playersApproval.confirmReject", { name: playerName }))) return;

    await archivePlayer({
      playerId,
      playerName,
      source: "reject",
      errorMessage: t("admin.playersApproval.errorRejecting", { name: playerName }),
      successMessage: t("admin.playersApproval.rejectedArchived", { name: playerName }),
    });
  };

  const handleAdminDelete = async (playerId: number, playerName: string) => {
    if (!isAdmin) {
      toast.error(t("players.onlyAdminCanArchive"));
      return;
    }
    if (!confirm(t("players.deleteConfirm"))) return;

    await archivePlayer({
      playerId,
      playerName,
      source: "delete",
      errorMessage: t("players.errorDeleting"),
      successMessage: t("players.deleted"),
    });
  };

  const handleRestore = async (playerId: number, playerName: string) => {
    if (!isAdmin) {
      toast.error(t("players.onlyAdminCanArchive"));
      return;
    }
    if (!confirm(t("players.restoreConfirm", { name: playerName }))) return;

    const previousPlayers = players;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, is_approved: true, deleted_at: null, deleted_by: null } : p
      )
    );

    const { error } = await supabase
      .from("players")
      .update({ is_approved: true, deleted_at: null, deleted_by: null })
      .eq("id", playerId);

    if (error) {
      setPlayers(previousPlayers);
      toast.error(t("players.errorRestoring"));
      return;
    }

    await logAction({
      action: "RESTORE_PLAYER",
      entity: "player",
      entityId: playerId,
      metadata: { playerName },
    });

    toast.success(t("players.restored", { name: playerName }));
  };

  const handleAdminEdit = (playerId: number) => {
    router.push(`/players/edit/${playerId}`);
  };

  const filteredPlayers = useMemo(() => {
    const term = normalizeForSearch(search.trim());
    if (!term) return players;
    return players.filter((p) => normalizeForSearch(String(p?.name || "")).includes(term));
  }, [players, search]);

  const activePlayers = filteredPlayers.filter((p) => !isArchivedPlayer(p));
  const archivedPlayers = filteredPlayers.filter((p) => isArchivedPlayer(p));
  const approvedPlayers = activePlayers.filter((p) => Boolean(p.is_approved));
  const pendingPlayers = activePlayers.filter((p) => !Boolean(p.is_approved));

  if (roleLoading) {
    return (
      <main className="flex-1 p-8">
        <p className="text-gray-500 animate-pulse">{t("common.loading")}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800">{t("players.title")}</h2>

        <div className="flex w-full md:w-auto gap-3 items-stretch sm:items-center flex-col sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("players.searchPlaceholder")}
            className="w-full sm:w-64 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#007bff]"
          />
          <Link
            href="/players/create"
            className="bg-[#007bff] text-white px-4 py-2 rounded-lg hover:bg-[#0056b3] transition shadow-sm font-bold flex justify-center items-center gap-2 whitespace-nowrap"
          >
            <span>+</span> {t("players.create")}
          </Link>
        </div>
      </div>

      {(isAdmin || isManager) && pendingPlayers.length > 0 && (
        <section className="mb-8 p-4 rounded-lg bg-yellow-50 shadow-md">
          <h3 className="text-xl font-bold text-yellow-800 mb-4 flex items-center gap-2">
            <i className="fas fa-clock"></i>
            {t("common.pending")} ({pendingPlayers.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingPlayers.map((player) => (
              <Card
                key={player.id}
                className="p-4 flex flex-col justify-between border-l-4 border-l-yellow-500"
              >
                <div>
                  <p className="font-bold">
                    {player.name}{" "}
                    <span className="text-xs text-yellow-600">
                      ({t("common.pending").toUpperCase()})
                    </span>
                  </p>
                  <p className="text-sm text-gray-600 truncate">{player.email}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t("stats.level")}: {player.level}
                  </p>
                </div>
                <div className={`mt-3 ${isAdmin ? "flex gap-2" : ""}`}>
                  <button
                    onClick={() => handleApprove(player.id, player.name)}
                    className="flex-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                    disabled={loading}
                  >
                    {t("admin.playersApproval.approve")}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleReject(player.id, player.name)}
                      className="flex-1 px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 transition border border-red-200"
                      disabled={loading}
                    >
                      {t("admin.playersApproval.reject")}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <h3 className="text-xl font-bold text-gray-800 mb-4">{t("players.approvedPlayers")}</h3>

      {loading ? (
        <p className="text-gray-500 animate-pulse">{t("players.loading")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {approvedPlayers.length === 0 ? (
            <p className="col-span-full text-gray-500">{t("players.empty")}</p>
          ) : (
            approvedPlayers.map((player) => (
              <Link
                key={player.id}
                href={role === "user" ? `/players/${player.id}` : `/players/edit/${player.id}`}
                className="block group"
              >
                <Card className="p-4 flex flex-col justify-between border-l-4 border-l-green-500 cursor-pointer hover:shadow-lg transition">
                  <div className="flex items-center gap-4">
                    <img
                      src={player.avatar_url || "https://placehold.co/40x40/cccccc/ffffff?text=U"}
                      alt={player.name}
                      className="w-10 h-10 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "https://placehold.co/40x40/cccccc/ffffff?text=U";
                      }}
                    />
                    <div>
                      <p className="font-bold group-hover:text-blue-600 transition">{player.name}</p>
                      <p className="text-sm text-gray-500">
                        {t("stats.level")}: {player.level}
                      </p>
                      {role === "user" && (
                        <p className="text-xs text-gray-400 mt-1">{t("players.viewStats")}</p>
                      )}
                    </div>
                  </div>

                  {(isAdmin || isManager) && (
                    <div className="mt-3 flex gap-2 border-t pt-3 border-gray-100">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleAdminEdit(player.id);
                        }}
                        className="flex-1 px-3 py-1 bg-blue-50 text-blue-600 text-sm rounded hover:bg-blue-100 transition flex items-center justify-center gap-1"
                      >
                        <i className="fas fa-edit"></i> {t("common.edit")}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleAdminDelete(player.id, player.name);
                          }}
                          className="flex-1 px-3 py-1 bg-red-50 text-red-600 text-sm rounded hover:bg-red-100 transition flex items-center justify-center gap-1"
                        >
                          <i className="fas fa-trash"></i> {t("common.delete")}
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              </Link>
            ))
          )}
        </div>
      )}

      {isAdmin && (
        <section className="mt-10 p-4 rounded-lg bg-gray-50 shadow-md">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {t("players.archivedPlayers")} ({archivedPlayers.length})
          </h3>

          {archivedPlayers.length === 0 ? (
            <p className="text-gray-500">{t("players.archivedEmpty")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedPlayers.map((player) => (
                <Card
                  key={player.id}
                  className="p-4 flex flex-col justify-between border-l-4 border-l-gray-400"
                >
                  <div>
                    <p className="font-bold text-gray-800">{player.name}</p>
                    <p className="text-sm text-gray-600 truncate">{player.email}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {t("stats.level")}: {player.level}
                    </p>
                    {player.deleted_at && (
                      <p className="text-xs text-gray-500 mt-2">
                        {t("players.archivedSince", {
                          date: new Date(player.deleted_at).toLocaleDateString(),
                        })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => void handleRestore(player.id, player.name)}
                    className="mt-3 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                    disabled={loading}
                  >
                    {t("players.restore")}
                  </button>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
