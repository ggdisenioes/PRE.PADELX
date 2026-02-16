-- =============================================================
-- Vincular jugadores con usuarios auth (Mi Cuenta)
-- =============================================================

-- Columna user_id en players para vincular con auth.users
ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Un usuario solo puede estar vinculado a un jugador
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id) WHERE user_id IS NOT NULL;
