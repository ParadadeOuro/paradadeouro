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

    const rawDoc = data.payer?.document || data.payer?.taxId || "00000000000";
    const docDigits = rawDoc.replace(/\D/g, '');
    const docType = docDigits.length > 11 ? "CNPJ" : "CPF";

    // Pagou.ai V2 Payload
    const payload = {
      method: "credit_card",
      amount: data.amount,
      installments: installments || 1,
      postback_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://paradadeouro.com.br'}/api/webhooks/pagouai`,
      buyer: {
        name: data.payer?.name || "Cliente sem nome",
        email: data.payer?.email || "email@desconhecido.com",
        document: {
          number: docDigits,
          type: docType
        }
      },
      products: data.items?.map((i: any) => ({
        name: i.title,
        quantity: i.quantity,
        price: i.unit_price || i.unitPrice || 0,
      })) || [],
      credit_card: {
        number: card.number.replace(/\D/g, ''),
        holder_name: card.holder,
        exp_month: expMonth,
        exp_year: expYear,
        cvv: card.cvv
      }
    };

    const res = await fetch("https://api.pagou.ai/v2/transactions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${apiKey}`,
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
