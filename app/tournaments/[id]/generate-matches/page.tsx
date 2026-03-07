"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { supabase } from "../../../lib/supabase";
import { useRole } from "../../../hooks/useRole";
import { notifyMatchCreated } from "../../../lib/notify";
import Card from "../../../components/Card";

type Player = {
  id: number;
  name: string;
  level?: number | null;
};

type Format = "liga" | "grupos" | "eliminacion";

type Team = {
  a: number; // jugador 1
  b: number; // jugador 2
};

type TournamentRound = {
  id: number;
  round_number: number;
  round_name: string;
  start_at: string;
};

const ROUND_NAMES: Record<number, string> = {
  2: "Final",
  4: "Semifinal",
  8: "Cuartos",
  16: "Octavos",
};

function isPowerOfTwo(n: number) {
  return (n & (n - 1)) === 0 && n !== 0;
}

function nextPowerOfTwo(n: number) {
  let count = 0;
  if (n && !(n & (n - 1))) return n;
  while (n !== 0) {
    n >>= 1;
    count += 1;
  }
  return 1 << count;
}

function createSeededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let n = Math.imul(t ^ (t >>> 15), 1 | t);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(array: T[], randomFn: () => number = Math.random): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function teamKey(t: Team) {
  return [t.a, t.b].sort((x, y) => x - y).join("-");
}

function matchupKey(t1: Team, t2: Team) {
  const k1 = teamKey(t1);
  const k2 = teamKey(t2);
  return [k1, k2].sort().join("__");
}

