// ./app/admin/players-approval/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Card from "../../components/Card";
import toast from "react-hot-toast";
import { useTranslation } from "../../i18n";

type PendingPlayer = {
  id: number;
  name: string;
  email: string | null;
};

export default function PlayersApprovalPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pendingPlayers, setPendingPlayers] = useState<PendingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [canReject, setCanReject] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = (profile?.role || "").toString().toLowerCase();
      const allowed = role === "admin" || role === "manager" || role === "super_admin";
      if (!allowed) {
        router.push("/");
        return;
      }

      setHasAccess(true);
      setCanReject(role === "admin" || role === "super_admin");
      await fetchPendingPlayers();
    };

    void checkAuth();
  }, [router]);

  const fetchPendingPlayers = async () => {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, email")
      .eq("is_approved", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(t("admin.playersApproval.errorLoading"));
    } else {
      setPendingPlayers((data as PendingPlayer[]) || []);
    }
    setLoading(false);
  };

  const handleApprove = async (playerId: number, playerName: string) => {
    setLoading(true);
    const { error } = await supabase
      .from("players")
      .update({ is_approved: true, deleted_at: null, deleted_by: null })
      .eq("id", playerId);

    if (error) {
      toast.error(t("admin.playersApproval.errorApproving", { name: playerName }));
    } else {
      toast.success(t("admin.playersApproval.approved", { name: playerName }));
      await fetchPendingPlayers();
    }
    setLoading(false);
  };

  const handleReject = async (playerId: number, playerName: string) => {
    if (!canReject) {
      toast.error(t("players.onlyAdminCanArchive"));
      return;
    }
    if (!confirm(t("admin.playersApproval.confirmReject", { name: playerName }))) return;
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("players")
      .update({
        is_approved: false,
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id ?? null,
      })
      .eq("id", playerId);

    if (error) {
      toast.error(t("admin.playersApproval.errorRejecting", { name: playerName }));
    } else {
      toast.success(t("admin.playersApproval.rejectedArchived", { name: playerName }));
      await fetchPendingPlayers();
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">{t("admin.playersApproval.title")}</h2>
        <p>{t("admin.playersApproval.loading")}</p>
      </main>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">
        {t("admin.playersApproval.titleWithCount", { count: pendingPlayers.length })}
      </h2>

      {pendingPlayers.length === 0 ? (
        <p className="text-gray-500">{t("admin.playersApproval.empty")}</p>
      ) : (
        <div className="space-y-4">
          {pendingPlayers.map((player) => (
            <Card key={player.id} className="flex justify-between items-center p-4">
              <div className="flex-1">
                <p className="font-bold text-lg">{player.name}</p>
                <p className="text-sm text-gray-500">{player.email}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => void handleApprove(player.id, player.name)}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
                  disabled={loading}
                >
                  {t("admin.playersApproval.approve")}
                </button>
                {canReject && (
                  <button
                    onClick={() => void handleReject(player.id, player.name)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                    disabled={loading}
                  >
                    {t("admin.playersApproval.reject")}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
