"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import Card from '../../../components/Card';
import toast from 'react-hot-toast'; 
import { useRole } from '../../../hooks/useRole';


export default function EditMatch() {
  const router = useRouter();
  const params = useParams();
  const matchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const matchIdNum = Number(matchId);

  const { role } = useRole();

  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const FRIENDLY_VALUE = "__friendly__";
  const [players, setPlayers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('details'); // Nuevo estado para pestañas

  const [formData, setFormData] = useState({
    tournament_id: FRIENDLY_VALUE,
    round_name: '',
    player_1_a: '', 
    player_2_a: '', 
    player_1_b: '', 
    player_2_b: '',
    place: '',
    court: '',
    start_time: '',
    winner: 'pending',
    score: ''
  });

// --- CARGA DE DATOS (partido existente, jugadores y torneos) ---
  useEffect(() => {
    if (!matchIdNum || Number.isNaN(matchIdNum)) {
      toast.error('ID de partido inválido. Revisá la ruta /matches/edit/[id].');
      router.push('/matches');
      setLoading(false);
      return;
    }
    const loadData = async () => {
      // 1. Carregar Tornejos i Jugadors
      const { data: tourns } = await supabase.from('tournaments').select('id, name, category').order('created_at', { ascending: false });
      const { data: plyrs } = await supabase
        .from('players')
        .select('id, name, level, is_approved')
        .order('name');
      
      if (tourns) setTournaments(tourns);
      if (plyrs) setPlayers(plyrs);

      // 2. Carregar Dades del Partit existent
      const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select(`*`) // Select all columns for editing
          .eq('id', matchIdNum)
          .single();

      if (matchError) {
          console.error('Error cargando partido:', matchError);
          toast.error('Error cargando datos del partido.');
          setLoading(false);
          return;
      }
      
      if (matchData) {
          // Fill form data with existing match values (converting IDs to string for select inputs)
          setFormData({
              tournament_id: matchData.tournament_id ? String(matchData.tournament_id) : FRIENDLY_VALUE,
              round_name: matchData.round_name || '',
              // Player IDs must be strings for the select input's value prop, and safe for null
              player_1_a: matchData.player_1_a ? String(matchData.player_1_a) : '',
              player_2_a: matchData.player_2_a ? String(matchData.player_2_a) : '',
              player_1_b: matchData.player_1_b ? String(matchData.player_1_b) : '',
              player_2_b: matchData.player_2_b ? String(matchData.player_2_b) : '',
              place: matchData.place || '',
              court: matchData.court ? String(matchData.court) : '',
              // Format date/time string correctly for datetime-local input (removes timezone info)
              start_time: matchData.start_time ? matchData.start_time.substring(0, 16) : '', 
              winner: matchData.winner || 'pending',
              score: matchData.score || '',
          });
      }

      setLoading(false);
    };
    loadData();
  }, [matchIdNum, router]);


  // --- MANEJO DEL ENVÍO (LÓGICA DE ACTUALIZACIÓN) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const selectedPlayers = [formData.player_1_a, formData.player_2_a, formData.player_1_b, formData.player_2_b];
    const activePlayers = selectedPlayers.filter(p => p !== "");
    const uniquePlayers = new Set(activePlayers);

    if (uniquePlayers.size !== activePlayers.length) {
        toast.error("⛔ ERROR: Has seleccionado el mismo jugador más de una vez.");
        setLoading(false);
        return;
    }
    
    if (activePlayers.length < 3) {
        toast.error("Se deben seleccionar al menos 3 jugadores.");
        setLoading(false);
        return;
    }
    
    const isValidScore = (score: string) => {
      if (!score) return true; // permitir sin resultado
      const sets = score.split(' ');
      if (sets.length > 3) return false;

      return sets.every(set => {
        const [a, b] = set.split('-').map(Number);
        if (isNaN(a) || isNaN(b)) return false;
        if (a < 6 && b < 6) return false;
        if (Math.abs(a - b) < 2 && a < 7 && b < 7) return false;
        if (a > 7 || b > 7) return false;
        return true;
      });
    };

    if (!isValidScore(formData.score)) {
      toast.error('❌ Resultado inválido según reglamento de pádel');
      setLoading(false);
      return;
    }
    
    // Prepare data for UPDATE
    const updateData = {
        tournament_id:
          formData.tournament_id === FRIENDLY_VALUE || !formData.tournament_id
            ? null
            : Number(formData.tournament_id),
        round_name:
          formData.tournament_id === FRIENDLY_VALUE ? null : (formData.round_name || null),
        place: formData.place,
        court: formData.court,
        start_time: formData.start_time ? new Date(formData.start_time).toISOString() : null,
        winner: formData.winner, 
        score: formData.score || null,
        
        // Convert player IDs from string (from select) to BIGINT (number)
        player_1_a: formData.player_1_a ? Number(formData.player_1_a) : null,
        player_2_a: formData.player_2_a ? Number(formData.player_2_a) : null,
        player_1_b: formData.player_1_b ? Number(formData.player_1_b) : null,
        player_2_b: formData.player_2_b ? Number(formData.player_2_b) : null,
    };


    const { error } = await supabase
      .from('matches')
      .update(updateData) // Use update instead of insert
      .eq('id', matchIdNum); // CRUCIAL: Filter by ID

    if (error) {
        toast.error('Error en actualitzar: ' + error.message);
        setLoading(false);
    } else {
        toast.success('¡Partido actualizado correctamente!');
        router.push('/matches');
        router.refresh();
    }
    setLoading(false);
  };

  const PlayerSelect = ({ label, value, onChange }: any) => (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{label}</label>
      <select 
        className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar...</option>
        {players.map(p => (
          <option key={p.id} value={String(p.id)}>
            {p.name} (Niv {p.level}){p.is_approved === false ? " · Pendiente" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  if (loading) {
    return (
        <main className="flex-1 overflow-y-auto p-8">
            <p className="text-gray-500 animate-pulse">Cargando datos de edición del partido...</p>
        </main>
    );
  }

  if (!matchIdNum) {
    return null;
  }

  return (
    <main className="flex-1 overflow-y-auto p-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Editar Partido ID: {matchId}</h2>

        {role === 'user' && (
          <p className="text-sm text-red-600 font-semibold mb-4">
            Solo administradores o managers pueden editar partidos
          </p>
        )}

        <Card className="max-w-4xl mx-auto p-6 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* NAV TABS */}
                <div className="flex border-b border-gray-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('details')}
                        className={`py-2 px-4 text-sm font-semibold transition-colors duration-200 border-b-2
                            ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Detalles y horario
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('players')}
                        className={`py-2 px-4 text-sm font-semibold transition-colors duration-200 border-b-2
                            ${activeTab === 'players' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Selección de jugadores
                    </button>
                </div>


                {/* TAB CONTENT: DETALLS I HORARI */}
                {activeTab === 'details' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50 p-6 rounded-lg border border-blue-100">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-blue-800 mb-1">Torneo</label>
                                <select 
                                    className="w-full p-3 border border-blue-300 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.tournament_id}
                                    onChange={(e) => setFormData({...formData, tournament_id: e.target.value})}
                                >
                                    <option value={FRIENDLY_VALUE}>Partido Amistoso</option>
                                    <option value="">-- Selecciona un torneo --</option>
                                    {tournaments.map(t => (
                                        <option key={t.id} value={String(t.id)}>{t.name} - {t.category}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {/* Ronda i Hora */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ronda / Fase</label>
                                <input
                                  type="text"
                                  required={formData.tournament_id !== FRIENDLY_VALUE}
                                  disabled={formData.tournament_id === FRIENDLY_VALUE}
                                  placeholder={formData.tournament_id === FRIENDLY_VALUE ? "(Opcional en amistosos)" : "Ej: Octavos de Final"}
                                  className="w-full p-2 border border-gray-300 rounded"
                                  value={formData.round_name}
                                  onChange={(e) => setFormData({...formData, round_name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora</label>
                                <input type="datetime-local" required className="w-full p-2 border border-gray-300 rounded" value={formData.start_time} onChange={(e) => setFormData({...formData, start_time: e.target.value})} />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Resultado</label>
                              <input
                                type="text"
                                placeholder="Ej: 6-4 6-3"
                                className="w-full p-2 border border-gray-300 rounded"
                                value={formData.score}
                                onChange={(e) => setFormData({ ...formData, score: e.target.value })}
                              />
                            </div>
                            
                            {/* Lloc i Pista */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Lugar</label>
                                <input type="text" placeholder="Ej: Club Padel Central" className="w-full p-2 border border-gray-300 rounded" value={formData.place} onChange={(e) => setFormData({...formData, place: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número de pista</label>
                                <input type="text" placeholder="Ej: Pista 4" className="w-full p-2 border border-gray-300 rounded" value={formData.court} onChange={(e) => setFormData({...formData, court: e.target.value})} />
                            </div>
                        </div>

                        {/* Estado adicional */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <p className="text-sm font-medium text-gray-700 mb-2">Estado del partido: <span className="font-bold">{formData.winner === 'pending' ? 'PENDIENTE' : 'FINALIZADO'}</span></p>
                        </div>
                    </div>
                )}


                {/* TAB CONTENT: SELECCIÓ DE JUGADORS */}
                {activeTab === 'players' && (
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                        {/* PARELLA 1 */}
                        <div className="flex-1 w-full bg-gray-50 p-5 rounded-xl border-l-4 border-l-blue-500 shadow-sm">
                            <h3 className="font-bold text-blue-700 mb-4 border-b pb-2">PAREJA 1</h3>
                            <div className="space-y-4">
                                <PlayerSelect label="Jugador 1 (Reves)" value={formData.player_1_a} onChange={(val: string) => setFormData({...formData, player_1_a: val})} />
                                <PlayerSelect label="Jugador 2 (Drive)" value={formData.player_2_a} onChange={(val: string) => setFormData({...formData, player_2_a: val})} />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-gray-300 italic hidden md:block">VS</div>
                        
                        {/* PARELLA 2 */}
                        <div className="flex-1 w-full bg-gray-50 p-5 rounded-xl border-r-4 border-r-red-500 shadow-sm text-right">
                            <h3 className="font-bold text-red-700 mb-4 border-b pb-2">PAREJA 2</h3>
                            <div className="space-y-4">
                                <PlayerSelect label="Jugador 1 (Reves)" value={formData.player_1_b} onChange={(val: string) => setFormData({...formData, player_1_b: val})} />
                                <PlayerSelect label="Jugador 2 (Drive)" value={formData.player_2_b} onChange={(val: string) => setFormData({...formData, player_2_b: val})} />
                            </div>
                        </div>
                    </div>
                )}

                {/* BOTONS FINALS */}
                <div className="flex gap-4 pt-6 border-t">
                    <button type="button" onClick={() => router.back()} className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
                    <button type="submit" disabled={loading || role === 'user'} className="flex-1 px-6 py-3 text-white bg-green-600 rounded hover:bg-green-700 font-bold text-lg shadow-lg">
                        {loading ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>
            </form>
        </Card>
    </main>
  );
}