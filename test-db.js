const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pknolfzgkqrohiwrszga.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbm9sZnpna3Fyb2hpd3JzemdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg3MDU0NiwiZXhwIjoyMDk4NDQ2NTQ2fQ.1VzDPlWVR9YK_HPGN6T2tvIUUFN_LmrPaYICS-0F-lI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function test() {
  const { data, error } = await supabase.from('orders').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Columns:', data.length > 0 ? Object.keys(data[0]) : 'No data, but query worked');
    if (data.length === 0) {
      // try to insert an empty object to see what column error we get
      const { error: insErr } = await supabase.from('orders').insert({});
      console.log('Insert error:', insErr);
    }
  }
}

test();
