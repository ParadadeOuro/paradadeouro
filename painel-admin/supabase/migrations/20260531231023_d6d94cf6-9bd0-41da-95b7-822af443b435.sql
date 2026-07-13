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