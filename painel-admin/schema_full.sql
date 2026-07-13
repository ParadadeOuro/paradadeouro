
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_payment_id_idx ON public.orders (payment_id);
CREATE INDEX orders_external_ref_idx ON public.orders (external_ref);

GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can create an order"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anyone can read orders"
  ON public.orders FOR SELECT TO anon, authenticated
  USING (true);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

-- Storage bucket for PIX receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can upload comprovantes"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'comprovantes');

CREATE POLICY "Public can read comprovantes"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'comprovantes');

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Public can read comprovantes" ON storage.objects;
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_copied_at TIMESTAMP WITH TIME ZONE;DROP POLICY IF EXISTS "anyone can create an order" ON public.orders;
DROP POLICY IF EXISTS "anyone can read orders" ON public.orders;

CREATE POLICY "admins can read orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_secret UUID DEFAULT gen_random_uuid();

-- Atualiza registros existentes que ainda não têm order_secret
UPDATE public.orders SET order_secret = gen_random_uuid() WHERE order_secret IS NULL;

-- Torna order_secret NOT NULL para garantir que sempre exista
ALTER TABLE public.orders ALTER COLUMN order_secret SET NOT NULL;

-- Remove a policy pública de INSERT no bucket comprovantes (upload agora é feito apenas via server function com order_secret)
DROP POLICY IF EXISTS "Public can upload comprovantes" ON storage.objects;

