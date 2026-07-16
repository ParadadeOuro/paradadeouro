import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Filtro simples de bots por User-Agent
function isLikelyBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  if (!/mozilla\/|opera|safari\//.test(s)) return true;
  return /bot\b|crawl|spider|slurp|fetch|curl|wget|python|requests|axios|node-fetch|okhttp|java\/|go-http|headlesschrome|headless|phantom|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|monitor|uptimerobot|preview|prerender|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|googlebot|bingbot|yandex|duckduckbot|baidu|sogou|petalbot|bytespider|bytedancespider|bytedance|tiktokspider|tiktokbot|tiktok-ads|tt-?spider|ttbot|applebot|ahrefs|semrush|mj12bot|dotbot|seekport|chatgpt|gptbot|claudebot|oai-searchbot|perplexity|meta-externalagent|amazonbot|cloudflare|datadog|newrelic|statuspage|hetrix|rogerbot|exabot|qwant|coccocbot/.test(
    s
  );
}

// Sessões originadas do editor / preview do Lovable não devem contar
function isLovableEditor(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return /(^|\.)lovable\.(app|dev)$/i.test(host);
  } catch {
    return false;
  }
}

const HeartbeatSchema = z.object({
  sessionId: z.string().min(8).max(80),
  sessionStartedAt: z.string().datetime().optional(),
  path: z.string().max(500),
  interacted: z.boolean(),
  inCheckout: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  utm: z
    .object({
      source: z.string().max(120).nullable().optional(),
      medium: z.string().max(120).nullable().optional(),
      campaign: z.string().max(120).nullable().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = HeartbeatSchema.parse(json);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
               req.headers.get("cf-connecting-ip")?.trim() || null;

    if (isLikelyBot(data.userAgent)) return NextResponse.json({ ok: true, skipped: "bot" });
    if ((data.path ?? "").startsWith("/painel-gr")) return NextResponse.json({ ok: true, skipped: "admin" });
    if (isLovableEditor(data.referrer)) return NextResponse.json({ ok: true, skipped: "editor" });

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const IDLE_MS = 30 * 60 * 1000;
    const clientStartedMs = data.sessionStartedAt ? Date.parse(data.sessionStartedAt) : NaN;
    const hasValidClientStartedAt =
      Number.isFinite(clientStartedMs) &&
      clientStartedMs <= nowMs + 2 * 60 * 1000 &&
      clientStartedMs >= nowMs - 12 * 60 * 60 * 1000;
    const sessionStartedAtIso = hasValidClientStartedAt ? new Date(clientStartedMs).toISOString() : nowIso;

    const { data: existing } = await supabaseAdmin
      .from("site_sessions")
      .select("created_at, last_seen_at")
      .eq("session_id", data.sessionId)
      .maybeSingle();

    const existingCreatedMs = existing?.created_at ? new Date(existing.created_at).getTime() : 0;
    const isNewSessionByIdle =
      !existing ||
      !existing.last_seen_at ||
      nowMs - new Date(existing.last_seen_at).getTime() > IDLE_MS;
    const isNewSessionByClientStart = hasValidClientStartedAt && (!existing || clientStartedMs > existingCreatedMs + 5000);

    const basePayload = {
      session_id: data.sessionId,
      interacted: data.interacted,
      current_path: data.path,
      in_checkout: data.inCheckout ?? false,
      last_seen_at: nowIso,
      user_agent: data.userAgent ?? null,
      referrer: data.referrer ?? null,
      utm_source: data.utm?.source ?? null,
      utm_medium: data.utm?.medium ?? null,
      utm_campaign: data.utm?.campaign ?? null,
      ip_address: ip,
    };
    const payload = isNewSessionByIdle || isNewSessionByClientStart
      ? { ...basePayload, created_at: sessionStartedAtIso }
      : basePayload;

    await supabaseAdmin
      .from("site_sessions")
      .upsert(payload, { onConflict: "session_id", ignoreDuplicates: false });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Heartbeat error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
