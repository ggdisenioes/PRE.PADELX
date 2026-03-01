'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useRole } from '../../hooks/useRole';
import Card from '../../components/Card';
import { formatDateTimeMadrid } from '@/lib/dates';
import { useTranslation } from '@/i18n';

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
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold">{t("matches.friendlyListTitle")}</h1>

        {(isAdmin || isManager) && (
          <Link
            href="/matches/friendly/create"
            className="btn-primary"
          >
            ➕ {t("matches.createFriendly")}
          </Link>
        )}
      </div>

      {loading && <p>{t("matches.loading")}</p>}

      {!loading && matches.length === 0 && (
        <p className="text-gray-500">{t("matches.noFriendlyMatches")}</p>
      )}

      <div className="grid gap-4">
        {matches.map(match => (
          <Card key={match.id} title={t("matches.friendlyCardTitle", { id: match.id })}>
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div>
                <p className="font-semibold">
                  {match.player_1_a?.name} / {match.player_2_a?.name}
                  {' '}vs{' '}
                  {match.player_1_b?.name} / {match.player_2_b?.name}
                </p>

                <p className="text-sm text-gray-500">
                  {formatDateTimeMadrid(match.start_time)}
                  {match.place && ` · ${match.place}`}
                  {match.court && ` · Pista ${match.court}`}
                </p>

                {match.score && (
                  <p className="mt-1 text-sm">
                    {t("matches.score")}: <strong>{match.score}</strong>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {(isAdmin || isManager) && (
                  <Link
                    href={`/matches/edit/${match.id}`}
                    className="btn-secondary"
                  >
                    {t("common.edit")}
                  </Link>
                )}

                {(isAdmin || isManager) && (
                  <Link
                    href={`/matches/score/${match.id}`}
                    className="btn-primary"
                  >
                    {t("matches.loadResult")}
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
