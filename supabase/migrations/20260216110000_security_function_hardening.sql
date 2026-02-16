-- ============================================================
-- Security: Harden SECURITY DEFINER functions
-- 1. Add email format validation to provision_tenant_admin
-- 2. Add token format validation to get_invitation_preview
-- ============================================================

-- ============================================================
-- 1. Harden provision_tenant_admin: validate email format
-- ============================================================
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

  -- 3. Validar formato de email
  IF p_email IS NULL OR p_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RAISE EXCEPTION 'Formato de email inválido';
  END IF;

  -- 4. Verificar que el email no está en uso
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'El email % ya está registrado', p_email;
  END IF;

  -- 5. Validar password mínimo
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
  END IF;

  -- 6. Sanitizar nombres (trim whitespace, limit length)
  p_first_name := LEFT(TRIM(COALESCE(p_first_name, '')), 100);
  p_last_name := LEFT(TRIM(COALESCE(p_last_name, '')), 100);

  -- 7. Generar UUID
  v_user_id := gen_random_uuid();

  -- 8. Insertar en auth.users
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
      'first_name', COALESCE(NULLIF(p_first_name, ''), NULL),
      'last_name', COALESCE(NULLIF(p_last_name, ''), NULL)
    ),
    'authenticated',
    'authenticated',
    '',
    '',
    FALSE,
    NOW(),
    NOW()
  );

  -- 9. Insertar identity
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

  -- 10. Crear perfil con rol admin y tenant_id
  INSERT INTO public.profiles (id, email, role, active, tenant_id, first_name, last_name)
  VALUES (
    v_user_id,
    p_email,
    'admin',
    TRUE,
    p_tenant_id,
    NULLIF(p_first_name, ''),
    NULLIF(p_last_name, '')
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = p_tenant_id,
    role = 'admin',
    active = TRUE,
    first_name = COALESCE(NULLIF(p_first_name, ''), profiles.first_name),
    last_name = COALESCE(NULLIF(p_last_name, ''), profiles.last_name);

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'email', p_email,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- ============================================================
-- 2. Harden get_invitation_preview: validate token format
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.tenant_invitations%ROWTYPE;
  v_tenant_name TEXT;
BEGIN
  -- Validate token format (UUID format expected)
  IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 100 THEN
    -- Return generic not_found to prevent enumeration
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_invite
  FROM public.tenant_invitations
  WHERE token = p_token AND status = 'pending';

  IF NOT FOUND THEN
    -- Add small delay to prevent timing attacks on token enumeration
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found');
  END IF;

  IF v_invite.expires_at < NOW() THEN
    UPDATE public.tenant_invitations
      SET status = 'expired', updated_at = NOW()
    WHERE id = v_invite.id;
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'expired');
  END IF;

  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = v_invite.tenant_id;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'email', v_invite.email,
    'first_name', v_invite.first_name,
    'tenant_name', v_tenant_name,
    'expires_at', v_invite.expires_at
  );
END;
$$;
