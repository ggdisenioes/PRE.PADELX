// ./app/page.tsx
// ./app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";
import MatchCard from "@/components/matches/MatchCard";
import toast from "react-hot-toast";
import { formatDateMadrid, formatTimeMadrid, formatDateTimeMadrid } from "@/lib/dates";
import { useTranslation } from "./i18n";

type PlayerMap = {
  [key: number]: string;
};

type TournamentMap = {
  [key: number]: string;
};

type UpcomingMatch = {
  id: number;
  start_time: string | null;
  tournament_id: number | null;
  round_name: string | null;
  place: string | null;
  court: string | null;
  // Esquema anterior
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;

  // Nuevo esquema (amistosos)
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  winner: string | null;
  score: string | null;
};

type AuditLog = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | null;
  user_email: string | null;
  created_at: string;
};

type AlertItem = {
  id: string;
  type: "warning" | "info";
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

type PendingApprovalUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

// --- Dashboard extra types ---
type RankingItem = {
  player_id: number;
  name: string;
  points: number;
  wins: number;
  played: number;
  losses: number;
  games_for: number;
  games_against: number;
};

type TournamentRankingRow = {
  tournament_id: number;
  player_id: number;
  points: number;
  matches_won: number;
  matches_lost: number;
  games_for: number;
  games_against: number;
  players: { name: string | null } | { name: string | null }[] | null;
};

type FinishedMatch = {
  id: number;
  tournament_id: number | null;
  start_time: string | null;
  round_name?: string | null;
  place?: string | null;
  court?: string | null;
  tournament_name?: string;
  score: string | null;
  winner: string | null;
  // Esquema anterior
  player_1_a: number | null;
  player_2_a: number | null;
  player_1_b: number | null;
  player_2_b: number | null;

  // Nuevo esquema (amistosos)
  player_1_a_id?: number | null;
  player_2_a_id?: number | null;
  player_1_b_id?: number | null;
  player_2_b_id?: number | null;

  created_at: string;
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const [countPlayers, setCountPlayers] = useState(0);
  const [countTournaments, setCountTournaments] = useState(0);
  const [countPendingMatches, setCountPendingMatches] = useState(0);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([]);
  const [playerMap, setPlayerMap] = useState<PlayerMap>({});
  const [tournamentMap, setTournamentMap] = useState<TournamentMap>({});
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const { isAdmin, isManager } = useRole();
  const isUser = !isAdmin && !isManager;
  const canManageUsers = isAdmin || isManager;
  const [pendingApprovalUsers, setPendingApprovalUsers] = useState<PendingApprovalUser[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [overdueMatchesCount, setOverdueMatchesCount] = useState(0);
  const [actingPendingUserId, setActingPendingUserId] = useState<string | null>(null);

  const [topRanking, setTopRanking] = useState<RankingItem[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [recentResults, setRecentResults] = useState<FinishedMatch[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [chart7d, setChart7d] = useState<
    { key: string; label: string; pending: number; finished: number; total: number }[]
  >([]);

  const [openResultMatch, setOpenResultMatch] = useState<FinishedMatch | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const normalizePlayersFromIds = <T extends {
    player_1_a: number | null;
    player_2_a: number | null;
    player_1_b: number | null;
    player_2_b: number | null;
    player_1_a_id?: number | null;
    player_2_a_id?: number | null;
    player_1_b_id?: number | null;
    player_2_b_id?: number | null;
  }>(m: T): T => {
    return {
      ...m,
      player_1_a: m.player_1_a ?? (m.player_1_a_id ?? null),
      player_2_a: m.player_2_a ?? (m.player_2_a_id ?? null),
      player_1_b: m.player_1_b ?? (m.player_1_b_id ?? null),
      player_2_b: m.player_2_b ?? (m.player_2_b_id ?? null),
    };
  };


  // Función para calcular alertas inteligentes usando datasets ya cargados.
  const calculateAlerts = useCallback(
    ({
      overdueCount,
      tournaments,
      players,
      matchesLite,
    }: {
      overdueCount: number;
      tournaments: Array<{ id: number; name: string }>;
      players: Array<{ id: number; name: string }>;
      matchesLite: Array<{
        tournament_id: number | null;
        player_1_a: number | null;
        player_2_a: number | null;
        player_1_b: number | null;
        player_2_b: number | null;
        player_1_a_id?: number | null;
        player_2_a_id?: number | null;
        player_1_b_id?: number | null;
        player_2_b_id?: number | null;
      }>;
    }) => {
      const alertsList: AlertItem[] = [];

      if (overdueCount > 0) {
        alertsList.push({
          id: "overdue-matches",
          type: "warning",
          message: `⚠️ Hay ${overdueCount} partido(s) atrasado(s) sin resultado.`,
          actionLabel: t("matches.loadResult"),
          actionHref: "/matches?status=pending",
        });
      }

      const tournamentsWithMatches = new Set<number>();
      const playersWithMatches = new Set<number>();

      for (const match of matchesLite) {
        const tournamentId = Number(match.tournament_id);
        if (Number.isFinite(tournamentId) && tournamentId > 0) {
          tournamentsWithMatches.add(tournamentId);
        }

        const participantIdsRaw = [
          match.player_1_a ?? match.player_1_a_id,
          match.player_2_a ?? match.player_2_a_id,
          match.player_1_b ?? match.player_1_b_id,
          match.player_2_b ?? match.player_2_b_id,
        ];

        for (const rawId of participantIdsRaw) {
          const id = Number(rawId);
          if (Number.isFinite(id) && id > 0) playersWithMatches.add(id);
        }
      }

      for (const tournament of tournaments) {
        const tournamentId = Number(tournament.id);
        if (!Number.isFinite(tournamentId) || !tournamentsWithMatches.has(tournamentId)) {
          alertsList.push({
            id: `tournament-${tournament.id}`,
            type: "info",
            message: `ℹ️ El torneo "${tournament.name}" no tiene partidos cargados.`,
            actionLabel: t("matches.createManual"),
            actionHref: `/matches/create?tournament=${tournament.id}`,
          });
        }
      }

      for (const player of players) {
        const playerId = Number(player.id);
        if (!Number.isFinite(playerId) || playersWithMatches.has(playerId)) continue;
        alertsList.push({
          id: `player-${player.id}`,
          type: "info",
          message: t("dashboard.playerWithoutMatches", { name: player.name }),
          actionLabel: t("dashboard.assignMatch"),
          actionHref: `/matches/create?player=${player.id}`,
        });
      }

      setAlerts(alertsList.slice(0, 4));
    },
    [t]
  );

  const loadPendingApprovalUsers = useCallback(async () => {
    if (!canManageUsers) {
      setPendingApprovalUsers([]);
      setPendingApprovalCount(0);
      return;
    }

    const { data, count, error } = await supabase
      .from("profiles")
      .select("id,email,first_name,last_name,created_at", { count: "exact" })
      .eq("approval_status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(4);

    if (error) {
      console.error("[dashboard] pending users error:", error);
      return;
    }

    setPendingApprovalUsers((data as PendingApprovalUser[]) || []);
    setPendingApprovalCount(count || 0);
  }, [canManageUsers]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoadingDashboard(true);

      try {
        const start7d = new Date();
        start7d.setDate(start7d.getDate() - 6);
        start7d.setHours(0, 0, 0, 0);
        const nowIso = new Date().toISOString();

        const [
          { data: playersData, error: playersErr },
          { data: tournamentsData, error: tournamentsErr },
          { data: pendingMatches, count: pendingCount, error: pendingErr },
          { data: matches7d, error: m7Err },
          { data: finishedMatches, error: finishedErr },
          { data: logs, error: logsErr },
          { data: matchesLite, error: matchesLiteErr },
          { count: overdueCount, error: overdueErr },
        ] = await Promise.all([
          supabase.from("players").select("id, name").eq("is_approved", true),
          supabase.from("tournaments").select("id, name"),
          supabase
            .from("matches")
            .select(
              "id, start_time, tournament_id, round_name, place, court, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, winner, score",
              { count: "exact" }
            )
            .eq("winner", "pending")
            .order("start_time", { ascending: true })
            .limit(5),
          supabase
            .from("matches")
            .select("start_time, winner")
            .gte("start_time", start7d.toISOString()),
          supabase
            .from("matches")
            .select("id, tournament_id, start_time, round_name, place, court, score, winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, created_at")
            .neq("winner", "pending")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("action_logs")
            .select("id, action, entity, entity_id, user_email, created_at")
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("matches")
            .select("tournament_id, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id"),
          supabase
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("winner", "pending")
            .lt("start_time", nowIso),
        ]);

        if (!active) return;

        if (playersErr) console.error("[dashboard] players error:", playersErr);
        if (tournamentsErr) console.error("[dashboard] tournaments error:", tournamentsErr);
        if (pendingErr) console.error("[dashboard] pending matches error:", pendingErr);
        if (m7Err) console.error("[dashboard] chart matches error:", m7Err);
        if (finishedErr) console.error("[dashboard] finished matches error:", finishedErr);
        if (logsErr) console.error("[dashboard] logs error:", logsErr);
        if (matchesLiteErr) console.error("[dashboard] matches lite error:", matchesLiteErr);
        if (overdueErr) console.error("[dashboard] overdue count error:", overdueErr);

        const approvedPlayers = (playersData || []) as Array<{ id: number; name: string }>;
        const tournaments = (tournamentsData || []) as Array<{ id: number; name: string }>;

        const pMap: PlayerMap = {};
        for (const player of approvedPlayers) {
          pMap[player.id] = player.name;
        }
        setPlayerMap(pMap);

        const tMap: TournamentMap = {};
        for (const tournament of tournaments) {
          tMap[tournament.id] = tournament.name;
        }
        setTournamentMap(tMap);

        setCountPendingMatches(pendingCount || 0);
        setCountPlayers(approvedPlayers.length);
        setCountTournaments(tournaments.length);

        setUpcomingMatches((pendingMatches || []).map((m: any) => normalizePlayersFromIds(m)));
        setRecentResults((finishedMatches || []).map((m: any) => normalizePlayersFromIds(m)));
        setRecentLogs(logs || []);
        setOverdueMatchesCount(overdueCount || 0);

        const days: { key: string; label: string }[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start7d);
          d.setDate(start7d.getDate() + i);
          days.push({
            key: d.toISOString().slice(0, 10),
            label: d.toLocaleDateString("es-ES", { weekday: "short" }),
          });
        }

        const byDay: Record<string, { key: string; label: string; pending: number; finished: number; total: number }> = {};
        for (const d of days) {
          byDay[d.key] = { key: d.key, label: d.label, pending: 0, finished: 0, total: 0 };
        }

        for (const row of (matches7d || []) as { start_time: string | null; winner: string | null }[]) {
          if (!row.start_time) continue;
          const key = new Date(row.start_time).toISOString().slice(0, 10);
          if (!byDay[key]) continue;
          const isPending = !row.winner || String(row.winner).toLowerCase() === "pending";
          if (isPending) byDay[key].pending += 1;
          else byDay[key].finished += 1;
          byDay[key].total += 1;
        }

        setChart7d(days.map((d) => byDay[d.key]));

        calculateAlerts({
          overdueCount: overdueCount || 0,
          tournaments,
          players: approvedPlayers,
          matchesLite: (matchesLite || []) as Array<{
            tournament_id: number | null;
            player_1_a: number | null;
            player_2_a: number | null;
            player_1_b: number | null;
            player_2_b: number | null;
            player_1_a_id?: number | null;
            player_2_a_id?: number | null;
            player_1_b_id?: number | null;
            player_2_b_id?: number | null;
          }>,
        });

        await loadPendingApprovalUsers();
      } catch (error) {
        console.error("[dashboard] loadData error:", error);
      } finally {
        if (active) setLoadingDashboard(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [calculateAlerts, loadPendingApprovalUsers]);

  useEffect(() => {
    let active = true;

    const buildRankingFromMatchesFallback = async () => {
      let matchesQuery = supabase
        .from("matches")
        .select("winner, player_1_a, player_2_a, player_1_b, player_2_b, player_1_a_id, player_2_a_id, player_1_b_id, player_2_b_id, score, tournament_id")
        .neq("winner", "pending");

      if (selectedTournamentId) {
        matchesQuery = matchesQuery.eq("tournament_id", selectedTournamentId);
      }

      const { data: rankingMatches, error: rankingMatchesError } = await matchesQuery;
      if (!active) return;
      if (rankingMatchesError) {
        console.error("[dashboard] ranking fallback error:", rankingMatchesError);
        setTopRanking([]);
        return;
      }

      const rankingMap: Record<number, RankingItem> = {};
      for (const match of (rankingMatches || []) as Array<{
        winner: string | null;
        player_1_a: number | null;
        player_2_a: number | null;
        player_1_b: number | null;
        player_2_b: number | null;
        player_1_a_id?: number | null;
        player_2_a_id?: number | null;
        player_1_b_id?: number | null;
        player_2_b_id?: number | null;
        score: string | null;
      }>) {
        const normalized = normalizePlayersFromIds(match);
        const teamA = [normalized.player_1_a, normalized.player_2_a].filter(Boolean) as number[];
        const teamB = [normalized.player_1_b, normalized.player_2_b].filter(Boolean) as number[];
        const winners = normalized.winner === "A" ? teamA : normalized.winner === "B" ? teamB : [];
        const losers = normalized.winner === "A" ? teamB : normalized.winner === "B" ? teamA : [];

        let teamAScore = 0;
        let teamBScore = 0;
        if (typeof normalized.score === "string") {
          const scoreMatch = normalized.score.match(/(\d+)[\s\-:,]+(\d+)/);
          if (scoreMatch) {
            teamAScore = parseInt(scoreMatch[1], 10);
            teamBScore = parseInt(scoreMatch[2], 10);
          }
        }

        for (const playerId of winners) {
          if (!rankingMap[playerId]) {
            rankingMap[playerId] = {
              player_id: playerId,
              name: playerMap[playerId] || `Jugador ${playerId}`,
              points: 0,
              wins: 0,
              played: 0,
              losses: 0,
              games_for: 0,
              games_against: 0,
            };
          }
          rankingMap[playerId].wins += 1;
          rankingMap[playerId].points += 3;
          rankingMap[playerId].played += 1;
          if (normalized.winner === "A") {
            rankingMap[playerId].games_for += teamAScore;
            rankingMap[playerId].games_against += teamBScore;
          } else {
            rankingMap[playerId].games_for += teamBScore;
            rankingMap[playerId].games_against += teamAScore;
          }
        }

        for (const playerId of losers) {
          if (!rankingMap[playerId]) {
            rankingMap[playerId] = {
              player_id: playerId,
              name: playerMap[playerId] || `Jugador ${playerId}`,
              points: 0,
              wins: 0,
              played: 0,
              losses: 0,
              games_for: 0,
              games_against: 0,
            };
          }
          rankingMap[playerId].losses += 1;
          rankingMap[playerId].points += 1;
          rankingMap[playerId].played += 1;
          if (normalized.winner === "A") {
            rankingMap[playerId].games_for += teamBScore;
            rankingMap[playerId].games_against += teamAScore;
          } else {
            rankingMap[playerId].games_for += teamAScore;
            rankingMap[playerId].games_against += teamBScore;
          }
        }
      }

      setTopRanking(
        Object.values(rankingMap).sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const diffA = a.games_for - a.games_against;
          const diffB = b.games_for - b.games_against;
          if (diffB !== diffA) return diffB - diffA;
          if (b.games_for !== a.games_for) return b.games_for - a.games_for;
          return b.wins - a.wins;
        })
      );
    };

    const loadRanking = async () => {
      try {
        let query = supabase
          .from("tournament_rankings")
          .select("tournament_id, player_id, points, matches_won, matches_lost, games_for, games_against, players(name)");

        if (selectedTournamentId) {
          query = query.eq("tournament_id", selectedTournamentId);
        }

        const { data, error } = await query;
        if (!active) return;

        if (error) {
          console.error("[dashboard] ranking error:", error);
          await buildRankingFromMatchesFallback();
          return;
        }

        const rankingMap: Record<number, RankingItem> = {};

        for (const row of (data || []) as TournamentRankingRow[]) {
          const playerId = Number(row.player_id);
          if (!Number.isFinite(playerId)) continue;

          const relation = Array.isArray(row.players) ? row.players[0] : row.players;
          const resolvedName =
            relation?.name ||
            playerMap[playerId] ||
            `Jugador ${playerId}`;

          if (!rankingMap[playerId]) {
            rankingMap[playerId] = {
              player_id: playerId,
              name: resolvedName,
              points: 0,
              wins: 0,
              played: 0,
              losses: 0,
              games_for: 0,
              games_against: 0,
            };
          }

          rankingMap[playerId].points += Number(row.points) || 0;
          rankingMap[playerId].wins += Number(row.matches_won) || 0;
          rankingMap[playerId].losses += Number(row.matches_lost) || 0;
          rankingMap[playerId].games_for += Number(row.games_for) || 0;
          rankingMap[playerId].games_against += Number(row.games_against) || 0;
          rankingMap[playerId].played =
            rankingMap[playerId].wins + rankingMap[playerId].losses;
        }

        setTopRanking(
          Object.values(rankingMap).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const diffA = a.games_for - a.games_against;
            const diffB = b.games_for - b.games_against;
            if (diffB !== diffA) return diffB - diffA;
            if (b.games_for !== a.games_for) return b.games_for - a.games_for;
            return b.wins - a.wins;
          })
        );
      } catch (error) {
        console.error("[dashboard] loadRanking error:", error);
      }
    };

    void loadRanking();

    return () => {
      active = false;
    };
  }, [selectedTournamentId, playerMap]);


  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("realtime-action-logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "action_logs",
        },
        (payload: { new: AuditLog }) => {
          const newLog = payload.new as AuditLog;

          setRecentLogs((prev) => {
            const updated = [newLog, ...prev];
            return updated.slice(0, 6);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  useEffect(() => {
    // KPIs en tiempo real (admin y manager)
    const channel = supabase
      .channel("realtime-kpis")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        async () => {
          const { count } = await supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .eq("winner", "pending");

          setCountPendingMatches(count || 0);
          // Dashboard PRO v2: recalcular resumen últimos 30 días
          // await fetchSummary30d(); // <-- eliminado: no actualizar gráficos desde realtime
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          const { count } = await supabase
            .from("players")
            .select("*", { count: "exact", head: true })
            .eq("is_approved", true);

          setCountPlayers(count || 0);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments" },
        async () => {
          const { count } = await supabase
            .from("tournaments")
            .select("*", { count: "exact", head: true });

          setCountTournaments(count || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getPendingUserDisplayName = (user: PendingApprovalUser) => {
    const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return full || user.email || user.id;
  };

  const handlePendingUserAction = async (
    userId: string,
    action: "approve" | "reject"
  ) => {
    setActingPendingUserId(userId);
    try {
      const rpcName = action === "approve" ? "approve_user" : "reject_user";
      const { error } = await supabase.rpc(rpcName, { p_user_id: userId });
      if (error) throw error;

      toast.success(
        action === "approve"
          ? t("dashboard.userApproved")
          : t("dashboard.userRejected")
      );
      await loadPendingApprovalUsers();
    } catch (error) {
      console.error("[dashboard] pending user action error:", error);
      toast.error(t("dashboard.userActionError"));
    } finally {
      setActingPendingUserId(null);
    }
  };


  const getPlayerName = (id: number | null) =>
    id && playerMap[id] ? playerMap[id] : id ? `ID ${id}` : "-";

  const isPlayed = (m: FinishedMatch) =>
    !!m.score && !!m.winner && String(m.winner).toLowerCase() !== "pending";

  const formatScoreForDisplay = (raw: string | null) => {
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
  };

  const buildTeamNameFromIds = (p1: number | null, p2: number | null) => {
    const a = getPlayerName(p1);
    const b = getPlayerName(p2);
    const joined = [a, b].filter((x) => x && x !== "-").join(" y ");
    return joined || "Por definir";
  };

  const getWinnerLoserTeams = (m: FinishedMatch) => {
    const teamA = buildTeamNameFromIds(m.player_1_a, m.player_2_a);
    const teamB = buildTeamNameFromIds(m.player_1_b, m.player_2_b);
    const score = formatScoreForDisplay(m.score);

    if (m.winner === "A") return { winnerTeam: teamA, loserTeam: teamB, score };
    if (m.winner === "B") return { winnerTeam: teamB, loserTeam: teamA, score };
    return { winnerTeam: teamA, loserTeam: teamB, score };
  };

  if (isUser) {
    // Usuario cliente: solo vista informativa
  }
  return (
    <main className="w-full overflow-x-hidden px-4 py-6 md:px-8 lg:px-10 lg:py-8">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">{t("dashboard.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("dashboard.welcome")}</p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-500 shadow-sm w-fit">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </div>
        </header>

        {/* GRID PRINCIPAL (estilo dashboard con panel derecho) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUMNA IZQUIERDA */}
          <div className="lg:col-span-8 space-y-6">
            {/* KPIs */}
            {(isAdmin || isManager) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.lastDaysActivity")}
                  </h2>
                  <Link
                    href="/matches"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver partidos →
                  </Link>
                </div>

                {loadingDashboard ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="h-24 bg-gray-100 animate-pulse rounded-xl"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{t("dashboard.totalTournaments")}</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {countTournaments}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">{t("dashboard.viewAllTournaments")}</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        🏆
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{t("common.pending")}</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {countPendingMatches}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">{t("dashboard.pendingMatches")}</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        🎾
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{t("dashboard.totalPlayers")}</p>
                        <p className="text-2xl font-extrabold text-gray-900">{countPlayers}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{t("common.approved")}</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        👥
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">{t("dashboard.upcomingMatches")}</p>
                        <p className="text-2xl font-extrabold text-gray-900">
                          {formatTimeMadrid(upcomingMatches[0]?.start_time)}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">{t("dashboard.dateToBeConfirmed")}</p>
                      </div>
                      <div className="h-11 w-11 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-xl">
                        📅
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GRÁFICO (últimos 7 días) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {t("dashboard.lastDaysActivity")}
                </h2>
                <span className="text-xs text-gray-400">{t("common.pending")} vs {t("common.completed")}</span>
              </div>

              {chart7d.length === 0 ? (
                <div className="h-40 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-500">
                  {t("common.noData")}
                </div>
              ) : (
                (() => {
                  const max = Math.max(1, ...chart7d.map((d) => d.total));
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-7 gap-2 items-end h-44">
                        {chart7d.map((d) => {
                          const hTotal = Math.round((d.total / max) * 100);
                          const hPending = d.total ? Math.round((d.pending / max) * 100) : 0;
                          const hFinished = d.total ? Math.round((d.finished / max) * 100) : 0;

                          return (
                            <div key={d.key} className="flex flex-col items-center gap-2">
                              <div className="w-full flex items-end justify-center gap-1 h-36">
                                <div
                                  className="w-3 rounded-t bg-yellow-300"
                                  style={{ height: `${Math.max(2, hPending)}%` }}
                                  title={`${d.pending} pendientes`}
                                />
                                <div
                                  className="w-3 rounded-t bg-green-400"
                                  style={{ height: `${Math.max(2, hFinished)}%` }}
                                  title={`${d.finished} finalizados`}
                                />
                              </div>
                              <div className="text-[11px] text-gray-500 capitalize">{d.label}</div>
                              <div className="text-[11px] font-semibold text-gray-700">{d.total}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-yellow-300" />
                          {t("matches.filterPending")}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded bg-green-400" />
                          {t("matches.filterCompleted")}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* ALERTAS */}
            {(isAdmin || isManager) && alerts.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.alerts")}
                  </h2>
                  <span className="text-xs text-gray-400">{t("dashboard.alerts")}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border p-4 text-sm shadow-sm flex items-start justify-between gap-4 ${
                        alert.type === "warning"
                          ? "bg-yellow-50 border-yellow-300 text-yellow-900"
                          : "bg-blue-50 border-blue-300 text-blue-900"
                      }`}
                    >
                      <p>{alert.message}</p>
                      {alert.actionHref && alert.actionLabel && (
                        <Link
                          href={alert.actionHref}
                          className="shrink-0 inline-flex items-center rounded-md bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-white transition"
                        >
                          {alert.actionLabel} →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PRÓXIMOS PARTIDOS */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {t("dashboard.upcomingMatches")}
                </h2>
                <Link
                  href="/matches"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Ver todos →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingMatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                    {t("dashboard.noUpcomingMatches")}
                  </div>
                ) : (
                  upcomingMatches.map((m: UpcomingMatch) => {
                    const matchWithName: any = {
                      ...m,
                      tournament_name: m.tournament_id
                        ? tournamentMap[m.tournament_id]
                        : undefined,
                    };
                    const clickable =
                      !!m.score &&
                      !!m.winner &&
                      String(m.winner).toLowerCase() !== "pending";

                    return (
                      <div
                        key={m.id}
                        className={clickable ? "cursor-pointer" : ""}
                        onClick={() => {
                          if (clickable)
                            setOpenResultMatch(matchWithName as any);
                        }}
                      >
                        <MatchCard
                          match={matchWithName}
                          playersMap={playerMap}
                          showActions={false}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RESULTADOS + RANKING */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Resultados recientes */}
              <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.recentResults")}
                  </h2>
                  <Link
                    href="/matches?status=finished"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver historial →
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentResults.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                      {t("dashboard.noRecentResults")}
                    </div>
                  ) : (
                    recentResults.map((m: FinishedMatch) => {
                      const matchWithName: any = {
                        ...m,
                        tournament_name: m.tournament_id
                          ? tournamentMap[m.tournament_id]
                          : undefined,
                      };
                      return (
                        <div
                          key={m.id}
                          className="cursor-pointer"
                          onClick={() => setOpenResultMatch(matchWithName)}
                        >
                          <MatchCard
                            match={matchWithName}
                            playersMap={playerMap}
                            showActions={false}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Ranking */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.topRanking")}
                  </h2>
                  <span className="text-xs text-gray-400">3 pts / 1 pts</span>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="tournament-selector"
                    className="block text-xs font-medium text-gray-500 mb-1"
                  >
                    {t("nav.tournaments")}
                  </label>
                  <select
                    id="tournament-selector"
                    value={selectedTournamentId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTournamentId(val === "" ? null : Number(val));
                    }}
                    className="w-full rounded-md border-gray-300 py-1.5 px-2 text-sm"
                  >
                    <option value="">{t("ranking.filterAll")}</option>
                    {Object.entries(tournamentMap).map(([tid, tname]) => (
                      <option key={tid} value={tid}>
                        {tname}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex font-semibold text-[11px] text-gray-600 px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <div className="w-6 text-center">{t("ranking.position")}</div>
                    <div className="flex-1">{t("ranking.player")}</div>
                    <div className="w-10 text-center">{t("ranking.points")}</div>
                  </div>

                  {topRanking.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">
                      {t("ranking.empty")}
                    </div>
                  ) : (
                    topRanking.slice(0, 8).map((r: RankingItem, idx: number) => {
                      const medal =
                        idx === 0
                          ? "🥇"
                          : idx === 1
                          ? "🥈"
                          : idx === 2
                          ? "🥉"
                          : null;

                      return (
                        <Link
                          key={r.player_id}
                          href={`/players/${r.player_id}`}
                          className="flex items-center px-3 py-2 border-b last:border-b-0 border-gray-100 hover:bg-gray-50 transition"
                        >
                          <div className="w-6 text-center text-sm font-bold text-gray-500">
                            {medal ?? idx + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-semibold text-sm text-gray-900">
                              {r.name}
                            </span>
                            <div className="text-[11px] text-gray-500">
                              PJ {r.played} · PG {r.wins} · PP {r.losses}
                            </div>
                          </div>
                          <div className="w-10 text-center font-extrabold text-green-700">
                            {r.points}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA */}
          <aside className="lg:col-span-4 space-y-6">
            {/* CENTRO DE TAREAS */}
            {canManageUsers && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.taskCenter")}
                  </h2>
                  <span className="text-xs font-semibold text-gray-500">
                    {pendingApprovalCount + countPendingMatches + overdueMatchesCount}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2 mb-4">
                  <Link
                    href="/admin/users"
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-indigo-700">
                      {t("dashboard.pendingUserRequests")}
                    </span>
                    <span className="text-xs font-bold text-indigo-800">{pendingApprovalCount}</span>
                  </Link>
                  <Link
                    href="/matches?status=pending"
                    className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-yellow-700">
                      {t("dashboard.pendingMatchesTitle")}
                    </span>
                    <span className="text-xs font-bold text-yellow-800">{countPendingMatches}</span>
                  </Link>
                  <Link
                    href="/matches?status=pending"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-red-700">
                      {t("dashboard.overdueMatches")}
                    </span>
                    <span className="text-xs font-bold text-red-800">{overdueMatchesCount}</span>
                  </Link>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("dashboard.pendingUserRequests")}
                    </p>
                    <Link
                      href="/admin/users"
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {t("dashboard.managePendingUsers")} →
                    </Link>
                  </div>

                  {pendingApprovalUsers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                      {t("dashboard.noPendingUserRequests")}
                    </p>
                  ) : (
                    pendingApprovalUsers.map((user) => (
                      <div
                        key={user.id}
                        className="rounded-lg border border-gray-200 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {getPendingUserDisplayName(user)}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {user.email || user.id}
                            </p>
                          </div>
                          {user.created_at && (
                            <span className="text-[11px] text-gray-400 shrink-0">
                              {formatDateMadrid(user.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePendingUserAction(user.id, "approve")}
                            disabled={actingPendingUserId === user.id}
                            className="flex-1 rounded-md bg-green-600 text-white py-1.5 text-xs font-semibold hover:bg-green-700 transition disabled:opacity-50"
                          >
                            {t("admin.playersApproval.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePendingUserAction(user.id, "reject")}
                            disabled={actingPendingUserId === user.id}
                            className="flex-1 rounded-md bg-red-600 text-white py-1.5 text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50"
                          >
                            {t("admin.playersApproval.reject")}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.readyToScore")}
                  </p>
                  {upcomingMatches.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-gray-800 truncate">
                          {buildTeamNameFromIds(m.player_1_a, m.player_2_a)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {buildTeamNameFromIds(m.player_1_b, m.player_2_b)}
                        </p>
                      </div>
                      <Link
                        href={`/matches/score/${m.id}`}
                        className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                      >
                        {t("matches.loadResult")}
                      </Link>
                    </div>
                  ))}
                  {upcomingMatches.length === 0 && (
                    <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                      {t("dashboard.noPendingMatches")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ACCIONES RÁPIDAS */}
            {(isAdmin || isManager) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  {t("dashboard.quickActions")}
                </h2>

                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href="/matches/create"
                    className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                  >
                    <span>➕ {t("dashboard.newFriendlyMatch")}</span>
                    <span className="text-gray-400">→</span>
                  </Link>

                  <Link
                    href="/matches?status=pending"
                    className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                  >
                    <span>🎯 {t("dashboard.viewAllMatches")}</span>
                    <span className="text-gray-400">→</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      href="/tournaments/create"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                    >
                      <span>🏆 {t("dashboard.newTournament")}</span>
                      <span className="text-gray-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/management"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 transition"
                    >
                      <span>👤 {t("dashboard.newPlayer")}</span>
                      <span className="text-indigo-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/users"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 shadow-sm hover:bg-purple-100 transition"
                    >
                      <span>🛠️ {t("nav.userManagement")}</span>
                      <span className="text-purple-400">→</span>
                    </Link>
                  )}

                  {isAdmin && (
                    <Link
                      href="/admin/logs"
                      className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
                    >
                      <span>📜 {t("admin.logs.title")}</span>
                      <span className="text-gray-400">→</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVIDAD RECIENTE */}
            {isAdmin && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                <div className="p-5 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t("dashboard.recentResults")}
                  </h2>
                </div>

                <div className="divide-y">
                  {recentLogs.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">{t("admin.logs.empty")}</p>
                  ) : (
                    recentLogs.map((log) => (
                      <div key={log.id} className="p-4 flex items-start gap-3">
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-green-500" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">
                            <span className="font-semibold">
                              {log.user_email ?? "Sistema"}
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
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* AYUDA RÁPIDA */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t("dashboard.quickActions")}
              </h2>
              <div className="text-sm text-gray-600 space-y-2">
                <Link href="/players" className="block hover:text-gray-900">
                  {t("nav.players")} →
                </Link>
                <Link href="/tournaments" className="block hover:text-gray-900">
                  {t("nav.tournaments")} →
                </Link>
                <Link href="/matches" className="block hover:text-gray-900">
                  {t("nav.matches")} →
                </Link>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {openResultMatch && isPlayed(openResultMatch) && (() => {
        const match = openResultMatch;
        const result = getWinnerLoserTeams(match);
        const matchType = match.tournament_id
          ? match.tournament_name || tournamentMap[match.tournament_id] || t("matches.typeTournament")
          : t("matches.friendlyMatchLabel");
        const dateStr = match.start_time ? formatDateMadrid(match.start_time) : "";
        const timeStr = match.start_time ? formatTimeMadrid(match.start_time) : "";
        const courtPlace = [match.court, match.place].filter(Boolean).join(" · ");

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 relative shadow-2xl">
              <button
                onClick={() => setOpenResultMatch(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl"
              >
                ✕
              </button>

              <div style={{ overflow: "hidden", borderRadius: 16 }}>
                <div
                  ref={shareCardRef}
                  style={{
                    width: 480,
                    height: 520,
                    backgroundColor: "#0b1220",
                    borderRadius: 0,
                    padding: "28px 32px",
                    color: "#fff",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transform: "scale(0.82)",
                    transformOrigin: "top left",
                    marginBottom: -90,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <img
                      src="/logo.svg"
                      alt="TWINCO"
                      style={{ height: 44, width: "auto", margin: "0 auto", objectFit: "contain" }}
                    />
                  </div>

                  <div style={{ textAlign: "center", marginTop: 14 }}>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: match.tournament_id ? "#1a3a2a" : "#1a2a3a",
                        color: match.tournament_id ? "#4ade80" : "#60a5fa",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "5px 16px",
                        borderRadius: 20,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {matchType}
                    </span>
                  </div>

                  <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 3, marginBottom: 6 }}>
                        {t("matches.shareCardWinners").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                        {result.winnerTeam}
                      </div>
                    </div>

                    <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 4, color: "#ccff00", margin: "8px 0" }}>
                      {result.score}
                    </div>

                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#666", letterSpacing: 3, marginBottom: 6 }}>
                        {t("matches.shareCardLosers").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 16, color: "#999" }}>
                        {result.loserTeam}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ height: 1, backgroundColor: "#1e293b", marginBottom: 12 }} />
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 11, color: "#64748b" }}>
                      {dateStr && <span>{dateStr}</span>}
                      {timeStr && <span>{timeStr}h</span>}
                      {courtPlace && <span>{courtPlace}</span>}
                    </div>
                    <div style={{ textAlign: "center", marginTop: 10, fontSize: 10, color: "#334155" }}>
                      {process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "padelx.es"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const el = shareCardRef.current;
                    if (!el) {
                      toast.error(t("shareModal.errorCreating"));
                      return;
                    }

                    const origTransform = el.style.transform;
                    const origMargin = el.style.marginBottom;
                    el.style.transform = "none";
                    el.style.marginBottom = "0";

                    try {
                      const { toPng } = await import("html-to-image");
                      const dataUrl = await toPng(el, {
                        cacheBust: true,
                        pixelRatio: 2,
                        width: 480,
                        height: 520,
                      });
                      const link = document.createElement("a");
                      link.download = `Twinco_Partido_${match.id}.png`;
                      link.href = dataUrl;
                      link.click();
                      toast.success(t("matches.imageDownloaded"));
                    } catch (err) {
                      console.error("toPng error:", err);
                      toast.error(t("shareModal.errorCreating"));
                    } finally {
                      el.style.transform = origTransform;
                      el.style.marginBottom = origMargin;
                    }
                  }}
                  className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-semibold hover:bg-black transition text-sm"
                >
                  {t("shareModal.download")}
                </button>
              </div>

              <button
                onClick={() => setOpenResultMatch(null)}
                className="w-full border border-gray-200 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                {t("shareModal.close")}
              </button>
            </div>
          </div>
        );
      })()}

      {openResultMatch && !isPlayed(openResultMatch) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#0F172A] w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 relative text-white">
            <button
              onClick={() => setOpenResultMatch(null)}
              className="absolute top-3 right-3 text-white/60 hover:text-white"
            >
              ✕
            </button>
            <p className="text-sm text-white/60 text-center">{t("dashboard.resultPending")}</p>
            <button
              onClick={() => setOpenResultMatch(null)}
              className="w-full py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white transition"
            >
              {t("shareModal.close")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
