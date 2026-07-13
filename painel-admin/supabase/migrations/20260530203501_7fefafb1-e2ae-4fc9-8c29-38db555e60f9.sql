INSERT INTO public.app_config (key, value, description) VALUES
  ('email_cart_recovery_enabled', 'false', 'Ativa o email de carrinho abandonado (1ª tentativa)'),
  ('email_cart_recovery_delay_minutes', '15', 'Minutos de inatividade para disparar o 1º email de carrinho'),
  ('email_cart_recovery_subject', 'Você esqueceu alguns itens no seu carrinho 🛒', 'Assunto do 1º email de carrinho abandonado'),
  ('email_cart_recovery_message',
'Olá, {nome}!

Notamos que você começou um pedido na Gol Raiz e não finalizou. Separamos seu carrinho para você retomar exatamente de onde parou:

{itens}

Total: {total}

Basta clicar no botão abaixo e seus dados já estarão preenchidos:
{link}

Qualquer dúvida, é só responder este email. Estamos por aqui! 🟡⚫
Equipe Gol Raiz',
   'Template do 1º email de carrinho abandonado'),

  ('email_cart_recovery2_enabled', 'false', 'Ativa o 2º email de carrinho abandonado (cupom 5%)'),
  ('email_cart_recovery2_delay_minutes', '30', 'Minutos do abandono para disparar o 2º email'),
  ('email_cart_recovery2_subject', 'Liberamos 5% OFF para finalizar seu pedido 🎁', 'Assunto do 2º email de carrinho abandonado'),
  ('email_cart_recovery2_message',
'Oi, {nome}!

Vimos que você ainda não finalizou seu pedido na Gol Raiz e liberamos um cupom exclusivo de 5% OFF para te ajudar.

Seu carrinho:
{itens}

Total: {total}
Cupom: {cupom}

Clique abaixo para retomar com o cupom já aplicado:
{link}

Qualquer dúvida, é só responder este email. 🟡⚫
Equipe Gol Raiz',
   'Template do 2º email de carrinho abandonado'),

  ('email_cart_recovery3_enabled', 'false', 'Ativa o 3º email de carrinho abandonado (cupom 10%)'),
  ('email_cart_recovery3_delay_minutes', '60', 'Minutos do abandono para disparar o 3º email'),
  ('email_cart_recovery3_subject', 'Último empurrãozinho: 10% OFF no seu carrinho 🔥', 'Assunto do 3º email de carrinho abandonado'),
  ('email_cart_recovery3_message',
'Oi, {nome}!

Um último empurrãozinho: liberamos 10% OFF no seu carrinho na Gol Raiz.

Seu carrinho:
{itens}

Total: {total}
Cupom: {cupom}

Aplique direto pelo link abaixo:
{link}

Este cupom é exclusivo e não acumula com outras promoções. Te esperamos! 🟡⚫
Equipe Gol Raiz',
   'Template do 3º email de carrinho abandonado'),

  ('email_pix_reminder_enabled', 'false', 'Ativa o 1º email de Pix pendente'),
  ('email_pix_reminder_delay_minutes', '20', 'Minutos sem pagamento para disparar o 1º email de Pix'),
  ('email_pix_reminder_subject', 'Seu Pix da Gol Raiz ainda está aguardando pagamento ⏳', 'Assunto do 1º email de Pix pendente'),
  ('email_pix_reminder_message',
'Oi, {nome}!

Notamos que o seu Pix de {total} (pedido {pedido}) na Gol Raiz ainda não foi pago. Para garantir seu pedido, finalize seu pagamento pelo link abaixo:

{link}

Se preferir, você também encontra o código copia-e-cola e o QR Code direto na sua área de pedido.

Qualquer dúvida, é só responder este email. 🟡⚫
Equipe Gol Raiz',
   'Template do 1º email de lembrete de Pix pendente'),

  ('email_pix_reminder2_enabled', 'false', 'Ativa o 2º email de Pix pendente (cupom 10%)'),
  ('email_pix_reminder2_delay_minutes', '60', 'Minutos sem pagamento para disparar o 2º email de Pix'),
  ('email_pix_reminder2_subject', 'Liberamos 10% OFF para você finalizar seu Pix 🎁', 'Assunto do 2º email de Pix pendente'),
  ('email_pix_reminder2_message',
'Oi, {nome}!

Seu Pix (pedido {pedido}) ainda está pendente e queremos te ajudar a fechar esse pedido. Liberamos um cupom exclusivo de 10% OFF.

Total atual: {total}
Cupom: {cupom}

Finalize pelo link abaixo com o cupom já aplicado:
{link}

Este cupom é exclusivo e não acumula com outras promoções. 🟡⚫
Equipe Gol Raiz',
   'Template do 2º email de lembrete de Pix pendente'),

  ('email_order_confirmation_enabled', 'false', 'Ativa o email de pedido confirmado'),
  ('email_order_confirmation_delay_minutes', '0', 'Minutos da aprovação para disparar o email de confirmação'),
  ('email_order_confirmation_subject', 'Pedido confirmado na Gol Raiz ✅', 'Assunto do email de pedido confirmado'),
  ('email_order_confirmation_message',
'Olá, {nome}!

Seu pagamento foi aprovado e seu pedido na Gol Raiz está confirmado. 🎉

Pedido: {pedido}
Total: {total}

Já estamos preparando tudo com muito carinho. Assim que enviarmos, você receberá o código de rastreio neste email.

Acompanhe seu pedido em:
{link}

Obrigado por confiar na Gol Raiz! 🟡⚫
Equipe Gol Raiz',
   'Template do email de pedido confirmado'),

  ('email_from_name', 'Gol Raiz', 'Nome exibido como remetente dos emails'),
  ('email_from_address', 'no-reply@notify.usegolraiz.com.br', 'Endereço usado como remetente (From)'),
  ('email_reply_to', 'contato@usegolraiz.com.br', 'Endereço usado como Reply-To')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now()
  WHERE public.app_config.value IS NULL OR public.app_config.value = '';