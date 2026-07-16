import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { externalRef, items, amount, payer, delivery, paymentMethod } = data;

    if (!externalRef || !payer || !amount || !items) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const orderItems = items.map((i: any) => ({
      id: i.id,
      name: i.title,
      quantity: i.quantity,
      priceInCents: Math.round(i.price * 100),
      selectedOptions: i.options || {}
    }));

    const { error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        external_ref: externalRef,
        status: "PENDING",
        gateway: paymentMethod || "monetrix",
        payer_name: payer.name,
        payer_email: payer.email,
        payer_phone: payer.phone,
        payer_taxid: payer.document,
        amount_cents: amount,
        items: orderItems,
        delivery: delivery || {}
      });

    if (insertErr) {
      console.error("Error inserting order via create-order API:", insertErr);
      return NextResponse.json({ error: "Erro ao salvar pedido: " + insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, orderId: externalRef });
  } catch (err) {
    console.error("create-order API error:", err);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
