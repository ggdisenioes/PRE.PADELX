-- =============================================================
-- Notificaciones completas: desafíos, partidos nuevos, recordatorios 24h
-- Respetan preferencias notify_email / notify_whatsapp del jugador
-- =============================================================

-- =============================================
-- 1. DESAFÍO NUEVO — notify_on_challenge_created
-- =============================================
-- Estructura challenge:
--   challenger_id + challenger_partner_id vs challenged_id + challenged_partner_id
-- Notifica a los 2 jugadores desafiados (challenged + challenged_partner)

CREATE OR REPLACE FUNCTION notify_on_challenge_created()
RETURNS TRIGGER AS $$
DECLARE
  challenger_name TEXT;
  challenger_partner_name TEXT;
  challenged_rec RECORD;
  challenged_partner_rec RECORD;
  tenant_name TEXT;
  subject_text TEXT;
  body_text TEXT;
BEGIN
  -- Nombres de los retadores
  SELECT name INTO challenger_name FROM players WHERE id = NEW.challenger_id LIMIT 1;
  SELECT name INTO challenger_partner_name FROM players WHERE id = NEW.challenger_partner_id LIMIT 1;

  -- Nombre del club
  SELECT name INTO tenant_name FROM tenants WHERE id = NEW.tenant_id LIMIT 1;

  -- Datos del jugador desafiado principal
  SELECT id, name, email, phone, COALESCE(notify_email, true) AS notify_email, COALESCE(notify_whatsapp, false) AS notify_whatsapp
    INTO challenged_rec
    FROM players WHERE id = NEW.challenged_id LIMIT 1;

  -- Datos del compañero del desafiado (si existe)
  IF NEW.challenged_partner_id IS NOT NULL THEN
    SELECT id, name, email, phone, COALESCE(notify_email, true) AS notify_email, COALESCE(notify_whatsapp, false) AS notify_whatsapp
      INTO challenged_partner_rec
      FROM players WHERE id = NEW.challenged_partner_id LIMIT 1;
  END IF;

  -- Construir asunto y cuerpo
  -- Asunto: "Challenger y Partner te desafiaron junto con TuCompañero"
  IF challenger_partner_name IS NOT NULL THEN
    subject_text := format('%s y %s te han desafiado', challenger_name, challenger_partner_name);
  ELSE
    subject_text := format('%s te ha desafiado', challenger_name);
  END IF;

  -- --- Notificar al jugador desafiado principal ---
  IF challenged_rec.id IS NOT NULL THEN
    body_text := format(
      '<h2>¡Nuevo Desafío!</h2>'
      '<p><strong>%s</strong>%s te han desafiado%s en <strong>%s</strong>.</p>'
      '%s'
      '<p style="margin-top:16px;"><a href="https://twinco.padelx.es/challenges" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver desafío</a></p>',
      challenger_name,
      CASE WHEN challenger_partner_name IS NOT NULL THEN format(' y %s', challenger_partner_name) ELSE '' END,
      CASE WHEN challenged_partner_rec.name IS NOT NULL THEN format(' junto con %s', challenged_partner_rec.name) ELSE '' END,
      COALESCE(tenant_name, 'tu club'),
      CASE WHEN NEW.message IS NOT NULL AND NEW.message != '' THEN format('<p><em>Mensaje: "%s"</em></p>', NEW.message) ELSE '' END
    );

    -- Email
    IF challenged_rec.email IS NOT NULL AND challenged_rec.notify_email THEN
      PERFORM enqueue_notification_email(
        challenged_rec.email,
        subject_text,
        body_text,
        'challenge_created',
        NEW.tenant_id
      );
    END IF;

    -- WhatsApp
    IF challenged_rec.phone IS NOT NULL AND challenged_rec.phone != '' AND challenged_rec.notify_whatsapp THEN
      PERFORM enqueue_whatsapp_message(
        NEW.tenant_id,
        challenged_rec.phone,
        'challenge_created',
        jsonb_build_array(
          challenged_rec.name,
          COALESCE(challenger_name, 'Un jugador'),
          COALESCE(challenger_partner_name, ''),
          COALESCE(tenant_name, 'tu club')
        )
      );
    END IF;
  END IF;

  -- --- Notificar al compañero del desafiado (si existe) ---
  IF challenged_partner_rec.id IS NOT NULL THEN
    body_text := format(
      '<h2>¡Nuevo Desafío!</h2>'
      '<p><strong>%s</strong>%s te han desafiado junto con <strong>%s</strong> en <strong>%s</strong>.</p>'
      '%s'
      '<p style="margin-top:16px;"><a href="https://twinco.padelx.es/challenges" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver desafío</a></p>',
      challenger_name,
      CASE WHEN challenger_partner_name IS NOT NULL THEN format(' y %s', challenger_partner_name) ELSE '' END,
      challenged_rec.name,
      COALESCE(tenant_name, 'tu club'),
      CASE WHEN NEW.message IS NOT NULL AND NEW.message != '' THEN format('<p><em>Mensaje: "%s"</em></p>', NEW.message) ELSE '' END
    );

    IF challenged_partner_rec.email IS NOT NULL AND challenged_partner_rec.notify_email THEN
      PERFORM enqueue_notification_email(
        challenged_partner_rec.email,
        subject_text,
        body_text,
        'challenge_created',
        NEW.tenant_id
      );
    END IF;

    IF challenged_partner_rec.phone IS NOT NULL AND challenged_partner_rec.phone != '' AND challenged_partner_rec.notify_whatsapp THEN
      PERFORM enqueue_whatsapp_message(
        NEW.tenant_id,
        challenged_partner_rec.phone,
        'challenge_created',
        jsonb_build_array(
          challenged_partner_rec.name,
          COALESCE(challenger_name, 'Un jugador'),
          COALESCE(challenger_partner_name, ''),
          COALESCE(tenant_name, 'tu club')
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. PARTIDO NUEVO — notify_on_match_created
-- =============================================
-- Notifica a los 4 jugadores del partido

CREATE OR REPLACE FUNCTION notify_on_match_created()
RETURNS TRIGGER AS $$
DECLARE
  p RECORD;
  player_ids BIGINT[];
  tenant_name TEXT;
  court_name TEXT;
  match_date TEXT;
  subject_text TEXT;
  body_text TEXT;
  all_player_names TEXT;
  p1a_name TEXT;
  p2a_name TEXT;
  p1b_name TEXT;
  p2b_name TEXT;
BEGIN
  -- Recoger los 4 IDs de jugadores (pueden ser NULL)
  player_ids := ARRAY[NEW.player_1_a, NEW.player_2_a, NEW.player_1_b, NEW.player_2_b];

  -- Nombre del club
  SELECT name INTO tenant_name FROM tenants WHERE id = NEW.tenant_id LIMIT 1;

  -- Nombre de la pista
  IF NEW.court_id IS NOT NULL THEN
    SELECT name INTO court_name FROM courts WHERE id = NEW.court_id LIMIT 1;
  END IF;
  court_name := COALESCE(court_name, NEW.court, 'Sin pista asignada');

  -- Fecha y hora
  IF NEW.start_time IS NOT NULL THEN
    match_date := to_char(NEW.start_time AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI');
  ELSE
    match_date := 'Fecha por confirmar';
  END IF;

  -- Nombres de los 4 jugadores para el email
  SELECT name INTO p1a_name FROM players WHERE id = NEW.player_1_a LIMIT 1;
  SELECT name INTO p2a_name FROM players WHERE id = NEW.player_2_a LIMIT 1;
  SELECT name INTO p1b_name FROM players WHERE id = NEW.player_1_b LIMIT 1;
  SELECT name INTO p2b_name FROM players WHERE id = NEW.player_2_b LIMIT 1;

  subject_text := format('Nuevo partido programado en %s', COALESCE(tenant_name, 'PadelX'));

  -- Notificar a cada jugador
  FOR p IN
    SELECT pl.id, pl.name, pl.email, pl.phone,
           COALESCE(pl.notify_email, true) AS notify_email,
           COALESCE(pl.notify_whatsapp, false) AS notify_whatsapp
      FROM players pl
     WHERE pl.id = ANY(player_ids)
       AND pl.id IS NOT NULL
  LOOP
    body_text := format(
      '<h2>¡Nuevo Partido!</h2>'
      '<p>Hola <strong>%s</strong>, tenés un nuevo partido programado.</p>'
      '<table style="border-collapse:collapse;margin:16px 0;">'
      '<tr><td style="padding:4px 12px;font-weight:bold;">Equipo A:</td><td style="padding:4px 12px;">%s y %s</td></tr>'
      '<tr><td style="padding:4px 12px;font-weight:bold;">Equipo B:</td><td style="padding:4px 12px;">%s y %s</td></tr>'
      '<tr><td style="padding:4px 12px;font-weight:bold;">Fecha:</td><td style="padding:4px 12px;">%s</td></tr>'
      '<tr><td style="padding:4px 12px;font-weight:bold;">Pista:</td><td style="padding:4px 12px;">%s</td></tr>'
      '</table>'
      '<p><a href="https://twinco.padelx.es/matches" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver partido</a></p>',
      p.name,
      COALESCE(p1a_name, '—'), COALESCE(p2a_name, '—'),
      COALESCE(p1b_name, '—'), COALESCE(p2b_name, '—'),
      match_date,
      court_name
    );

    -- Email
    IF p.email IS NOT NULL AND p.notify_email THEN
      PERFORM enqueue_notification_email(
        p.email,
        subject_text,
        body_text,
        'match_created',
        NEW.tenant_id
      );
    END IF;

    -- WhatsApp
    IF p.phone IS NOT NULL AND p.phone != '' AND p.notify_whatsapp THEN
      PERFORM enqueue_whatsapp_message(
        NEW.tenant_id,
        p.phone,
        'match_created',
        jsonb_build_array(
          p.name,
          COALESCE(p1a_name, '—') || ' y ' || COALESCE(p2a_name, '—'),
          COALESCE(p1b_name, '—') || ' y ' || COALESCE(p2b_name, '—'),
          match_date
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger en matches
DROP TRIGGER IF EXISTS on_match_created ON matches;
CREATE TRIGGER on_match_created
AFTER INSERT ON matches
FOR EACH ROW EXECUTE FUNCTION notify_on_match_created();


-- =============================================
-- 3. RECORDATORIO 24H — enqueue_match_reminder_24h
-- =============================================
-- Busca partidos que empiezan en las próximas 24-25 horas
-- y que no se haya enviado recordatorio aún (template_type != 'match_reminder_24h')

CREATE OR REPLACE FUNCTION enqueue_match_reminder_24h()
RETURNS VOID AS $$
DECLARE
  m RECORD;
  p RECORD;
  player_ids BIGINT[];
  court_name TEXT;
  tenant_name TEXT;
  match_date TEXT;
  p1a_name TEXT;
  p2a_name TEXT;
  p1b_name TEXT;
  p2b_name TEXT;
  already_sent BOOLEAN;
BEGIN
  -- Iterar sobre partidos que empiezan en 24-25 horas (ventana de 1 hora para el cron)
  FOR m IN
    SELECT id, tenant_id, player_1_a, player_2_a, player_1_b, player_2_b,
           start_time, court_id, court
      FROM matches
     WHERE start_time BETWEEN (NOW() + INTERVAL '23 hours') AND (NOW() + INTERVAL '25 hours')
       AND (winner IS NULL OR winner = 'pending')
  LOOP
    -- Verificar si ya se envió recordatorio para este partido
    SELECT EXISTS(
      SELECT 1 FROM email_queue
       WHERE template_type = 'match_reminder_24h'
         AND subject LIKE '%' || m.id::text || '%_reminder'
    ) INTO already_sent;

    IF already_sent THEN
      CONTINUE;
    END IF;

    -- Datos del partido
    player_ids := ARRAY[m.player_1_a, m.player_2_a, m.player_1_b, m.player_2_b];

    SELECT name INTO tenant_name FROM tenants WHERE id = m.tenant_id LIMIT 1;

    IF m.court_id IS NOT NULL THEN
      SELECT name INTO court_name FROM courts WHERE id = m.court_id LIMIT 1;
    END IF;
    court_name := COALESCE(court_name, m.court, 'Sin pista asignada');

    match_date := to_char(m.start_time AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI');

    SELECT name INTO p1a_name FROM players WHERE id = m.player_1_a LIMIT 1;
    SELECT name INTO p2a_name FROM players WHERE id = m.player_2_a LIMIT 1;
    SELECT name INTO p1b_name FROM players WHERE id = m.player_1_b LIMIT 1;
    SELECT name INTO p2b_name FROM players WHERE id = m.player_2_b LIMIT 1;

    -- Notificar a cada jugador
    FOR p IN
      SELECT pl.id, pl.name, pl.email, pl.phone,
             COALESCE(pl.notify_email, true) AS notify_email,
             COALESCE(pl.notify_whatsapp, false) AS notify_whatsapp
        FROM players pl
       WHERE pl.id = ANY(player_ids)
         AND pl.id IS NOT NULL
    LOOP
      -- Email
      IF p.email IS NOT NULL AND p.notify_email THEN
        PERFORM enqueue_notification_email(
          p.email,
          format('Recordatorio: partido mañana a las %s', to_char(m.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI')),
          format(
            '<h2>Recordatorio de Partido</h2>'
            '<p>Hola <strong>%s</strong>, te recordamos que mañana tenés un partido.</p>'
            '<table style="border-collapse:collapse;margin:16px 0;">'
            '<tr><td style="padding:4px 12px;font-weight:bold;">Equipo A:</td><td style="padding:4px 12px;">%s y %s</td></tr>'
            '<tr><td style="padding:4px 12px;font-weight:bold;">Equipo B:</td><td style="padding:4px 12px;">%s y %s</td></tr>'
            '<tr><td style="padding:4px 12px;font-weight:bold;">Fecha:</td><td style="padding:4px 12px;">%s</td></tr>'
            '<tr><td style="padding:4px 12px;font-weight:bold;">Pista:</td><td style="padding:4px 12px;">%s</td></tr>'
            '</table>'
            '<p><a href="https://twinco.padelx.es/matches" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver partido</a></p>',
            p.name,
            COALESCE(p1a_name, '—'), COALESCE(p2a_name, '—'),
            COALESCE(p1b_name, '—'), COALESCE(p2b_name, '—'),
            match_date,
            court_name
          ),
          'match_reminder_24h',
          m.tenant_id
        );
      END IF;

      -- WhatsApp
      IF p.phone IS NOT NULL AND p.phone != '' AND p.notify_whatsapp THEN
        PERFORM enqueue_whatsapp_message(
          m.tenant_id,
          p.phone,
          'match_reminder',
          jsonb_build_array(
            p.name,
            match_date,
            court_name,
            COALESCE(tenant_name, 'tu club')
          )
        );
      END IF;
    END LOOP;

    -- Marcar como procesado insertando un registro centinela
    INSERT INTO email_queue (tenant_id, recipient_email, subject, body_html, template_type, status)
    VALUES (m.tenant_id, 'system@padelx.es', m.id::text || '_reminder', '', 'match_reminder_24h', 'sent');

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
