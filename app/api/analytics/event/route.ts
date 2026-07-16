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

function isLovableEditor(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return /(^|\.)lovable\.(app|dev)$/i.test(host);
  } catch {
    return false;
  }
}

const EventSchema = z.object({
  sessionId: z.string().min(8).max(80),
  type: z.enum(["visit", "view_product", "view_checkout", "pix_generated", "paid"]),
  productHandle: z.string().max(120).optional(),
  orderRef: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = EventSchema.parse(json);

    if (isLikelyBot(data.userAgent)) return NextResponse.json({ ok: true, skipped: "bot" });
    if (isLovableEditor(data.referrer)) return NextResponse.json({ ok: true, skipped: "editor" });

    // Deduplicação por (session, type, productHandle) nos últimos 30min para tipos "view_*"
    if (data.type === "visit" || data.type === "view_product" || data.type === "view_checkout") {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let q = supabaseAdmin
        .from("funnel_events")
        .select("id", { head: true, count: "exact" })
        .eq("session_id", data.sessionId)
        .eq("event_type", data.type)
        .gte("created_at", since);
      if (data.productHandle) q = q.eq("product_handle", data.productHandle);
      const { count } = await q;
      if ((count ?? 0) > 0) return NextResponse.json({ ok: true, deduped: true });
    }

    await supabaseAdmin.from("funnel_events").insert({
      session_id: data.sessionId,
      event_type: data.type,
      product_handle: data.productHandle ?? null,
      order_ref: data.orderRef ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Event error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
