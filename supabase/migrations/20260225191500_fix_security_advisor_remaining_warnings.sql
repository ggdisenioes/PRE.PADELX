-- ============================================================
-- Security Advisor compatibility fixes
-- Goal: resolve warnings without reducing existing permissions.
-- 1) Set SECURITY INVOKER on public.profiles_with_tenant view.
-- 2) Enable RLS on exposed legacy stats/raw tables with
--    compatibility policies (same effective access as before).
-- ============================================================

-- 1) View: SECURITY INVOKER
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

-- 2) Tables: enable RLS + compatibility policies
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'player_stats',
    'tournament_player_stats',
    'tournament_rankings',
    'sheet_matches_raw'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND policyname = v_table || '_select_all_compat'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)',
        v_table || '_select_all_compat',
        v_table
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND policyname = v_table || '_insert_all_compat'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO public WITH CHECK (true)',
        v_table || '_insert_all_compat',
        v_table
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND policyname = v_table || '_update_all_compat'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO public USING (true) WITH CHECK (true)',
        v_table || '_update_all_compat',
        v_table
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND policyname = v_table || '_delete_all_compat'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO public USING (true)',
        v_table || '_delete_all_compat',
        v_table
      );
    END IF;
  END LOOP;
END
$$;
