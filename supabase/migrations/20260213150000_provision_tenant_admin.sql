-- ============================================================
-- FUNCIÓN: provision_tenant_admin
-- Crea usuario auth + perfil para un tenant dado.
-- Solo callable por super_admin via supabase.rpc()
-- ============================================================

-- Asegurar que pgcrypto esté habilitado (para crypt/gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.provision_tenant_admin(
  p_tenant_id UUID,
  p_email TEXT,
  p_password TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Verificar que el llamante es super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo super_admin puede crear admins de tenant';
  END IF;

  -- 2. Verificar que el tenant existe
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant no encontrado: %', p_tenant_id;
  END IF;

  -- 3. Verificar que el email no está en uso
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'El email % ya está registrado', p_email;
  END IF;

  -- 4. Validar password mínimo
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  -- 5. Generar UUID
  v_user_id := gen_random_uuid();

  -- 6. Insertar en auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    role,
    aud,
    confirmation_token,
    recovery_token,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', p_tenant_id,
      'role', 'admin'
    ),
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'role', 'admin',
      'first_name', COALESCE(p_first_name, ''),
      'last_name', COALESCE(p_last_name, '')
    ),
    'authenticated',
    'authenticated',
    '',
    '',
    FALSE,
    NOW(),
    NOW()
  );

  -- 7. Insertar identity (requerido para login con email/password)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 8. Crear perfil con rol admin y tenant_id
  INSERT INTO public.profiles (id, email, role, active, tenant_id, first_name, last_name)
  VALUES (
    v_user_id,
    p_email,
    'admin',
    TRUE,
    p_tenant_id,
    p_first_name,
    p_last_name
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = p_tenant_id,
    role = 'admin',
    active = TRUE,
    first_name = COALESCE(p_first_name, profiles.first_name),
    last_name = COALESCE(p_last_name, profiles.last_name);

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'email', p_email,
    'tenant_id', p_tenant_id
  );
END;
$$;
