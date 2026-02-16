-- =============================================================
-- Agregar teléfono WhatsApp y preferencias de notificación a players
-- =============================================================

-- 1. Nuevas columnas en players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT false;

-- 2. Actualizar trigger de booking para respetar preferencias
CREATE OR REPLACE FUNCTION notify_on_booking_created()
RETURNS TRIGGER AS $$
DECLARE
  player_email TEXT;
  player_phone TEXT;
  player_first_name TEXT;
  player_notify_email BOOLEAN;
  player_notify_whatsapp BOOLEAN;
  court_name TEXT;
  tenant_name TEXT;
BEGIN
  -- Datos del jugador desde players (vinculado via user_id → profiles → players)
  -- Primero intentamos obtener datos del profile (user_id)
  SELECT p.email, p.phone, p.first_name
    INTO player_email, player_phone, player_first_name
    FROM profiles p
   WHERE p.id = NEW.user_id
   LIMIT 1;

  -- Luego buscamos las preferencias de notificación del player
  -- Un player puede estar vinculado por email o por user_id
  DECLARE
    pl_phone TEXT;
    pl_notify_email BOOLEAN;
    pl_notify_whatsapp BOOLEAN;
  BEGIN
    SELECT pl.phone, COALESCE(pl.notify_email, true), COALESCE(pl.notify_whatsapp, false)
      INTO pl_phone, pl_notify_email, pl_notify_whatsapp
      FROM players pl
     WHERE pl.email = player_email
        OR pl.name = (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.user_id LIMIT 1)
     LIMIT 1;

    -- Si el player tiene teléfono propio, usar ese
    IF pl_phone IS NOT NULL AND pl_phone != '' THEN
      player_phone := pl_phone;
    END IF;

    player_notify_email := COALESCE(pl_notify_email, true);
    player_notify_whatsapp := COALESCE(pl_notify_whatsapp, false);
  END;

  -- Nombre de la pista
  SELECT name INTO court_name FROM courts WHERE id = NEW.court_id LIMIT 1;

  -- Nombre del club
  SELECT name INTO tenant_name FROM tenants WHERE id = NEW.tenant_id LIMIT 1;

  -- Email de confirmación (solo si tiene habilitado notify_email)
  IF player_email IS NOT NULL AND player_notify_email THEN
    PERFORM enqueue_notification_email(
      player_email,
      'Pista Reservada Correctamente',
      format(
        '<h2>¡Reserva Confirmada!</h2><p>Pista: %s</p><p>Fecha: %s</p><p>Hora: %s - %s</p><p><a href="https://qa.padelx.es/bookings">Ver reserva</a></p>',
        court_name,
        NEW.booking_date,
        NEW.start_time,
        NEW.end_time
      ),
      'booking_confirmed',
      NEW.tenant_id
    );
  END IF;

  -- WhatsApp de confirmación (solo si tiene habilitado notify_whatsapp y tiene teléfono)
  IF player_phone IS NOT NULL AND player_phone != '' AND player_notify_whatsapp THEN
    PERFORM enqueue_whatsapp_message(
      NEW.tenant_id,
      player_phone,
      'booking_confirmation',
      jsonb_build_array(
        COALESCE(player_first_name, 'Jugador'),
        COALESCE(tenant_name, 'tu club'),
        to_char(NEW.booking_date, 'DD/MM/YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI'),
        COALESCE(court_name, 'Pista')
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
