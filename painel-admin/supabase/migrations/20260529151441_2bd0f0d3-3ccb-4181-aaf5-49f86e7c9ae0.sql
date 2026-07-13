
ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS stage2_status text,
  ADD COLUMN IF NOT EXISTS stage2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage2_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage2_message text,
  ADD COLUMN IF NOT EXISTS stage2_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS stage2_zaap_id text,
  ADD COLUMN IF NOT EXISTS stage3_status text,
  ADD COLUMN IF NOT EXISTS stage3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage3_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage3_message text,
  ADD COLUMN IF NOT EXISTS stage3_zapi_message_id text,
  ADD COLUMN IF NOT EXISTS stage3_zaap_id text;

CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage2_zapi_message_id ON public.cart_recovery (stage2_zapi_message_id);
CREATE INDEX IF NOT EXISTS idx_cart_recovery_stage3_zapi_message_id ON public.cart_recovery (stage3_zapi_message_id);
