import { createClient } from '@supabase/supabase-js';

// Cliente Supabase dedicado ao checkout (agora aponta para o projeto principal Parada de Ouro
// e parou de usar as Edge Functions externas)
const CHECKOUT_SUPABASE_URL = 'https://pknolfzgkqrohiwrszga.supabase.co';
const CHECKOUT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbm9sZnpna3Fyb2hpd3JzemdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzA1NDYsImV4cCI6MjA5ODQ0NjU0Nn0.QbR5iWau294ZyCHll0Y7YgRJ0bOUMl9iQZjY1OJ6zX0';

export const checkoutSupabase = createClient(CHECKOUT_SUPABASE_URL, CHECKOUT_SUPABASE_KEY);
