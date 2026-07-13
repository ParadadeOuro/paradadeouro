
-- Remove duplicatas mantendo o mais recente por checkout_attempt_id
DELETE FROM public.cart_recovery a
USING public.cart_recovery b
WHERE a.checkout_attempt_id IS NOT NULL
  AND a.checkout_attempt_id = b.checkout_attempt_id
  AND a.created_at < b.created_at;

-- Cria unique constraint parcial (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS cart_recovery_checkout_attempt_id_unique
  ON public.cart_recovery (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;
