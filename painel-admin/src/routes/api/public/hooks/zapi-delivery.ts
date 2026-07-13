import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { nowBR } from "@/lib/datetime";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders, ...(init.headers ?? {}) },
  });
}

function extractZapiDeliveryState(payload: any): "failed" | "delivered" | "sent" | "queued" {
  const text = [
    payload?.status,
    payload?.type,
    payload?.event,
    payload?.message,
    payload?.deliveryStatus,
    payload?.message?.status,
    payload?.message?.type,
    payload?.message?.event,
  ]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();

  if (payload?.error === true || /erro|error|failed|falha|undeliver|rejected|cancel/i.test(text)) return "failed";
  if (/received|read|read_by_me|played|lido|visualizado/i.test(text)) return "delivered";
  if (/deliverycallback|message_status_callback|sent|enviado|delivered|entregue/i.test(text)) return "sent";
  return "queued";
}

function zapiEventTimestamp(payload: any): string {
  const raw = Number(payload?.momment ?? payload?.moment ?? payload?.timestamp ?? payload?.time);
  if (Number.isFinite(raw) && raw > 0) {
    const ms = raw > 10_000_000_000 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  return nowBR().toISOString();
}

export const Route = createFileRoute("/api/public/hooks/zapi-delivery")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () => json({ ok: true, webhook: "zapi-delivery" }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";

        const { data: cfgRows, error: cfgErr } = await supabaseAdmin
          .from("app_config")
          .select("key, value")
          .in("key", ["zapi_delivery_webhook_secret"]);
        if (cfgErr) {
          console.error("zapi-delivery config error", cfgErr);
          return json({ ok: false }, { status: 500 });
        }

        const secret = cfgRows?.find((r) => r.key === "zapi_delivery_webhook_secret")?.value ?? "";
        if (!secret || token !== secret) {
          return json({ ok: false }, { status: 401 });
        }

        const payload = await request.json().catch(() => null) as any;
        if (!payload || typeof payload !== "object") {
          return json({ ok: false }, { status: 400 });
        }

        const messageIds = [payload.messageId, payload.id, payload.zaapId, payload.zaapMessageId, payload.message?.id, payload.message?.messageId, payload.message?.zaapId, ...(Array.isArray(payload.ids) ? payload.ids : [])]
          .filter((v) => typeof v === "string" && v.length > 0) as string[];
        const zaapIds = [payload.zaapId, payload.zaapMessageId, payload.messageId, payload.id, payload.message?.zaapId, payload.message?.messageId]
          .filter((v) => typeof v === "string" && v.length > 0) as string[];
        const deliveryState = extractZapiDeliveryState(payload);
        const hasError = deliveryState === "failed";
        const isDelivered = deliveryState === "delivered";
        const isSent = deliveryState === "sent";
        const eventAt = zapiEventTimestamp(payload);

        // ---------- Atualiza cart_recovery: tenta nos 3 estágios ----------
        const cartStages: Array<{ msgCol: string; zaapCol: string; patch: Record<string, any> }> = [
          {
            msgCol: "zapi_message_id",
            zaapCol: "zapi_zaap_id",
            patch: hasError
              ? { status: "failed", processed_at: nowBR().toISOString(), zapi_delivery_payload: payload }
              : isDelivered
                ? { status: "delivered", sent_at: eventAt, processed_at: nowBR().toISOString(), zapi_delivery_payload: payload }
                : isSent
                  ? { status: "sent", sent_at: eventAt, processed_at: nowBR().toISOString(), zapi_delivery_payload: payload }
                  : { status: "queued", processed_at: nowBR().toISOString(), zapi_delivery_payload: payload },
          },
          {
            msgCol: "stage2_zapi_message_id",
            zaapCol: "stage2_zaap_id",
            patch: hasError
              ? { stage2_status: "failed", stage2_processed_at: nowBR().toISOString() }
              : isDelivered
                ? { stage2_status: "delivered", stage2_sent_at: eventAt, stage2_processed_at: nowBR().toISOString() }
                : isSent
                  ? { stage2_status: "sent", stage2_sent_at: eventAt, stage2_processed_at: nowBR().toISOString() }
                  : { stage2_status: "queued", stage2_processed_at: nowBR().toISOString() },
          },
          {
            msgCol: "stage3_zapi_message_id",
            zaapCol: "stage3_zaap_id",
            patch: hasError
              ? { stage3_status: "failed", stage3_processed_at: nowBR().toISOString() }
              : isDelivered
                ? { stage3_status: "delivered", stage3_sent_at: eventAt, stage3_processed_at: nowBR().toISOString() }
                : isSent
                  ? { stage3_status: "sent", stage3_sent_at: eventAt, stage3_processed_at: nowBR().toISOString() }
                  : { stage3_status: "queued", stage3_processed_at: nowBR().toISOString() },
          },
        ];

        for (const stage of cartStages) {
          if (messageIds.length > 0) {
            const { data: updatedRows, error } = await supabaseAdmin
              .from("cart_recovery")
              .update(stage.patch as any)
              .in(stage.msgCol, messageIds)
              .select("id");
            if (error) console.error("zapi-delivery cart update by messageId error", stage.msgCol, error);
            else if ((updatedRows?.length ?? 0) > 0) continue;
          }
          if (zaapIds.length > 0) {
            await supabaseAdmin
              .from("cart_recovery")
              .update(stage.patch as any)
              .in(stage.zaapCol, zaapIds);
          }
        }

        // ---------- Atualiza orders (3 canais) ----------
        const orderStatus = hasError ? "failed" : isDelivered ? "delivered" : isSent ? "sent" : "queued";
        const channels: Array<{ msgCol: string; zaapCol: string; statusCol: string; sentCol: string }> = [
          { msgCol: "pix_reminder_zapi_message_id", zaapCol: "pix_reminder_zapi_zaap_id", statusCol: "pix_reminder_status", sentCol: "pix_reminder_sent_at" },
          { msgCol: "pix_reminder2_zapi_message_id", zaapCol: "pix_reminder2_zapi_zaap_id", statusCol: "pix_reminder2_status", sentCol: "pix_reminder2_sent_at" },
          { msgCol: "confirmation_zapi_message_id", zaapCol: "confirmation_zapi_zaap_id", statusCol: "confirmation_status", sentCol: "confirmation_sent_at" },
        ];

        for (const ch of channels) {
          const patch = (isDelivered || isSent) ? { [ch.statusCol]: orderStatus, [ch.sentCol]: eventAt } : { [ch.statusCol]: orderStatus };
          if (messageIds.length > 0) {
            const { data: rows } = await supabaseAdmin
              .from("orders")
              .update(patch as any)
              .in(ch.msgCol, messageIds)
              .select("id");
            if ((rows?.length ?? 0) > 0) continue;
          }
          if (zaapIds.length > 0) {
            await supabaseAdmin
              .from("orders")
              .update(patch as any)
              .in(ch.zaapCol, zaapIds);
          }
        }

        return json({ ok: true });
      },
    },
  },
});
