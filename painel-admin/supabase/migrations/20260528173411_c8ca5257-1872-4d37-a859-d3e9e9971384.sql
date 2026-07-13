
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
