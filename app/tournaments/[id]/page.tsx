"use client";

import { useEffect, useState, useMemo } from "react";
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
  const [loading, setLoading] = useState(true);
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
                    <MatchCard
                      key={m.id}
                      match={m}
                      playersMap={playersMap}
                      showActions={false}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
