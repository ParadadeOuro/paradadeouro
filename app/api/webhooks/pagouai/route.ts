import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log("Pagou.ai Webhook Data:", data);

    const status = data.status || data.transaction?.status;
    const externalRef = data.external_reference || data.reference || data.transaction?.external_reference || data.metadata?.external_reference;

    if (!externalRef) {
      return NextResponse.json({ error: "Missing externalRef" }, { status: 400 });
    }

    if (status === 'paid' || status === 'approved' || status === 'completed') {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('external_id', externalRef);
      
      if (error) {
        console.error("Supabase update error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("pagouai webhook error:", err);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
