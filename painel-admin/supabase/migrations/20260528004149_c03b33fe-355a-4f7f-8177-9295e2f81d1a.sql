ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_secret UUID DEFAULT gen_random_uuid();

-- Atualiza registros existentes que ainda não têm order_secret
UPDATE public.orders SET order_secret = gen_random_uuid() WHERE order_secret IS NULL;

-- Torna order_secret NOT NULL para garantir que sempre exista
ALTER TABLE public.orders ALTER COLUMN order_secret SET NOT NULL;

-- Remove a policy pública de INSERT no bucket comprovantes (upload agora é feito apenas via server function com order_secret)
DROP POLICY IF EXISTS "Public can upload comprovantes" ON storage.objects;

-- Adiciona policy restritiva para leitura apenas de arquivos no próprio bucket (download via signed URLs ainda funciona para service_role)
-- O upload via client direto ao storage não é mais permitido; todo upload passa pela server function uploadComprovante