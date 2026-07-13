UPDATE public.app_config
SET value = E'Olá, {nome}! 👋\n\nNotei que você começou um pedido na Gol Raiz e não finalizou:\n\n{itens}\n\n💰 Total: *{total}*\n\nPara te ajudar, separei seu carrinho — é só clicar no link abaixo para retomar de onde parou (com seus dados já preenchidos):\n\n{link}\n\nQualquer dúvida, estou por aqui! 🟡⚫',
    updated_at = now()
WHERE key = 'cart_recovery_message';