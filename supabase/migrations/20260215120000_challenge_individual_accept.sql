-- Individual acceptance tracking for challenges
ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS challenged_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS challenged_partner_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_court TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_place TEXT;
