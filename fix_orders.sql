-- 1. Renomeia a coluna antiga
ALTER TABLE public.orders RENAME COLUMN total TO amount_cents;

-- 2. Adiciona as colunas novas exigidas pelo Painel Admin
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_ref text UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_id text UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_taxid text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS comprovante_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_copied_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_secret uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'monetrix';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- 3. Preenche os 6 pedidos antigos com dados genéricos para não quebrar o banco
UPDATE public.orders SET 
  external_ref = 'legacy-' || id,
  payer_name = 'Pedido Antigo',
  payer_email = 'legacy@example.com',
  payer_taxid = '00000000000',
  payer_phone = '00000000000',
  amount_cents = COALESCE(amount_cents, 0)
WHERE external_ref IS NULL;

-- 4. Agora que os antigos estão preenchidos, obriga que os novos tenham esses dados (NOT NULL)
ALTER TABLE public.orders ALTER COLUMN external_ref SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN payer_name SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN payer_email SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN payer_taxid SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN payer_phone SET NOT NULL;

-- 5. Atualiza o cache do Supabase para que a nossa API consiga enxergar as colunas novas na mesma hora!
NOTIFY pgrst, 'reload schema';
