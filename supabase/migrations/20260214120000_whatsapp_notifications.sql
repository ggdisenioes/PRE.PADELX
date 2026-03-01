-- =============================================================
-- WhatsApp notification queue + helper + modify booking trigger
-- =============================================================

-- 1. Tabla whatsapp_queue
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  to_phone TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT DEFAULT 'es',
  template_params JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message TEXT,
  attempts INT DEFAULT 0,
  meta_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_pending
  ON public.whatsapp_queue(status, created_at)
  WHERE status = 'pending';

-- RLS habilitado, sin policies publicas (solo service_role accede)
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- 2. Helper function para encolar mensajes de WhatsApp
CREATE OR REPLACE FUNCTION enqueue_whatsapp_message(
  p_tenant_id UUID,
  p_to_phone TEXT,
  p_template_name TEXT,
  p_template_params JSONB DEFAULT '[]'::jsonb,
  p_template_language TEXT DEFAULT 'es'
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.whatsapp_queue (tenant_id, to_phone, template_name, template_params, template_language)
  VALUES (p_tenant_id, p_to_phone, p_template_name, p_template_params, p_template_language)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Modificar trigger notify_on_booking_created para también encolar WhatsApp
CREATE OR REPLACE FUNCTION notify_on_booking_created()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_phone TEXT;
  user_first_name TEXT;
  court_name TEXT;
  tenant_name TEXT;
BEGIN
  -- Datos del usuario
  SELECT email, phone, first_name
    INTO user_email, user_phone, user_first_name
    FROM profiles
   WHERE id = NEW.user_id
   LIMIT 1;

  -- Nombre de la pista
  SELECT name INTO court_name FROM courts WHERE id = NEW.court_id LIMIT 1;

  -- Nombre del club
  SELECT name INTO tenant_name FROM tenants WHERE id = NEW.tenant_id LIMIT 1;

  -- Email de confirmación (existente)
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

  -- WhatsApp de confirmación (nuevo)
  IF user_phone IS NOT NULL AND user_phone != '' THEN
    PERFORM enqueue_whatsapp_message(
      NEW.tenant_id,
      user_phone,
      'booking_confirmation',
      jsonb_build_array(
        COALESCE(user_first_name, 'Jugador'),
        COALESCE(tenant_name, 'tu club'),
        to_char(NEW.booking_date, 'DD/MM/YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI'),
        COALESCE(court_name, 'Pista')
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
