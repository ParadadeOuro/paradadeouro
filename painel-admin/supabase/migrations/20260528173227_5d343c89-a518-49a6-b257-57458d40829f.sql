
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
