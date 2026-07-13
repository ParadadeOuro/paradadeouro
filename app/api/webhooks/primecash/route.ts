import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log("Primecash Webhook Data:", data);

    // Usually postbacks contain status, external_reference or reference, id
    const status = data.status || data.transaction?.status;
    const externalRef = data.external_reference || data.reference || data.transaction?.external_reference || data.id || data.transaction?.id;

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
    console.error("primecash webhook error:", err);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
