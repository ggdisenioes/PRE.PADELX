"use client";

type TeamProps = {
  p1?: string;
  p2?: string;
  score?: string | null;
  winner?: boolean | null;
};

type PlayerRef = { id: number; name: string };
type PlayerValue = number | PlayerRef | null | undefined;

export type Match = {
  id: number;
  start_time?: string | null;
  round_name?: string | null;
  tournament_id?: number | null;
  tournament_name?: string | null;
  court?: string | null;
  score?: string | null;
  winner?: string | null;
  player_1_a?: PlayerValue;
  player_2_a?: PlayerValue;
  player_1_b?: PlayerValue;
  player_2_b?: PlayerValue;
};

type MatchCardProps = {
  match?: Match;
  playersMap?: Record<number, string>;
  showActions?: boolean;

  // compatibilidad
  status?: "programado" | "finalizado";
  tournament?: string;
  teamA?: TeamProps;
  teamB?: TeamProps;
  date?: string;
  time?: string;
  court?: string;
};

export default function MatchCard(props: MatchCardProps) {
  const {
    match,
    playersMap = {},
    showActions = false,
    status,
    tournament,
    teamA,
    teamB,
    date,
    time,
    court,
  } = props;

  const nameFromValue = (v?: PlayerValue) => {
    if (!v) return "Por definir";
    if (typeof v === "object") return v.name || "Por definir";
    return playersMap[v] || `Jugador ${v}`;
  };

  const toDateFromSupabase = (iso?: string | null) => {
    if (!iso) return null;
    // Si no trae zona (Z o +HH:MM/-HH:MM), lo tratamos como UTC.
    const hasTz = /([zZ])|([+-]\d{2}:\d{2})$/.test(iso);
    const normalized = hasTz ? iso : `${iso}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const winnerSide = match?.winner ?? null;
  const isWinnerAFromMatch = winnerSide === "A";
  const isWinnerBFromMatch = winnerSide === "B";

  const resolvedTeamA: Required<Pick<TeamProps, "p1" | "p2">> & TeamProps = {
    p1: teamA?.p1 ?? nameFromValue(match?.player_1_a),
    p2: teamA?.p2 ?? nameFromValue(match?.player_2_a),
    score: teamA?.score ?? null,
    winner: teamA?.winner ?? isWinnerAFromMatch,
  };

  const resolvedTeamB: Required<Pick<TeamProps, "p1" | "p2">> & TeamProps = {
    p1: teamB?.p1 ?? nameFromValue(match?.player_1_b),
    p2: teamB?.p2 ?? nameFromValue(match?.player_2_b),
    score: teamB?.score ?? null,
    winner: teamB?.winner ?? isWinnerBFromMatch,
  };

  const inferredFinished =
    !!match?.score &&
    !!winnerSide &&
    String(winnerSide).toLowerCase() !== "pending" &&
    (winnerSide === "A" || winnerSide === "B" || typeof winnerSide === "string");

  const isFinished = status ? status === "finalizado" : inferredFinished;

  const headerLeft = match?.round_name || "Partido";
  const headerRight =
    tournament ||
    match?.tournament_name ||
    (match?.tournament_id ? `Torneo #${match.tournament_id}` : "Sin torneo");

  const startDate = toDateFromSupabase(match?.start_time);

  const displayDate = startDate
    ? startDate.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })
    : date || undefined;

  const displayTime = startDate
    ? startDate.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Madrid",
      })
    : time || undefined;

  const displayCourt = court || match?.court || undefined;
  const displayScore = match?.score || null;


  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {headerLeft}
        </span>

        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isFinished
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {isFinished ? "Finalizado" : "Programado"}
        </span>
      </div>

      <div className="text-xs text-gray-500 font-medium">{headerRight}</div>

      <div className="flex items-center justify-between text-center">
        <div className="flex-1">
          <p
            className={`font-semibold ${
              resolvedTeamA.winner ? "text-green-600" : "text-gray-900"
            }`}
          >
            {resolvedTeamA.p1}
          </p>
          <p className="text-sm text-gray-500">{resolvedTeamA.p2}</p>
        </div>

        <div className="mx-4 text-gray-400 font-bold">VS</div>

        <div className="flex-1">
          <p
            className={`font-semibold ${
              resolvedTeamB.winner ? "text-green-600" : "text-gray-900"
            }`}
          >
            {resolvedTeamB.p1}
          </p>
          <p className="text-sm text-gray-500">{resolvedTeamB.p2}</p>
        </div>
      </div>

      {isFinished && displayScore && (
        <div className="text-center text-sm font-bold text-green-600">
          {displayScore}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
        {displayDate && <span>📅 {displayDate}</span>}
        {displayTime && <span>⏰ {displayTime}</span>}
        {displayCourt && <span>🎾 {displayCourt}</span>}
      </div>

      {showActions && (
        <div className="pt-2 flex justify-end">
          <button className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Ver detalle →
          </button>
        </div>
      )}
    </div>
  );
}