INSERT INTO public.app_config (key, value, description)
VALUES (
  'cart_recovery_message',
  'Oi {nome}, vi que você deixou seu carrinho com {total} na Gol Raiz. Ainda tem interesse? Pode retomar aqui: {link}',
  'Template da mensagem de recuperação. Placeholders: {nome}, {total}, {link}'
)
ON CONFLICT (key) DO NOTHING;