"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/Badge";
import toast from "react-hot-toast";
import MatchCard, { type Match } from "../../components/matches/MatchCard";
import { useTranslation } from "../../i18n";
import { useRole } from "../../hooks/useRole";
import { waitForSession } from "../../lib/auth-session";
import { getClientCache, setClientCache } from "../../lib/clientCache";
import {
  DEFAULT_LEAGUE_MODE,
  DEFAULT_TOURNAMENT_TYPE,
  LEAGUE_MODE_LABEL,
  TOURNAMENT_TYPE_LABEL,
  extractCupPhase,
  getCupPhaseName,
} from "../../lib/tournamentFormats";

type Tournament = {
  id: number;
  name: string;
  category: string | null;
  start_date: string | null;
  tournament_type?: "league" | "cup" | null;
  league_mode?: "single_leg" | "double_leg" | null;
};

type PlayerMap = {
  [key: number]: string;
};

type TournamentRound = {
  id: number;
  round_number: number;
  round_name: string;
  start_at: string;
};

type TournamentDetailCachePayload = {
  tournament: Tournament | null;
  matches: Match[];
  tournamentRounds: TournamentRound[];
  playersMap: PlayerMap;
};

const TOURNAMENT_DETAIL_CACHE_KEY_PREFIX = "padelx:tournament:detail:v1:";
const TOURNAMENT_DETAIL_CACHE_TTL_MS = 90 * 1000;
const ROUND_ORDER = ["Fase de Grupos", "Octavos", "Cuartos", "Semifinal", "Final"];
const BRACKET_CARD_HEIGHT_PX = 112;
const BRACKET_BASE_GAP_PX = 12;
const BRACKET_CONNECTOR_PX = 12;

type CupBracketSlot = {
  key: string;
  match: Match | null;
};

type CupBracketRound = {
  phaseName: string;
  roundDepth: number;
  slots: CupBracketSlot[];
};

type CupBracketSideRound = CupBracketRound & {
  leftSlots: CupBracketSlot[];
  rightSlots: CupBracketSlot[];
};

