-- ============================================================
-- Lint Fix: resolve ambiguous first_name/last_name references
-- in public.admin_set_user_names(uuid,text,text)
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

  IF v_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_oid) INTO v_def;

  v_new := replace(
    v_def,
    E'set first_name = first_name,\n      last_name = last_name',
    E'set first_name = admin_set_user_names.first_name,\n      last_name = admin_set_user_names.last_name'
  );

  IF v_new = v_def THEN
    v_new := regexp_replace(
      v_def,
      'set[[:space:]]+first_name[[:space:]]*=[[:space:]]*first_name[[:space:]]*,[[:space:]]*last_name[[:space:]]*=[[:space:]]*last_name',
      'set first_name = admin_set_user_names.first_name, last_name = admin_set_user_names.last_name',
      'i'
    );
  END IF;

  IF v_new IS DISTINCT FROM v_def THEN
    EXECUTE v_new;
  END IF;
END
$$;
