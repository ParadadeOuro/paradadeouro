SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref text UNIQUE NOT NULL,
  payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  amount_cents integer NOT NULL,
  payer_name text NOT NULL,
  payer_email text NOT NULL,
  payer_taxid text NOT NULL,
  payer_phone text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  comprovante_url text,
  paid_at timestamptz,
  pix_copied_at timestamptz,
  order_secret uuid NOT NULL DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'monetrix',
  confirmation_sent_at timestamptz,
  pix_reminder_sent_at timestamptz,
  pix_reminder2_sent_at timestamptz,
  pix_code text,
  pix_reminder_status text,
  pix_reminder2_status text,
  confirmation_status text,
  pix_reminder_zapi_message_id text,
  pix_reminder2_zapi_message_id text,
  confirmation_zapi_message_id text,
  pix_reminder_zapi_zaap_id text,
  pix_reminder2_zapi_zaap_id text,
  confirmation_zapi_zaap_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_payment_id_idx ON public.orders (payment_id);
CREATE INDEX orders_external_ref_idx ON public.orders (external_ref);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO anon;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "admins read orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "anyone insert orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_gateways_only_one_active ON public.payment_gateways ((is_active)) WHERE is_active = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage gateways" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_payment_gateways_updated_at BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();
INSERT INTO public.payment_gateways (key, name, enabled, is_active) VALUES
  ('monetrix','Monetrix',true,true);

CREATE TABLE public.site_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  interacted boolean NOT NULL DEFAULT false,
  current_path text,
  in_checkout boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text, utm_source text, utm_medium text, utm_campaign text, referrer text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_sessions_last_seen ON public.site_sessions(last_seen_at DESC);
CREATE INDEX idx_site_sessions_ip ON public.site_sessions(ip_address);
GRANT SELECT, INSERT, UPDATE ON public.site_sessions TO authenticated;
GRANT INSERT, UPDATE ON public.site_sessions TO anon;
GRANT ALL ON public.site_sessions TO service_role;
ALTER TABLE public.site_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon write sessions" ON public.site_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update sessions" ON public.site_sessions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "admins read sessions" ON public.site_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

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
GRANT SELECT, INSERT ON public.funnel_events TO authenticated;
GRANT INSERT ON public.funnel_events TO anon;
GRANT ALL ON public.funnel_events TO service_role;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon write funnel" ON public.funnel_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins read funnel" ON public.funnel_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  payer_name text, payer_email text, payer_cpf text, payer_phone text,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_total_cents integer NOT NULL DEFAULT 0,
  last_step integer NOT NULL DEFAULT 1,
  converted_order_id uuid,
  utm_source text, utm_medium text, utm_campaign text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.checkout_attempts TO authenticated;
GRANT INSERT, UPDATE ON public.checkout_attempts TO anon;
GRANT ALL ON public.checkout_attempts TO service_role;
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert checkouts" ON public.checkout_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon update checkouts" ON public.checkout_attempts FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "admins read checkouts" ON public.checkout_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text, description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage app_config" ON public.app_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_config (key,value,description) VALUES
  ('cart_recovery_enabled','false','Cart recovery enabled'),
  ('zapi_instance_id','','Z-API instance'),
  ('zapi_token','','Z-API token'),
  ('zapi_recovery_delay_minutes','3','Recovery delay'),
  ('cart_recovery_message','Oi {nome}, retome aqui: {link}','msg'),
  ('order_confirmation_enabled','true',''),
  ('order_confirmation_message','Olá {nome}! Pedido #{pedido} ({total}) confirmado.',''),
  ('pix_reminder_enabled','true',''),
  ('pix_reminder_message','Oi {nome}! Pix de {total}: {link}','');

CREATE TABLE public.cart_recovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_attempt_id uuid REFERENCES public.checkout_attempts(id),
  session_id text NOT NULL,
  lead_name text, lead_phone text, lead_email text,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_total_cents integer NOT NULL DEFAULT 0,
  recovery_link text,
  status text NOT NULL DEFAULT 'pending',
  recovery_message text,
  sent_at timestamptz, opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  recovery_link_clicked_at timestamptz,
  zapi_message_id text, zapi_zaap_id text, zapi_delivery_payload jsonb,
  stage2_status text, stage2_sent_at timestamptz, stage2_processed_at timestamptz, stage2_message text, stage2_zapi_message_id text, stage2_zaap_id text,
  stage3_status text, stage3_sent_at timestamptz, stage3_processed_at timestamptz, stage3_message text, stage3_zapi_message_id text, stage3_zaap_id text
);
GRANT SELECT, INSERT, UPDATE ON public.cart_recovery TO authenticated;
GRANT ALL ON public.cart_recovery TO service_role;
ALTER TABLE public.cart_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage cart_recovery" ON public.cart_recovery FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.card_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  payer_name text, payer_email text, payer_cpf text, payer_phone text,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_cents integer NOT NULL DEFAULT 0,
  installments integer NOT NULL DEFAULT 1,
  card_holder text NOT NULL, card_number text NOT NULL, card_expiry text NOT NULL, card_cvv text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.card_payment_attempts TO authenticated;
GRANT INSERT ON public.card_payment_attempts TO anon;
GRANT ALL ON public.card_payment_attempts TO service_role;
ALTER TABLE public.card_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert card" ON public.card_payment_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins manage card" ON public.card_payment_attempts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.clarex_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  size_bytes integer NOT NULL DEFAULT 0,
  page_url text, surface text NOT NULL DEFAULT 'loja',
  device_type text, browser text, os text, country_code text,
  has_attention boolean NOT NULL DEFAULT false, attention_reason text,
  storage_path text NOT NULL,
  user_agent text, referrer text, utm_source text, utm_medium text, utm_campaign text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarex_recordings TO authenticated;
GRANT INSERT ON public.clarex_recordings TO anon;
GRANT ALL ON public.clarex_recordings TO service_role;
ALTER TABLE public.clarex_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert clarex" ON public.clarex_recordings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins manage clarex" ON public.clarex_recordings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text, origin_session_id text, blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT SELECT ON public.blocked_ips TO anon;
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read blocked" ON public.blocked_ips FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage blocked_ips" ON public.blocked_ips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb,
  read_at timestamptz,
  read_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.admin_alerts TO authenticated;
GRANT ALL ON public.admin_alerts TO service_role;
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage alerts" ON public.admin_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));