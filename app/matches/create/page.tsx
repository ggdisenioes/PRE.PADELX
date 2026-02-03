"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Card from '../../components/Card';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Tournament = {
  id: number;
  name: string;
  category: string;
};

export default function CreateMatch() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Cargar Torneos
        const { data: tourns } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
        if (tourns) setTournaments(tourns);
      } catch (err) {
        console.error('Error loading tournaments', err);
      }
    };
    loadData();
  }, []);

  return (
    <main className="flex-1 overflow-y-auto p-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Crear partidos</h2>

        <Card className="max-w-4xl mx-auto p-6">
          <div className="space-y-6">
            <div>
              <label htmlFor="tournament-select" className="block text-sm font-medium text-gray-700 mb-2">Selecciona un torneo</label>
              <select
                id="tournament-select"
                required
                className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedTournamentId ?? ''}
                onChange={(e) => setSelectedTournamentId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Seleccionar...</option>
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <button
                disabled={!selectedTournamentId}
                onClick={() => selectedTournamentId && router.push(`/matches/create/manual?tournament=${selectedTournamentId}`)}
                className={`flex-1 px-6 py-3 text-white rounded font-bold text-lg shadow-lg ${selectedTournamentId ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
              >
                ➕ Crear partidos manualmente
              </button>
              <button
                disabled={!selectedTournamentId}
                onClick={() => selectedTournamentId && router.push(`/matches/create/random?tournament=${selectedTournamentId}`)}
                className={`flex-1 px-6 py-3 text-white rounded font-bold text-lg shadow-lg ${selectedTournamentId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
              >
                🎲 Generar partidos aleatorios
              </button>
            </div>
          </div>
        </Card>
    </main>
  );
}