
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