-- Adiciona policy restritiva para leitura apenas de arquivos no próprio bucket (download via signed URLs ainda funciona para service_role)
-- O upload via client direto ao storage não é mais permitido; todo upload passa pela server function uploadComprovante
-- Gateways table
CREATE TABLE public.payment_gateways (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active gateway at a time
CREATE UNIQUE INDEX payment_gateways_only_one_active
  ON public.payment_gateways ((is_active)) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read gateways"
  ON public.payment_gateways FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update gateways"
  ON public.payment_gateways FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins insert gateways"
  ON public.payment_gateways FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_payment_gateways_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

-- Seed
INSERT INTO public.payment_gateways (key, name, enabled, is_active) VALUES
  ('monetrix', 'Monetrix', true, true);

-- Track which gateway processed each order
ALTER TABLE public.orders
  ADD COLUMN gateway text NOT NULL DEFAULT 'monetrix';

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

CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage app_config"
ON public.app_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Configuração padrão: recuperação de carrinho desativada até ter Z-API
INSERT INTO public.app_config (key, value, description)
VALUES ('cart_recovery_enabled', 'false', 'Habilita/desabilita envio automático de recuperação de carrinho via WhatsApp');

INSERT INTO public.app_config (key, value, description)
VALUES ('zapi_instance_id', '', 'ID da instância Z-API');

INSERT INTO public.app_config (key, value, description)
VALUES ('zapi_token', '', 'Token de acesso Z-API');

INSERT INTO public.app_config (key, value, description)
VALUES ('zapi_recovery_delay_minutes', '3', 'Minutos após abandono para disparar recuperação');

CREATE TABLE public.cart_recovery (
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

CREATE POLICY "admins manage cart_recovery"
ON public.cart_recovery
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Habilita extensões (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job anterior se existir, ignorando erro se não existir
DO $$
BEGIN
  PERFORM cron.unschedule('cart-recovery-job');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job cart-recovery-job não existia, ignorando...';
END $$;

-- Agenda job para rodar a cada 3 minutos
SELECT cron.schedule(
  'cart-recovery-job',
  '*/3 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://project--9e4cfe6b-5493-441d-a526-3ea2317d7e5e.lovable.app/api/public/hooks/cart-recovery',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
INSERT INTO public.app_config (key, value, description)
VALUES (
  'cart_recovery_message',
  'Oi {nome}, vi que você deixou seu carrinho com {total} na Gol Raiz. Ainda tem interesse? Pode retomar aqui: {link}',
  'Template da mensagem de recuperação. Placeholders: {nome}, {total}, {link}'
)
ON CONFLICT (key) DO NOTHING;CREATE TABLE public.card_payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  payer_name text,
  payer_email text,
  payer_cpf text,
  payer_phone text,
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

CREATE POLICY "admins manage card attempts"
ON public.card_payment_attempts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_card_payment_attempts_created_at ON public.card_payment_attempts(created_at DESC);
CREATE INDEX idx_card_payment_attempts_status ON public.card_payment_attempts(status);UPDATE storage.buckets
SET public = false
WHERE id = 'comprovantes';

DROP POLICY IF EXISTS "Public can upload comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Public can read comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete comprovantes" ON storage.objects;

CREATE POLICY "Admins can read comprovantes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can upload comprovantes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update comprovantes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete comprovantes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);-- Clarex: tabela de gravações de sessão
CREATE TABLE public.clarex_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  size_bytes integer NOT NULL DEFAULT 0,
  page_url text,
  surface text NOT NULL DEFAULT 'loja', -- 'loja' | 'checkout'
  device_type text, -- 'mobile' | 'desktop' | 'tablet'
  browser text,
  os text,
  country_code text,
  has_attention boolean NOT NULL DEFAULT false,
  attention_reason text,
  storage_path text NOT NULL,
  user_agent text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clarex_recordings_created_at ON public.clarex_recordings (created_at DESC);
CREATE INDEX idx_clarex_recordings_session ON public.clarex_recordings (session_id);
CREATE INDEX idx_clarex_recordings_surface ON public.clarex_recordings (surface);
CREATE INDEX idx_clarex_recordings_attention ON public.clarex_recordings (has_attention) WHERE has_attention = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarex_recordings TO authenticated;
GRANT ALL ON public.clarex_recordings TO service_role;

ALTER TABLE public.clarex_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage clarex_recordings"
  ON public.clarex_recordings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Bucket privado para os blobs gzipados
INSERT INTO storage.buckets (id, name, public)
VALUES ('clarex-recordings', 'clarex-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admins read clarex blobs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins write clarex blobs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete clarex blobs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_status_paid_conf
  ON public.orders (status, paid_at)
  WHERE status = 'PAID' AND confirmation_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_reminder
  ON public.orders (status, created_at)
  WHERE status = 'PENDING' AND pix_reminder_sent_at IS NULL;

INSERT INTO public.app_config (key, value, description) VALUES
  ('order_confirmation_enabled', 'true', 'Habilita envio automático de mensagem de confirmação após pagamento'),
  ('order_confirmation_delay_minutes', '1', 'Minutos após pagamento para enviar confirmação'),
  ('order_confirmation_message', 'Olá {nome}! ✅ Seu pedido na Gol Raiz foi confirmado e o pagamento ({total}) foi aprovado. Em breve te enviamos o rastreio. Pedido: {pedido}', 'Template da mensagem de confirmação de pedido pago'),
  ('pix_reminder_enabled', 'true', 'Habilita lembrete de Pix pendente'),
  ('pix_reminder_delay_minutes', '5', 'Minutos após criação do pedido sem pagamento para enviar lembrete'),
  ('pix_reminder_message', 'Oi {nome}! Notamos que seu Pix de {total} na Gol Raiz ainda não foi pago. Para garantir seu pedido, finalize aqui: {link}', 'Template da mensagem de lembrete de Pix pendente')
ON CONFLICT (key) DO NOTHING;

-- Remove duplicatas mantendo o mais recente por checkout_attempt_id
DELETE FROM public.cart_recovery a
USING public.cart_recovery b
WHERE a.checkout_attempt_id IS NOT NULL
  AND a.checkout_attempt_id = b.checkout_attempt_id
  AND a.created_at < b.created_at;

-- Cria unique constraint parcial (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS cart_recovery_checkout_attempt_id_unique
  ON public.cart_recovery (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;
UPDATE public.app_config
SET value = E'Olá, {nome}! 👋\n\nNotei que você começou um pedido na Gol Raiz e não finalizou:\n\n{itens}\n\n💰 Total: *{total}*\n\nPara te ajudar, separei seu carrinho — é só clicar no link abaixo para retomar de onde parou (com seus dados já preenchidos):\n\n{link}\n\nQualquer dúvida, estou por aqui! 🟡⚫',
    updated_at = now()
WHERE key = 'cart_recovery_message';ALTER TABLE public.cart_recovery
ADD COLUMN IF NOT EXISTS zapi_message_id text,
ADD COLUMN IF NOT EXISTS zapi_zaap_id text,
ADD COLUMN IF NOT EXISTS zapi_delivery_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_message_id
ON public.cart_recovery (zapi_message_id)
WHERE zapi_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_zaap_id
ON public.cart_recovery (zapi_zaap_id)
WHERE zapi_zaap_id IS NOT NULL;UPDATE public.cart_recovery
SET status = 'pending',
    sent_at = NULL,
    processed_at = NULL,
    zapi_message_id = NULL,
    zapi_zaap_id = NULL,
    zapi_delivery_payload = NULL
WHERE status = 'sent'
  AND zapi_message_id IS NULL
  AND zapi_zaap_id IS NULL
  AND zapi_delivery_payload IS NULL;

DO $$
DECLARE
  recovery_job_id bigint;
BEGIN
  SELECT jobid INTO recovery_job_id
  FROM cron.job
  WHERE jobname = 'cart-recovery-job'
  LIMIT 1;

  IF recovery_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := recovery_job_id,
      schedule := '* * * * *',
      command := $cmd$
        SELECT net.http_post(
          url := 'https://usegolraiz.com.br/api/public/hooks/cart-recovery',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        ) AS request_id;
      $cmd$
    );
  ELSE
    PERFORM cron.schedule(
      'cart-recovery-job',
      '* * * * *',
      $cmd$
        SELECT net.http_post(
          url := 'https://usegolraiz.com.br/api/public/hooks/cart-recovery',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        ) AS request_id;
      $cmd$
    );
  END IF;
END $$;ALTER TABLE public.cart_recovery ADD COLUMN IF NOT EXISTS recovery_link_clicked_at timestamptz;ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_reminder2_sent_at timestamptz;ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_code text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS confirmation_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_zaap_id text;

UPDATE public.orders SET pix_reminder_status = 'queued'
  WHERE pix_reminder_sent_at IS NOT NULL AND pix_reminder_status IS NULL;
UPDATE public.orders SET pix_reminder2_status = 'queued'
  WHERE pix_reminder2_sent_at IS NOT NULL AND pix_reminder2_status IS NULL;
UPDATE public.orders SET confirmation_status = 'queued'
  WHERE confirmation_sent_at IS NOT NULL AND confirmation_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder_msgid ON public.orders (pix_reminder_zapi_message_id) WHERE pix_reminder_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder2_msgid ON public.orders (pix_reminder2_zapi_message_id) WHERE pix_reminder2_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_msgid ON public.orders (confirmation_zapi_message_id) WHERE confirmation_zapi_message_id IS NOT NULL;

ALTER TABLE public.cart_recovery
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
  ADD COLUMN IF NOT EXISTS stage3_zaap_id text;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage2_zapi_message_id ON public.cart_recovery (stage2_zapi_message_id);
CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage3_zapi_message_id ON public.cart_recovery (stage3_zapi_message_id);
UPDATE public.orders SET pix_reminder_status='failed', pix_reminder_sent_at=NULL WHERE pix_reminder_sent_at IS NOT NULL AND pix_reminder_zapi_message_id IS NULL AND (pix_reminder_status IS NULL OR pix_reminder_status IN ('queued','pending','sent'));
UPDATE public.orders SET pix_reminder2_status='failed', pix_reminder2_sent_at=NULL WHERE pix_reminder2_sent_at IS NOT NULL AND pix_reminder2_zapi_message_id IS NULL AND (pix_reminder2_status IS NULL OR pix_reminder2_status IN ('queued','pending','sent'));
UPDATE public.orders SET confirmation_status='failed', confirmation_sent_at=NULL WHERE confirmation_sent_at IS NOT NULL AND confirmation_zapi_message_id IS NULL AND (confirmation_status IS NULL OR confirmation_status IN ('queued','pending','sent'));
UPDATE public.cart_recovery SET status='failed', sent_at=NULL WHERE sent_at IS NOT NULL AND zapi_message_id IS NULL AND status IN ('queued','pending','sent');
UPDATE public.cart_recovery SET stage2_status='failed', stage2_sent_at=NULL WHERE stage2_sent_at IS NOT NULL AND stage2_zapi_message_id IS NULL AND (stage2_status IS NULL OR stage2_status IN ('queued','pending','sent'));
UPDATE public.cart_recovery SET stage3_status='failed', stage3_sent_at=NULL WHERE stage3_sent_at IS NOT NULL AND stage3_zapi_message_id IS NULL AND (stage3_status IS NULL OR stage3_status IN ('queued','pending','sent'));
ALTER TABLE public.site_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.clarex_recordings ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_site_sessions_ip ON public.site_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_clarex_recordings_ip ON public.clarex_recordings(ip_address);

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

CREATE POLICY "admins manage blocked_ips"
ON public.blocked_ips
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON public.blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip_address ON public.blocked_ips (ip_address);UPDATE public.app_config
SET value = E'Olá, {nome}! ⚽\n\nSeu pagamento foi aprovado com sucesso! ✅\n\n📦 *Pedido:* #{pedido}\n💰 *Valor:* {total}\n\nJá estamos preparando tudo com muito carinho aqui na *Gol Raiz*. Em breve seu pedido será despachado e você receberá o código de rastreio por aqui e no seu e-mail. 🚚\n\nObrigado por confiar na gente — bora vestir essa paixão! 💛💚\n\n_Equipe Gol Raiz_'
WHERE key = 'order_confirmation_message';UPDATE public.app_config SET value='true', updated_at=now() WHERE key IN ('order_confirmation_enabled','pix_reminder_enabled','pix_reminder2_enabled');-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');
INSERT INTO public.app_config (key, value, description) VALUES
  ('email_cart_recovery_enabled', 'false', 'Ativa o email de carrinho abandonado (1ª tentativa)'),
  ('email_cart_recovery_delay_minutes', '15', 'Minutos de inatividade para disparar o 1º email de carrinho'),
  ('email_cart_recovery_subject', 'Você esqueceu alguns itens no seu carrinho 🛒', 'Assunto do 1º email de carrinho abandonado'),
  ('email_cart_recovery_message',
'Olá, {nome}!

Notamos que você começou um pedido na Gol Raiz e não finalizou. Separamos seu carrinho para você retomar exatamente de onde parou:

{itens}

Total: {total}

Basta clicar no botão abaixo e seus dados já estarão preenchidos:
{link}

Qualquer dúvida, é só responder este email. Estamos por aqui! 🟡⚫
Equipe Gol Raiz',
   'Template do 1º email de carrinho abandonado'),

  ('email_cart_recovery2_enabled', 'false', 'Ativa o 2º email de carrinho abandonado (cupom 5%)'),
  ('email_cart_recovery2_delay_minutes', '30', 'Minutos do abandono para disparar o 2º email'),
  ('email_cart_recovery2_subject', 'Liberamos 5% OFF para finalizar seu pedido 🎁', 'Assunto do 2º email de carrinho abandonado'),
  ('email_cart_recovery2_message',
'Oi, {nome}!

Vimos que você ainda não finalizou seu pedido na Gol Raiz e liberamos um cupom exclusivo de 5% OFF para te ajudar.

Seu carrinho:
{itens}

Total: {total}
Cupom: {cupom}

Clique abaixo para retomar com o cupom já aplicado:
{link}

Qualquer dúvida, é só responder este email. 🟡⚫
Equipe Gol Raiz',
   'Template do 2º email de carrinho abandonado'),

  ('email_cart_recovery3_enabled', 'false', 'Ativa o 3º email de carrinho abandonado (cupom 10%)'),
  ('email_cart_recovery3_delay_minutes', '60', 'Minutos do abandono para disparar o 3º email'),
  ('email_cart_recovery3_subject', 'Último empurrãozinho: 10% OFF no seu carrinho 🔥', 'Assunto do 3º email de carrinho abandonado'),
  ('email_cart_recovery3_message',
'Oi, {nome}!

Um último empurrãozinho: liberamos 10% OFF no seu carrinho na Gol Raiz.

Seu carrinho:
{itens}

Total: {total}
Cupom: {cupom}

Aplique direto pelo link abaixo:
{link}

Este cupom é exclusivo e não acumula com outras promoções. Te esperamos! 🟡⚫
Equipe Gol Raiz',
   'Template do 3º email de carrinho abandonado'),

  ('email_pix_reminder_enabled', 'false', 'Ativa o 1º email de Pix pendente'),
  ('email_pix_reminder_delay_minutes', '20', 'Minutos sem pagamento para disparar o 1º email de Pix'),
  ('email_pix_reminder_subject', 'Seu Pix da Gol Raiz ainda está aguardando pagamento ⏳', 'Assunto do 1º email de Pix pendente'),
  ('email_pix_reminder_message',
'Oi, {nome}!

Notamos que o seu Pix de {total} (pedido {pedido}) na Gol Raiz ainda não foi pago. Para garantir seu pedido, finalize seu pagamento pelo link abaixo:

{link}

Se preferir, você também encontra o código copia-e-cola e o QR Code direto na sua área de pedido.

Qualquer dúvida, é só responder este email. 🟡⚫
Equipe Gol Raiz',
   'Template do 1º email de lembrete de Pix pendente'),

  ('email_pix_reminder2_enabled', 'false', 'Ativa o 2º email de Pix pendente (cupom 10%)'),
  ('email_pix_reminder2_delay_minutes', '60', 'Minutos sem pagamento para disparar o 2º email de Pix'),
  ('email_pix_reminder2_subject', 'Liberamos 10% OFF para você finalizar seu Pix 🎁', 'Assunto do 2º email de Pix pendente'),
  ('email_pix_reminder2_message',
'Oi, {nome}!

Seu Pix (pedido {pedido}) ainda está pendente e queremos te ajudar a fechar esse pedido. Liberamos um cupom exclusivo de 10% OFF.

Total atual: {total}
Cupom: {cupom}

Finalize pelo link abaixo com o cupom já aplicado:
{link}

Este cupom é exclusivo e não acumula com outras promoções. 🟡⚫
Equipe Gol Raiz',
   'Template do 2º email de lembrete de Pix pendente'),

  ('email_order_confirmation_enabled', 'false', 'Ativa o email de pedido confirmado'),
  ('email_order_confirmation_delay_minutes', '0', 'Minutos da aprovação para disparar o email de confirmação'),
  ('email_order_confirmation_subject', 'Pedido confirmado na Gol Raiz ✅', 'Assunto do email de pedido confirmado'),
  ('email_order_confirmation_message',
'Olá, {nome}!

Seu pagamento foi aprovado e seu pedido na Gol Raiz está confirmado. 🎉

Pedido: {pedido}
Total: {total}

Já estamos preparando tudo com muito carinho. Assim que enviarmos, você receberá o código de rastreio neste email.

Acompanhe seu pedido em:
{link}

Obrigado por confiar na Gol Raiz! 🟡⚫
Equipe Gol Raiz',
   'Template do email de pedido confirmado'),

  ('email_from_name', 'Gol Raiz', 'Nome exibido como remetente dos emails'),
  ('email_from_address', 'no-reply@notify.usegolraiz.com.br', 'Endereço usado como remetente (From)'),
  ('email_reply_to', 'contato@usegolraiz.com.br', 'Endereço usado como Reply-To')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now()
  WHERE public.app_config.value IS NULL OR public.app_config.value = '';-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase no longer grants public-schema access to service_role by default;
-- emit the grant explicitly so edge functions can reach the table via PostgREST.
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

GRANT ALL ON public.email_send_state TO service_role;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON public.suppressed_emails TO service_role;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');

-- Cart recovery: colunas para rastrear envio de EMAIL por estágio
ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS email2_status text,
  ADD COLUMN IF NOT EXISTS email2_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email2_message_id text,
  ADD COLUMN IF NOT EXISTS email3_status text,
  ADD COLUMN IF NOT EXISTS email3_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email3_message_id text;

-- Orders: colunas para rastrear envio de EMAIL de pix1/pix2/confirmacao
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_message_id text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_message_id text,
  ADD COLUMN IF NOT EXISTS email_confirmation_status text,
  ADD COLUMN IF NOT EXISTS email_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmation_message_id text;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id ON public.email_send_log(message_id);

-- Stage 1: lembrete amigável (5 min após abandono) — sem desconto
UPDATE public.app_config SET value =
'Você esqueceu seu carrinho na Gol Raiz, {nome} 👀',
updated_at = now()
WHERE key = 'email_cart_recovery_subject';

UPDATE public.app_config SET value =
'Oi {nome}, tudo bem?

Notei que você começou um pedido na Gol Raiz e não chegou a finalizar. Separei seu carrinho aqui pra você não perder os itens:

{itens}

Total: {total}

É só clicar no link abaixo que seu carrinho volta exatamente do jeito que estava (dados já preenchidos, sem precisar refazer nada):

{link}

Os estoques das nossas camisas oficiais costumam virar rápido, então não deixe pra depois.

Qualquer dúvida sobre tamanho, frete ou pagamento, é só responder este e-mail.

Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery_message';

-- Stage 2: 5% OFF (30 min)
UPDATE public.app_config SET value =
'{nome}, liberei 5% OFF pra finalizar seu pedido 🎁',
updated_at = now()
WHERE key = 'email_cart_recovery2_subject';

UPDATE public.app_config SET value =
'Oi {nome},

Vi que seu pedido ficou pra trás e quero te dar um empurrãozinho: acabei de liberar um cupom exclusivo de *5% OFF* pra você fechar agora.

Seu cupom: {cupom}

Seu carrinho:
{itens}

Total com desconto aplicado: {total}

O cupom já vem aplicado se você usar este link:
{link}

Esse desconto é por tempo limitado e foi gerado exclusivamente pro seu pedido — não compartilhe.

Conta com a gente,
Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery2_message';

-- Stage 3: 10% OFF (último empurrão, 60 min)
UPDATE public.app_config SET value =
'Última chance: 10% OFF no seu carrinho 🔥',
updated_at = now()
WHERE key = 'email_cart_recovery3_subject';

UPDATE public.app_config SET value =
'{nome}, é a última vez que toco no assunto 🙂

Sei que decidir leva tempo, mas seu carrinho está prestes a expirar do nosso sistema. Pra não te deixar sair sem o produto, liberei um cupom final de *10% OFF*:

Cupom: {cupom}

Resumo do pedido:
{itens}

Total com 10% aplicado: {total}

Recupera o carrinho com o desconto já válido:
{link}

Esse é o maior desconto que consigo liberar e ele vale apenas hoje. Depois disso, o cupom é desativado automaticamente.

Se preferir conversar com um humano antes de fechar, é só responder este e-mail que te respondo pessoalmente.

Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery3_message';
-- Add PIX fee fields to payment_gateways
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS pix_fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pix_fee_fixed_cents INTEGER NOT NULL DEFAULT 0;

-- Ad spend (lançamento por dia)
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

CREATE POLICY "admins manage ad_spend"
ON public.ad_spend FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_ad_spend_updated_at
BEFORE UPDATE ON public.ad_spend
FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();
ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS email1_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS email2_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS email3_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS whatsapp_clicked_at timestamp with time zone;
-- Security fixes for SECURITY DEFINER functions and search_path

-- 1. Fix email queue wrapper functions: add fixed search_path and restrict EXECUTE
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.read(queue_name, vt, batch_size);
EXCEPTION WHEN undefined_table THEN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- 2. Revoke EXECUTE from PUBLIC and restrict to service_role only (email queue functions)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- 3. has_role: keep for authenticated (needed for RLS policies), remove from PUBLIC/anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
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
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;-- Placeholder; real SQL inlined in next call via stdin? Not possible. We must inline. See below.
SELECT 1;
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_payment_id_idx ON public.orders (payment_id);
CREATE INDEX orders_external_ref_idx ON public.orders (external_ref);
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

CREATE POLICY "admins can read orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.payment_gateways (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
CREATE POLICY "admins read gateways" ON public.payment_gateways FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update gateways" ON public.payment_gateways FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins insert gateways" ON public.payment_gateways FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_payment_gateways_updated_at BEFORE UPDATE ON public.payment_gateways FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();
INSERT INTO public.payment_gateways (key, name, enabled, is_active) VALUES ('monetrix', 'Monetrix', true, true);

CREATE TABLE public.site_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  interacted boolean NOT NULL DEFAULT false,
  current_path text,
  in_checkout boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  utm_source text, utm_medium text, utm_campaign text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_sessions_last_seen ON public.site_sessions(last_seen_at DESC);
CREATE INDEX idx_site_sessions_interacted ON public.site_sessions(interacted, last_seen_at DESC);
GRANT SELECT ON public.site_sessions TO authenticated;
GRANT ALL ON public.site_sessions TO service_role;
ALTER TABLE public.site_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read sessions" ON public.site_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

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
CREATE POLICY "admins read funnel" ON public.funnel_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

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
CREATE INDEX idx_checkout_attempts_activity ON public.checkout_attempts(last_activity_at DESC);
CREATE INDEX idx_checkout_attempts_open ON public.checkout_attempts(last_activity_at DESC) WHERE converted_order_id IS NULL;
GRANT SELECT ON public.checkout_attempts TO authenticated;
GRANT ALL ON public.checkout_attempts TO service_role;
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read checkouts" ON public.checkout_attempts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage app_config" ON public.app_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.app_config (key, value, description) VALUES
  ('cart_recovery_enabled', 'false', 'Habilita/desabilita recuperação de carrinho'),
  ('zapi_instance_id', '', 'ID da instância Z-API'),
  ('zapi_token', '', 'Token Z-API'),
  ('zapi_client_token', '', 'Client token Z-API');

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
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ttclid     text,
  ADD COLUMN IF NOT EXISTS ttp        text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip_address text;SET search_path = public, extensions, pg_catalog;

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
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));ALTER TABLE public.orders
  ADD COLUMN ttclid text,
  ADD COLUMN ttp text,
  ADD COLUMN user_agent text,
  ADD COLUMN ip_address text;

ALTER TABLE public.payment_gateways
  ADD COLUMN pix_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN pix_fee_fixed_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN card_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN card_fee_fixed_cents integer NOT NULL DEFAULT 0;

CREATE TABLE public.ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date date NOT NULL,
  amount_cents integer NOT NULL,
  platform text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_spend_date ON public.ad_spend(spend_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_spend TO authenticated;
GRANT ALL ON public.ad_spend TO service_role;
ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ad_spend" ON public.ad_spend FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));ALTER TABLE public.cart_recovery
  ADD COLUMN email_status text,
  ADD COLUMN email_processed_at timestamptz,
  ADD COLUMN email_message_id text,
  ADD COLUMN email1_clicked_at timestamptz,
  ADD COLUMN email2_status text,
  ADD COLUMN email2_processed_at timestamptz,
  ADD COLUMN email2_message_id text,
  ADD COLUMN email2_clicked_at timestamptz,
  ADD COLUMN email3_status text,
  ADD COLUMN email3_processed_at timestamptz,
  ADD COLUMN email3_message_id text,
  ADD COLUMN email3_clicked_at timestamptz,
  ADD COLUMN whatsapp_clicked_at timestamptz;