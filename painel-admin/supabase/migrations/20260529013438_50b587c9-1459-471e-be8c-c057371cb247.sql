ALTER TABLE public.cart_recovery
ADD COLUMN IF NOT EXISTS zapi_message_id text,
ADD COLUMN IF NOT EXISTS zapi_zaap_id text,
ADD COLUMN IF NOT EXISTS zapi_delivery_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_message_id
ON public.cart_recovery (zapi_message_id)
WHERE zapi_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_zapi_zaap_id
ON public.cart_recovery (zapi_zaap_id)
WHERE zapi_zaap_id IS NOT NULL;