import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const apiKey = process.env.PRIMECASH_API_KEY;
    if (!apiKey) {
      console.error("PRIMECASH_API_KEY não configurada");
      return NextResponse.json({ error: "Configuração de pagamento ausente" }, { status: 500 });
    }

    // Validate and format document (cpf or cnpj)
    // Frontend sends as taxId or document — accept both
    const rawDoc = data.payer?.document || data.payer?.taxId || "00000000000";
    const docDigits = rawDoc.replace(/\D/g, '');
    const docType = docDigits.length > 11 ? "cnpj" : "cpf";

    // Primecash V1 Payload expects camelCase
    const payload = {
      paymentMethod: "pix",
      amount: data.amount,
      postbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://paradadeouro.com.br'}/api/webhooks/primecash`,
      customer: {
        name: data.payer?.name || "Cliente sem nome",
        email: data.payer?.email || "email@desconhecido.com",
        document: {
          number: docDigits,
          type: docType
        }
      },
      items: data.items?.map((i: any) => ({
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unit_price || i.unitPrice || 0,
        tangible: true
      })) || []
    };

    const url = "https://api.primecashbrasil.com/v1/transactions";

    // Encode API key with ":x" as basic auth
    const authHeader = `Basic ${Buffer.from(`${apiKey}:x`).toString('base64')}`;

    console.log("Sending PIX request to Primecash API", {
      amount: data.amount,
      customer: {
        name: data.payer?.name,
        email: data.payer?.email,
        document: data.payer?.document
      }
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
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
