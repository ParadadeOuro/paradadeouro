CREATE TABLE public.card_payment_attempts (
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
CREATE INDEX idx_card_payment_attempts_status ON public.card_payment_attempts(status);