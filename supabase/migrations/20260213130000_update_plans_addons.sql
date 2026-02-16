-- ============================================================
-- MIGRACIÓN: Actualizar planes, add-ons y asignar Twinco
-- ============================================================

-- ============================================================
-- 1. Agregar columna slug a subscription_plans
-- ============================================================
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

UPDATE subscription_plans SET slug = 'starter' WHERE name = 'Starter' AND slug IS NULL;
UPDATE subscription_plans SET slug = 'pro' WHERE name = 'Pro' AND slug IS NULL;
UPDATE subscription_plans SET slug = 'club_plus' WHERE name = 'Club+' AND slug IS NULL;

-- Hacer slug unique después de poblar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_slug_key'
  ) THEN
    ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_slug_key UNIQUE (slug);
  END IF;
END $$;

-- ============================================================
-- 2. Actualizar descripciones de planes
-- ============================================================
UPDATE subscription_plans SET
  description = 'Plan básico para clubes pequeños. Hasta 50 jugadores, 1 torneo activo, rankings básicos, reservas de pistas, cuadros automáticos, panel básico, soporte email 48h.'
WHERE name = 'Starter';

UPDATE subscription_plans SET
  description = 'Plan avanzado para clubes medianos. Hasta 200 jugadores, 5 torneos simultáneos, rankings avanzados con historial, estadísticas por jugador, ligas y americanas, inscripciones online, resultados en vivo, app móvil, soporte prioritario 24h.'
WHERE name = 'Pro';

UPDATE subscription_plans SET
  description = 'Plan premium para grandes clubes. Jugadores y torneos ilimitados, rankings federativos, estadísticas + histórico completo, gestión de inscripciones y comunicación, soporte premium.'
WHERE name = 'Club+';

-- ============================================================
-- 3. Agregar columna category a addons
-- ============================================================
ALTER TABLE addons ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- ============================================================
-- 4. Eliminar add-ons obsoletos
-- ============================================================
DELETE FROM tenant_addons WHERE addon_id IN (
  SELECT id FROM addons WHERE slug IN ('custom_subdomain', 'data_migration', 'email_notifications')
);
DELETE FROM addons WHERE slug IN ('custom_subdomain', 'data_migration', 'email_notifications');

-- ============================================================
-- 5. Actualizar add-ons existentes que se mantienen
-- ============================================================
UPDATE addons SET
  name = 'Branding white-label',
  description = 'Personalización completa con tu marca: logo, colores, dominio propio',
  price_eur = 39.00,
  category = 'top_ventas',
  sort_order = 4
WHERE slug = 'white_label';

UPDATE addons SET
  name = 'Multi-sede / Multi-club',
  description = 'Gestión de múltiples sedes o clubes desde una misma cuenta',
  price_eur = 49.00,
  category = 'gestion',
  sort_order = 5
WHERE slug = 'multi_sede';

UPDATE addons SET
  name = 'Exportaciones avanzadas',
  description = 'Reportes, exportaciones CSV/PDF y análisis avanzado de datos',
  price_eur = 19.00,
  category = 'gestion',
  sort_order = 7
WHERE slug = 'advanced_reports';

UPDATE addons SET
  name = 'WhatsApp / Notificaciones',
  description = 'Notificaciones automáticas por WhatsApp a jugadores y equipos',
  price_eur = 39.00,
  category = 'top_ventas',
  sort_order = 2
WHERE slug = 'whatsapp_notifications';

-- ============================================================
-- 6. Insertar nuevos add-ons
-- ============================================================
INSERT INTO addons (name, description, price_eur, slug, billing_type, category, sort_order) VALUES
  ('Pagos online (Stripe)', 'Cobro de inscripciones y cuotas con Stripe integrado', 49.00, 'online_payments', 'monthly', 'top_ventas', 1),
  ('Módulo de Sponsors', 'Gestión de patrocinadores: logos, banners y visibilidad en torneos', 29.00, 'sponsors', 'monthly', 'top_ventas', 3),
  ('Control de acceso por roles', 'Permisos granulares por rol: admin, manager, árbitro, jugador', 19.00, 'role_access_control', 'monthly', 'gestion', 6),
  ('Auditoría y logs avanzados', 'Registro detallado de todas las acciones y cambios en el sistema', 19.00, 'audit_logs', 'monthly', 'gestion', 8),
  ('Integración federación', 'Conexión con federaciones de pádel para rankings y licencias', 39.00, 'federation_integration', 'monthly', 'pro', 9),
  ('API / Integraciones', 'API REST para integrar PadelX con tus sistemas externos', 49.00, 'api_integrations', 'monthly', 'pro', 10),
  ('Soporte premium', 'Soporte dedicado con gestor de cuenta y SLA garantizado', 59.00, 'premium_support', 'monthly', 'pro', 11)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_eur = EXCLUDED.price_eur,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 7. Asignar a Twinco: plan Club+ y todos los add-ons
-- ============================================================
DO $$
DECLARE
  v_twinco_id UUID;
  v_club_plus_id UUID;
  v_addon RECORD;
BEGIN
  -- Obtener Twinco tenant
  SELECT id INTO v_twinco_id FROM tenants WHERE slug = 'twinco' LIMIT 1;

  IF v_twinco_id IS NULL THEN
    RAISE NOTICE 'Tenant Twinco no encontrado, saltando asignación';
    RETURN;
  END IF;

  -- Obtener plan Club+
  SELECT id INTO v_club_plus_id FROM subscription_plans WHERE name = 'Club+' LIMIT 1;

  IF v_club_plus_id IS NULL THEN
    RAISE NOTICE 'Plan Club+ no encontrado, saltando asignación';
    RETURN;
  END IF;

  -- Asignar plan Club+ a Twinco
  UPDATE tenants SET
    subscription_plan_id = v_club_plus_id,
    status = 'active'
  WHERE id = v_twinco_id;

  -- Asignar todos los add-ons activos a Twinco
  FOR v_addon IN SELECT id FROM addons WHERE is_active = TRUE
  LOOP
    INSERT INTO tenant_addons (tenant_id, addon_id)
    VALUES (v_twinco_id, v_addon.id)
    ON CONFLICT (tenant_id, addon_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Twinco actualizado con Club+ y todos los add-ons';
END $$;
