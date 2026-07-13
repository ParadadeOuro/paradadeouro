DROP POLICY IF EXISTS "anyone can create an order" ON public.orders;
DROP POLICY IF EXISTS "anyone can read orders" ON public.orders;

CREATE POLICY "admins can read orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));