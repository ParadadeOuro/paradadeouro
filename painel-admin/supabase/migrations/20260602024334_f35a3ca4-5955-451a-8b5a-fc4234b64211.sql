
CREATE TABLE public.admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  read_at TIMESTAMPTZ,
  read_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_alerts_unread ON public.admin_alerts (created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_admin_alerts_type_recent ON public.admin_alerts (alert_type, created_at DESC);

GRANT SELECT, UPDATE ON public.admin_alerts TO authenticated;
GRANT ALL ON public.admin_alerts TO service_role;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alerts"
  ON public.admin_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update alerts"
  ON public.admin_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Função: checa backlog de emails e cria alerta se atrasado
CREATE OR REPLACE FUNCTION public.check_email_backlog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck_count INT;
  v_threshold INT := 5;
  v_recent_alert_exists BOOLEAN;
BEGIN
  -- Conta emails únicos (por message_id) ainda pendentes há mais de 10 min
  SELECT COUNT(*) INTO v_stuck_count
  FROM (
    SELECT DISTINCT ON (message_id) message_id, status, created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND created_at > now() - interval '4 hours'
    ORDER BY message_id, created_at DESC
  ) latest
  WHERE status = 'pending'
    AND created_at < now() - interval '10 minutes';

  IF v_stuck_count >= v_threshold THEN
    -- Evita spam: só cria novo alerta se não houve um nos últimos 30 min
    SELECT EXISTS (
      SELECT 1 FROM public.admin_alerts
      WHERE alert_type = 'email_backlog'
        AND created_at > now() - interval '30 minutes'
    ) INTO v_recent_alert_exists;

    IF NOT v_recent_alert_exists THEN
      INSERT INTO public.admin_alerts (alert_type, severity, title, message, details)
      VALUES (
        'email_backlog',
        'error',
        'Fila de emails travada',
        format('%s emails pendentes há mais de 10 minutos. O cron pode ter parado.', v_stuck_count),
        jsonb_build_object('stuck_count', v_stuck_count, 'detected_at', now())
      );
    END IF;
  END IF;
END;
$$;

-- Cron a cada 5 minutos
SELECT cron.schedule(
  'check-email-backlog',
  '*/5 * * * *',
  $$SELECT public.check_email_backlog();$$
);
