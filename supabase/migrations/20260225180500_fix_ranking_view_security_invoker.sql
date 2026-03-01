-- ============================================================
-- Security Fix: enforce SECURITY INVOKER on ranking view
-- Supabase linter warns when views run as SECURITY DEFINER
-- because they can bypass caller-level RLS expectations.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ranking_by_tournament'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.ranking_by_tournament SET (security_invoker = true)';
  END IF;
END
$$;
