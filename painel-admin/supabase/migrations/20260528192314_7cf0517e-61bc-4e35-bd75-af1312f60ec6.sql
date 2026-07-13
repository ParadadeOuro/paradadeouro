-- Clarex: tabela de gravações de sessão
CREATE TABLE public.clarex_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  size_bytes integer NOT NULL DEFAULT 0,
  page_url text,
  surface text NOT NULL DEFAULT 'loja', -- 'loja' | 'checkout'
  device_type text, -- 'mobile' | 'desktop' | 'tablet'
  browser text,
  os text,
  country_code text,
  has_attention boolean NOT NULL DEFAULT false,
  attention_reason text,
  storage_path text NOT NULL,
  user_agent text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clarex_recordings_created_at ON public.clarex_recordings (created_at DESC);
CREATE INDEX idx_clarex_recordings_session ON public.clarex_recordings (session_id);
CREATE INDEX idx_clarex_recordings_surface ON public.clarex_recordings (surface);
CREATE INDEX idx_clarex_recordings_attention ON public.clarex_recordings (has_attention) WHERE has_attention = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarex_recordings TO authenticated;
GRANT ALL ON public.clarex_recordings TO service_role;

ALTER TABLE public.clarex_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage clarex_recordings"
  ON public.clarex_recordings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Bucket privado para os blobs gzipados
INSERT INTO storage.buckets (id, name, public)
VALUES ('clarex-recordings', 'clarex-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admins read clarex blobs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins write clarex blobs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete clarex blobs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'clarex-recordings' AND has_role(auth.uid(), 'admin'::app_role));