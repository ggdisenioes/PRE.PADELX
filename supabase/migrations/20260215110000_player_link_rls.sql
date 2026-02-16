-- =============================================================
-- RLS: permitir que admin/manager actualice user_id en players
-- =============================================================

-- Policy para que admin/manager pueda actualizar players (incluyendo user_id)
DO $$
BEGIN
  -- Verificar si RLS está habilitado en players
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'players' AND rowsecurity = true
  ) THEN
    -- Crear policy de update si no existe
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'admin_manager_update_players'
    ) THEN
      EXECUTE 'CREATE POLICY admin_manager_update_players ON players FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN (''admin'', ''manager'')
            AND profiles.tenant_id::text = players.tenant_id::text
        )
      )';
    END IF;

    -- Policy de select para admin/manager si no existe
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'admin_manager_select_players'
    ) THEN
      EXECUTE 'CREATE POLICY admin_manager_select_players ON players FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN (''admin'', ''manager'')
            AND profiles.tenant_id::text = players.tenant_id::text
        )
      )';
    END IF;
  END IF;
END $$;

-- También permitir que un usuario con user_id lea su propio jugador (para Mi Cuenta)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'players' AND rowsecurity = true
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'user_select_own_player'
    ) THEN
      EXECUTE 'CREATE POLICY user_select_own_player ON players FOR SELECT USING (
        user_id = auth.uid()
      )';
    END IF;

    -- Permitir que el usuario actualice sus propias preferencias de notificación
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'user_update_own_player'
    ) THEN
      EXECUTE 'CREATE POLICY user_update_own_player ON players FOR UPDATE USING (
        user_id = auth.uid()
      )';
    END IF;
  END IF;
END $$;
