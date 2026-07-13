UPDATE public.cart_recovery
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
END $$;