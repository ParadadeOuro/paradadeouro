
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_status_paid_conf
  ON public.orders (status, paid_at)
  WHERE status = 'PAID' AND confirmation_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_reminder
  ON public.orders (status, created_at)
  WHERE status = 'PENDING' AND pix_reminder_sent_at IS NULL;

INSERT INTO public.app_config (key, value, description) VALUES
  ('order_confirmation_enabled', 'true', 'Habilita envio automático de mensagem de confirmação após pagamento'),
  ('order_confirmation_delay_minutes', '1', 'Minutos após pagamento para enviar confirmação'),
  ('order_confirmation_message', 'Olá {nome}! ✅ Seu pedido na Gol Raiz foi confirmado e o pagamento ({total}) foi aprovado. Em breve te enviamos o rastreio. Pedido: {pedido}', 'Template da mensagem de confirmação de pedido pago'),
  ('pix_reminder_enabled', 'true', 'Habilita lembrete de Pix pendente'),
  ('pix_reminder_delay_minutes', '5', 'Minutos após criação do pedido sem pagamento para enviar lembrete'),
  ('pix_reminder_message', 'Oi {nome}! Notamos que seu Pix de {total} na Gol Raiz ainda não foi pago. Para garantir seu pedido, finalize aqui: {link}', 'Template da mensagem de lembrete de Pix pendente')
ON CONFLICT (key) DO NOTHING;
