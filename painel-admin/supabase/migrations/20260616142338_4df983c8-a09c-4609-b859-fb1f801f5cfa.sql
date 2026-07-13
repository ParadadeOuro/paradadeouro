ALTER TABLE public.cart_recovery
  ADD COLUMN email_status text,
  ADD COLUMN email_processed_at timestamptz,
  ADD COLUMN email_message_id text,
  ADD COLUMN email1_clicked_at timestamptz,
  ADD COLUMN email2_status text,
  ADD COLUMN email2_processed_at timestamptz,
  ADD COLUMN email2_message_id text,
  ADD COLUMN email2_clicked_at timestamptz,
  ADD COLUMN email3_status text,
  ADD COLUMN email3_processed_at timestamptz,
  ADD COLUMN email3_message_id text,
  ADD COLUMN email3_clicked_at timestamptz,
  ADD COLUMN whatsapp_clicked_at timestamptz;