import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";

// Endpoint anônimo que recebe blobs gzipados de eventos rrweb do browser.
// Sem PII; gravações ficam num bucket privado e só admin lê via URL assinada.
// Limites: 8MB por upload, session_id no formato esperado.

const MAX_BYTES = 8 * 1024 * 1024;
const SESSION_RE = /^[a-zA-Z0-9_-]{4,128}$/;

function parseUA(ua: string): { device: string; browser: string; os: string } {
  const lower = ua.toLowerCase();
  const device = /mobi|android|iphone|ipod/.test(lower)
    ? "mobile"
    : /ipad|tablet/.test(lower)
    ? "tablet"
    : "desktop";
  const browser = lower.includes("edg/") ? "Edge"
    : lower.includes("chrome/") ? "Chrome"
    : lower.includes("safari/") ? "Safari"
    : lower.includes("firefox/") ? "Firefox"
    : "Outro";
  const os = lower.includes("android") ? "Android"
    : lower.includes("iphone") || lower.includes("ipad") || lower.includes("ios") ? "iOS"
    : lower.includes("mac os") || lower.includes("macintosh") ? "macOS"
    : lower.includes("windows") ? "Windows"
    : lower.includes("linux") ? "Linux"
    : "Outro";
  return { device, browser, os };
}

export const Route = createFileRoute("/api/public/clarex-upload")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Clarex-Meta",
          },
        }),
      POST: async ({ request }) => {
        try {
          const metaRaw = request.headers.get("x-clarex-meta");
          if (!metaRaw) return new Response("missing meta", { status: 400 });
          let meta: {
            sessionId: string;
            startedAt: string;
            endedAt: string;
            durationMs: number;
            eventCount: number;
            pageUrl: string;
            surface?: string;
            referrer?: string;
            utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
            hasAttention?: boolean;
            attentionReason?: string;
          };
          try {
            meta = JSON.parse(metaRaw);
          } catch {
            return new Response("invalid meta", { status: 400 });
          }
          if (!SESSION_RE.test(meta.sessionId)) return new Response("invalid session", { status: 400 });
          if (typeof meta.eventCount !== "number" || meta.eventCount < 1) {
            return new Response("no events", { status: 400 });
          }

          const buffer = await request.arrayBuffer();
          if (!buffer.byteLength || buffer.byteLength > MAX_BYTES) {
            return new Response("payload size", { status: 413 });
          }

          const ua = request.headers.get("user-agent") ?? "";
          const { device, browser, os } = parseUA(ua);
          const country = request.headers.get("cf-ipcountry") ?? null;
          const ip =
            (request.headers.get("cf-connecting-ip") ||
              request.headers.get("x-forwarded-for")?.split(",")[0] ||
              null)?.trim() || null;

          if (ip) {
            const { isIpBlockedCached } = await import("@/lib/ip-blocklist.functions");
            const { blocked } = await isIpBlockedCached(ip);
            if (blocked) return new Response("blocked", { status: 403 });
          }


          const id = crypto.randomUUID();
          const day = new Date().toISOString().slice(0, 10);
          const storagePath = `${day}/${meta.sessionId}/${id}.json.gz`;

          const { error: upErr } = await supabaseAdmin.storage
            .from("clarex-recordings")
            .upload(storagePath, buffer, {
              contentType: "application/gzip",
              upsert: false,
            });
          if (upErr) {
            console.error("[clarex-upload] storage error", upErr);
            return new Response("storage error", { status: 500 });
          }

          const surface =
            meta.surface ??
            (meta.pageUrl?.includes("/checkout") ? "checkout" : "loja");

          const { error: insErr } = await supabaseAdmin.from("clarex_recordings").insert({
            id,
            session_id: meta.sessionId,
            started_at: meta.startedAt,
            ended_at: meta.endedAt,
            duration_ms: Math.max(0, Math.round(meta.durationMs)),
            event_count: meta.eventCount,
            size_bytes: buffer.byteLength,
            page_url: meta.pageUrl,
            surface,
            device_type: device,
            browser,
            os,
            country_code: country,
            has_attention: !!meta.hasAttention,
            attention_reason: meta.attentionReason ?? null,
            storage_path: storagePath,
            user_agent: ua.slice(0, 500),
            referrer: meta.referrer ?? null,
            utm_source: meta.utm?.source ?? null,
            utm_medium: meta.utm?.medium ?? null,
            utm_campaign: meta.utm?.campaign ?? null,
            ip_address: ip,
          });

          if (insErr) {
            console.error("[clarex-upload] insert error", insErr);
            // remove blob órfão
            await supabaseAdmin.storage.from("clarex-recordings").remove([storagePath]);
            return new Response("db error", { status: 500 });
          }

          return new Response(JSON.stringify({ ok: true, id }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (err) {
          console.error("[clarex-upload] unexpected", err);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
