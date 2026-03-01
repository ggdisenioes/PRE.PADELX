-- Function to enqueue notification emails
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
  -- Get challenged player's email
  SELECT p.email, pl.name INTO challenged_email, challenged_name
  FROM profiles p
  JOIN players pl ON p.id = pl.user_id
  WHERE pl.id = NEW.challenged_id
  LIMIT 1;

  -- Get challenger's name
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

-- Create trigger for challenge creation
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
  -- Get user's email
  SELECT email INTO user_email FROM profiles WHERE id = NEW.user_id LIMIT 1;

  -- Get court name
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

-- Create trigger for booking confirmation
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
