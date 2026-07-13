ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ttclid     text,
  ADD COLUMN IF NOT EXISTS ttp        text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip_address text;