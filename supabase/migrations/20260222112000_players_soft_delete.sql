-- Soft-delete para jugadores (archivo de eliminados + restauración)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_players_tenant_deleted_at
  ON public.players (tenant_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_players_deleted_at
  ON public.players (deleted_at);