function getCupPhaseSize(phaseName: string) {
  const normalized = phaseName.trim().toLowerCase();
  if (normalized === "final") return 2;
  if (normalized === "semifinal") return 4;
  if (normalized === "cuartos") return 8;
  if (normalized === "octavos") return 16;
  if (normalized === "dieciseisavos") return 32;

  const dynamic = normalized.match(/ronda\s+de\s+(\d+)/i);
  if (dynamic) {
    const parsed = Number(dynamic[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortMatchesForBracket(a: Match, b: Match) {
  const aTs = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
  const bTs = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
  if (aTs !== bTs) return aTs - bTs;
  return a.id - b.id;
}

function getBracketTopOffset(roundDepth: number) {
  if (roundDepth <= 0) return 0;
  const stride = BRACKET_CARD_HEIGHT_PX + BRACKET_BASE_GAP_PX;
  return (stride / 2) * (2 ** roundDepth - 1);
}

function getBracketRoundGap(roundDepth: number) {
  if (roundDepth <= 0) return BRACKET_BASE_GAP_PX;
  const stride = BRACKET_CARD_HEIGHT_PX + BRACKET_BASE_GAP_PX;
  return stride * 2 ** roundDepth - BRACKET_CARD_HEIGHT_PX;
}

function getNextCupPhaseName(currentPhase: string) {
  const currentSize = getCupPhaseSize(currentPhase);
  if (!Number.isFinite(currentSize) || currentSize <= 2 || currentSize === Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return getCupPhaseName(Math.max(2, Math.floor(currentSize / 2)));
}

export default function TournamentDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAdmin, isManager, loading: roleLoading } = useRole();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idNum = Number(id);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentRounds, setTournamentRounds] = useState<TournamentRound[]>([]);
  const [playersMap, setPlayersMap] = useState<PlayerMap>({});
  const [canManageByProfile, setCanManageByProfile] = useState(false);
  const [openResultMatch, setOpenResultMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAutoAdvancingCup, setIsAutoAdvancingCup] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const lastAutoAdvanceSignatureRef = useRef<string>("");
  const dateLocale = locale === "en" ? "en-US" : "es-ES";
  const cacheKey = `${TOURNAMENT_DETAIL_CACHE_KEY_PREFIX}${idNum}`;

  // Cargar torneo + partidos + jugadores
  useEffect(() => {
    if (!id || Number.isNaN(idNum)) {
      toast.error(t("tournaments.invalidId"));
      router.push("/tournaments");
      return;
    }

    const load = async () => {
      const cached = getClientCache<TournamentDetailCachePayload>(
        cacheKey,
        TOURNAMENT_DETAIL_CACHE_TTL_MS
      );

      if (cached) {
        setTournament(cached.tournament ?? null);
        setMatches(cached.matches ?? []);
        setTournamentRounds(cached.tournamentRounds ?? []);
        setPlayersMap(cached.playersMap ?? {});
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        try {
          const roleRes = await fetch("/api/auth/whoami-role", { cache: "no-store" });
          const roleData = await roleRes.json().catch(() => null);
          setCanManageByProfile(Boolean(roleData?.can_manage_tournaments));
        } catch {
          setCanManageByProfile(false);
        }

        // Esperamos a que la sesión esté restaurada para evitar falsos "no encontrado" por RLS.
        await waitForSession(supabase, { retries: 16, delayMs: 180 });

        const [
          { data: tData, error: tError },
          { data: mData, error: mError },
          { data: pData, error: pError },
          { data: roundsData, error: roundsError },
        ] =
          await Promise.all([
            supabase
              .from("tournaments")
              .select("*")
              .eq("id", idNum)
              .maybeSingle(),
            supabase
              .from("matches")
              .select(
                "id, start_time, round_name, place, court, score, winner, player_1_a, player_2_a, player_1_b, player_2_b"
              )
              .eq("tournament_id", idNum)
              .order("start_time", { ascending: true })
              .returns<Match[]>(),
            supabase.from("players").select("id, name"),
            supabase
              .from("tournament_rounds")
              .select("id, round_number, round_name, start_at")
              .eq("tournament_id", idNum)
              .order("round_number", { ascending: true }),
          ]);

        if (tError) {
          console.error("Error cargando torneo:", tError);
        }

        const tournamentMatches = (mData || []) as Match[];
        if (mError) {
          console.error("Error cargando partidos:", mError);
          toast.error(t("matches.errorLoading"));
          setMatches([]);
        } else {
          setMatches(tournamentMatches);
        }

        if (tData) {
          setTournament({
            ...(tData as Tournament),
            tournament_type:
              (tData as Tournament).tournament_type || DEFAULT_TOURNAMENT_TYPE,
            league_mode: (tData as Tournament).league_mode || DEFAULT_LEAGUE_MODE,
          });
        } else if (tournamentMatches.length > 0) {
          setTournament({
            id: idNum,
            name: `${t("nav.tournaments")} #${idNum}`,
            category: null,
            start_date: null,
            tournament_type: DEFAULT_TOURNAMENT_TYPE,
            league_mode: DEFAULT_LEAGUE_MODE,
          });
        } else {
          setTournament(null);
        }

        if (pError) {
          console.error("Error cargando jugadores:", pError);
        } else {
          const map: PlayerMap = {};
          (pData || []).forEach((p) => {
            map[p.id] = p.name;
          });
          setPlayersMap(map);
        }

        if (roundsError) {
          console.error("Error cargando jornadas:", roundsError);
          setTournamentRounds([]);
        } else {
          setTournamentRounds((roundsData || []) as TournamentRound[]);
        }

        const safeTournament = tData
          ? ({
              ...(tData as Tournament),
              tournament_type:
                (tData as Tournament).tournament_type || DEFAULT_TOURNAMENT_TYPE,
              league_mode: (tData as Tournament).league_mode || DEFAULT_LEAGUE_MODE,
            } as Tournament)
          : tournamentMatches.length > 0
            ? {
                id: idNum,
                name: `${t("nav.tournaments")} #${idNum}`,
                category: null,
                start_date: null,
                tournament_type: DEFAULT_TOURNAMENT_TYPE,
                league_mode: DEFAULT_LEAGUE_MODE,
              }
            : null;

        const safePlayerMap: PlayerMap = {};
        (pData || []).forEach((p) => {
          safePlayerMap[p.id] = p.name;
        });

        setClientCache<TournamentDetailCachePayload>(cacheKey, {
          tournament: safeTournament,
          matches: tournamentMatches,
          tournamentRounds: (roundsData || []) as TournamentRound[],
          playersMap: safePlayerMap,
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [cacheKey, id, idNum, router, t]);


  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString(dateLocale);
  };

  const formatRoundStart = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(dateLocale, {
      timeZone: "Europe/Madrid",
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const translateRoundName = (roundName: string) => {
    const keyMap: Record<string, string> = {
      "Fase de Grupos": "matches.filterRoundGroups",
      Octavos: "tournaments.round16",
      Cuartos: "matches.filterRoundQuarterfinals",
      Semifinal: "matches.filterRoundSemifinal",
      Final: "matches.filterRoundFinal",
      "Sin ronda": "tournaments.noRound",
    };
    const key = keyMap[roundName];
    return key ? t(key) : roundName;
  };

  const isPlayed = (m: Match) =>
    !!m?.score && !!m?.winner && String(m.winner).toLowerCase() !== "pending";

  const getPlayerName = (value: unknown) => {
    if (value == null) return t("matches.tbd");
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof (value as { name?: unknown }).name === "string"
    ) {
      return (value as { name: string }).name;
    }
    const numericId = Number(value);
    if (Number.isFinite(numericId)) return playersMap[numericId] || t("matches.tbd");
    return t("matches.tbd");
  };

  const buildTeamName = (a?: unknown, b?: unknown) => {
    const p1 = getPlayerName(a);
    const p2 = getPlayerName(b);
    return [p1, p2].filter(Boolean).join(" y ");
  };

  const formatScore = (raw: string | null | undefined) => {
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
  };

  const formatMatchDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(locale === "en" ? "en-US" : "es-ES", {
      timeZone: "Europe/Madrid",
    });
  };

  const formatMatchTime = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(locale === "en" ? "en-US" : "es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Madrid",
    });
  };


  // Agrupar partidos por ronda
  const matchesByRound = useMemo(() => {
    return matches.reduce((acc: Record<string, Match[]>, match) => {
      const round = match.round_name || "Sin ronda";
      if (!acc[round]) acc[round] = [];
      acc[round].push(match);
      return acc;
    }, {});
  }, [matches]);

  const sortedRounds = useMemo(() => {
    const rounds = Object.keys(matchesByRound);
    return rounds.sort((a, b) => {
      const ia = ROUND_ORDER.indexOf(a);
      const ib = ROUND_ORDER.indexOf(b);

      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [matchesByRound]);

  const configuredRoundNames = useMemo(
    () => tournamentRounds.map((round) => round.round_name),
    [tournamentRounds]
  );

  const adHocRounds = useMemo(
    () => sortedRounds.filter((roundName) => !configuredRoundNames.includes(roundName)),
    [configuredRoundNames, sortedRounds]
  );
  const canManageTournament = isAdmin || isManager || canManageByProfile;

  const tournamentType: "league" | "cup" =
    tournament?.tournament_type === "cup" ? "cup" : "league";
  const leagueMode =
    tournament?.league_mode === "double_leg" ? "double_leg" : "single_leg";
  const isCupTournament = tournamentType === "cup";

  const cupMatchesByPhase = useMemo(() => {
    const map: Record<string, Match[]> = {};
    Object.entries(matchesByRound).forEach(([roundName, roundMatches]) => {
      const phase = extractCupPhase(roundName);
      if (!phase) return;
      if (!map[phase]) map[phase] = [];
      map[phase].push(...roundMatches);
    });
    return map;
  }, [matchesByRound]);

  const cupBracketRounds = useMemo<CupBracketRound[]>(() => {
    const phaseNames = Object.keys(cupMatchesByPhase).sort(
      (a, b) => getCupPhaseSize(b) - getCupPhaseSize(a)
    );
    if (phaseNames.length === 0) return [];

    let previousExpectedSlots = 0;
    return phaseNames.map((phaseName, roundDepth) => {
      const phaseMatches = [...(cupMatchesByPhase[phaseName] || [])].sort(sortMatchesForBracket);
      const expectedFromTree =
        roundDepth === 0 ? phaseMatches.length : Math.max(1, Math.ceil(previousExpectedSlots / 2));
      const expectedSlots = Math.max(expectedFromTree, phaseMatches.length || 0, 1);
      previousExpectedSlots = expectedSlots;

      const slots: CupBracketSlot[] = Array.from({ length: expectedSlots }, (_, index) => ({
        key: `${phaseName}-${index}`,
        match: phaseMatches[index] || null,
      }));

      return { phaseName, roundDepth, slots };
    });
  }, [cupMatchesByPhase]);

  const cupFinalRound = useMemo(
    () => (cupBracketRounds.length > 0 ? cupBracketRounds[cupBracketRounds.length - 1] : null),
    [cupBracketRounds]
  );

  const cupSideRounds = useMemo<CupBracketSideRound[]>(() => {
    if (cupBracketRounds.length <= 1) return [];
    return cupBracketRounds.slice(0, -1).map((round) => {
      const pivot = Math.ceil(round.slots.length / 2);
      return {
        ...round,
        leftSlots: round.slots.slice(0, pivot),
        rightSlots: round.slots.slice(pivot),
      };
    });
  }, [cupBracketRounds]);

  const rightCupSideRounds = useMemo(() => [...cupSideRounds].reverse(), [cupSideRounds]);

  useEffect(() => {
    if (!isCupTournament || !canManageTournament || loading || isAutoAdvancingCup) return;
    if (matches.length === 0) return;

    const signature = matches
      .map((m) => `${m.id}:${m.round_name || ""}:${m.winner || ""}:${m.score || ""}`)
      .join("|");
    if (lastAutoAdvanceSignatureRef.current === signature) return;
    lastAutoAdvanceSignatureRef.current = signature;

    let cancelled = false;

    const autoAdvanceCup = async () => {
      const byPhase = new Map<string, Match[]>();
      matches.forEach((match) => {
        const phase = extractCupPhase(match.round_name);
        if (!phase) return;
        if (!byPhase.has(phase)) byPhase.set(phase, []);
        byPhase.get(phase)!.push(match);
      });

      const phaseNames = [...byPhase.keys()].sort(
        (a, b) => getCupPhaseSize(b) - getCupPhaseSize(a)
      );
      if (phaseNames.length === 0) return;

      const candidatePhase = phaseNames.find((phase) => {
        const phaseMatches = byPhase.get(phase) || [];
        const completed =
          phaseMatches.length > 0 &&
          phaseMatches.every((m) => {
            const winner = String(m.winner || "").toUpperCase();
            return winner === "A" || winner === "B";
          });
        if (!completed) return false;

        const next = getNextCupPhaseName(phase);
        if (!next) return false;
        return !byPhase.has(next);
      });

      if (!candidatePhase) return;

      const nextPhase = getNextCupPhaseName(candidatePhase);
      if (!nextPhase) return;

      const completedPhaseMatches = [...(byPhase.get(candidatePhase) || [])].sort(
        sortMatchesForBracket
      );
      if (completedPhaseMatches.length === 0) return;

      const winners: Array<{ a: number; b: number }> = [];
      completedPhaseMatches.forEach((match) => {
        const winner = String(match.winner || "").toUpperCase();
        if (winner === "A") {
          const a = Number(match.player_1_a);
          const b = Number(match.player_2_a);
          if (Number.isFinite(a) && Number.isFinite(b)) winners.push({ a, b });
          return;
        }
        if (winner === "B") {
          const a = Number(match.player_1_b);
          const b = Number(match.player_2_b);
          if (Number.isFinite(a) && Number.isFinite(b)) winners.push({ a, b });
        }
      });

      if (winners.length < 2 || winners.length % 2 !== 0) return;

      const latestStart = completedPhaseMatches.reduce((max, match) => {
        const value = match.start_time ? new Date(match.start_time).getTime() : Number.NaN;
        if (!Number.isFinite(value)) return max;
        return Math.max(max, value);
      }, Date.now());

      const baseStart = new Date(latestStart);
      baseStart.setDate(baseStart.getDate() + 7);

      const nextMatchesPayload = [];
      for (let i = 0; i < winners.length / 2; i += 1) {
        const teamA = winners[i];
        const teamB = winners[winners.length - 1 - i];
        const startAt = new Date(baseStart);
        startAt.setMinutes(startAt.getMinutes() + i * 5);

        nextMatchesPayload.push({
          tournament_id: idNum,
          round_name: nextPhase,
          player_1_a: teamA.a,
          player_2_a: teamA.b,
          player_1_b: teamB.a,
          player_2_b: teamB.b,
          start_time: startAt.toISOString(),
          score: null,
          winner: null,
          place: null,
        });
      }

      if (nextMatchesPayload.length === 0) return;

      setIsAutoAdvancingCup(true);
      try {
        const { data: inserted, error } = await supabase
          .from("matches")
          .insert(nextMatchesPayload)
          .select(
            "id, start_time, round_name, place, court, score, winner, player_1_a, player_2_a, player_1_b, player_2_b"
          )
          .returns<Match[]>();

        if (error) {
          console.error("[cup:auto-advance] error creating next phase:", error);
          return;
        }

        if (cancelled || !inserted || inserted.length === 0) return;

        setMatches((prev) => {
          const next = [...prev, ...inserted].sort(sortMatchesForBracket);
          setClientCache<TournamentDetailCachePayload>(cacheKey, {
            tournament,
            matches: next,
            tournamentRounds,
            playersMap,
          });
          return next;
        });

        toast.success(`Llave actualizada: fase ${nextPhase} creada automáticamente.`);
      } finally {
        if (!cancelled) setIsAutoAdvancingCup(false);
      }
    };

    void autoAdvanceCup();

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    canManageTournament,
    idNum,
    isAutoAdvancingCup,
    isCupTournament,
    loading,
    matches,
    playersMap,
    tournament,
    tournamentRounds,
  ]);

  const noResultMessage =
    locale === "en" ? "This match has no result yet." : "Este partido todavia no tiene resultado.";

  const openPlayedMatch = (match: Match | null) => {
    if (!match) return;
    if (!isPlayed(match)) {
      toast.error(noResultMessage);
      return;
    }
    setOpenResultMatch(match);
  };

  const renderCupSlotCard = (slot: CupBracketSlot) => {
    if (!slot.match) {
      return (
        <div className="h-[112px] rounded-xl border border-dashed border-slate-300 bg-white/70 px-2 py-2 flex items-center justify-center text-[11px] text-slate-400 text-center">
          Pendiente de definir
        </div>
      );
    }

    const m = slot.match;
    const teamA = buildTeamName(m.player_1_a, m.player_2_a);
    const teamB = buildTeamName(m.player_1_b, m.player_2_b);
    const played = isPlayed(m);
    const score = formatScore(m.score);

    return (
      <button
        type="button"
        onClick={() => openPlayedMatch(m)}
        className={`h-[112px] w-full rounded-xl border bg-white px-2 py-2 text-left transition ${
          played ? "border-slate-300 hover:shadow-sm" : "border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
          <span>{formatMatchDate(m.start_time) || "-"}</span>
          <span className="font-semibold text-slate-700">{score || "-"}</span>
        </div>

        <div className="space-y-1 text-[13px] leading-tight">
          <p className={m.winner === "A" ? "font-semibold text-emerald-700 truncate" : "text-slate-700 truncate"}>
            {teamA}
          </p>
          <p className={m.winner === "B" ? "font-semibold text-emerald-700 truncate" : "text-slate-700 truncate"}>
            {teamB}
          </p>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <main className="p-10 text-center">
        {t("tournaments.detailLoading")}
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="p-10 text-center">
        {t("tournaments.detailNotFound")}
      </main>
    );
  }

  return (
    <main className="w-full overflow-x-hidden p-4 md:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Cabecera del Torneo */}
        <section className="mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {tournament.name}
              </h1>
              {tournament.category && (
                <p className="text-sm text-gray-500 mt-1">
                  {t("tournaments.category")}: {tournament.category}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(tournament.start_date)}
              </p>
            </div>

            {/* Badge simple usando SOLO prop label */}
            <div className="flex items-center md:items-end justify-start md:justify-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge label={TOURNAMENT_TYPE_LABEL[tournamentType]} />
                {isCupTournament ? (
                  <Badge label="Llaves" />
                ) : (
                  <Badge label={LEAGUE_MODE_LABEL[leagueMode]} />
                )}
              </div>
            </div>
          </div>

          {(!roleLoading || canManageByProfile) && canManageTournament && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => router.push(`/tournaments/edit/${idNum}`)}
                className="bg-gray-900 !text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-gray-800 transition"
                style={{ WebkitTextFillColor: "#fff" }}
              >
                Editar torneo
              </button>
            </div>
          )}
        </section>

        {/* Cuadro por rondas / llaves */}
        <section className="space-y-6">
          {isCupTournament ? (
            <>
              {(!roleLoading || canManageByProfile) && canManageTournament && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/matches/create/manual?tournament=${idNum}`)}
                    className="bg-green-600 !text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-green-700 transition"
                    style={{ WebkitTextFillColor: "#fff" }}
                  >
                    + Crear partido
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/tournaments/${idNum}/generate-matches`)}
                    className="bg-indigo-600 !text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 transition"
                    style={{ WebkitTextFillColor: "#fff" }}
                  >
                    Gestionar llaves
                  </button>
                </div>
              )}

              {cupBracketRounds.length === 0 ? (
                <p className="text-sm text-gray-500">{t("tournaments.noMatchesYet")}</p>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4 overflow-hidden">
                  <div className="space-y-4 lg:hidden">
                    {cupBracketRounds.map((round) => (
                      <div key={`stack-${round.phaseName}`} className="space-y-2">
                        <div className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold text-center">
                          {translateRoundName(round.phaseName)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {round.slots.map((slot) => (
                            <div key={`stack-slot-${slot.key}`}>{renderCupSlotCard(slot)}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden lg:flex items-stretch justify-center gap-3 px-1 py-2 w-full">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {cupSideRounds.map((round) => {
                        const gap = getBracketRoundGap(round.roundDepth);
                        const stride = BRACKET_CARD_HEIGHT_PX + gap;
                        const pairCount = Math.floor(round.leftSlots.length / 2);
                        return (
                          <div key={`left-${round.phaseName}`} className="min-w-0 flex-1">
                            <div className="rounded-xl bg-slate-900 text-white px-2 py-2 mb-3 text-xs xl:text-sm font-semibold text-center">
                              {translateRoundName(round.phaseName)}
                            </div>
                            <div
                              className="relative"
                              style={{ paddingTop: `${getBracketTopOffset(round.roundDepth)}px` }}
                            >
                              <div className="relative flex flex-col" style={{ gap: `${gap}px` }}>
                                {round.leftSlots.map((slot) => (
                                  <div key={slot.key} className="relative">
                                    {renderCupSlotCard(slot)}
                                    <span
                                      className="absolute top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                                      style={{
                                        right: `-${BRACKET_CONNECTOR_PX}px`,
                                        width: `${BRACKET_CONNECTOR_PX}px`,
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>

                              {pairCount > 0 &&
                                Array.from({ length: pairCount }).map((_, pairIndex) => {
                                  const firstCenter = BRACKET_CARD_HEIGHT_PX / 2 + pairIndex * 2 * stride;
                                  const secondCenter = firstCenter + stride;
                                  const middle = (firstCenter + secondCenter) / 2;
                                  return (
                                    <div key={`left-connector-${round.phaseName}-${pairIndex}`}>
                                      <span
                                        className="absolute border-l-2 border-slate-300"
                                        style={{
                                          right: `-${BRACKET_CONNECTOR_PX}px`,
                                          top: `${firstCenter}px`,
                                          height: `${secondCenter - firstCenter}px`,
                                        }}
                                      />
                                      <span
                                        className="absolute border-t-2 border-slate-300"
                                        style={{
                                          right: `-${BRACKET_CONNECTOR_PX * 2}px`,
                                          top: `${middle}px`,
                                          width: `${BRACKET_CONNECTOR_PX}px`,
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="w-[160px] xl:w-[180px] shrink-0 flex flex-col items-center justify-center">
                      <div className="rounded-xl bg-slate-900 text-white px-2 py-2 mb-3 text-xs xl:text-sm font-semibold text-center w-full">
                        {translateRoundName(cupFinalRound?.phaseName || "Final")}
                      </div>
                      {cupFinalRound?.slots[0] ? (
                        <div className="relative w-full">
                          <span
                            className="absolute top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                            style={{ left: `-${BRACKET_CONNECTOR_PX}px`, width: `${BRACKET_CONNECTOR_PX}px` }}
                          />
                          <span
                            className="absolute top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                            style={{ right: `-${BRACKET_CONNECTOR_PX}px`, width: `${BRACKET_CONNECTOR_PX}px` }}
                          />
                          {renderCupSlotCard(cupFinalRound.slots[0])}
                        </div>
                      ) : (
                        <div className="w-full h-[112px] rounded-xl border border-dashed border-slate-300 bg-white/70 px-2 py-2 flex items-center justify-center text-[11px] text-slate-400 text-center">
                          Final pendiente
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {rightCupSideRounds.map((round) => {
                        const gap = getBracketRoundGap(round.roundDepth);
                        const stride = BRACKET_CARD_HEIGHT_PX + gap;
                        const pairCount = Math.floor(round.rightSlots.length / 2);
                        return (
                          <div key={`right-${round.phaseName}`} className="min-w-0 flex-1">
                            <div className="rounded-xl bg-slate-900 text-white px-2 py-2 mb-3 text-xs xl:text-sm font-semibold text-center">
                              {translateRoundName(round.phaseName)}
                            </div>
                            <div
                              className="relative"
                              style={{ paddingTop: `${getBracketTopOffset(round.roundDepth)}px` }}
                            >
                              <div className="relative flex flex-col" style={{ gap: `${gap}px` }}>
                                {round.rightSlots.map((slot) => (
                                  <div key={slot.key} className="relative">
                                    {renderCupSlotCard(slot)}
                                    <span
                                      className="absolute top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                                      style={{
                                        left: `-${BRACKET_CONNECTOR_PX}px`,
                                        width: `${BRACKET_CONNECTOR_PX}px`,
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>

                              {pairCount > 0 &&
                                Array.from({ length: pairCount }).map((_, pairIndex) => {
                                  const firstCenter = BRACKET_CARD_HEIGHT_PX / 2 + pairIndex * 2 * stride;
                                  const secondCenter = firstCenter + stride;
                                  const middle = (firstCenter + secondCenter) / 2;
                                  return (
                                    <div key={`right-connector-${round.phaseName}-${pairIndex}`}>
                                      <span
                                        className="absolute border-l-2 border-slate-300"
                                        style={{
                                          left: `-${BRACKET_CONNECTOR_PX}px`,
                                          top: `${firstCenter}px`,
                                          height: `${secondCenter - firstCenter}px`,
                                        }}
                                      />
                                      <span
                                        className="absolute border-t-2 border-slate-300"
                                        style={{
                                          left: `-${BRACKET_CONNECTOR_PX * 2}px`,
                                          top: `${middle}px`,
                                          width: `${BRACKET_CONNECTOR_PX}px`,
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : tournamentRounds.length === 0 && sortedRounds.length === 0 ? (
            <p className="text-sm text-gray-500">{t("tournaments.noMatchesYet")}</p>
          ) : (
            <>
              {tournamentRounds.map((round) => {
                const roundMatches = matchesByRound[round.round_name] || [];
                return (
                  <div key={round.id} className="space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <h2 className="text-sm md:text-base font-semibold text-gray-800">
                        {round.round_name}
                      </h2>
                      <span className="text-xs text-gray-500">
                        {formatRoundStart(round.start_at)}
                      </span>
                    </div>

                    {(!roleLoading || canManageByProfile) && canManageTournament && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/matches/create/manual?tournament=${idNum}&round_id=${round.id}`
                            )
                          }
                          className="bg-green-600 !text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-green-700 transition"
                          style={{ WebkitTextFillColor: "#fff" }}
                        >
                          + Crear partido
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/tournaments/${idNum}/generate-matches?round_id=${round.id}`
                            )
                          }
                          className="bg-indigo-600 !text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 transition"
                          style={{ WebkitTextFillColor: "#fff" }}
                        >
                          Crear partidos aleatorios
                        </button>
                      </div>
                    )}

                    {roundMatches.length === 0 ? (
                      <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-3">
                        Todavía no hay partidos en esta jornada.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {roundMatches.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (!isPlayed(m)) {
                                toast.error(
                                  locale === "en"
                                    ? "This match has no result yet."
                                    : "Este partido todavia no tiene resultado."
                                );
                                return;
                              }
                              setOpenResultMatch(m);
                            }}
                            className={isPlayed(m) ? "cursor-pointer" : "cursor-default"}
                          >
                            <MatchCard
                              match={m}
                              playersMap={playersMap}
                              showActions={false}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {adHocRounds.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm md:text-base font-semibold text-gray-700">
                    Otras rondas
                  </h2>
                  {adHocRounds.map((roundName) => (
                    <div key={roundName} className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        {translateRoundName(roundName)}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {matchesByRound[roundName].map((m) => (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (!isPlayed(m)) {
                                toast.error(
                                  locale === "en"
                                    ? "This match has no result yet."
                                    : "Este partido todavia no tiene resultado."
                                );
                                return;
                              }
                              setOpenResultMatch(m);
                            }}
                            className={isPlayed(m) ? "cursor-pointer" : "cursor-default"}
                          >
                            <MatchCard
                              match={m}
                              playersMap={playersMap}
                              showActions={false}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {openResultMatch && isPlayed(openResultMatch) && (() => {
        const m = openResultMatch;
        const winnerTeam = m.winner === "A"
          ? buildTeamName(m.player_1_a, m.player_2_a)
          : buildTeamName(m.player_1_b, m.player_2_b);
        const loserTeam = m.winner === "A"
          ? buildTeamName(m.player_1_b, m.player_2_b)
          : buildTeamName(m.player_1_a, m.player_2_a);
        const score = formatScore(m.score);
        const dateStr = formatMatchDate(m.start_time);
        const timeStr = formatMatchTime(m.start_time);
        const courtPlace = [m.court].filter(Boolean).join(" · ");

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
                    <Image
                      src="/logo.svg"
                      alt="PADELX QA"
                      width={140}
                      height={44}
                      style={{ margin: "0 auto", objectFit: "contain" }}
                    />
                  </div>

                  <div style={{ textAlign: "center", marginTop: 14 }}>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: "#1a3a2a",
                        color: "#4ade80",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "5px 16px",
                        borderRadius: 20,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {tournament?.name || `${t("nav.tournaments")} #${idNum}`}
                    </span>
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#4ade80",
                          letterSpacing: 3,
                          marginBottom: 6,
                        }}
                      >
                        {t("matches.shareCardWinners").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                        {winnerTeam}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: 900,
                        letterSpacing: 4,
                        color: "#ccff00",
                        margin: "8px 0",
                      }}
                    >
                      {score}
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#666",
                          letterSpacing: 3,
                          marginBottom: 6,
                        }}
                      >
                        {t("matches.shareCardLosers").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 16, color: "#999" }}>{loserTeam}</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ height: 1, backgroundColor: "#1e293b", marginBottom: 12 }} />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 16,
                        fontSize: 11,
                        color: "#64748b",
                      }}
                    >
                      {dateStr && <span>{dateStr}</span>}
                      {timeStr && <span>{timeStr}h</span>}
                      {courtPlace && <span>{courtPlace}</span>}
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        marginTop: 10,
                        fontSize: 10,
                        color: "#334155",
                      }}
                    >
                      {process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "padelx.es"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const el = shareCardRef.current;
                    if (!el) return;

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
                      link.download = `PadelXQA_Partido_${m.id}.png`;
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
    </main>
  );
}
