export type TournamentType = "league" | "cup";

export type LeagueMode = "single_leg" | "double_leg";

export const DEFAULT_TOURNAMENT_TYPE: TournamentType = "league";
export const DEFAULT_LEAGUE_MODE: LeagueMode = "single_leg";

export const TOURNAMENT_TYPE_LABEL: Record<TournamentType, string> = {
  league: "Liga",
  cup: "Copa",
};

export const LEAGUE_MODE_LABEL: Record<LeagueMode, string> = {
  single_leg: "Solo ida",
  double_leg: "Ida y vuelta",
};

export const CUP_PHASE_ORDER = [
  "Final",
  "Semifinal",
  "Cuartos",
  "Octavos",
  "Dieciseisavos",
] as const;

type CupPhaseKey = 2 | 4 | 8 | 16 | 32;

const CUP_PHASE_BY_SIZE: Record<CupPhaseKey, string> = {
  2: "Final",
  4: "Semifinal",
  8: "Cuartos",
  16: "Octavos",
  32: "Dieciseisavos",
};

export function isPowerOfTwo(value: number) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number) {
  if (value <= 1) return 2;
  if (isPowerOfTwo(value)) return value;
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

export function getCupPhaseName(teamCount: number) {
  const normalized = Math.max(2, nextPowerOfTwo(teamCount)) as CupPhaseKey;
  return CUP_PHASE_BY_SIZE[normalized] || `Ronda de ${normalized}`;
}

export function cupPhaseIndex(phase: string) {
  return CUP_PHASE_ORDER.indexOf(phase as (typeof CUP_PHASE_ORDER)[number]);
}

export function sortCupPhases(phases: string[]) {
  return [...phases].sort((a, b) => {
    const ia = cupPhaseIndex(a);
    const ib = cupPhaseIndex(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function extractCupPhase(roundName: string | null | undefined) {
  const value = String(roundName || "").trim();
  if (!value) return null;

  for (const phase of CUP_PHASE_ORDER) {
    const regex = new RegExp(`\\b${phase}\\b`, "i");
    if (regex.test(value)) return phase;
  }

  const ronda = value.match(/ronda\\s+de\\s+(\\d+)/i);
  if (ronda) return `Ronda de ${ronda[1]}`;

  return null;
}
