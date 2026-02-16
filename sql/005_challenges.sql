-- Challenges Table
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenger_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenger_partner_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  challenged_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenged_partner_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  message TEXT,
  match_id BIGINT REFERENCES matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Enable RLS on challenges table
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view challenges in their tenant
CREATE POLICY "challenges_select_all"
  ON challenges FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Users can create challenges
CREATE POLICY "challenges_insert_own"
  ON challenges FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Challenged player can update challenge status
CREATE POLICY "challenges_update_challenged"
  ON challenges FOR UPDATE
  USING (
    challenged_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Challenger can cancel their challenge
CREATE POLICY "challenges_update_challenger"
  ON challenges FOR UPDATE
  USING (
    challenger_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);
