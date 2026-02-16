-- ============================================================
-- SUPER ADMIN SaaS DASHBOARD - MIGRACIONES COMPLETAS
-- ============================================================
-- Infraestructura para el super admin dashboard
-- Sin romper las tablas existentes
-- ============================================================

-- ============================================================
-- 1. TABLA: subscription_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_eur DECIMAL(10, 2) NOT NULL,
  max_players INT NOT NULL,
  max_concurrent_tournaments INT NOT NULL,
  max_courts INT NOT NULL,
  has_advanced_rankings BOOLEAN DEFAULT FALSE,
  has_player_stats BOOLEAN DEFAULT FALSE,
  has_leagues BOOLEAN DEFAULT FALSE,
  has_online_registration BOOLEAN DEFAULT FALSE,
  has_api_access BOOLEAN DEFAULT FALSE,
  has_mobile_app BOOLEAN DEFAULT FALSE,
  has_live_scoring BOOLEAN DEFAULT FALSE,
  has_white_label BOOLEAN DEFAULT FALSE,
  has_integrations BOOLEAN DEFAULT FALSE,
  support_level VARCHAR(50) DEFAULT 'email',
  support_response_hours INT DEFAULT 48,
  sort_order INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);

-- ============================================================
-- 2. TABLA: addons
-- ============================================================
CREATE TABLE IF NOT EXISTS addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_eur DECIMAL(10, 2) NOT NULL,
  billing_type VARCHAR(50) DEFAULT 'monthly'::VARCHAR,
  slug VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addons_active ON addons(is_active);
CREATE INDEX IF NOT EXISTS idx_addons_slug ON addons(slug);

-- ============================================================
-- 3. ACTUALIZAR TABLA: tenants (agregar columnas faltantes)
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan_id UUID;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'trial'::VARCHAR;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding_config JSONB DEFAULT '{}'::JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features_usage JSONB DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_plan ON tenants(subscription_plan_id);

-- Agregar foreign key a tenants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'tenants' AND constraint_name = 'tenants_subscription_plan_id_fkey'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_plan_id_fkey
      FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- ============================================================
-- 4. TABLA: tenant_addons
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES addons(id),
  activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deactivated_at TIMESTAMP WITH TIME ZONE,
  purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant ON tenant_addons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_addons_addon ON tenant_addons(addon_id);

-- ============================================================
-- 5. TABLA: tenant_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  player_count INT DEFAULT 0,
  active_tournament_count INT DEFAULT 0,
  booking_count_monthly INT DEFAULT 0,
  api_calls_monthly INT DEFAULT 0,
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_measured ON tenant_usage(measured_at DESC);

-- ============================================================
-- 6. TABLA: subscription_invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  base_plan_price DECIMAL(10, 2),
  addons_price DECIMAL(10, 2) DEFAULT 0,
  total_price DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft'::VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  due_at DATE,
  UNIQUE(tenant_id, billing_period_start)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON subscription_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON subscription_invoices(status);

-- ============================================================
-- 7. TABLA: super_admin_action_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_user_id UUID,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_tenant ON super_admin_action_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_super_admin ON super_admin_action_logs(super_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created ON super_admin_action_logs(created_at DESC);

-- ============================================================
-- INSERTS: Planes
-- ============================================================

INSERT INTO subscription_plans (
  name, description, price_eur,
  max_players, max_concurrent_tournaments, max_courts,
  has_advanced_rankings, has_player_stats, has_leagues,
  has_online_registration, has_mobile_app,
  support_level, support_response_hours, sort_order
) VALUES
  (
    'Starter',
    'Plan básico para clubes pequeños. Hasta 50 jugadores, 1 torneo activo simultáneo.',
    99.00,
    50, 1, 4,
    FALSE, FALSE, FALSE,
    FALSE, FALSE,
    'email', 48, 1
  ),
  (
    'Pro',
    'Plan avanzado para clubes medianos. Hasta 200 jugadores, 5 torneos simultáneos.',
    149.00,
    200, 5, 10,
    TRUE, TRUE, TRUE,
    TRUE, TRUE,
    'priority', 24, 2
  ),
  (
    'Club+',
    'Plan premium para grandes clubes. Jugadores, torneos y ligas ilimitadas.',
    229.00,
    999999, 999999, 999999,
    TRUE, TRUE, TRUE,
    TRUE, TRUE,
    'premium', 1, 3
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- INSERTS: Add-ons
-- ============================================================

INSERT INTO addons (
  name, description, price_eur, slug, billing_type, sort_order
) VALUES
  ('White-label (Tu marca)', 'Personalización completa con tu branding', 39.00, 'white_label', 'monthly', 1),
  ('Conexión con subdominio', 'Tu dominio personalizado (ej: tuclub.padelx.es)', 19.00, 'custom_subdomain', 'monthly', 2),
  ('Multi-sede', 'Gestión de múltiples sedes desde una cuenta', 49.00, 'multi_sede', 'monthly', 3),
  ('Reportes avanzados', 'Reportes y exportaciones avanzadas', 19.00, 'advanced_reports', 'monthly', 4),
  ('Carga de datos inicial asistida', 'Nuestro equipo carga tus datos', 99.00, 'data_migration', 'one_time', 5),
  ('Notificaciones por email', 'Emails automáticos a jugadores', 29.00, 'email_notifications', 'monthly', 6),
  ('Notificaciones por WhatsApp', 'Mensajes de WhatsApp a jugadores', 39.00, 'whatsapp_notifications', 'monthly', 7)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- RLS: tenants
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_see_all_tenants" ON tenants;
CREATE POLICY "super_admin_see_all_tenants" ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admin_see_own_tenant" ON tenants;
CREATE POLICY "admin_see_own_tenant" ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = tenants.id
        AND profiles.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "super_admin_create_tenant" ON tenants;
CREATE POLICY "super_admin_create_tenant" ON tenants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "super_admin_update_tenant" ON tenants;
CREATE POLICY "super_admin_update_tenant" ON tenants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- RLS: tenant_addons
-- ============================================================

ALTER TABLE tenant_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_see_all_addons" ON tenant_addons;
CREATE POLICY "super_admin_see_all_addons" ON tenant_addons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admin_see_own_addons" ON tenant_addons;
CREATE POLICY "admin_see_own_addons" ON tenant_addons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = tenant_addons.tenant_id
    )
  );

DROP POLICY IF EXISTS "super_admin_manage_addons" ON tenant_addons;
CREATE POLICY "super_admin_manage_addons" ON tenant_addons
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "super_admin_delete_addons" ON tenant_addons;
CREATE POLICY "super_admin_delete_addons" ON tenant_addons
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- RLS: subscription_invoices
-- ============================================================

ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_see_all_invoices" ON subscription_invoices;
CREATE POLICY "super_admin_see_all_invoices" ON subscription_invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admin_see_own_invoices" ON subscription_invoices;
CREATE POLICY "admin_see_own_invoices" ON subscription_invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = subscription_invoices.tenant_id
    )
  );

-- ============================================================
-- RLS: tenant_usage
-- ============================================================

ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_see_all_usage" ON tenant_usage;
CREATE POLICY "super_admin_see_all_usage" ON tenant_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admin_see_own_usage" ON tenant_usage;
CREATE POLICY "admin_see_own_usage" ON tenant_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = tenant_usage.tenant_id
    )
  );

-- ============================================================
-- RLS: super_admin_action_logs
-- ============================================================

ALTER TABLE super_admin_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_see_all_logs" ON super_admin_action_logs;
CREATE POLICY "super_admin_see_all_logs" ON super_admin_action_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );
