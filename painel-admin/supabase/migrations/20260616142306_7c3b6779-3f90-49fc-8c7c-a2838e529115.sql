ALTER TABLE public.orders
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
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));