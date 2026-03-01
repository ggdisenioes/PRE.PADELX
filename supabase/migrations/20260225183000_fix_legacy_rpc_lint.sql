-- ============================================================
-- Security/Lint Fixes for legacy RPC functions
-- 1) admin_set_user_names: remove ambiguous variable references
-- 2) create_invite: include extensions schema for gen_random_bytes
-- ============================================================

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid
    INTO v_oid
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_set_user_names'
    AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text'
  LIMIT 1;

  IF v_oid IS NOT NULL THEN
    SELECT pg_catalog.pg_get_functiondef(v_oid) INTO v_def;

    v_new := regexp_replace(
      v_def,
      'set\\s+first_name\\s*=\\s*first_name\\s*,\\s*last_name\\s*=\\s*last_name',
      'set first_name = admin_set_user_names.first_name, last_name = admin_set_user_names.last_name',
      'i'
    );

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.create_invite(text,text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_invite(text,text) SET search_path = public, auth, extensions';
  END IF;
END
$$;
