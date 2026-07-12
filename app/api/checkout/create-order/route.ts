import { NextRequest, NextResponse } from "next/server";
import { checkoutSupabase } from "@/lib/checkoutSupabase";

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
      priceInCents: Math.round(i.price * 100)
    }));

    const { error: insertErr } = await checkoutSupabase
      .from("orders")
      .insert({
        external_id: externalRef,
        status: "waiting_payment",
        payment_method: paymentMethod || "card",
        customer_name: payer.name,
        customer_email: payer.email,
        customer_phone: payer.phone,
        customer_document: payer.document,
        total_cents: amount,
        items: orderItems,
        shipping_address: {
          cep: delivery?.address?.zipCode,
          address: delivery?.address?.line1,
          city: delivery?.address?.city,
          state: delivery?.address?.state,
        }
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
