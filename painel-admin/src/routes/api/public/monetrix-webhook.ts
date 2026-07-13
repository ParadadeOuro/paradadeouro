import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
// (CompletePayment movido para createPixPayment — sem imports do tiktok aqui)


/**
 * Webhook do Monetrix.
 * Como o formato exato do payload pode variar, ao receber qualquer notificação
 * nós re-consultamos a API do Monetrix usando o ID do pagamento como fonte da verdade.
 * Requer o header X-Webhook-Secret para validar a origem.
 */
export const Route = createFileRoute("/api/public/monetrix-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.MONETRIX_API_KEY;
        if (!apiKey) {
          return new Response("Missing MONETRIX_API_KEY", { status: 500 });
        }

        const webhookSecret = process.env.MONETRIX_WEBHOOK_SECRET;
        if (webhookSecret) {
          const providedSecret = request.headers.get("x-webhook-secret");
          if (providedSecret !== webhookSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const paymentId: string | undefined =
          body?.id || body?.paymentId || body?.data?.id || body?.payment?.id;
        const externalRef: string | undefined =
          body?.externalRef || body?.data?.externalRef || body?.payment?.externalRef;

        if (!paymentId && !externalRef) {
          return new Response("Missing payment id", { status: 400 });
        }

        // Verifica status na origem
        let status: string = "UNKNOWN";
        let paidAt: string | null = null;
        if (paymentId) {
          const r = await fetch(
            `https://api.monetrixpay.online/v1/payment/${encodeURIComponent(paymentId)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } },
          );
          if (r.ok) {
            const j: any = await r.json().catch(() => ({}));
            const raw = String(j?.status ?? j?.data?.status ?? "").toUpperCase();
            if (["PAID", "APPROVED", "COMPLETED", "CONFIRMED"].includes(raw)) status = "PAID";
            else if (["PENDING", "WAITING", "PROCESSING", "CREATED"].includes(raw)) status = "PENDING";
            else if (["EXPIRED", "TIMEOUT"].includes(raw)) status = "PENDING";
            else if (["CANCELLED", "CANCELED", "REFUSED", "FAILED"].includes(raw)) status = "CANCELLED";
            paidAt = j?.paidAt ?? j?.data?.paidAt ?? null;
          }
        }

        const update: { status: string; paid_at?: string } = { status };
        if (status === "PAID") update.paid_at = paidAt ?? new Date().toISOString();

        // Lê estado anterior para garantir idempotência do evento do TikTok.
        let prevStatus: string | null = null;
        {
          const q = supabaseAdmin.from("orders").select("status, id");
          const { data: prev } = paymentId
            ? await q.eq("payment_id", paymentId).maybeSingle()
            : await q.eq("external_ref", externalRef!).maybeSingle();
          prevStatus = prev?.status ?? null;
        }

        const query = supabaseAdmin.from("orders").update(update);
        const { error } = paymentId
          ? await query.eq("payment_id", paymentId)
          : await query.eq("external_ref", externalRef!);

        if (error) {
          console.error("webhook update error", error);
          return new Response("DB error", { status: 500 });
        }

        // 🔕 TikTok CompletePayment foi movido para o momento da geração do PIX
        // (em createPixPayment). Não dispara mais aqui na transição para PAID.




        if (status === "PAID") {
          try {
            let ref = externalRef ?? null;
            if (!ref && paymentId) {
              const { data: ord } = await supabaseAdmin
                .from("orders")
                .select("external_ref")
                .eq("payment_id", paymentId)
                .maybeSingle();
              ref = ord?.external_ref ?? null;
            }
            if (ref) {
              const { data: pixEvt } = await supabaseAdmin
                .from("funnel_events")
                .select("session_id")
                .eq("event_type", "pix_generated")
                .eq("order_ref", ref)
                .maybeSingle();
              if (pixEvt?.session_id) {
                const { data: already } = await supabaseAdmin
                  .from("funnel_events")
                  .select("id")
                  .eq("event_type", "paid")
                  .eq("order_ref", ref)
                  .maybeSingle();
                if (!already) {
                  await supabaseAdmin.from("funnel_events").insert({
                    session_id: pixEvt.session_id,
                    event_type: "paid",
                    order_ref: ref,
                  });
                }
              }
            }
          } catch (e) {
            console.error("funnel paid event error", e);
          }
        }

        return new Response(JSON.stringify({ ok: true, status }), {
          headers: { "Content-Type": "application/json" },
        });

      },
    },
  },
});
