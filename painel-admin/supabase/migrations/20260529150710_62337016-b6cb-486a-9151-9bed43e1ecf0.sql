
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS confirmation_status text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS pix_reminder2_zapi_zaap_id text,
  ADD COLUMN IF NOT EXISTS confirmation_zapi_zaap_id text;

UPDATE public.orders SET pix_reminder_status = 'queued'
  WHERE pix_reminder_sent_at IS NOT NULL AND pix_reminder_status IS NULL;
UPDATE public.orders SET pix_reminder2_status = 'queued'
  WHERE pix_reminder2_sent_at IS NOT NULL AND pix_reminder2_status IS NULL;
UPDATE public.orders SET confirmation_status = 'queued'
  WHERE confirmation_sent_at IS NOT NULL AND confirmation_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder_msgid ON public.orders (pix_reminder_zapi_message_id) WHERE pix_reminder_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pix_reminder2_msgid ON public.orders (pix_reminder2_zapi_message_id) WHERE pix_reminder2_zapi_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_msgid ON public.orders (confirmation_zapi_message_id) WHERE confirmation_zapi_message_id IS NOT NULL;
