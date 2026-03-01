-- Phase 1 performance indexes
-- Focus: dashboard alerts, stats listing, matches/ranking reads.

CREATE INDEX IF NOT EXISTS idx_players_tenant_approved
  ON public.players (tenant_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_players_approved_name
  ON public.players (is_approved, name);

CREATE INDEX IF NOT EXISTS idx_tournaments_tenant_name
  ON public.tournaments (tenant_id, name);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_tenant_winner_start_time ON public.matches (tenant_id, winner, start_time)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_tenant_tournament ON public.matches (tenant_id, tournament_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_tenant_created_at ON public.matches (tenant_id, created_at DESC)';
  END IF;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_pending_start_time ON public.matches (start_time) WHERE winner = ''pending''';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_finished_created_at ON public.matches (created_at DESC) WHERE winner IS NOT NULL AND winner <> ''pending''';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_1_a'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_1_a ON public.matches (player_1_a)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_2_a'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_2_a ON public.matches (player_2_a)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_1_b'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_1_b ON public.matches (player_1_b)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_2_b'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_2_b ON public.matches (player_2_b)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_1_a_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_1_a_id ON public.matches (player_1_a_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_2_a_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_2_a_id ON public.matches (player_2_a_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_1_b_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_1_b_id ON public.matches (player_1_b_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'player_2_b_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_matches_player_2_b_id ON public.matches (player_2_b_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'action_logs'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON public.action_logs (created_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'action_logs'
      AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_action_logs_tenant_created_at ON public.action_logs (tenant_id, created_at DESC)';
  END IF;
END
$$;
