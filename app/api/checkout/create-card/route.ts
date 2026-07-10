import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const apiKey = process.env.PAGOUAI_API_KEY;
    if (!apiKey) {
      console.error("PAGOUAI_API_KEY não configurada");
      return NextResponse.json({ error: "Configuração de pagamento ausente" }, { status: 500 });
    }

    const { card, installments, ...rest } = data;
    const expParts = card.exp.split('/');
    const expMonth = expParts[0];
    const expYear = expParts[1]?.length === 2 ? `20${expParts[1]}` : expParts[1];

    // Pagou.ai Payload
    const payload = {
      payment_method: "credit_card",
      amount: data.amount,
      installments: installments || 1,
      postback_url: `${process.env.CHECKOUT_REDIRECT_URL || 'https://paradadeouro.com'}/api/webhooks/pagouai`,
      customer: {
        name: data.payer?.name || "Cliente sem nome",
        email: data.payer?.email || "email@desconhecido.com",
        document: data.payer?.document?.replace(/\D/g, '') || "00000000000"
      },
      items: data.items?.map((i: any) => ({
        title: i.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tangible: true
      })) || [],
      card: {
        number: card.number.replace(/\D/g, ''),
        holder_name: card.holder,
        exp_month: expMonth,
        exp_year: expYear,
        cvv: card.cvv
      }
    };

    const res = await fetch("https://api.pagou.ai/v1/transactions", {
      method: "POST",
      headers: { 
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        "Content-Type": "application/json" 
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

    if (!res.ok) {
      console.error("Pagou.ai error", res.status, body);
      return NextResponse.json(
        { error: body?.message || body?.errors?.[0]?.message || "Erro ao processar cartão na Pagou.ai" },
        { status: res.status }
      );
    }

    return NextResponse.json({ 
      id: body?.id ?? body?.data?.id ?? null, 
      status: body?.status ?? body?.data?.status ?? 'processing',
      success: true
    });
  } catch (err) {
    console.error("create-card API error:", err);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
