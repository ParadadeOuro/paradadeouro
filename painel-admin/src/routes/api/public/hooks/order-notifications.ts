import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { enqueueAppEmail, renderTemplate } from "@/lib/email-dispatch-admin";
import { nowBR } from "@/lib/datetime";


type Cfg = Map<string, string>;

const ZAPI_DELIVERY_WEBHOOK_BASE = "https://usefutfanaticos.com.br/api/public/hooks/zapi-delivery";

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function zapiAccepted(json: any): boolean {
  if (!json || typeof json !== "object") return false;
  if (json.error === true || json.success === false) return false;
  if (typeof json.message === "string" && /erro|error|inv[aá]lid|falha|failed|disconnect/i.test(json.message)) return false;
  return Boolean(json.messageId || json.id || json.zaapId);
}

async function zapiIsConnected(cfg: Cfg): Promise<boolean> {
  const instanceId = cfg.get("zapi_instance_id") ?? "";
  const token = cfg.get("zapi_token") ?? "";
  const clientToken = cfg.get("zapi_client_token") ?? token;
  if (!instanceId || !token) return false;
  try {
    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/status`, {
      method: "GET",
      headers: { "Client-Token": clientToken },
    });
    if (!res.ok) return false;
    const json: any = await res.json().catch(() => ({}));
    // Z-API retorna { connected: true/false, ... }
    return json?.connected === true;
  } catch {
    return false;
  }
}

type SendResult =
  | { ok: true; messageId: string | null; zaapId: string | null }
  | { ok: false; reason: string; status?: number };

function primaryZapiMessageId(result: SendResult): string | null {
  if (!result.ok) return null;
  return result.messageId || result.zaapId || null;
}

async function upsertConfig(key: string, value: string, description: string) {
  await supabaseAdmin
    .from("app_config")
    .upsert({ key, value, description, updated_at: nowBR().toISOString() }, { onConflict: "key" });
}

async function ensureZapiDeliveryWebhook(cfg: Cfg) {
  const instanceId = cfg.get("zapi_instance_id") ?? "";
  const token = cfg.get("zapi_token") ?? "";
  const clientToken = cfg.get("zapi_client_token") ?? token;
  if (!instanceId || !token) return;

  let secret = cfg.get("zapi_delivery_webhook_secret") ?? "";
  if (!secret) {
    secret = crypto.randomUUID();
    await upsertConfig("zapi_delivery_webhook_secret", secret, "Token interno do webhook de entrega Z-API");
  }
  const webhookUrl = `${ZAPI_DELIVERY_WEBHOOK_BASE}?token=${encodeURIComponent(secret)}`;

  async function configure(endpoint: string, cfgKey: string, description: string) {
    if (cfg.get(cfgKey) === webhookUrl) return;
    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ value: webhookUrl }),
    });
    const body = await res.text().catch(() => "");
    let json: any = {};
    try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
    if (!res.ok || json.value !== true) {
      console.error(`Z-API webhook config failed: ${endpoint}`, res.status, body);
      return;
    }
    await upsertConfig(cfgKey, webhookUrl, description);
  }

  await configure("update-webhook-delivery", "zapi_delivery_webhook_url", "Webhook de confirmação de disparo Z-API");
  await configure("update-webhook-message-status", "zapi_message_status_webhook_url", "Webhook de status real da mensagem Z-API");
}

async function sendZapi(cfg: Cfg, phone: string, message: string): Promise<SendResult> {
  const instanceId = cfg.get("zapi_instance_id") ?? "";
  const token = cfg.get("zapi_token") ?? "";
  const clientToken = cfg.get("zapi_client_token") ?? token;
  if (!instanceId || !token) return { ok: false, reason: "missing_credentials" };
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (!normalized || normalized.length < 12) return { ok: false, reason: "invalid_phone" };
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone: normalized, message }),
    });
    const body = await res.text().catch(() => "");
    let json: any = {};
    try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
    if (!res.ok || !zapiAccepted(json)) {
      console.error("Z-API send failed", res.status, body);
      return { ok: false, reason: "api_error", status: res.status };
    }
    return { ok: true, messageId: json.messageId ?? json.id ?? null, zaapId: json.zaapId ?? null };
  } catch (e: any) {
    console.error("Z-API send exception", e);
    return { ok: false, reason: "exception" };
  }
}

export const Route = createFileRoute("/api/public/hooks/order-notifications")({
  server: {
    handlers: {
      POST: async () => {
        const { data: cfgRows, error: cfgErr } = await supabaseAdmin
          .from("app_config")
          .select("key, value");
        if (cfgErr) {
          console.error("order-notifications config error", cfgErr);
          return new Response(JSON.stringify({ success: false, error: "config" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const cfg: Cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value ?? ""]));

        const confEnabled = cfg.get("order_confirmation_enabled") === "true";
        const remEnabled = cfg.get("pix_reminder_enabled") === "true";
        const rem2Enabled = cfg.get("pix_reminder2_enabled") === "true";
        const confDelay = Number(cfg.get("order_confirmation_delay_minutes") ?? "1");
        const remDelay = Number(cfg.get("pix_reminder_delay_minutes") ?? "5");
        const rem2Delay = Number(cfg.get("pix_reminder2_delay_minutes") ?? "60");
        const rem2Coupon = (cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase();

        await ensureZapiDeliveryWebhook(cfg);

        // Z-API check — se desconectado, pula WhatsApp mas segue com e-mail.
        const connected = await zapiIsConnected(cfg);
        const runWhatsapp = connected;
        if (!connected) {
          console.warn("[order-notifications] Z-API desconectado — seguindo com e-mail.");
        }

        let confirmationsSent = 0;
        let remindersSent = 0;
        let reminders2Sent = 0;
        let pixCodesSent = 0;
        let failed = 0;
        let emailSent = 0, emailFailed = 0;


        // ---------- Confirmações (PAID + 1min) ----------
        if (runWhatsapp && confEnabled) {
          const cutoff = new Date(Date.now() - confDelay * 60 * 1000).toISOString();
          const { data: paid } = await supabaseAdmin
            .from("orders")
            .select("id, external_ref, payer_name, payer_phone, amount_cents, order_secret")
            .eq("status", "PAID")
            .or("confirmation_status.is.null,confirmation_status.in.(failed,skipped,invalid_phone)")
            .lte("paid_at", cutoff)
            .limit(50);

          for (const o of paid ?? []) {
            const tpl = cfg.get("order_confirmation_message")
              || "Olá {nome}! Seu pedido na Fanáticos por Mantos foi confirmado. Total: {total}. Pedido: {pedido}";
            const message = render(tpl, {
              nome: (o.payer_name ?? "").split(" ")[0] ?? "",
              total: fmtBRL(o.amount_cents ?? 0),
              pedido: o.external_ref ?? "",
              link: `https://usefutfanaticos.com.br/rastreio/${o.external_ref ?? ""}?token=${o.order_secret ?? ""}`,
            });
            const r = await sendZapi(cfg, o.payer_phone ?? "", message);
            if (r.ok) {
              const acceptedId = primaryZapiMessageId(r);
              await supabaseAdmin
                .from("orders")
                .update({
                  confirmation_sent_at: null,
                  confirmation_status: acceptedId ? "queued" : "failed",
                  confirmation_zapi_message_id: r.messageId,
                  confirmation_zapi_zaap_id: r.zaapId,
                } as any)
                .eq("id", o.id);
              confirmationsSent++;
            } else {
              failed++;
              if (r.reason === "invalid_phone") {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    confirmation_sent_at: nowBR().toISOString(),
                    confirmation_status: "invalid_phone",
                  } as any)
                  .eq("id", o.id);
              }
            }
          }
        }

        // ---------- 1º Lembrete Pix (PENDING + delay) ----------
        if (runWhatsapp && remEnabled) {
          const cutoff = new Date(Date.now() - remDelay * 60 * 1000).toISOString();
          const { data: pend } = await supabaseAdmin
            .from("orders")
            .select("id, external_ref, payer_name, payer_phone, amount_cents, order_secret, pix_code")
            .eq("status", "PENDING")
            .or("pix_reminder_status.is.null,pix_reminder_status.in.(failed,skipped,invalid_phone)")
            .lte("created_at", cutoff)
            .limit(50);

          for (const o of pend ?? []) {
            const tpl = cfg.get("pix_reminder_message")
              || "Oi {nome}! Seu Pix de {total} ainda não foi pago. Vou te mandar o copia-e-cola na próxima mensagem 👇";
            // 🚫 1º lembrete NÃO leva link de checkout — leva copia-e-cola em 2ª mensagem.
            const message = render(tpl, {
              nome: (o.payer_name ?? "").split(" ")[0] ?? "",
              total: fmtBRL(o.amount_cents ?? 0),
              pedido: o.external_ref ?? "",
              link: "",
            });
            const r = await sendZapi(cfg, o.payer_phone ?? "", message);
            if (r.ok) {
              // 👉 COPIA-E-COLA: enviamos o pix_code como 2ª mensagem (única forma do cliente pagar pelo WhatsApp).
              let rCode: SendResult | null = null;
              if (o.pix_code) {
                rCode = await sendZapi(cfg, o.payer_phone ?? "", o.pix_code);
                if (rCode.ok) pixCodesSent++;
                else console.warn("[pix_reminder] copia-e-cola NÃO enviado", { orderId: o.id, reason: rCode.reason });
              } else {
                console.warn("[pix_reminder] pedido sem pix_code — copia-e-cola não disparado", { orderId: o.id });
              }
              const acceptedId = primaryZapiMessageId(r);
              const codeAccepted = !o.pix_code || Boolean(rCode?.ok && primaryZapiMessageId(rCode));
              await supabaseAdmin
                .from("orders")
                .update({
                  pix_reminder_sent_at: null,
                  pix_reminder_status: acceptedId && codeAccepted ? "queued" : "failed",
                  pix_reminder_zapi_message_id: r.messageId,
                  pix_reminder_zapi_zaap_id: r.zaapId,
                } as any)
                .eq("id", o.id);
              remindersSent++;
            } else {
              failed++;
              if (r.reason === "invalid_phone") {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    pix_reminder_sent_at: nowBR().toISOString(),
                    pix_reminder_status: "invalid_phone",
                  } as any)
                  .eq("id", o.id);
              }
            }
          }
        }

        // ---------- 2º Lembrete Pix com cupom 10% (PENDING + 60min) ----------
        if (runWhatsapp && rem2Enabled) {
          const cutoff = new Date(Date.now() - rem2Delay * 60 * 1000).toISOString();
          const { data: pend2 } = await supabaseAdmin
            .from("orders")
            .select("id, external_ref, payer_name, payer_phone, amount_cents, order_secret")
            .eq("status", "PENDING")
            .or("pix_reminder2_status.is.null,pix_reminder2_status.in.(failed,skipped,invalid_phone)")
            .lte("created_at", cutoff)
            .limit(50);

          for (const o of pend2 ?? []) {
            const tpl = cfg.get("pix_reminder2_message")
              || "Oi {nome}! Liberei um cupom de 10% OFF ({cupom}) pra você finalizar seu Pix. Total: {total}. Acesse: {link}";
            const link = `https://usegolraiz.com.br/checkout?coupon=${rem2Coupon}`;
            const message = render(tpl, {
              nome: (o.payer_name ?? "").split(" ")[0] ?? "",
              total: fmtBRL(o.amount_cents ?? 0),
              pedido: o.external_ref ?? "",
              cupom: rem2Coupon,
              link,
            });
            const r = await sendZapi(cfg, o.payer_phone ?? "", message);
            if (r.ok) {
              // 🚫 2º lembrete NÃO envia copia-e-cola — apenas o link com cupom.
              const acceptedId = primaryZapiMessageId(r);
              await supabaseAdmin
                .from("orders")
                .update({
                  pix_reminder2_sent_at: null,
                  pix_reminder2_status: acceptedId ? "queued" : "failed",
                  pix_reminder2_zapi_message_id: r.messageId,
                  pix_reminder2_zapi_zaap_id: r.zaapId,
                } as any)
                .eq("id", o.id);
              reminders2Sent++;
            } else {
              failed++;
              if (r.reason === "invalid_phone") {
                await supabaseAdmin
                  .from("orders")
                  .update({
                    pix_reminder2_sent_at: nowBR().toISOString(),
                    pix_reminder2_status: "invalid_phone",
                  } as any)
                  .eq("id", o.id);
              }
            }
          }
        }

        // ============================================================
        // ENVIO DE EMAIL — pix1, pix2, confirmação (independente Z-API)
        // ============================================================
        const emConfEnabled = cfg.get("email_order_confirmation_enabled") === "true";
        const emRemEnabled = cfg.get("email_pix_reminder_enabled") === "true";
        const emRem2Enabled = cfg.get("email_pix_reminder2_enabled") === "true";
        const emConfDelay = Number(cfg.get("email_order_confirmation_delay_minutes") ?? "0");
        const emRemDelay = Number(cfg.get("email_pix_reminder_delay_minutes") ?? "5");
        const emRem2Delay = Number(cfg.get("email_pix_reminder2_delay_minutes") ?? "60");

        async function processOrderEmail(
          channel: "pix1" | "pix2" | "confirmation",
          enabled: boolean,
          delayMin: number,
          subjectKey: string,
          messageKey: string,
          orderStatus: "PENDING" | "PAID",
          timestampForCutoff: "created_at" | "paid_at",
          statusCol: string,
          sentCol: string,
          msgIdCol: string,
        ) {
          if (!enabled) return;
          const subject = cfg.get(subjectKey) || "Atualização do seu pedido na Fanáticos por Mantos";
          const tpl = cfg.get(messageKey) || "Olá {nome}!";
          const cutoff = new Date(Date.now() - delayMin * 60 * 1000).toISOString();
          const { data: rows } = await supabaseAdmin
            .from("orders")
            .select(`id, external_ref, payer_name, payer_email, amount_cents, order_secret, pix_code, ${timestampForCutoff}, ${statusCol}, ${sentCol}`)
            .eq("status", orderStatus)
            .is(sentCol, null)
            .lte(timestampForCutoff, cutoff)
            .not("payer_email", "is", null)
            .limit(50);

          for (const o of rows ?? []) {
            const email = ((o as any).payer_email ?? "").trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              await supabaseAdmin.from("orders").update({
                [statusCol]: "invalid_email",
                [sentCol]: nowBR().toISOString(),
              } as any).eq("id", (o as any).id);
              continue;
            }
            const ref = (o as any).external_ref ?? "";
            const secret = (o as any).order_secret ?? "";
            const trackUrl = `https://usefutfanaticos.com.br/rastreio/${encodeURIComponent(ref)}?token=${encodeURIComponent(secret)}`;
            const link = channel === "confirmation"
              ? trackUrl
              : channel === "pix2"
              ? `https://usefutfanaticos.com.br/checkout?coupon=${(cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase()}`
              : `https://usefutfanaticos.com.br/checkout/pix?ref=${ref}`;
            const message = renderTemplate(tpl, {
              nome: ((o as any).payer_name ?? "").split(" ")[0] ?? "",
              total: fmtBRL((o as any).amount_cents ?? 0),
              pedido: (o as any).external_ref ?? "",
              cupom: (cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase(),
              link,
              pix: (o as any).pix_code ?? "",
            });
            const r = await enqueueAppEmail({
              to: email,
              subject,
              text: message,
              templateName: messageKey,
              label: `${channel}_email`,
              idempotencyKey: `${channel}-${(o as any).id}`,
            });
            if (r.ok) {
              // ⚠️ NÃO marca como "enviado" aqui — apenas registra que foi enfileirado.
              // O processador da fila (process-email-queue) atualiza o status real
              // (sent/dlq) baseado na resposta da API de e-mail.
              await supabaseAdmin.from("orders").update({
                [statusCol]: "pending",
                [msgIdCol]: r.messageId,
                // sentCol fica null até confirmação real do envio
              } as any).eq("id", (o as any).id);
              emailSent++;
            } else {
              await supabaseAdmin.from("orders").update({
                [statusCol]: r.reason,
                [sentCol]: new Date().toISOString(),
              } as any).eq("id", (o as any).id);
              emailFailed++;
            }
          }
        }

        await processOrderEmail(
          "pix1", emRemEnabled, emRemDelay,
          "email_pix_reminder_subject", "email_pix_reminder_message",
          "PENDING", "created_at",
          "email_pix_reminder_status", "email_pix_reminder_sent_at", "email_pix_reminder_message_id",
        );
        await processOrderEmail(
          "pix2", emRem2Enabled, emRem2Delay,
          "email_pix_reminder2_subject", "email_pix_reminder2_message",
          "PENDING", "created_at",
          "email_pix_reminder2_status", "email_pix_reminder2_sent_at", "email_pix_reminder2_message_id",
        );
        await processOrderEmail(
          "confirmation", emConfEnabled, emConfDelay,
          "email_order_confirmation_subject", "email_order_confirmation_message",
          "PAID", "paid_at",
          "email_confirmation_status", "email_confirmation_sent_at", "email_confirmation_message_id",
        );

        return new Response(
          JSON.stringify({ success: true, confirmationsSent, remindersSent, reminders2Sent, pixCodesSent, failed, emailSent, emailFailed }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      },
    },
  },
});
