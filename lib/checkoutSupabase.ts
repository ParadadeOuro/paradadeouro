import { createClient } from '@supabase/supabase-js';

// Cliente Supabase dedicado ao checkout (aponta para o projeto FutCompany
// onde as Edge Functions create-pix, tiktok-events, track-utmify residem)
const CHECKOUT_SUPABASE_URL = 'https://bbgeysgtevbkdobevdfs.supabase.co';
const CHECKOUT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZ2V5c2d0ZXZia2RvYmV2ZGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjYzMjEsImV4cCI6MjA5NDU0MjMyMX0.58h1XKhO5RJQkG07Vb63evSqpZlfxIm9HRbQ7l-98aw';

export const checkoutSupabase = createClient(CHECKOUT_SUPABASE_URL, CHECKOUT_SUPABASE_KEY);
