
-- 1) Sessões do site (heartbeat)
CREATE TABLE public.site_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  interacted boolean NOT NULL DEFAULT false,
  current_path text,
  in_checkout boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_sessions_last_seen ON public.site_sessions(last_seen_at DESC);
CREATE INDEX idx_site_sessions_interacted ON public.site_sessions(interacted, last_seen_at DESC);

GRANT SELECT ON public.site_sessions TO authenticated;
GRANT ALL ON public.site_sessions TO service_role;

ALTER TABLE public.site_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read sessions" ON public.site_sessions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Eventos do funil
CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL,
  product_handle text,
  order_ref text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_funnel_events_created ON public.funnel_events(created_at DESC);
CREATE INDEX idx_funnel_events_type ON public.funnel_events(event_type, created_at DESC);
CREATE INDEX idx_funnel_events_session ON public.funnel_events(session_id);

GRANT SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read funnel" ON public.funnel_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) Tentativas de checkout (carrinhos abandonados)
CREATE TABLE public.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  payer_name text,
  payer_email text,
  payer_cpf text,
  payer_phone text,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_total_cents integer NOT NULL DEFAULT 0,
  last_step integer NOT NULL DEFAULT 1,
  converted_order_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_checkout_attempts_activity ON public.checkout_attempts(last_activity_at DESC);
CREATE INDEX idx_checkout_attempts_open ON public.checkout_attempts(last_activity_at DESC) WHERE converted_order_id IS NULL;

GRANT SELECT ON public.checkout_attempts TO authenticated;
GRANT ALL ON public.checkout_attempts TO service_role;

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read checkouts" ON public.checkout_attempts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
