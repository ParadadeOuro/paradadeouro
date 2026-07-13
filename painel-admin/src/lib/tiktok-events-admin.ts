import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

const PIXEL_CODE = "D8EU56JC77U0TBB150F0";

const ItemSchema = z.object({
  content_id: z.string().min(1).max(120),
  content_name: z.string().max(200).optional(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const InputSchema = z.object({
  eventId: z.string().min(1).max(80),
  value: z.number().nonnegative(),
  currency: z.string().default("BRL"),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  externalId: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
  ttclid: z.string().min(1).max(500).optional(),
  ttp: z.string().min(1).max(500).optional(),
  contents: z.array(ItemSchema).min(1).max(100),
});

function sha256(s: string) {
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

function normalizePhone(p: string) {
  const digits = p.replace(/\D/g, "");
  // E.164 BR: prefix +55 se faltar
  if (digits.startsWith("55")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

async function sendEventToTiktok(eventName: string, data: z.infer<typeof InputSchema>) {
  const token = process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
  if (!token) {
    console.warn("TIKTOK_EVENTS_ACCESS_TOKEN ausente — evento server-side ignorado");
    return { sent: false, reason: "missing_token" as const };
  }

  const userAgent = getRequestHeader("user-agent") ?? undefined;
  const ip = (() => {
    try { return getRequestIP({ xForwardedFor: true }) ?? undefined; } catch { return undefined; }
  })();

  const user: Record<string, unknown> = {};
  if (data.email) user.email = [sha256(data.email)];
  if (data.phone) user.phone = [sha256(normalizePhone(data.phone))];
  if (data.externalId) user.external_id = [sha256(data.externalId)];
  if (ip) user.ip = ip;
  if (userAgent) user.user_agent = userAgent;
  if (data.ttclid) user.ttclid = data.ttclid;
  if (data.ttp) user.ttp = data.ttp;

  const payload = {
    event_source: "web",
    event_source_id: PIXEL_CODE,
    data: [
      {
        event: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: data.eventId,
        user,
        properties: {
          currency: data.currency,
          value: Number(data.value.toFixed(2)),
          contents: data.contents.map((c) => ({
            content_id: c.content_id,
            content_type: "product",
            content_name: c.content_name,
            quantity: c.quantity,
            price: Number(c.price.toFixed(2)),
          })),
        },
        page: data.url ? { url: data.url } : undefined,
      },
    ],
  };

  try {
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body && body.code && body.code !== 0)) {
      console.error(`TikTok Events API error (${eventName})`, res.status, body);
      return { sent: false, status: res.status, body };
    }
    return { sent: true as const };
  } catch (e: any) {
    console.error(`TikTok Events API exception (${eventName})`, e);
    return { sent: false, error: e?.message ?? "fetch_failed" };
  }
}

export const trackTiktokPurchase = createServerFn({ method: "POST" })
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => sendEventToTiktok("CompletePayment", data));

export const trackTiktokViewContent = createServerFn({ method: "POST" })
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => sendEventToTiktok("ViewContent", data));

export const trackTiktokAddToCart = createServerFn({ method: "POST" })
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => sendEventToTiktok("AddToCart", data));

export const trackTiktokInitiateCheckout = createServerFn({ method: "POST" })
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => sendEventToTiktok("InitiateCheckout", data));




