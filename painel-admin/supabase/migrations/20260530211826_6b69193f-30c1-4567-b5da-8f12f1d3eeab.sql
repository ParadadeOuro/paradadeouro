
-- Cart recovery: colunas para rastrear envio de EMAIL por estágio
ALTER TABLE public.cart_recovery
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS email2_status text,
  ADD COLUMN IF NOT EXISTS email2_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email2_message_id text,
  ADD COLUMN IF NOT EXISTS email3_status text,
  ADD COLUMN IF NOT EXISTS email3_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email3_message_id text;

-- Orders: colunas para rastrear envio de EMAIL de pix1/pix2/confirmacao
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_pix_reminder_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder_message_id text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_status text,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_pix_reminder2_message_id text,
  ADD COLUMN IF NOT EXISTS email_confirmation_status text,
  ADD COLUMN IF NOT EXISTS email_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmation_message_id text;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id ON public.email_send_log(message_id);
