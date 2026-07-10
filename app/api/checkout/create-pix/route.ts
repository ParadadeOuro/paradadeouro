import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const apiKey = process.env.PRIMECASH_API_KEY;
    if (!apiKey) {
      console.error("PRIMECASH_API_KEY não configurada");
      return NextResponse.json({ error: "Configuração de pagamento ausente" }, { status: 500 });
    }

    // Primecash V2 Payload
    const payload = {
      payment_method: "pix",
      amount: data.amount,
      postback_url: `${process.env.CHECKOUT_REDIRECT_URL || 'https://paradadeouro.com'}/api/webhooks/primecash`,
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
      })) || []
    };

    const res = await fetch("https://api.primecashbrasil.com/v2/transactions", {
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
      console.error("Primecash error", res.status, body);
      return NextResponse.json(
        { error: body?.message || "Erro ao gerar PIX na Primecash" },
        { status: res.status }
      );
    }

    const d = body?.data ?? body ?? {};
    const pixData = d.pix || d;
    const qrCode = pixData.qrcode || pixData.qr_code || pixData.copypaste || pixData.copy_paste || null;
    const qrCodeBase64 = pixData.qrcodeBase64 || pixData.qr_code_base64 || pixData.qrCodeUrl || null;
    const id = body?.id ?? null;
    const status = body?.status ?? null;

    return NextResponse.json({ 
      id, 
      status, 
      qrCode, 
      qrCodeBase64,
      pixCode: qrCode // Para manter compatibilidade com o checkout
    });
  } catch (err) {
    console.error("create-pix API error:", err);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
