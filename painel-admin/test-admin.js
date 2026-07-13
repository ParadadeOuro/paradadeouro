import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(url, key);
async function test() {
  const { data, error, count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true });
  console.log("Error:", error);
  console.log("Count:", count);
}
test();
