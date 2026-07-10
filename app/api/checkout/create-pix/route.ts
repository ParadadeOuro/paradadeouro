import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const apiKey = process.env.MONETRIX_API_KEY;
    if (!apiKey) {
      console.error("MONETRIX_API_KEY não configurada");
      return NextResponse.json({ error: "Configuração de pagamento ausente" }, { status: 500 });
    }

    const payload = {
      amount: data.amount,
      currency: "BRL",
      method: "PIX",
      description: data.description || "Pedido Parada de Ouro",
      externalRef: data.externalRef,
      payer: data.payer,
      items: data.items || [],
      delivery: data.delivery || { fee: 0, address: { line1: "N/A", city: "N/A", state: "N/A", zipCode: "00000000", country: "BR" } },
    };

    const res = await fetch("https://api.monetrixpay.online/v1/payment", {
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
      console.error("Monetrix error", res.status, body);
      return NextResponse.json(
        { error: body?.message || "Erro ao gerar PIX na Monetrix" },
        { status: res.status }
      );
    }

    const d = body?.data ?? {};
    const qrCode = d.copypaste || d.copyPaste || d.qrcode || d.qrCode || body?.qrcode || null;
    const qrCodeBase64 = d.qrcodeBase64 || d.qrCodeBase64 || d.imageBase64 || null;
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
