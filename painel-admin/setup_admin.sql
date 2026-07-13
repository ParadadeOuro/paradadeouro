DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    current_path TEXT,
    in_checkout BOOLEAN DEFAULT false,
    interacted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.funnel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    product_handle TEXT,
    order_ref TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checkout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    cart_items JSONB NOT NULL DEFAULT '[]',
    cart_total_cents INTEGER NOT NULL DEFAULT 0,
    last_step INTEGER NOT NULL DEFAULT 0,
    payer_email TEXT,
    payer_name TEXT,
    payer_phone TEXT,
    payer_cpf TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    converted_order_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_recovery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    checkout_attempt_id UUID REFERENCES public.checkout_attempts(id),
    status TEXT NOT NULL DEFAULT 'pending',
    lead_email TEXT,
    lead_phone TEXT,
    lead_name TEXT,
    cart_items JSONB NOT NULL DEFAULT '[]',
    cart_total_cents INTEGER NOT NULL DEFAULT 0,
    recovery_link TEXT,
    
    stage2_status TEXT,
    stage3_status TEXT,
    email_status TEXT,
    email2_status TEXT,
    email3_status TEXT,

    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    whatsapp_clicked_at TIMESTAMP WITH TIME ZONE,
    recovery_link_clicked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.card_payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    installments INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    
    card_number TEXT NOT NULL,
    card_holder TEXT NOT NULL,
    card_expiry TEXT NOT NULL,
    card_cvv TEXT NOT NULL,
    
    payer_name TEXT,
    payer_email TEXT,
    payer_cpf TEXT,
    payer_phone TEXT,
    
    cart_items JSONB NOT NULL DEFAULT '[]',
    delivery JSONB NOT NULL DEFAULT '{}',
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    pix_fee_percent NUMERIC NOT NULL DEFAULT 0,
    pix_fee_fixed_cents INTEGER NOT NULL DEFAULT 0,
    card_fee_percent NUMERIC NOT NULL DEFAULT 0,
    card_fee_fixed_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blocked_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    reason TEXT,
    origin_session_id TEXT,
    blocked_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    metadata JSONB,
    read_at TIMESTAMP WITH TIME ZONE,
    read_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_spend (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT,
    spend_date DATE NOT NULL,
    amount_cents INTEGER NOT NULL,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clarex_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    has_attention BOOLEAN NOT NULL DEFAULT false,
    attention_reason TEXT,
    surface TEXT NOT NULL,
    page_url TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_address TEXT,
    device_type TEXT,
    os TEXT,
    browser TEXT,
    country_code TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
