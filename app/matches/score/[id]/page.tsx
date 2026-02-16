"use client";

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRole } from '../../../hooks/useRole';
import { useRouter, useParams } from 'next/navigation';
import Card from '../../../components/Card';
import toast from 'react-hot-toast';
import { logAction } from '../../../lib/audit';
import { formatDateMadrid, formatTimeMadrid } from '@/lib/dates';

export default function ScoreEntryPage() {
    const { isAdmin, isManager, loading: roleLoading } = useRole();
    const router = useRouter();
    const params = useParams();
    const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
    const matchIdNum = Number(matchId);

    const [loading, setLoading] = useState(true);
    const [matchData, setMatchData] = useState<any>(null);
    const [scores, setScores] = useState({
        set1A: '', set1B: '',
        set2A: '', set2B: '',
        set3A: '', set3B: '',
    });
    const [winnerTeam, setWinnerTeam] = useState<'A' | 'B' | null>(null);

    // Determines if the match is 'FINALIZED'
    const isFinished = useMemo(() => matchData?.winner !== 'pending', [matchData]);

    // Helper function to get player names (using fetched JOIN data)
    const getTeamDisplay = (teamLetter: 'A' | 'B') => {
        if (!matchData) return 'Cargando...';

        const p1 = matchData[`player_1_${teamLetter.toLowerCase()}`];
        const p2 = matchData[`player_2_${teamLetter.toLowerCase()}`];
        
        // Verify that the object exists before accessing .name
        const name1 = p1?.name || 'N/A';
        const name2 = p2?.name || 'N/A';
        
        return `${name1} / ${name2}`;
    };

    // --- LOAD LOGIC ---
    useEffect(() => {
        if (!matchIdNum || isNaN(matchIdNum)) return;

        const fetchMatchData = async () => {
            // Load match data and player names (JOIN)
            const { data, error } = await supabase
                .from('matches')
                .select(`
                    id, tournament_id, round_name, start_time, score, winner,
                    player_1_a (name, level), player_2_a (name, level),
                    player_1_b (name, level), player_2_b (name, level)
                `)
                .eq('id', matchIdNum)
                .single();

            if (error) {
                console.error("Error al cargar datos del partido:", error);
                toast.error('Error al cargar datos del partido. Verifique RLS de lectura.', { duration: 4000 });
                router.push('/matches');
                return;
            }

            if (data) { 
                setMatchData(data);
                // Si el partido ya tiene resultado, cargar el estado
                if (data.score) { 
                    const parts = data.score.split(', ');
                    setScores({
                        set1A: parts[0]?.split('-')[0] || '', set1B: parts[0]?.split('-')[1] || '',
                        set2A: parts[1]?.split('-')[0] || '', set2B: parts[1]?.split('-')[1] || '',
                        set3A: parts[2]?.split('-')[0] || '', set3B: parts[2]?.split('-')[1] || '',
                    });
                }
                setWinnerTeam(data.winner === 'A' || data.winner === 'B' ? data.winner : null);
            }
            setLoading(false);
        };

        fetchMatchData();
    }, [matchIdNum, router]);


    if (roleLoading) {
        return (
            <main className="flex-1 overflow-y-auto p-8">
                <p className="text-gray-500 animate-pulse">Cargando permisos…</p>
            </main>
        );
    }

    if (loading || !matchData) {
        return (
            <main className="flex-1 overflow-y-auto p-8">
                <p className="text-gray-500 animate-pulse">Cargando datos del partido...</p>
            </main>
        );
    }

    if (!isAdmin && (!isManager || isFinished)) {
        return (
            <main className="flex-1 overflow-y-auto p-8">
                <h2 className="text-3xl font-bold text-red-600">Acceso Denegado</h2>
                <p className="text-gray-600">
                    Solo administradores o managers pueden cargar resultados.
                </p>
            </main>
        );
    }


    // --- FINALIZE MATCH LOGIC ---
    const handleFinalize = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isFinished && !isAdmin) {
            toast.error('Este partido ya está finalizado.');
            return;
        }

        // 1. Validation: Winner must be selected
        if (!winnerTeam) {
            toast.error('Debe seleccionar al equipo ganador.');
            return;
        }

        const scoreSets = [
            [scores.set1A, scores.set1B],
            [scores.set2A, scores.set2B],
            [scores.set3A, scores.set3B],
        ].filter(([a, b]) => a !== '' && b !== '');

        if (scoreSets.length < 1) {
            toast.error('Debe cargar al menos 1 set.');
            return;
        }

        // 6. VALIDACIÓN REGLAMENTO DE PÁDEL (CRÍTICO)
        for (const [a, b] of scoreSets) {
            const numA = parseInt(a);
            const numB = parseInt(b);

            if (numA < 0 || numB < 0) {
                toast.error('Los juegos no pueden ser negativos.');
                return;
            }

            if (numA > 7 || numB > 7) {
                toast.error('Un set no puede superar los 7 juegos.');
                return;
            }

            const diff = Math.abs(numA - numB);

            const validSet =
                (numA === 6 && numB <= 4) ||
                (numB === 6 && numA <= 4) ||
                (numA === 7 && (numB === 5 || numB === 6)) ||
                (numB === 7 && (numA === 5 || numA === 6));

            if (!validSet) {
                toast.error(`Set inválido: ${numA}-${numB}. Respete el reglamento de pádel.`);
                return;
            }
        }
        
        // 2. Victory Validation (must win more sets)
        let setsWonA = 0;
        let setsWonB = 0;
        
        scoreSets.forEach(([scoreA, scoreB]) => {
            const numA = parseInt(scoreA);
            const numB = parseInt(scoreB);
            if (numA > numB) { setsWonA++; }
            else if (numB > numA) { setsWonB++; }
        });
        
        if (winnerTeam === 'A' && setsWonA < setsWonB) {
            toast.error('El ganador seleccionado (Pareja 1) debe haber ganado más sets que el otro equipo.');
            return;
        }
        if (winnerTeam === 'B' && setsWonB < setsWonA) {
            toast.error('El ganador seleccionado (Pareja 2) debe haber ganado más sets que el otro equipo.');
            return;
        }

        const scoreString = scoreSets.map(([a, b]) => `${a}-${b}`).join(' ');

        setLoading(true);

        // 3. Database Update
        const { error } = await supabase
            .from('matches')
            .update({
                score: scoreString,
                winner: winnerTeam,
            })
            .eq('id', matchIdNum);

        if (error) {
            console.error("Error al actualizar partido (RLS?):", error);
            // Mostrar error específico de RLS si falla
            toast.error(`Error al finalizar el partido: ${error.message}. (Verifique RLS UPDATE en matches).`);
        } else {
            // 📜 AUDITORÍA
            await logAction({
                action: isFinished ? 'EDIT_MATCH_RESULT' : 'SET_MATCH_RESULT',
                entity: 'match',
                entityId: matchIdNum,
                metadata: {
                    score: scoreString,
                    winner: winnerTeam,
                },
            });

            toast.success('Resultado guardado correctamente.');
            router.push('/matches?status=pending');
            router.refresh();
        }
        setLoading(false);
    };

    // --- Componente de Input para Set ---
    const ScoreInput = ({ team, set, game }: { team: 'A' | 'B', set: 1 | 2 | 3, game: 'set' | 'game' }) => {
        const keyA = `set${set}A` as keyof typeof scores;
        const keyB = `set${set}B` as keyof typeof scores;
        const currentKey = team === 'A' ? keyA : keyB;

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value.replace(/[^0-9]/g, ''); // Numbers only
            setScores(prev => ({ ...prev, [currentKey]: val }));
        };

        return (
            <input
                type="text"
                className={`w-16 h-16 text-center text-2xl font-bold border-2 rounded-lg transition-colors 
                            ${winnerTeam === team ? 'border-green-500 bg-green-50' : 'border-gray-300 focus:border-blue-500'}
                            ${isFinished && !isAdmin ? 'bg-gray-200 text-gray-600' : 'bg-white'}`}
                value={scores[currentKey]}
                onChange={handleChange}
                maxLength={2}
                disabled={loading || (isFinished && !isAdmin)}
            />
        );
    };
    

    return (
        <main className="flex-1 overflow-y-auto p-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Carga de Resultado</h2>

            <div className="max-w-4xl mx-auto mb-8 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="mb-4">
                <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                  {matchData.round_name || "Partido"}
                </span>
              </div>

              <div className="grid grid-cols-3 items-center text-center gap-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{getTeamDisplay('A')}</p>
                </div>

                <div className="flex justify-center">
                  <span className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 text-green-700 font-bold">
                    VS
                  </span>
                </div>

                <div>
                  <p className="text-lg font-bold text-gray-900">{getTeamDisplay('B')}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600">
                <div>📅 {formatDateMadrid(matchData.start_time)}</div>
                <div>⏰ {formatTimeMadrid(matchData.start_time)}</div>
              </div>
            </div>

            <Card className="max-w-4xl mx-auto p-6">
                <form onSubmit={handleFinalize} className="space-y-8">
                    
                    {/* ENCABEZADO DE EQUIPOS */}
                    <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
                        <div className="text-center w-1/3">
                            <h3 className="text-lg font-extrabold text-blue-700">PAREJA 1 (A)</h3>
                            <p className="text-sm text-gray-600">{getTeamDisplay('A')}</p>
                        </div>
                        <div className="text-2xl font-black text-gray-400">VS</div>
                        <div className="text-center w-1/3">
                            <h3 className="text-lg font-extrabold text-red-700">PAREJA 2 (B)</h3>
                            <p className="text-sm text-gray-600">{getTeamDisplay('B')}</p>
                        </div>
                    </div>
                    
                    {/* TABLA DE SETS */}
                    <div className="flex flex-col items-center space-y-4">
                        {[1, 2, 3].map((set) => (
                            <div key={set} className="flex items-center gap-6">
                                <ScoreInput team="A" set={set as 1 | 2 | 3} game="set" />
                                <span className="text-gray-500 font-bold w-12 text-center">SET {set}</span>
                                <ScoreInput team="B" set={set as 1 | 2 | 3} game="set" />
                            </div>
                        ))}
                    </div>

                    {/* SELECCIÓN DE GANADOR */}
                    <div className="mt-8 pt-6 border-t-4 border-yellow-200 bg-yellow-50 p-6 rounded-lg text-center">
                        <p className="font-extrabold text-lg text-yellow-800 mb-4">¿QUIÉN HA GANADO EL PARTIDO?</p>
                        <div className="flex justify-center gap-6">
                            <button
                                type="button"
                                onClick={() => setWinnerTeam('A')}
                                className={`px-8 py-3 rounded-lg font-bold text-lg transition shadow ${winnerTeam === 'A' ? 'bg-green-600 text-white shadow-green-400/50' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                                disabled={loading || (isFinished && !isAdmin)}
                            >
                                Pareja 1
                            </button>
                            <button
                                type="button"
                                onClick={() => setWinnerTeam('B')}
                                className={`px-8 py-3 rounded-lg font-bold text-lg transition shadow ${winnerTeam === 'B' ? 'bg-green-600 text-white shadow-green-400/50' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                                disabled={loading || (isFinished && !isAdmin)}
                            >
                                Pareja 2
                            </button>
                        </div>
                    </div>

                    {/* BOTONES FINALES */}
                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => router.back()} className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading || (!winnerTeam) || (isFinished && !isAdmin)} 
                            className={`flex-1 px-6 py-3 text-white rounded font-bold text-lg shadow-lg transition ${isFinished ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            {loading ? 'Guardando...' : isFinished ? 'Actualizar Resultado' : 'Finalizar Partido'}
                        </button>
                    </div>

                </form>
            </Card>
        </main>
    );
}