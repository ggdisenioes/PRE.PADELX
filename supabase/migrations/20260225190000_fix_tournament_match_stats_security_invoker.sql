-- ============================================================
-- Security Fix: enforce SECURITY INVOKER on tournament stats view
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'tournament_match_stats'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.tournament_match_stats SET (security_invoker = true)';
  END IF;
END
$$;
