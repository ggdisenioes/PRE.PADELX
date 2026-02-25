"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/Badge";
import toast from "react-hot-toast";
import MatchCard, { type Match } from "../../components/matches/MatchCard";
import { useTranslation } from "../../i18n";

type Tournament = {
  id: number;
  name: string;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
};

type PlayerMap = {
  [key: number]: string;
};

export default function TournamentDetail() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();

  const rawId = (params as any)?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const idNum = Number(id);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playersMap, setPlayersMap] = useState<PlayerMap>({});
  const [openResultMatch, setOpenResultMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const dateLocale = locale === "en" ? "en-US" : "es-ES";

  // Cargar torneo + partidos + jugadores
  useEffect(() => {
    if (!id || Number.isNaN(idNum)) {
      toast.error(t("tournaments.invalidId"));
      router.push("/tournaments");
      return;
    }

    const load = async () => {
      setLoading(true);

      try {
        const [{ data: tData, error: tError }, { data: mData, error: mError }, { data: pData, error: pError }] =
          await Promise.all([
            supabase
              .from("tournaments")
              .select("id, name, category, start_date, end_date")
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
          setTournament(tData as Tournament);
        } else if (tournamentMatches.length > 0) {
          setTournament({
            id: idNum,
            name: `${t("nav.tournaments")} #${idNum}`,
            category: null,
            start_date: null,
            end_date: null,
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
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, idNum, router, t]);


  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString(dateLocale);
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

  const getPlayerName = (value: any) => {
    if (value == null) return t("matches.tbd");
    if (typeof value === "object" && typeof value.name === "string") return value.name;
    const numericId = Number(value);
    if (Number.isFinite(numericId)) return playersMap[numericId] || t("matches.tbd");
    return t("matches.tbd");
  };

  const buildTeamName = (a?: any, b?: any) => {
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

  // Orden lógico de rondas
  const roundOrder = ["Fase de Grupos", "Octavos", "Cuartos", "Semifinal", "Final"];

  const sortedRounds = useMemo(() => {
    const rounds = Object.keys(matchesByRound);
    return rounds.sort((a, b) => {
      const ia = roundOrder.indexOf(a);
      const ib = roundOrder.indexOf(b);

      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [matchesByRound]);

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
                {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
              </p>
            </div>

            {/* Badge simple usando SOLO prop label */}
            <div className="flex items-center md:items-end justify-start md:justify-end">
              <Badge label={t("tournaments.bracket")} />
            </div>
          </div>
        </section>

        {/* Cuadro por rondas */}
        <section className="space-y-6">
          {sortedRounds.length === 0 ? (
            <p className="text-sm text-gray-500">
              {t("tournaments.noMatchesYet")}
            </p>
          ) : (
            sortedRounds.map((roundName) => (
              <div key={roundName} className="space-y-3">
                <h2 className="text-sm md:text-base font-semibold text-gray-800">
                  {translateRoundName(roundName)}
                </h2>

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
            ))
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
                    <img
                      src="/logo.svg"
                      alt="TWINCO"
                      style={{
                        height: 44,
                        width: "auto",
                        margin: "0 auto",
                        objectFit: "contain",
                      }}
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
                      link.download = `Twinco_Partido_${m.id}.png`;
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
