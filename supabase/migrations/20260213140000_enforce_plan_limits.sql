-- ============================================================
-- MIGRACIÓN: Enforcement de límites de plan + RLS lectura
-- ============================================================

-- ============================================================
-- 1. RLS: Permitir a usuarios autenticados leer planes y addons
-- ============================================================
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE addons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY authenticated_read_plans ON subscription_plans
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY authenticated_read_addons ON addons
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Asegurar que tenant_addons sea legible para usuarios de su propio tenant
DO $$ BEGIN
  CREATE POLICY authenticated_read_own_tenant_addons ON tenant_addons
    FOR SELECT TO authenticated
    USING (
      tenant_id IN (
        SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Trigger: Enforce player limit
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_player_limit()
RETURNS trigger AS $$
DECLARE
  v_tenant_id UUID;
  v_max_players INT;
  v_current_count INT;
BEGIN
  v_tenant_id := NEW.tenant_id;

  -- Si no tiene tenant_id, intentar obtenerlo del perfil del usuario
  IF v_tenant_id IS NULL THEN
    SELECT p.tenant_id INTO v_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener límite del plan
  SELECT sp.max_players INTO v_max_players
  FROM tenants t
  JOIN subscription_plans sp ON sp.id = t.subscription_plan_id
  WHERE t.id = v_tenant_id;

  -- Sin plan asignado = sin restricción
  IF v_max_players IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contar jugadores existentes
  SELECT COUNT(*) INTO v_current_count
  FROM players
  WHERE tenant_id = v_tenant_id;

  IF v_current_count >= v_max_players THEN
    RAISE EXCEPTION 'PLAN_LIMIT: Has alcanzado el limite de jugadores (% de %) de tu plan. Actualiza tu plan para agregar mas.',
      v_current_count, v_max_players;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_player_limit ON public.players;
CREATE TRIGGER trg_enforce_player_limit
  BEFORE INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_player_limit();

-- ============================================================
-- 3. Trigger: Enforce tournament limit
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_tournament_limit()
RETURNS trigger AS $$
DECLARE
  v_tenant_id UUID;
  v_max_tournaments INT;
  v_current_count INT;
BEGIN
  v_tenant_id := NEW.tenant_id;

  IF v_tenant_id IS NULL THEN
    SELECT p.tenant_id INTO v_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener límite del plan
  SELECT sp.max_concurrent_tournaments INTO v_max_tournaments
  FROM tenants t
  JOIN subscription_plans sp ON sp.id = t.subscription_plan_id
  WHERE t.id = v_tenant_id;

  -- Sin plan asignado = sin restricción
  IF v_max_tournaments IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contar solo torneos activos (open + ongoing)
  SELECT COUNT(*) INTO v_current_count
  FROM tournaments
  WHERE tenant_id = v_tenant_id
    AND status IN ('open', 'ongoing');

  IF v_current_count >= v_max_tournaments THEN
    RAISE EXCEPTION 'PLAN_LIMIT: Has alcanzado el limite de torneos activos (% de %) de tu plan. Finaliza un torneo o actualiza tu plan.',
      v_current_count, v_max_tournaments;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_tournament_limit ON public.tournaments;
CREATE TRIGGER trg_enforce_tournament_limit
  BEFORE INSERT ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tournament_limit();