export default function GenerateMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, isManager, loading: roleLoading } = useRole();
  const requestedRoundId = searchParams.get("round_id") || searchParams.get("round");

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [format, setFormat] = useState<Format>("liga");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>("");

  // Fecha base (necesaria porque start_time en matches es NOT NULL)
  const [startDate, setStartDate] = useState<string>("");

  // Grupos
  const [groupsCount, setGroupsCount] = useState(2);
  const [roundTrip, setRoundTrip] = useState(false);

  // Eliminación
  // También se usa para armar parejas “balanceadas” por nivel
  const [seeded, setSeeded] = useState(false);
  const [pairingSeed, setPairingSeed] = useState<number>(() => (Date.now() % 2147483647) | 0);

  const tournamentId = useMemo(() => Number(id), [id]);
  const selectedRound = useMemo(
    () => rounds.find((round) => String(round.id) === selectedRoundId) || null,
    [rounds, selectedRoundId]
  );

  /* 🚫 Seguridad */
  if (!roleLoading && !isAdmin && !isManager) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <p className="text-red-600 font-semibold">
          No tienes permisos para generar partidos.
        </p>
      </main>
    );
  }

  /* 📥 Cargar jugadores aprobados */
  useEffect(() => {
    const loadPlayers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("players")
        .select("id, name, level")
        .eq("is_approved", true)
        .is("deleted_at", null)
        .order("name");

      if (error) {
        console.error(error);
        toast.error("Error al cargar jugadores");
        setPlayers([]);
        setLoading(false);
        return;
      }

      setPlayers((data || []) as Player[]);

      const { data: roundsData, error: roundsError } = await supabase
        .from("tournament_rounds")
        .select("id, round_number, round_name, start_at")
        .eq("tournament_id", tournamentId)
        .order("round_number", { ascending: true });

      if (roundsError) {
        console.error("[generate-matches] error cargando jornadas", roundsError);
        setRounds([]);
      } else {
        const nextRounds = (roundsData || []) as TournamentRound[];
        setRounds(nextRounds);
        if (nextRounds.length > 0) {
          const initialRound =
            nextRounds.find((round) => String(round.id) === requestedRoundId) || nextRounds[0];
          setSelectedRoundId(String(initialRound.id));
          setStartDate(initialRound.start_at.slice(0, 10));
        }
      }
      setLoading(false);
    };

    loadPlayers();
  }, [tournamentId, requestedRoundId]);

  const togglePlayer = (playerId: number) => {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((x) => x !== playerId)
        : [...prev, playerId]
    );
  };

  const selectedPlayerObjs = useMemo(
    () => players.filter((p) => selectedPlayers.includes(p.id)),
    [players, selectedPlayers]
  );

  /**
   * ✅ Armado de parejas (2vs2):
   * - Si seeded = true: balancea por nivel (mejor con peor)
   * - Si seeded = false: aleatorio
   */
  const buildTeams = (): Team[] => {
    if (selectedPlayerObjs.length < 4) return [];
    if (selectedPlayerObjs.length % 2 !== 0) return [];

    let list = [...selectedPlayerObjs];

    if (seeded) {
      list.sort((a, b) => {
        const la = a.level ?? -1;
        const lb = b.level ?? -1;
        if (la !== lb) return lb - la;
        return a.name.localeCompare(b.name);
      });

      // Balance: mejor con peor
      const teams: Team[] = [];
      let i = 0;
      let j = list.length - 1;
      while (i < j) {
        teams.push({ a: list[i].id, b: list[j].id });
        i++;
        j--;
      }
      return teams;
    }

    // Aleatorio (determinista para que preview y generación coincidan)
    list = shuffleArray(list, createSeededRandom(pairingSeed));
    const teams: Team[] = [];
    for (let i = 0; i < list.length; i += 2) {
      teams.push({ a: list[i].id, b: list[i + 1].id });
    }
    return teams;
  };

  const teamsPreview = useMemo(() => buildTeams(), [selectedPlayerObjs, seeded, pairingSeed]);

  const formatLabel = (f: Format) => {
    if (f === "liga") return "Liga (todos contra todos)";
    if (f === "grupos") return "Grupos";
    return "Eliminación directa";
  };

  /* 🧠 Generar partidos (SIEMPRE 2vs2) */
  const generateMatches = async () => {
    // Reglas 2vs2
    if (selectedPlayers.length < 4) {
      toast.error("Selecciona al menos 4 jugadores (2 parejas)");
      return;
    }
    if (selectedPlayers.length % 2 !== 0) {
      toast.error("Para 2vs2 necesitás un número PAR de jugadores (se arman parejas)");
      return;
    }

    if (rounds.length > 0 && !selectedRound) {
      toast.error("Selecciona la jornada donde querés generar los partidos");
      return;
    }

    if (!startDate && !selectedRound?.start_at) {
      toast.error("Selecciona la fecha de inicio del torneo");
      return;
    }

    if (!tournamentId || Number.isNaN(tournamentId)) {
      toast.error("ID de torneo inválido");
      return;
    }

    // Validaciones específicas
    if (format === "grupos") {
      if (groupsCount < 2) {
        toast.error("La cantidad de grupos debe ser al menos 2");
        return;
      }
      // grupos no puede ser mayor que cantidad de PAREJAS
      const teamsCount = teamsPreview.length;
      if (groupsCount > Math.max(2, teamsCount)) {
        toast.error("La cantidad de grupos no puede ser mayor que la cantidad de parejas");
        return;
      }
    }

    const teams = teamsPreview;
    if (teams.length < 2) {
      toast.error("No se pudieron armar parejas. Revisa la selección de jugadores.");
      return;
    }

    setCreating(true);

    // 🔎 Traer partidos existentes para evitar duplicados (por parejas)
    const { data: existingMatches, error: existingError } = await supabase
      .from("matches")
      .select("player_1_a, player_2_a, player_1_b, player_2_b, tournament_id")
      .eq("tournament_id", tournamentId);

    if (existingError) {
      console.error(existingError);
      toast.error("No se pudieron leer los partidos existentes");
      setCreating(false);
      return;
    }

    const existingMatchups = new Set<string>();
    (existingMatches || []).forEach((m: any) => {
      const a1 = m.player_1_a as number | null;
      const a2 = m.player_2_a as number | null;
      const b1 = m.player_1_b as number | null;
      const b2 = m.player_2_b as number | null;
      if (a1 == null || a2 == null || b1 == null || b2 == null) return;
      existingMatchups.add(matchupKey({ a: a1, b: a2 }, { a: b1, b: b2 }));
    });

    const matchupExists = (t1: Team, t2: Team) => existingMatchups.has(matchupKey(t1, t2));

    const baseStart = new Date(selectedRound?.start_at || startDate);
    if (Number.isNaN(baseStart.getTime())) {
      toast.error("Fecha inválida");
      setCreating(false);
      return;
    }

    // Para no insertar todo con la misma hora, escalonamos en minutos (opcional pero útil)
    const startAt = (idx: number) => {
      const d = new Date(baseStart);
      d.setMinutes(d.getMinutes() + idx * 5);
      return d.toISOString();
    };

    let newMatches: any[] = [];
    let matchIndex = 0;
    let skippedExisting = 0;

    if (format === "liga") {
      // Liga (todos contra todos) ENTRE PAREJAS
      const leagueRoundName = selectedRound?.round_name || "Liga";
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const t1 = teams[i];
          const t2 = teams[j];
          if (matchupExists(t1, t2)) {
            skippedExisting++;
            continue;
          }

          newMatches.push({
            tournament_id: tournamentId,
            round_name: leagueRoundName,
            player_1_a: t1.a,
            player_2_a: t1.b,
            player_1_b: t2.a,
            player_2_b: t2.b,
            start_time: startAt(matchIndex++),
            score: null,
            winner: null,
            place: null,
          });

          // Ida y vuelta en liga (si querés, lo dejamos sólo para grupos; acá NO)
        }
      }
    }

    if (format === "grupos") {
      const shuffledTeams = shuffleArray(teams, createSeededRandom(pairingSeed + 1));
      const groups: Team[][] = Array.from({ length: groupsCount }, () => []);
      shuffledTeams.forEach((t, idx) => {
        groups[idx % groupsCount].push(t);
      });

      groups.forEach((groupTeams, idx) => {
        const baseGroupName = `Grupo ${String.fromCharCode(65 + idx)}`;
        const groupName = selectedRound
          ? `${selectedRound.round_name} - ${baseGroupName}`
          : baseGroupName;

        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            const t1 = groupTeams[i];
            const t2 = groupTeams[j];
            if (matchupExists(t1, t2)) {
              skippedExisting++;
              continue;
            }

            newMatches.push({
              tournament_id: tournamentId,
              round_name: groupName,
              player_1_a: t1.a,
              player_2_a: t1.b,
              player_1_b: t2.a,
              player_2_b: t2.b,
              start_time: startAt(matchIndex++),
              score: null,
              winner: null,
              place: null,
            });

            if (roundTrip) {
              newMatches.push({
                tournament_id: tournamentId,
                round_name: groupName,
                player_1_a: t2.a,
                player_2_a: t2.b,
                player_1_b: t1.a,
                player_2_b: t1.b,
                start_time: startAt(matchIndex++),
                score: null,
                winner: null,
                place: null,
              });
            }
          }
        }
      });
    }

    if (format === "eliminacion") {
      // Eliminación directa ENTRE PAREJAS
      // Necesita cantidad de parejas potencia de 2. Si no, agregamos BYE (parejas libres) a nivel bracket.

      let elimTeams = [...teams];

      // Seed automático: ordena parejas por suma de niveles (o por nivel alto/alto), simple:
      // Como los jugadores ya vienen armados, hacemos ranking por (nivelA + nivelB) desc
      if (seeded) {
        const levelMap = new Map<number, number>();
        players.forEach((p) => levelMap.set(p.id, p.level ?? -1));

        elimTeams.sort((t1, t2) => {
          const s1 = (levelMap.get(t1.a) ?? -1) + (levelMap.get(t1.b) ?? -1);
          const s2 = (levelMap.get(t2.a) ?? -1) + (levelMap.get(t2.b) ?? -1);
          if (s1 !== s2) return s2 - s1;
          return teamKey(t1).localeCompare(teamKey(t2));
        });
      } else {
        elimTeams = shuffleArray(elimTeams, createSeededRandom(pairingSeed + 2));
      }

      const n = elimTeams.length;
      const nextPow2 = isPowerOfTwo(n) ? n : nextPowerOfTwo(n);
      const byesNeeded = nextPow2 - n;

      // “BYE” en eliminación: equipos que pasan de ronda sin jugar.
      // En vez de insertar partidos con nulls, simplemente dejamos equipos sin rival.
      // Para la primera ronda, emparejamos en espejo y saltamos los que no tengan rival.
      const eliminationBaseRoundName = ROUND_NAMES[nextPow2] || `Ronda de ${nextPow2}`;
      const roundName = selectedRound
        ? `${selectedRound.round_name} - ${eliminationBaseRoundName}`
        : eliminationBaseRoundName;

      // Armamos una grilla con huecos (BYE)
      const slots: (Team | null)[] = [...elimTeams];
      for (let i = 0; i < byesNeeded; i++) slots.push(null);

      const half = slots.length / 2;
      for (let i = 0; i < half; i++) {
        const t1 = slots[i];
        const t2 = slots[slots.length - 1 - i];
        if (!t1 || !t2) continue; // BYE => no se crea partido
        if (matchupExists(t1, t2)) {
          skippedExisting++;
          continue;
        }

        newMatches.push({
          tournament_id: tournamentId,
          round_name: roundName,
          player_1_a: t1.a,
          player_2_a: t1.b,
          player_1_b: t2.a,
          player_2_b: t2.b,
          start_time: startAt(matchIndex++),
          score: null,
          winner: null,
          place: null,
        });
      }
    }

    if (newMatches.length === 0) {
      toast.error("No hay nuevos partidos para generar");
      setCreating(false);
      return;
    }

    // ➕ Insertar partidos
    const { data: createdMatches, error: insertError } = await supabase
      .from("matches")
      .insert(newMatches)
      .select("id");

    if (insertError) {
      console.error("SUPABASE INSERT ERROR:", insertError);
      toast.error(insertError.message || "Error al generar partidos");
      setCreating(false);
      return;
    }

    // Notificar a los jugadores de los partidos creados
    if (createdMatches && createdMatches.length > 0) {
      notifyMatchCreated(createdMatches.map((m: { id: number }) => m.id));
    }

    // 🧾 Insertar log de acción (no bloquea si falla)
    await supabase.from("action_logs").insert({
      action: "GENERATE_MATCHES",
      entity: "tournament",
      entity_id: tournamentId,
      metadata: {
        formato: format,
        grupos: format === "grupos" ? groupsCount : null,
        ida_vuelta: format === "grupos" ? roundTrip : null,
        seed: seeded,
        jugadores: selectedPlayers.length,
        parejas: teams.length,
        partidos_creados: newMatches.length,
        start_date: startDate,
      },
    });

    toast.success(
      skippedExisting > 0
        ? `Se generaron ${newMatches.length} partidos (2vs2). ${skippedExisting} cruces ya existían y se omitieron.`
        : `Se generaron ${newMatches.length} partidos (2vs2)`
    );
    setCreating(false);
    router.push(`/tournaments/edit/${id}`);
  };

  const isOddPlayers = selectedPlayers.length % 2 !== 0;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Generar partidos</h1>

      <Card>
        <div className="space-y-6">
          {rounds.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Jornada</label>
              <select
                value={selectedRoundId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedRoundId(nextId);
                  const round = rounds.find((item) => String(item.id) === nextId);
                  if (round) setStartDate(round.start_at.slice(0, 10));
                }}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Seleccionar jornada</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {`${round.round_name} · ${new Date(round.start_at).toLocaleString("es-ES", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Madrid",
                    })}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Formato */}
          <div>
            <label className="block text-sm font-medium mb-1">Formato</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="liga">Liga (todos contra todos)</option>
              <option value="grupos">Grupos</option>
              <option value="eliminacion">Eliminación directa</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Todos los formatos generan partidos <b>2vs2</b> (se arman parejas automáticamente).
            </p>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Fecha de inicio del torneo
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Necesaria porque <code>start_time</code> en <code>matches</code> no permite NULL.
            </p>
          </div>

          {/* Armado de parejas */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="seededPairs"
              checked={seeded}
              onChange={(e) => setSeeded(e.target.checked)}
              className="accent-green-600"
            />
            <label htmlFor="seededPairs" className="select-none">
              Armar parejas por nivel (balanceadas)
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {seeded
                ? "Con parejas por nivel no se rearman manualmente."
                : "La generación usará exactamente las parejas que ves en la vista previa."}
            </p>
            <button
              type="button"
              onClick={() => setPairingSeed((prev) => (prev + 1) % 2147483647)}
              disabled={seeded}
              className={`px-3 py-2 text-xs rounded-md border border-gray-300 ${
                seeded ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
              }`}
              title={seeded ? "Disponible solo en modo aleatorio" : "Generar una nueva combinación aleatoria"}
            >
              Rearmar parejas
            </button>
          </div>

          {/* Opciones según formato */}
          {format === "grupos" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Cantidad de grupos (por parejas)
                </label>
                <input
                  type="number"
                  min={2}
                  max={Math.max(2, Math.floor(selectedPlayers.length / 2) || 2)}
                  value={groupsCount}
                  onChange={(e) => setGroupsCount(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="roundTrip"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                  className="accent-green-600"
                />
                <label htmlFor="roundTrip" className="select-none">
                  Ida y vuelta
                </label>
              </div>
            </div>
          )}

          {/* Jugadores */}
          <div>
            <p className="font-medium mb-2">Seleccionar jugadores</p>

            <div className="max-h-64 overflow-y-auto border rounded p-3 space-y-2">
              {loading ? (
                <p className="text-gray-500">Cargando jugadores...</p>
              ) : players.length === 0 ? (
                <p className="text-gray-500">No hay jugadores disponibles.</p>
              ) : (
                players.map((player) => (
                  <label
                    key={player.id}
                    className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition
                      ${
                        selectedPlayers.includes(player.id)
                          ? "bg-green-50 border-green-500"
                          : "bg-white border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-green-600"
                      checked={selectedPlayers.includes(player.id)}
                      onChange={() => togglePlayer(player.id)}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {player.name}
                    </span>
                  </label>
                ))
              )}
            </div>

            {isOddPlayers && (
              <p className="text-yellow-600 text-sm mt-2">
                Para 2vs2 necesitás un número <b>PAR</b> de jugadores (se arman parejas).
              </p>
            )}

            <p className="text-sm text-gray-500 mt-2">
              Jugadores seleccionados: {selectedPlayers.length}
            </p>
            <p className="text-sm text-gray-500">
              Parejas estimadas: {Math.floor(selectedPlayers.length / 2)}
            </p>
          </div>

          {/* Preview de parejas */}
          <div>
            <p className="font-medium mb-2">Vista previa de parejas</p>
            {selectedPlayers.length < 4 ? (
              <p className="text-gray-500 text-sm">Selecciona al menos 4 jugadores para armar parejas.</p>
            ) : selectedPlayers.length % 2 !== 0 ? (
              <p className="text-gray-500 text-sm">Falta 1 jugador para poder armar parejas.</p>
            ) : (
              <div className="border rounded p-3 space-y-2">
                {teamsPreview.map((t, idx) => {
                  const pA = players.find((p) => p.id === t.a)?.name || `ID ${t.a}`;
                  const pB = players.find((p) => p.id === t.b)?.name || `ID ${t.b}`;
                  return (
                    <div key={idx} className="text-sm">
                      <span className="font-semibold">Pareja {idx + 1}:</span> {pA} + {pB}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Formato seleccionado: <b>{formatLabel(format)}</b>
            </p>
          </div>

          <button
            onClick={generateMatches}
            disabled={creating}
            className="bg-green-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {creating ? "Generando partidos..." : "Generar partidos"}
          </button>
        </div>
      </Card>
    </main>
  );
}
