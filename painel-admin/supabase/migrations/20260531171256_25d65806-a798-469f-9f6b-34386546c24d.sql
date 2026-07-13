
-- Stage 1: lembrete amigável (5 min após abandono) — sem desconto
UPDATE public.app_config SET value =
'Você esqueceu seu carrinho na Gol Raiz, {nome} 👀',
updated_at = now()
WHERE key = 'email_cart_recovery_subject';

UPDATE public.app_config SET value =
'Oi {nome}, tudo bem?

Notei que você começou um pedido na Gol Raiz e não chegou a finalizar. Separei seu carrinho aqui pra você não perder os itens:

{itens}

Total: {total}

É só clicar no link abaixo que seu carrinho volta exatamente do jeito que estava (dados já preenchidos, sem precisar refazer nada):

{link}

Os estoques das nossas camisas oficiais costumam virar rápido, então não deixe pra depois.

Qualquer dúvida sobre tamanho, frete ou pagamento, é só responder este e-mail.

Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery_message';

-- Stage 2: 5% OFF (30 min)
UPDATE public.app_config SET value =
'{nome}, liberei 5% OFF pra finalizar seu pedido 🎁',
updated_at = now()
WHERE key = 'email_cart_recovery2_subject';

UPDATE public.app_config SET value =
'Oi {nome},

Vi que seu pedido ficou pra trás e quero te dar um empurrãozinho: acabei de liberar um cupom exclusivo de *5% OFF* pra você fechar agora.

Seu cupom: {cupom}

Seu carrinho:
{itens}

Total com desconto aplicado: {total}

O cupom já vem aplicado se você usar este link:
{link}

Esse desconto é por tempo limitado e foi gerado exclusivamente pro seu pedido — não compartilhe.

Conta com a gente,
Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery2_message';

-- Stage 3: 10% OFF (último empurrão, 60 min)
UPDATE public.app_config SET value =
'Última chance: 10% OFF no seu carrinho 🔥',
updated_at = now()
WHERE key = 'email_cart_recovery3_subject';

UPDATE public.app_config SET value =
'{nome}, é a última vez que toco no assunto 🙂

Sei que decidir leva tempo, mas seu carrinho está prestes a expirar do nosso sistema. Pra não te deixar sair sem o produto, liberei um cupom final de *10% OFF*:

Cupom: {cupom}

Resumo do pedido:
{itens}

Total com 10% aplicado: {total}

Recupera o carrinho com o desconto já válido:
{link}

Esse é o maior desconto que consigo liberar e ele vale apenas hoje. Depois disso, o cupom é desativado automaticamente.

Se preferir conversar com um humano antes de fechar, é só responder este e-mail que te respondo pessoalmente.

Time Gol Raiz 🟡⚫',
updated_at = now()
WHERE key = 'email_cart_recovery3_message';
