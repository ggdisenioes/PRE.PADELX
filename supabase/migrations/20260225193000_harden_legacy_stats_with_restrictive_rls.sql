-- ============================================================
-- Multi-tenant hardening (non-breaking rollout)
-- Keep compatibility policies, but enforce tenant isolation via
-- RESTRICTIVE policies on legacy exposed tables.
-- ============================================================

-- Ensure view executes with caller permissions (idempotent safety)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles_with_tenant'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.profiles_with_tenant SET (security_invoker = true)';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- player_stats: tenant isolation via players.tenant_id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.player_stats') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'player_stats'
        AND policyname = 'player_stats_tenant_select_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY player_stats_tenant_select_restrictive
          ON public.player_stats
          AS RESTRICTIVE
          FOR SELECT
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.players pl ON pl.id = player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'player_stats'
        AND policyname = 'player_stats_tenant_insert_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY player_stats_tenant_insert_restrictive
          ON public.player_stats
          AS RESTRICTIVE
          FOR INSERT
          TO public
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.players pl ON pl.id = player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'player_stats'
        AND policyname = 'player_stats_tenant_update_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY player_stats_tenant_update_restrictive
          ON public.player_stats
          AS RESTRICTIVE
          FOR UPDATE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.players pl ON pl.id = player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = pl.tenant_id
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.players pl ON pl.id = player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'player_stats'
        AND policyname = 'player_stats_tenant_delete_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY player_stats_tenant_delete_restrictive
          ON public.player_stats
          AS RESTRICTIVE
          FOR DELETE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.players pl ON pl.id = player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- tournament_player_stats: tenant isolation via tournament+player
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tournament_player_stats') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tournament_player_stats ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_player_stats'
        AND policyname = 'tournament_player_stats_tenant_select_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_player_stats_tenant_select_restrictive
          ON public.tournament_player_stats
          AS RESTRICTIVE
          FOR SELECT
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_player_stats.tournament_id
              JOIN public.players pl ON pl.id = tournament_player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_player_stats'
        AND policyname = 'tournament_player_stats_tenant_insert_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_player_stats_tenant_insert_restrictive
          ON public.tournament_player_stats
          AS RESTRICTIVE
          FOR INSERT
          TO public
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_player_stats.tournament_id
              JOIN public.players pl ON pl.id = tournament_player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_player_stats'
        AND policyname = 'tournament_player_stats_tenant_update_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_player_stats_tenant_update_restrictive
          ON public.tournament_player_stats
          AS RESTRICTIVE
          FOR UPDATE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_player_stats.tournament_id
              JOIN public.players pl ON pl.id = tournament_player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_player_stats.tournament_id
              JOIN public.players pl ON pl.id = tournament_player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_player_stats'
        AND policyname = 'tournament_player_stats_tenant_delete_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_player_stats_tenant_delete_restrictive
          ON public.tournament_player_stats
          AS RESTRICTIVE
          FOR DELETE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_player_stats.tournament_id
              JOIN public.players pl ON pl.id = tournament_player_stats.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- tournament_rankings: tenant isolation via tournament+player
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tournament_rankings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tournament_rankings ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_rankings'
        AND policyname = 'tournament_rankings_tenant_select_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_rankings_tenant_select_restrictive
          ON public.tournament_rankings
          AS RESTRICTIVE
          FOR SELECT
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_rankings.tournament_id
              JOIN public.players pl ON pl.id = tournament_rankings.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_rankings'
        AND policyname = 'tournament_rankings_tenant_insert_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_rankings_tenant_insert_restrictive
          ON public.tournament_rankings
          AS RESTRICTIVE
          FOR INSERT
          TO public
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_rankings.tournament_id
              JOIN public.players pl ON pl.id = tournament_rankings.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_rankings'
        AND policyname = 'tournament_rankings_tenant_update_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_rankings_tenant_update_restrictive
          ON public.tournament_rankings
          AS RESTRICTIVE
          FOR UPDATE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_rankings.tournament_id
              JOIN public.players pl ON pl.id = tournament_rankings.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_rankings.tournament_id
              JOIN public.players pl ON pl.id = tournament_rankings.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tournament_rankings'
        AND policyname = 'tournament_rankings_tenant_delete_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY tournament_rankings_tenant_delete_restrictive
          ON public.tournament_rankings
          AS RESTRICTIVE
          FOR DELETE
          TO public
          USING (
            EXISTS (
              SELECT 1
              FROM public.profiles p
              JOIN public.tournaments t ON t.id = tournament_rankings.tournament_id
              JOIN public.players pl ON pl.id = tournament_rankings.player_id
              WHERE p.id = auth.uid()
                AND p.tenant_id = t.tenant_id
                AND p.tenant_id = pl.tenant_id
            )
          )
      $sql$;
    END IF;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- sheet_matches_raw: at least require authenticated users
-- (table has no tenant key to enforce tenant isolation yet)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sheet_matches_raw') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sheet_matches_raw ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'sheet_matches_raw'
        AND policyname = 'sheet_matches_raw_authenticated_only_select_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY sheet_matches_raw_authenticated_only_select_restrictive
          ON public.sheet_matches_raw
          AS RESTRICTIVE
          FOR SELECT
          TO public
          USING (auth.uid() IS NOT NULL)
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'sheet_matches_raw'
        AND policyname = 'sheet_matches_raw_authenticated_only_insert_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY sheet_matches_raw_authenticated_only_insert_restrictive
          ON public.sheet_matches_raw
          AS RESTRICTIVE
          FOR INSERT
          TO public
          WITH CHECK (auth.uid() IS NOT NULL)
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'sheet_matches_raw'
        AND policyname = 'sheet_matches_raw_authenticated_only_update_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY sheet_matches_raw_authenticated_only_update_restrictive
          ON public.sheet_matches_raw
          AS RESTRICTIVE
          FOR UPDATE
          TO public
          USING (auth.uid() IS NOT NULL)
          WITH CHECK (auth.uid() IS NOT NULL)
      $sql$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'sheet_matches_raw'
        AND policyname = 'sheet_matches_raw_authenticated_only_delete_restrictive'
    ) THEN
      EXECUTE $sql$
        CREATE POLICY sheet_matches_raw_authenticated_only_delete_restrictive
          ON public.sheet_matches_raw
          AS RESTRICTIVE
          FOR DELETE
          TO public
          USING (auth.uid() IS NOT NULL)
      $sql$;
    END IF;
  END IF;
END
$$;
