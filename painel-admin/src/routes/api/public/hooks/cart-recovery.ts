import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { enqueueAppEmail, renderTemplate } from "@/lib/email-dispatch-admin";



const ZAPI_DELIVERY_WEBHOOK_BASE = "https://usegolraiz.com.br/api/public/hooks/zapi-delivery";

function zapiMessageAcceptedResponse(json: any): boolean {
  if (!json || typeof json !== "object") return false;
  if (json.error === true || json.success === false) return false;
  if (typeof json.message === "string" && /erro|error|inv[aá]lid|falha|failed|disconnect/i.test(json.message)) {
    return false;
  }
  return Boolean(json.messageId || json.id || json.zaapId);
}

function normalizeWhatsappPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function upsertConfig(key: string, value: string, description: string) {
  await supabaseAdmin
    .from("app_config")
    .upsert({ key, value, description, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

async function ensureZapiDeliveryWebhook(cfg: Map<string, string>, instanceId: string, token: string, clientToken: string) {
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

async function zapiConnected(instanceId: string, token: string, clientToken: string): Promise<boolean> {
  if (!instanceId || !token) return false;
  try {
    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/status`, {
      headers: { "Client-Token": clientToken },
    });
    if (!res.ok) return false;
    const json: any = await res.json().catch(() => ({}));
    return json?.connected === true;
  } catch {
    return false;
  }
}

type SendResult =
  | { ok: true; messageId: string | null; zaapId: string | null }
  | { ok: false; reason: string };

async function sendText(instanceId: string, token: string, clientToken: string, phone: string, message: string): Promise<SendResult> {
  try {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, message }),
    });
    const body = await res.text().catch(() => "");
    let json: any = {};
    try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
    if (!res.ok || !zapiMessageAcceptedResponse(json)) {
      console.error("Z-API send failed", res.status, body || json);
      return { ok: false, reason: "api_error" };
    }
    return { ok: true, messageId: json.messageId ?? json.id ?? null, zaapId: json.zaapId ?? null };
  } catch (e: any) {
    console.error("Z-API exception", e);
    return { ok: false, reason: "exception" };
  }
}

// ============================================================
// Estágio 1 — usa colunas LEGADAS (status, sent_at, recovery_message, zapi_message_id, zapi_zaap_id)
// Estágio 2 e 3 — usam colunas stage2_* e stage3_*
// ============================================================

const DEFAULT_TEMPLATE_1 = `Olá, {nome}! 👋\n\nNotei que você começou um pedido na Gol Raiz e não finalizou:\n\n{itens}\n\n💰 Total: *{total}*\n\nPara te ajudar, separei seu carrinho — é só clicar no link abaixo para retomar de onde parou (com seus dados já preenchidos):\n\n{link}\n\nQualquer dúvida, estou por aqui! 🟡⚫`;
const DEFAULT_TEMPLATE_2 = `Oi, {nome}! 👋\n\nVi que você não conseguiu finalizar seu pedido na Gol Raiz. Liberei um cupom exclusivo de *5% OFF* ({cupom}) pra te ajudar.\n\n💰 Total do seu carrinho: *{total}*\n\nÉ só clicar aqui pra retomar com o cupom já aplicado:\n{link}\n\nQualquer dúvida, estou por aqui! 🟡⚫`;
const DEFAULT_TEMPLATE_3 = `Oi, {nome}! 🙌\n\nÚltimo empurrãozinho: liberei *10% OFF* ({cupom}) no seu carrinho na Gol Raiz.\n\n💰 Total: *{total}*\n\nAplica direto aqui:\n{link}\n\nEsse cupom é exclusivo e não acumula com outros. Te espero! 🟡⚫`;

function buildMessage(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{nome\}/g, vars.nome ?? "")
    .replace(/\{itens\}/g, vars.itens ?? "")
    .replace(/\{total\}/g, vars.total ?? "")
    .replace(/\{link\}/g, vars.link ?? "")
    .replace(/\{cupom\}/g, vars.cupom ?? "");
}

function buildItensFmt(items: any[]): string {
  return items.map((it: any) => {
    const qty = Number(it?.quantity ?? 1);
    const title = String(it?.title ?? "Produto");
    const size = it?.size ? ` (${it.size})` : "";
    return `• ${qty}× ${title}${size}`;
  }).join("\n");
}

function isAfter(value: string | null | undefined, compareTo: string | null | undefined) {
  if (!value || !compareTo) return false;
  return new Date(value).getTime() > new Date(compareTo).getTime();
}

function idempotencySafeTimestamp(value: string | null | undefined) {
  return (value ?? new Date().toISOString()).replace(/[^0-9a-z]/gi, "");
}

export const Route = createFileRoute("/api/public/hooks/cart-recovery")({
  server: {
    handlers: {
      POST: async () => {
        const { data: configRows, error: cfgErr } = await supabaseAdmin
          .from("app_config")
          .select("key, value");
        if (cfgErr) {
          console.error("cart-recovery config error", cfgErr);
          return new Response(JSON.stringify({ success: false, error: "config" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const cfg = new Map(configRows?.map((r) => [r.key, r.value ?? ""]) ?? []);
        const enabled = cfg.get("cart_recovery_enabled") === "true";
        const instanceId = cfg.get("zapi_instance_id") ?? "";
        const token = cfg.get("zapi_token") ?? "";
        const clientToken = cfg.get("zapi_client_token") ?? token;
        // Regra fixa do negócio: carrinho com mais de 5 minutos sem atividade
        // deve entrar no fluxo de recuperação por e-mail. Sem depender de
        // configuração antiga de WhatsApp/Z-API.
        const delay1 = 5;
        const delay2 = Number(cfg.get("cart_recovery_delay2_minutes") ?? "30");
        const delay3 = Number(cfg.get("cart_recovery_delay3_minutes") ?? "60");
        const coupon2 = (cfg.get("cart_recovery_coupon2") || "CARRINHO5").toUpperCase();
        const coupon3 = (cfg.get("cart_recovery_coupon3") || "CARRINHO10").toUpperCase();
        const template1 = cfg.get("cart_recovery_message") || DEFAULT_TEMPLATE_1;
        const template2 = cfg.get("cart_recovery_message2") || DEFAULT_TEMPLATE_2;
        const template3 = cfg.get("cart_recovery_message3") || DEFAULT_TEMPLATE_3;

        // ⚠️ Carrinho abandonado NÃO envia WhatsApp — apenas e-mail.
        // WhatsApp é exclusivo de: lembrete Pix pendente e confirmação de pagamento (order-notifications).
        void enabled; void instanceId; void token; void clientToken;
        void template1; void template2; void template3;



        // ============================================================
        // BACKFILL stage 1: cria cart_recovery para checkout_attempts abandonados
        // ============================================================
        const cutoff1 = new Date(Date.now() - delay1 * 60 * 1000).toISOString();
        const { data: attempts } = await supabaseAdmin
          .from("checkout_attempts")
          .select("id, session_id, payer_name, payer_phone, payer_email, cart_items, cart_total_cents, last_activity_at, converted_order_id")
          .lte("last_activity_at", cutoff1)
          .is("converted_order_id", null)
          .order("last_activity_at", { ascending: false })
          .limit(200);

        if (attempts && attempts.length > 0) {
          const ids = attempts.map((a) => a.id);
          const { data: existing } = await supabaseAdmin
            .from("cart_recovery")
            .select("id, checkout_attempt_id, email_status, email_processed_at, email2_status, email2_processed_at, email3_status, email3_processed_at")
            .in("checkout_attempt_id", ids);
          const existingByAttempt = new Map((existing ?? []).map((r: any) => [r.checkout_attempt_id, r]));
          const toInsert = attempts
            .filter((a) => !existingByAttempt.has(a.id))
            .filter((a) => {
              const hasPhone = normalizeWhatsappPhone(a.payer_phone).length >= 12;
              const hasEmail = !!(a.payer_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.payer_email));
              return hasPhone || hasEmail;
            })
            .map((a) => ({
              checkout_attempt_id: a.id,
              session_id: a.session_id,
              lead_name: a.payer_name ?? null,
              lead_phone: a.payer_phone ?? null,
              lead_email: a.payer_email ?? null,
              cart_items: a.cart_items ?? [],
              cart_total_cents: a.cart_total_cents ?? 0,
              recovery_link: `https://usegolraiz.com.br/checkout?recover=${a.id}`,
              status: "pending",
            }));

          if (toInsert.length > 0) {
            await supabaseAdmin.from("cart_recovery").insert(toInsert);
          }

          for (const a of attempts ?? []) {
            const row: any = existingByAttempt.get(a.id);
            if (!row) continue;
            const patch: Record<string, unknown> = {
              lead_name: a.payer_name ?? null,
              lead_phone: a.payer_phone ?? null,
              lead_email: a.payer_email ?? null,
              cart_items: a.cart_items ?? [],
              cart_total_cents: a.cart_total_cents ?? 0,
              recovery_link: `https://usegolraiz.com.br/checkout?recover=${a.id}`,
            };

            // Se o cliente voltou ao checkout depois de um disparo anterior, é um novo abandono.
            // Reabre os estágios de e-mail para a fila usar a última atividade, não a criação antiga do carrinho.
            if (isAfter(a.last_activity_at, row.email_processed_at)) {
              patch.email_status = null;
              patch.email_processed_at = null;
              patch.email_message_id = null;
            }
            if (isAfter(a.last_activity_at, row.email2_processed_at)) {
              patch.email2_status = null;
              patch.email2_processed_at = null;
              patch.email2_message_id = null;
            }
            if (isAfter(a.last_activity_at, row.email3_processed_at)) {
              patch.email3_status = null;
              patch.email3_processed_at = null;
              patch.email3_message_id = null;
            }

            await supabaseAdmin.from("cart_recovery").update(patch as any).eq("id", row.id);
          }
        }

        let queued1 = 0, queued2 = 0, queued3 = 0;
        let failed = 0, skipped = 0;

        // Helper: confere a última atividade real do checkout e se já converteu.
        async function getAttemptState(checkoutAttemptId: string | null): Promise<{ converted: boolean; lastActivityAt: string | null }> {
          if (!checkoutAttemptId) return { converted: false, lastActivityAt: null };
          const { data: attempt } = await supabaseAdmin
            .from("checkout_attempts")
            .select("converted_order_id, last_activity_at, created_at, payer_email, payer_phone")
            .eq("id", checkoutAttemptId)
            .maybeSingle();
          if (!attempt) return { converted: false, lastActivityAt: null };
          if (attempt.converted_order_id) {
            return { converted: true, lastActivityAt: attempt.last_activity_at ?? null };
          }

          // Segurança extra: se por algum motivo o checkout não foi vinculado,
          // ainda assim NÃO dispara recuperação quando já existe pedido/Pix
          // gerado para o mesmo lead depois do início desse checkout.
          const email = (attempt.payer_email ?? "").trim().toLowerCase();
          const phone = normalizeWhatsappPhone(attempt.payer_phone);
          let hasGeneratedPix = false;
          if (email || phone) {
            const { data: orders } = await supabaseAdmin
              .from("orders")
              .select("id, payer_email, payer_phone")
              .gte("created_at", attempt.created_at)
              .order("created_at", { ascending: false })
              .limit(50);
            hasGeneratedPix = Boolean((orders ?? []).some((order: any) => {
              const orderEmail = String(order?.payer_email ?? "").trim().toLowerCase();
              const orderPhone = normalizeWhatsappPhone(order?.payer_phone);
              return (!!email && orderEmail === email) || (!!phone && orderPhone === phone);
            }));
          }
          return { converted: hasGeneratedPix, lastActivityAt: attempt.last_activity_at ?? null };
        }

        // ============================================================
        // WhatsApp foi REMOVIDO do fluxo de carrinho abandonado.
        // Carrinho abandonado agora é exclusivamente por e-mail.
        // ============================================================
        void buildMessage; void buildItensFmt; void sendText;
        void coupon2; void coupon3;



        // ============================================================
        // ENVIO DE EMAIL — independente do WhatsApp / Z-API
        // ============================================================
        // Estágio 1 é obrigatório: todo carrinho abandonado há mais de 5 minutos
        // com e-mail válido deve ser enfileirado, exceto se já gerou Pix/pedido.
        const emailEnabled1 = true;
        const emailEnabled2 = cfg.get("email_cart_recovery2_enabled") === "true";
        const emailEnabled3 = cfg.get("email_cart_recovery3_enabled") === "true";
        const emailDelay1 = 5;
        const emailDelay2 = Number(cfg.get("email_cart_recovery2_delay_minutes") ?? "30");
        const emailDelay3 = Number(cfg.get("email_cart_recovery3_delay_minutes") ?? "60");
        const emailSubject1 = cfg.get("email_cart_recovery_subject") || "Você esqueceu alguns itens no seu carrinho 🛒";
        const emailSubject2 = cfg.get("email_cart_recovery2_subject") || "Liberamos 5% OFF para finalizar seu pedido 🎁";
        const emailSubject3 = cfg.get("email_cart_recovery3_subject") || "Último empurrãozinho: 10% OFF no seu carrinho 🔥";
        const emailTpl1 = cfg.get("email_cart_recovery_message") || template1;
        const emailTpl2 = cfg.get("email_cart_recovery2_message") || template2;
        const emailTpl3 = cfg.get("email_cart_recovery3_message") || template3;

        let emailQueued1 = 0, emailQueued2 = 0, emailQueued3 = 0, emailFailed = 0;

        async function processEmailStage(
          stage: 1 | 2 | 3,
          enabled: boolean,
          delayMin: number,
          subject: string,
          tpl: string,
          coupon: string | null,
        ) {
          if (!enabled) return;
          const statusCol = stage === 1 ? "email_status" : stage === 2 ? "email2_status" : "email3_status";
          const procCol = stage === 1 ? "email_processed_at" : stage === 2 ? "email2_processed_at" : "email3_processed_at";
          const msgIdCol = stage === 1 ? "email_message_id" : stage === 2 ? "email2_message_id" : "email3_message_id";
          const cutoff = new Date(Date.now() - delayMin * 60 * 1000).toISOString();

          const staleQueuedCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: rows } = await supabaseAdmin
            .from("cart_recovery")
            .select(`id, checkout_attempt_id, lead_name, lead_email, cart_items, cart_total_cents, created_at, ${statusCol}, ${procCol}`)
            .or(`${statusCol}.is.null,${statusCol}.in.(failed,dlq),${statusCol}.eq.queued`)
            .not("lead_email", "is", null)
            .order("created_at", { ascending: true })
            .limit(200);

          for (const row of rows ?? []) {
            if ((row as any)[statusCol] === "queued" && (row as any)[procCol] && new Date((row as any)[procCol]).getTime() > new Date(staleQueuedCutoff).getTime()) {
              continue;
            }
            const attemptState = await getAttemptState(row.checkout_attempt_id);
            if (attemptState.converted) {
              await supabaseAdmin
                .from("cart_recovery")
                .update({ [statusCol]: "skipped", [procCol]: new Date().toISOString() } as any)
                .eq("id", row.id);
              continue;
            }
            if (attemptState.lastActivityAt && new Date(attemptState.lastActivityAt).getTime() > new Date(cutoff).getTime()) {
              continue;
            }
            const email = (row.lead_email ?? "").trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              await supabaseAdmin
                .from("cart_recovery")
                .update({ [statusCol]: "invalid_email", [procCol]: new Date().toISOString() } as any)
                .eq("id", row.id);
              continue;
            }
            const items: any[] = Array.isArray(row.cart_items) ? (row.cart_items as any[]) : [];
            const link = coupon
              ? `https://usegolraiz.com.br/checkout?recover=${row.checkout_attempt_id ?? ""}&ch=email&st=${stage}&coupon=${coupon}`
              : `https://usegolraiz.com.br/checkout?recover=${row.checkout_attempt_id ?? ""}&ch=email&st=${stage}`;
            const message = renderTemplate(tpl, {
              nome: row.lead_name?.split(" ")[0] ?? "",
              itens: buildItensFmt(items),
              total: fmtBRL(row.cart_total_cents ?? 0),
              link,
              cupom: coupon ?? "",
            });
            const r = await enqueueAppEmail({
              to: email,
              subject,
              text: message,
              templateName: `email_cart_recovery${stage === 1 ? "" : stage}`,
              label: `cart_recovery_stage_${stage}`,
              idempotencyKey: `cart-${stage}-${row.id}-${idempotencySafeTimestamp(attemptState.lastActivityAt ?? row.created_at)}`,
            });
            if (r.ok) {
              await supabaseAdmin
                .from("cart_recovery")
                .update({
                  [statusCol]: "queued",
                  [procCol]: new Date().toISOString(),
                  [msgIdCol]: r.messageId,
                } as any)
                .eq("id", row.id);
              if (stage === 1) emailQueued1++; else if (stage === 2) emailQueued2++; else emailQueued3++;
            } else {
              await supabaseAdmin
                .from("cart_recovery")
                .update({ [statusCol]: r.reason, [procCol]: new Date().toISOString() } as any)
                .eq("id", row.id);
              emailFailed++;
            }
          }
        }

        await processEmailStage(1, emailEnabled1, emailDelay1, emailSubject1, emailTpl1, null);
        await processEmailStage(2, emailEnabled2, emailDelay2, emailSubject2, emailTpl2, coupon2);
        await processEmailStage(3, emailEnabled3, emailDelay3, emailSubject3, emailTpl3, coupon3);

        return new Response(
          JSON.stringify({
            success: true,
            queued1, queued2, queued3,
            emailQueued1, emailQueued2, emailQueued3,
            failed, skipped, emailFailed,
          }),
          { headers: { "Content-Type": "application/json" } },
        );

      },
    },
  },
});
