-- ============================================================
-- MIGRACIÓN: Sistema de invitaciones para admin de tenant
-- Tabla tenant_invitations + funciones create/accept/preview
-- ============================================================

-- Asegurar que pgcrypto esté habilitado
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Tabla tenant_invitations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by    UUID REFERENCES public.profiles(id),
  first_name    TEXT,
  last_name     TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token   ON public.tenant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant  ON public.tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email   ON public.tenant_invitations(email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_status  ON public.tenant_invitations(status);

-- ============================================================
-- 2. RLS para tenant_invitations
-- ============================================================
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY super_admin_read_invitations ON public.tenant_invitations
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_insert_invitations ON public.tenant_invitations
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_update_invitations ON public.tenant_invitations
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. Función: create_tenant_invitation
--    Llamada por super_admin desde el Dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
  p_tenant_id   UUID,
  p_email       TEXT,
  p_first_name  TEXT DEFAULT NULL,
  p_last_name   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_token       TEXT;
  v_invite_id   UUID;
  v_tenant_name TEXT;
BEGIN
  -- 1. Verificar super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo super_admin puede enviar invitaciones';
  END IF;

  -- 2. Verificar que el tenant existe
  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant no encontrado: %', p_tenant_id;
  END IF;

  -- 3. Verificar que el email no tiene cuenta registrada
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'El email % ya tiene una cuenta registrada', p_email;
  END IF;

  -- 4. Generar token seguro (64 hex chars = 32 bytes random)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- 5. Cancelar invitaciones pending previas para este tenant+email
  UPDATE public.tenant_invitations
    SET status = 'cancelled', updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND email = p_email
    AND status = 'pending';

  -- 6. Insertar nueva invitación
  INSERT INTO public.tenant_invitations
    (tenant_id, email, token, status, invited_by, first_name, last_name, expires_at)
  VALUES
    (p_tenant_id, p_email, v_token, 'pending', auth.uid(),
     p_first_name, p_last_name, NOW() + INTERVAL '72 hours')
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'invitation_id', v_invite_id,
    'token', v_token,
    'email', p_email,
    'tenant_name', v_tenant_name,
    'expires_at', (NOW() + INTERVAL '72 hours')
  );
END;
$$;

-- ============================================================
-- 4. Función: get_invitation_preview
--    Llamada por anon desde la página de aceptación
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
  SELECT * INTO v_invite
  FROM public.tenant_invitations
  WHERE token = p_token AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found');
  END IF;

  IF v_invite.expires_at < NOW() THEN
    -- Marcar como expirada
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
    'last_name', v_invite.last_name,
    'tenant_name', v_tenant_name,
    'expires_at', v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO anon;

-- ============================================================
-- 5. Función: accept_tenant_invitation
--    Llamada por anon desde la página de aceptación
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(
  p_token      TEXT,
  p_password   TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_invite      public.tenant_invitations%ROWTYPE;
  v_user_id     UUID;
  v_tenant_name TEXT;
BEGIN
  -- 1. Buscar invitación
  SELECT * INTO v_invite
  FROM public.tenant_invitations
  WHERE token = p_token AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no encontrada o ya utilizada';
  END IF;

  -- 2. Verificar expiración
  IF v_invite.expires_at < NOW() THEN
    UPDATE public.tenant_invitations
      SET status = 'expired', updated_at = NOW()
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'La invitación ha expirado. Solicita una nueva al administrador.';
  END IF;

  -- 3. Verificar que el email no está registrado
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_invite.email) THEN
    RAISE EXCEPTION 'Este email ya tiene una cuenta registrada';
  END IF;

  -- 4. Validar contraseña
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
  END IF;

  -- 5. Obtener nombre del tenant
  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = v_invite.tenant_id;

  -- 6. Crear usuario en auth.users
  v_user_id := gen_random_uuid();

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
    v_invite.email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', v_invite.tenant_id,
      'role', 'admin'
    ),
    jsonb_build_object(
      'tenant_id', v_invite.tenant_id,
      'role', 'admin',
      'first_name', COALESCE(p_first_name, v_invite.first_name, ''),
      'last_name', COALESCE(p_last_name, v_invite.last_name, '')
    ),
    'authenticated',
    'authenticated',
    '',
    '',
    FALSE,
    NOW(),
    NOW()
  );

  -- 7. Crear identity (requerido para login email/password)
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
    jsonb_build_object('sub', v_user_id::text, 'email', v_invite.email),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 8. Crear perfil
  INSERT INTO public.profiles (id, email, role, active, tenant_id, first_name, last_name)
  VALUES (
    v_user_id,
    v_invite.email,
    'admin',
    TRUE,
    v_invite.tenant_id,
    COALESCE(p_first_name, v_invite.first_name),
    COALESCE(p_last_name, v_invite.last_name)
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = v_invite.tenant_id,
    role = 'admin',
    active = TRUE,
    first_name = COALESCE(p_first_name, v_invite.first_name, profiles.first_name),
    last_name = COALESCE(p_last_name, v_invite.last_name, profiles.last_name);

  -- 9. Marcar invitación como aceptada
  UPDATE public.tenant_invitations
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'email', v_invite.email,
    'tenant_id', v_invite.tenant_id,
    'tenant_name', v_tenant_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(TEXT, TEXT, TEXT, TEXT) TO anon;
