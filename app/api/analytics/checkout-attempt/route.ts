import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isLikelyBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  if (!/mozilla\/|opera|safari\//.test(s)) return true;
  return /bot\b|crawl|spider|slurp|fetch|curl|wget|python|requests|axios|node-fetch|okhttp|java\/|go-http|headlesschrome|headless|phantom|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|monitor|uptimerobot|preview|prerender|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|googlebot|bingbot|yandex|duckduckbot|baidu|sogou|petalbot|bytespider|bytedancespider|bytedance|tiktokspider|tiktokbot|tiktok-ads|tt-?spider|ttbot|applebot|ahrefs|semrush|mj12bot|dotbot|seekport|chatgpt|gptbot|claudebot|oai-searchbot|perplexity|meta-externalagent|amazonbot|cloudflare|datadog|newrelic|statuspage|hetrix|rogerbot|exabot|qwant|coccocbot/.test(
    s
  );
}

const CheckoutAttemptSchema = z.object({
  sessionId: z.string().min(8).max(80),
  payerName: z.string().max(160).optional(),
  payerEmail: z.string().max(160).optional(),
  payerCpf: z.string().max(20).optional(),
  payerPhone: z.string().max(30).optional(),
  cartItems: z.array(z.any()).max(50).optional(),
  cartTotalCents: z.number().int().nonnegative().optional(),
  lastStep: z.number().int().min(1).max(3).optional(),
  userAgent: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = CheckoutAttemptSchema.parse(json);

    if (isLikelyBot(data.userAgent)) return NextResponse.json({ ok: true, skipped: "bot" });
    
    // Requer pelo menos UM campo de identificação preenchido
    const hasAny =
      (data.payerName && data.payerName.trim().length > 0) ||
      (data.payerEmail && data.payerEmail.trim().length > 0) ||
      (data.payerCpf && data.payerCpf.trim().length > 0) ||
      (data.payerPhone && data.payerPhone.trim().length > 0);
    if (!hasAny) return NextResponse.json({ ok: true, skipped: "empty" });

    const { data: upserted } = await supabaseAdmin
      .from("checkout_attempts")
      .upsert(
        {
          session_id: data.sessionId,
          payer_name: data.payerName ?? null,
          payer_email: data.payerEmail ?? null,
          payer_cpf: data.payerCpf ?? null,
          payer_phone: data.payerPhone ?? null,
          cart_items: data.cartItems ?? [],
          cart_total_cents: data.cartTotalCents ?? 0,
          last_step: data.lastStep ?? 1,
          last_activity_at: new Date().toISOString(),
        },
        { onConflict: "session_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    // Cria/atualiza entrada de recuperação de carrinho se tiver telefone
    if (upserted?.id && data.payerPhone && data.payerPhone.trim().length >= 10) {
      try {
        const { data: existingRec } = await supabaseAdmin
          .from("cart_recovery")
          .select("id, status")
          .eq("checkout_attempt_id", upserted.id)
          .maybeSingle();

        const payload = {
          checkout_attempt_id: upserted.id,
          session_id: data.sessionId,
          lead_name: data.payerName ?? null,
          lead_phone: data.payerPhone.trim(),
          lead_email: data.payerEmail ?? null,
          cart_items: data.cartItems ?? [],
          cart_total_cents: data.cartTotalCents ?? 0,
          recovery_link: `https://usegolraiz.com.br/checkout?recover=${upserted.id}`,
        };

        if (!existingRec) {
          await supabaseAdmin.from("cart_recovery").insert({ ...payload, status: "pending" });
        } else if (existingRec.status === "pending") {
          // Só atualiza dados se ainda não foi enviado
          await supabaseAdmin
            .from("cart_recovery")
            .update(payload)
            .eq("id", existingRec.id);
        }
      } catch (e) {
        console.error("cart_recovery upsert error", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Checkout attempt error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
