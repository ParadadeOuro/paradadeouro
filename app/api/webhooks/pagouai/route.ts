import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
      const { error } = await supabaseAdmin
        .from('orders')
        .update({ status: 'PAID' })
        .eq('external_ref', externalRef);
      
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
