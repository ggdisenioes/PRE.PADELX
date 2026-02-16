"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter, useParams } from "next/navigation";
import Card from "../../../components/Card";
import Link from "next/link";
import { useRole } from "../../../hooks/useRole";
import MatchCard from "../../../components/matches/MatchCard";
import toast from "react-hot-toast";
import MatchShareCard from "../../../components/matches/MatchShareCard";

export default function EditTournament() {
  const router = useRouter();
  const params = useParams();

  const idNumber = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    start_date: "",
    status: "abierto",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isAdmin, isManager } = useRole();
  const [matches, setMatches] = useState<any[]>([]);
  const [playersMap, setPlayersMap] = useState<Record<number, string>>({});
  const [openResultMatch, setOpenResultMatch] = useState<any | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Cargar datos del torneo y partidos
  useEffect(() => {
    const getTournamentAndMatches = async () => {
      if (!idNumber || isNaN(idNumber)) {
        setErrorMsg("ID de torneo inválido");
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("tournaments")
          .select("*")
          .eq("id", idNumber)
          .single();

        if (error) {
          console.error("Error cargando torneo:", error);
          setErrorMsg("Error cargando torneo");
          setLoading(false);
          return;
        }

        if (data) {
          setFormData({
            name: data.name || "",
            category: data.category || "",
            start_date: data.start_date ? data.start_date.split("T")[0] : "",
            status: data.status || "abierto",
          });
        }
      } catch (err) {
        console.error("Excepción al cargar torneo:", err);
        setErrorMsg("Error inesperado cargando torneo");
        setLoading(false);
        return;
      }

      try {
        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select(`
            id, tournament_id, round_name, place, court, start_time, score, winner,
            player_1_a, player_2_a, player_1_b, player_2_b,
            p1a:players!matches_player_1_a_fkey(id,name),
            p2a:players!matches_player_2_a_fkey(id,name),
            p1b:players!matches_player_1_b_fkey(id,name),
            p2b:players!matches_player_2_b_fkey(id,name)
          `)
          .eq("tournament_id", idNumber)
          .order("start_time", { ascending: true });

        if (matchesError) {
          console.error("Error cargando partidos del torneo:", matchesError);
          setMatches([]);
        } else {
          const normalized = (matchesData ?? []).map((m: any) => ({
            ...m,
            // Pasamos a MatchCard valores que pueden ser number o {id,name}. Preferimos el objeto si está.
            player_1_a: m.p1a ?? m.player_1_a,
            player_2_a: m.p2a ?? m.player_2_a,
            player_1_b: m.p1b ?? m.player_1_b,
            player_2_b: m.p2b ?? m.player_2_b,
          }));

          setMatches(normalized);

          const map: Record<number, string> = {};
          normalized.forEach((mm: any) => {
            const vals = [mm.player_1_a, mm.player_2_a, mm.player_1_b, mm.player_2_b];
            vals.forEach((v: any) => {
              if (v && typeof v === "object" && typeof v.id === "number" && typeof v.name === "string") {
                map[v.id] = v.name;
              }
            });
          });
          setPlayersMap(map);
        }
      } catch (err) {
        console.error("Excepción al cargar partidos:", err);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    };

    getTournamentAndMatches();
  }, [idNumber]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!idNumber || isNaN(idNumber)) {
      alert("ID de torneo inválido");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("tournaments")
      .update({
        name: formData.name,
        category: formData.category,
        start_date: formData.start_date,
        status: formData.status,
      })
      .eq("id", idNumber);

    if (error) {
      console.error("Error UPDATE tournaments:", error);
      alert("Error al actualizar: " + (error.message || "Error desconocido"));
      setLoading(false);
    } else {
      router.push("/tournaments");
      router.refresh();
    }
  };

  const handleDeleteMatch = async (matchId: number) => {
    if (!confirm("¿Eliminar este partido?")) return;

    const { error } = await supabase
      .from("matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      alert("Error eliminando partido");
    } else {
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    }
  };

  const isPlayed = (m: any) =>
    !!m?.score && !!m?.winner && String(m.winner).toLowerCase() !== "pending";

  const formatScoreForDisplay = (raw: string | null) => {
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
  };

  const buildTeamName = (p1?: any, p2?: any) => {
    const a = p1?.name ? p1.name : "";
    const b = p2?.name ? p2.name : "";
    const joined = [a, b].filter(Boolean).join(" / ");
    return joined || "Por definir";
  };

  const getWinnerLoserTeams = (m: any) => {
    const teamA = buildTeamName(m.player_1_a, m.player_2_a);
    const teamB = buildTeamName(m.player_1_b, m.player_2_b);
    const score = formatScoreForDisplay(m.score);

    if (m.winner === "A") return { winnerTeam: teamA, loserTeam: teamB, score };
    if (m.winner === "B") return { winnerTeam: teamB, loserTeam: teamA, score };
    return { winnerTeam: teamA, loserTeam: teamB, score };
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20">
      {loading ? (
        <p className="text-gray-600">Cargando torneo...</p>
      ) : errorMsg ? (
        <p className="text-red-600 font-semibold">{errorMsg}</p>
      ) : (
        <Card className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-4">Editar torneo</h2>

          <form onSubmit={handleUpdate} className="space-y-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded outline-none"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded outline-none"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              >
                <option value="">Selecciona una categoría</option>
                <option value="1ra Categoría">1ra Categoría</option>
                <option value="2da Categoría">2da Categoría</option>
                <option value="3ra Categoría">3ra Categoría</option>
                <option value="Mixto A">Mixto A</option>
                <option value="Mixto B">Mixto B</option>
              </select>
            </div>

            {/* Estado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded outline-none"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
              >
                <option value="abierto">Abierto (Inscripciones)</option>
                <option value="en_curso">En Curso</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de inicio
              </label>
              <input
                type="date"
                className="w-full p-2 border border-gray-300 rounded outline-none"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
              />
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => router.push("/tournaments")}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700"
              >
                Guardar cambios
              </button>
            </div>
          </form>

          <hr className="my-8" />

          <h3 className="text-xl font-bold mb-4">Partidos del Torneo</h3>

          {(isAdmin || isManager) && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => router.push(`/matches/create/manual?tournament=${idNumber}`)}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-green-700 transition"
              >
                + Crear partido
              </button>

              <button
                type="button"
                onClick={() => router.push(`/matches/create/random?tournament=${idNumber}`)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 transition"
              >
                Crear partidos aleatorios
              </button>
            </div>
          )}

          {matches.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay partidos asociados a este torneo.</p>
          ) : (
            <div className="space-y-4">
              {matches.map((m) => (
                <div key={m.id} className="space-y-3">
                  <div onClick={() => setOpenResultMatch(m)} className="cursor-pointer">
                    <MatchCard match={m} playersMap={playersMap} showActions={false} />
                  </div>

                  <div className="flex justify-end gap-2">
                    {(isAdmin || isManager) && (
                      <>
                        <Link
                          href={`/matches/edit/${m.id}`}
                          className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                        >
                          Editar partido
                        </Link>

                        <Link
                          href={`/matches/score/${m.id}`}
                          className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                        >
                          Editar resultado
                        </Link>
                      </>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteMatch(m.id)}
                        className="px-3 py-1 rounded-md bg-red-100 text-red-700 text-sm hover:bg-red-200"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Render oculto para generar imagen (Instagram 1:1) */}
      <div style={{ position: "fixed", top: -9999, left: -9999, pointerEvents: "none", opacity: 0 }}>
        {openResultMatch && isPlayed(openResultMatch) && (
          <div ref={shareCardRef}>
            {(() => {
              const t = getWinnerLoserTeams(openResultMatch);
              return (
                <MatchShareCard
                  winnerTeam={t.winnerTeam}
                  loserTeam={t.loserTeam}
                  score={t.score}
                />
              );
            })()}
          </div>
        )}
      </div>

      {openResultMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-[#0F172A] w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 relative text-white">
            <button
              onClick={() => setOpenResultMatch(null)}
              className="absolute top-3 right-3 text-white/60 hover:text-white"
            >
              ✕
            </button>

            {/* LOGO */}
            <div className="flex flex-col items-center gap-1">
              <img
                src="/logo.svg"
                alt="DEMO Padel Manager"
                className="h-8 w-auto object-contain"
              />
              <span className="text-xs tracking-widest text-green-400">
                PADEL MANAGER
              </span>
            </div>

            {/* RESULT */}
            <div className="text-center space-y-2 mt-4">
              {isPlayed(openResultMatch) ? (
                <>
                  <p className="text-lg font-semibold">
                    {openResultMatch.winner === "A"
                      ? buildTeamName(openResultMatch.player_1_a, openResultMatch.player_2_a)
                      : buildTeamName(openResultMatch.player_1_b, openResultMatch.player_2_b)}
                  </p>

                  <p className="text-5xl font-extrabold my-2">
                    {formatScoreForDisplay(openResultMatch.score)}
                  </p>

                  <p className="text-sm text-white/70">
                    {openResultMatch.winner === "A"
                      ? buildTeamName(openResultMatch.player_1_b, openResultMatch.player_2_b)
                      : buildTeamName(openResultMatch.player_1_a, openResultMatch.player_2_a)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/60">Resultado todavía no cargado</p>
              )}
            </div>

            {/* BOTONES PRO */}
            <div className="space-y-2">
              <button
                disabled={!isPlayed(openResultMatch)}
                onClick={async () => {
                  if (!isPlayed(openResultMatch)) return;
                  if (!shareCardRef.current) {
                    toast.error("No se pudo generar la imagen");
                    return;
                  }

                  try {
                    const { toPng } = await import("html-to-image");
                    const dataUrl = await toPng(shareCardRef.current, {
                      cacheBust: true,
                      pixelRatio: 2,
                      backgroundColor: "#020617",
                    });

                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const file = new File([blob], "resultado-padelx-qa.png", { type: "image/png" });

                    if (navigator.share) {
                      try {
                        await navigator.share({
                          files: [file],
                          title: "Resultado del partido",
                          text: "Resultado DEMO Padel Manager",
                        });
                        toast.success("¡Imagen compartida!");
                        return;
                      } catch (err: any) {
                        if (err?.name === "AbortError" || err?.message === "Share canceled") return;
                      }
                    }

                    const a = document.createElement("a");
                    a.href = dataUrl;
                    a.download = "resultado-padelx-qa.png";
                    a.click();
                    toast.success("Imagen descargada");
                  } catch (err) {
                    console.error(err);
                    toast.error("No se pudo generar la imagen");
                  }
                }}
                className={`w-full mt-2 py-2 rounded-xl font-semibold transition ${
                  isPlayed(openResultMatch)
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
              >
                Compartir imagen
              </button>

              <button
                disabled={!isPlayed(openResultMatch)}
                onClick={async () => {
                  if (!isPlayed(openResultMatch)) return;
                  if (!shareCardRef.current) {
                    toast.error("No se pudo generar la imagen");
                    return;
                  }

                  try {
                    const { toPng } = await import("html-to-image");
                    const dataUrl = await toPng(shareCardRef.current, {
                      cacheBust: true,
                      pixelRatio: 2,
                      backgroundColor: "#020617",
                    });

                    const a = document.createElement("a");
                    a.href = dataUrl;
                    a.download = "resultado-padelx-qa.png";
                    a.click();
                    toast.success("Imagen descargada");
                  } catch (err) {
                    console.error(err);
                    toast.error("No se pudo generar la imagen");
                  }
                }}
                className={`w-full py-2 rounded-xl font-semibold transition ${
                  isPlayed(openResultMatch)
                    ? "bg-white/10 hover:bg-white/20 text-white"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}
              >
                Descargar imagen
              </button>

              <p className="text-center text-xs text-white/60">
                Ideal para WhatsApp e Instagram.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}