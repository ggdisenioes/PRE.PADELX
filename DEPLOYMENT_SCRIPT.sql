-- ============================================================================
-- PÁDEL MANAGER - DATABASE DEPLOYMENT SCRIPT
-- ============================================================================
-- This script deploys all migrations for the 8 new features
-- Execute in Supabase SQL Editor in order from top to bottom
-- ============================================================================

-- ============================================================================
-- MIGRATION 004: NEWS & COMMENTS TABLES
-- ============================================================================
-- News Table
CREATE TABLE IF NOT EXISTS news (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  published BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_select_published"
  ON news FOR SELECT
  USING (
    published = true
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "news_admin_all"
  ON news FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('match', 'tournament', 'player')),
  entity_id BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_all"
  ON comments FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "comments_insert_own"
  ON comments FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND user_id = auth.uid()
  );

CREATE POLICY "comments_update_own"
  ON comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "comments_delete_admin"
  ON comments FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

CREATE INDEX IF NOT EXISTS idx_news_tenant_published ON news(tenant_id, published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- ============================================================================
-- MIGRATION 005: CHALLENGES TABLE
-- ============================================================================
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

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges_select_all"
  ON challenges FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "challenges_insert_own"
  ON challenges FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "challenges_update_challenged"
  ON challenges FOR UPDATE
  USING (
    challenged_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "challenges_update_challenger"
  ON challenges FOR UPDATE
  USING (
    challenger_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);

-- ============================================================================
-- MIGRATION 006: BOOKINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  court_id BIGINT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT booking_time_order CHECK (start_time < end_time),
  CONSTRAINT booking_no_overlap UNIQUE (court_id, booking_date, start_time)
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select_all"
  ON bookings FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "bookings_insert_own"
  ON bookings FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND user_id = auth.uid()
  );

CREATE POLICY "bookings_update_own"
  ON bookings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "bookings_admin_all"
  ON bookings FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

CREATE INDEX IF NOT EXISTS idx_bookings_date_court ON bookings(booking_date, court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id, booking_date);

-- ============================================================================
-- MIGRATION 007: EMAIL QUEUE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_queue (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  template_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_queue_select_admin"
  ON email_queue FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

CREATE POLICY "email_queue_admin_all"
  ON email_queue FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_tenant ON email_queue(tenant_id, status);

-- ============================================================================
-- MIGRATION 008: DATABASE FUNCTIONS & TRIGGERS
-- ============================================================================
-- Function: Enqueue notification emails
CREATE OR REPLACE FUNCTION enqueue_notification_email(
  recipient_email TEXT,
  subject_text TEXT,
  body_html TEXT,
  template_name TEXT DEFAULT NULL,
  tenant_id_input BIGINT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO email_queue (tenant_id, recipient_email, subject, body_html, template_type)
  VALUES (tenant_id_input, recipient_email, subject_text, body_html, template_name)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Trigger for challenge creation - send notification email
CREATE OR REPLACE FUNCTION notify_on_challenge_created()
RETURNS TRIGGER AS $$
DECLARE
  challenged_email TEXT;
  challenged_name TEXT;
  challenger_name TEXT;
BEGIN
  SELECT p.email, pl.name INTO challenged_email, challenged_name
  FROM profiles p
  JOIN players pl ON p.id = pl.user_id
  WHERE pl.id = NEW.challenged_id
  LIMIT 1;

  SELECT name INTO challenger_name
  FROM players
  WHERE id = NEW.challenger_id
  LIMIT 1;

  IF challenged_email IS NOT NULL THEN
    PERFORM enqueue_notification_email(
      challenged_email,
      '¡Nuevo Desafío Recibido!',
      format(
        '<h2>¡Hola %s!</h2><p>%s te ha retado a un desafío.</p><p>Mensaje: %s</p><p><a href="https://twinco.padelx.es/challenges">Ver desafío</a></p>',
        challenged_name,
        challenger_name,
        COALESCE(NEW.message, 'Sin mensaje')
      ),
      'challenge_received',
      NEW.tenant_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_challenge_created ON challenges;
CREATE TRIGGER on_challenge_created
AFTER INSERT ON challenges
FOR EACH ROW EXECUTE FUNCTION notify_on_challenge_created();

-- Function: Clean up expired challenges daily
CREATE OR REPLACE FUNCTION cleanup_expired_challenges()
RETURNS VOID AS $$
BEGIN
  UPDATE challenges
  SET status = 'cancelled'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get player advanced statistics
CREATE OR REPLACE FUNCTION get_player_advanced_stats(player_id_input BIGINT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_matches', COALESCE(COUNT(*), 0),
    'wins', COALESCE(SUM(CASE
      WHEN (winner = 'A' AND (player_1_a = player_id_input OR player_2_a = player_id_input))
        OR (winner = 'B' AND (player_1_b = player_id_input OR player_2_b = player_id_input))
      THEN 1 ELSE 0 END), 0),
    'losses', COALESCE(SUM(CASE
      WHEN winner IS NOT NULL
        AND winner != 'pending'
        AND NOT ((winner = 'A' AND (player_1_a = player_id_input OR player_2_a = player_id_input))
          OR (winner = 'B' AND (player_1_b = player_id_input OR player_2_b = player_id_input)))
      THEN 1 ELSE 0 END), 0),
    'pending_matches', COALESCE(SUM(CASE WHEN winner IS NULL OR winner = 'pending' THEN 1 ELSE 0 END), 0)
  ) INTO result
  FROM matches
  WHERE player_1_a = player_id_input
    OR player_2_a = player_id_input
    OR player_1_b = player_id_input
    OR player_2_b = player_id_input;

  RETURN COALESCE(result, json_build_object(
    'total_matches', 0,
    'wins', 0,
    'losses', 0,
    'pending_matches', 0
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get global platform statistics
CREATE OR REPLACE FUNCTION get_platform_stats(tenant_id_input BIGINT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles WHERE tenant_id = tenant_id_input),
    'total_active_users', (SELECT COUNT(*) FROM profiles WHERE tenant_id = tenant_id_input AND active = true),
    'total_players', (SELECT COUNT(*) FROM players WHERE tenant_id = tenant_id_input),
    'total_matches', (SELECT COUNT(*) FROM matches WHERE tenant_id = tenant_id_input),
    'total_completed_matches', (SELECT COUNT(*) FROM matches WHERE tenant_id = tenant_id_input AND winner IS NOT NULL AND winner != 'pending'),
    'total_tournaments', (SELECT COUNT(*) FROM tournaments WHERE tenant_id = tenant_id_input),
    'total_bookings', (SELECT COUNT(*) FROM bookings WHERE tenant_id = tenant_id_input),
    'pending_challenges', (SELECT COUNT(*) FROM challenges WHERE tenant_id = tenant_id_input AND status = 'pending'),
    'news_published', (SELECT COUNT(*) FROM news WHERE tenant_id = tenant_id_input AND published = true)
  ) INTO result;

  RETURN COALESCE(result, json_build_object(
    'total_users', 0,
    'total_active_users', 0,
    'total_players', 0,
    'total_matches', 0,
    'total_completed_matches', 0,
    'total_tournaments', 0,
    'total_bookings', 0,
    'pending_challenges', 0,
    'news_published', 0
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Notify on booking confirmation
CREATE OR REPLACE FUNCTION notify_on_booking_created()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  court_name TEXT;
BEGIN
  SELECT email INTO user_email FROM profiles WHERE id = NEW.user_id LIMIT 1;

  SELECT name INTO court_name FROM courts WHERE id = NEW.court_id LIMIT 1;

  IF user_email IS NOT NULL THEN
    PERFORM enqueue_notification_email(
      user_email,
      'Pista Reservada Correctamente',
      format(
        '<h2>¡Reserva Confirmada!</h2><p>Pista: %s</p><p>Fecha: %s</p><p>Hora: %s - %s</p><p><a href="https://twinco.padelx.es/bookings">Ver reserva</a></p>',
        court_name,
        NEW.booking_date,
        NEW.start_time,
        NEW.end_time
      ),
      'booking_confirmed',
      NEW.tenant_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON bookings;
CREATE TRIGGER on_booking_created
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_on_booking_created();

-- Function: Check court availability
CREATE OR REPLACE FUNCTION is_court_available(
  court_id_input BIGINT,
  booking_date_input DATE,
  start_time_input TIME,
  end_time_input TIME,
  exclude_booking_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM bookings
  WHERE court_id = court_id_input
    AND booking_date = booking_date_input
    AND status IN ('confirmed', 'completed')
    AND (
      (start_time < end_time_input AND end_time > start_time_input)
    )
    AND (exclude_booking_id IS NULL OR id != exclude_booking_id);

  RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DEPLOYMENT COMPLETE
-- ============================================================================
-- All migrations have been executed successfully!
-- Run the verification queries in DATABASE_DEPLOYMENT.md to confirm
-- ============================================================================
