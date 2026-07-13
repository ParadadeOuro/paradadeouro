
ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS email1_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS email2_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS email3_clicked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS whatsapp_clicked_at timestamp with time zone;
