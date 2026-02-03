'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useRole } from '../../hooks/useRole';
import Card from '../../components/Card';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Match = {
  id: number;
  start_time: string;
  place: string | null;
  court: string | null;
  score: string | null;
  winner: string;
  player_1_a: { name: string } | null;
  player_2_a: { name: string } | null;
  player_1_b: { name: string } | null;
  player_2_b: { name: string } | null;
};

export default function FriendlyMatchesPage() {
  const { role } = useRole();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === 'admin';
  const isManager = role === 'manager';

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    setLoading(true);

    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        start_time,
        place,
        court,
        score,
        winner,
        player_1_a:players!matches_player_1_a_fkey(name),
        player_2_a:players!matches_player_2_a_fkey(name),
        player_1_b:players!matches_player_1_b_fkey(name),
        player_2_b:players!matches_player_2_b_fkey(name)
      `)
      .is('tournament_id', null)
      .eq('round_name', 'Amistoso')
      .order('start_time', { ascending: true });

    if (!error && data) {
      setMatches(data as Match[]);
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partidos amistosos</h1>

        {(isAdmin || isManager) && (
          <Link
            href="/matches/friendly/create"
            className="btn-primary"
          >
            ➕ Crear partido amistoso
          </Link>
        )}
      </div>

      {loading && <p>Cargando partidos...</p>}

      {!loading && matches.length === 0 && (
        <p className="text-gray-500">No hay partidos amistosos creados.</p>
      )}

      <div className="grid gap-4">
        {matches.map(match => (
          <Card key={match.id} title={`Amistoso #${match.id}`}>
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <p className="font-semibold">
                  {match.player_1_a?.name} / {match.player_2_a?.name}
                  {' '}vs{' '}
                  {match.player_1_b?.name} / {match.player_2_b?.name}
                </p>

                <p className="text-sm text-gray-500">
                  {new Date(match.start_time).toLocaleString('es-ES')}
                  {match.place && ` · ${match.place}`}
                  {match.court && ` · Pista ${match.court}`}
                </p>

                {match.score && (
                  <p className="mt-1 text-sm">
                    Resultado: <strong>{match.score}</strong>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {(isAdmin || isManager) && (
                  <Link
                    href={`/matches/edit/${match.id}`}
                    className="btn-secondary"
                  >
                    Editar
                  </Link>
                )}

                {(isAdmin || isManager) && (
                  <Link
                    href={`/matches/score/${match.id}`}
                    className="btn-primary"
                  >
                    Cargar resultado
                  </Link>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}