
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
