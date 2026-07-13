import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { nowBR } from "./datetime";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar permissão");
  if (!data) throw new Error("Acesso negado");
}

function formatItensList(items: any): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((it: any) => {
      const qty = Number(it?.quantity ?? 1);
      const title = String(it?.title ?? "Produto");
      const size = it?.size ? ` (${it.size})` : "";
      return `• ${qty}× ${title}${size}`;
    })
    .join("\n");
}

function zapiMessageAcceptedResponse(json: any): boolean {
  if (!json || typeof json !== "object") return false;
  if (json.error === true || json.success === false) return false;
  if (typeof json.message === "string" && /erro|error|inv[aá]lid|falha|failed/i.test(json.message)) {
    return false;
  }
  return Boolean(json.messageId || json.id || json.zaapId);
}

function normalizeWhatsappPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

const ZAPI_DELIVERY_WEBHOOK_BASE = "https://usegolraiz.com.br/api/public/hooks/zapi-delivery";

async function upsertConfig(key: string, value: string, description: string) {
  await supabaseAdmin
    .from("app_config")
    .upsert({ key, value, description, updated_at: nowBR().toISOString() }, { onConflict: "key" });
}

async function ensureZapiDeliveryWebhook() {
  const cfg = await getAppConfig();
  if (!cfg.zapi_instance_id || !cfg.zapi_token) return;
  const { data: rows } = await supabaseAdmin.from("app_config").select("key, value");
  const map = new Map(rows?.map((r) => [r.key, r.value ?? ""]) ?? []);
  let secret = map.get("zapi_delivery_webhook_secret") ?? "";
  if (!secret) {
    secret = crypto.randomUUID();
    await upsertConfig("zapi_delivery_webhook_secret", secret, "Token interno do webhook de entrega Z-API");
  }
  const webhookUrl = `${ZAPI_DELIVERY_WEBHOOK_BASE}?token=${encodeURIComponent(secret)}`;

  async function configure(endpoint: string, cfgKey: string, description: string) {
    if (map.get(cfgKey) === webhookUrl) return;
    const res = await fetch(`https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Client-Token": cfg.zapi_client_token },
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

const DEFAULT_RECOVERY_TEMPLATE = `Olá, {nome}! 👋

Notei que você começou um pedido na Gol Raiz e não finalizou:

{itens}

💰 Total: *{total}*

Para te ajudar, separei seu carrinho — é só clicar no link abaixo para retomar de onde parou (com seus dados já preenchidos):

{link}

Qualquer dúvida, estou por aqui! 🟡⚫`;

interface AppConfig {
  cart_recovery_enabled: boolean;
  zapi_instance_id: string;
  zapi_token: string;
  zapi_client_token: string;
  zapi_recovery_delay_minutes: number;
}

async function getAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("key, value");
  if (error) throw new Error(error.message);

  const map = new Map(data?.map((r) => [r.key, r.value]) ?? []);
  const token = map.get("zapi_token") ?? "";

  return {
    cart_recovery_enabled: map.get("cart_recovery_enabled") === "true",
    zapi_instance_id: map.get("zapi_instance_id") ?? "",
    zapi_token: token,
    zapi_client_token: map.get("zapi_client_token") ?? token,
    zapi_recovery_delay_minutes: Number(map.get("zapi_recovery_delay_minutes") ?? "3"),
  };
}

// ---------- PUBLIC: send recovery message via Z-API ----------
export const sendCartRecoveryMessage = createServerFn({ method: "POST" })
  .validator((d: { phone: string; message: string; checkoutAttemptId?: string }) => d)
  .handler(async ({ data }) => {
    const cfg = await getAppConfig();
    await ensureZapiDeliveryWebhook();
    if (!cfg.cart_recovery_enabled) {
      return { ok: false, reason: "disabled" };
    }
    if (!cfg.zapi_instance_id || !cfg.zapi_token) {
      return { ok: false, reason: "missing_credentials" };
    }

    const phone = normalizeWhatsappPhone(data.phone);
    if (!phone || phone.length < 12) {
      return { ok: false, reason: "invalid_phone" };
    }

    const url = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/send-text`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": cfg.zapi_client_token },
        body: JSON.stringify({ phone, message: data.message }),
      });

      const body = await res.text().catch(() => "");
      let json: any = {};
      try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }

      if (!res.ok || !zapiMessageAcceptedResponse(json)) {
        console.error("Z-API error", res.status, body);
        return { ok: false, reason: "api_error", status: res.status };
      }

      // A API aceitou a fila; "Enviado" só será marcado pelo webhook de entrega.
      if (data.checkoutAttemptId) {
        await supabaseAdmin
          .from("cart_recovery")
          .update({
            status: "queued",
            processed_at: nowBR().toISOString(),
            sent_at: null,
            zapi_message_id: json.messageId ?? json.id ?? null,
            zapi_zaap_id: json.zaapId ?? null,
            zapi_delivery_payload: null,
          } as any)
          .eq("checkout_attempt_id", data.checkoutAttemptId);
      }

      return { ok: true, zapiResponse: json };
    } catch (err: any) {
      console.error("Z-API send error", err);
      return { ok: false, reason: "exception", message: err?.message ?? "unknown" };
    }
  });

// ---------- ADMIN: update config ----------
export const updateAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { key: string; value: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert(
        { key: data.key, value: data.value, updated_at: nowBR().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: resend recovery message ----------
export const resendCartRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("cart_recovery")
      .select("id, checkout_attempt_id, lead_name, lead_phone, cart_total_cents, cart_items")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Registro não encontrado");

    const cfg = await getAppConfig();
    await ensureZapiDeliveryWebhook();
    if (!cfg.zapi_instance_id || !cfg.zapi_token) {
      return { ok: false, reason: "missing_credentials" as const };
    }

    const phone = normalizeWhatsappPhone(row.lead_phone);
    if (!phone || phone.length < 12) {
      return { ok: false, reason: "invalid_phone" as const };
    }

    const total = (row.cart_total_cents ?? 0) / 100;
    const totalFmt = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const name = row.lead_name?.split(" ")[0] ?? "";
    const recoverUrl = `https://usegolraiz.com.br/checkout?recover=${row.checkout_attempt_id ?? ""}&ch=wa`;
    const itensFmt = formatItensList(row.cart_items);

    const { data: cfgRows } = await supabaseAdmin.from("app_config").select("key, value");
    const cfgMap = new Map(cfgRows?.map((r) => [r.key, r.value]) ?? []);
    const template = cfgMap.get("cart_recovery_message") || DEFAULT_RECOVERY_TEMPLATE;
    const message = template
      .replace(/\{nome\}/g, name)
      .replace(/\{itens\}/g, itensFmt)
      .replace(/\{total\}/g, totalFmt)
      .replace(/\{link\}/g, recoverUrl);

    const url = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/send-text`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": cfg.zapi_client_token },
        body: JSON.stringify({ phone, message }),
      });
      const body = await res.text().catch(() => "");
      let json: any = {};
      try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
      if (!res.ok || !zapiMessageAcceptedResponse(json)) {
        console.error("Z-API resend failed", res.status, body);
        await supabaseAdmin
          .from("cart_recovery")
          .update({ status: "failed", processed_at: nowBR().toISOString(), sent_at: null })
          .eq("id", row.id);
        return { ok: false, reason: "api_error" as const, status: res.status, body };
      }
      await supabaseAdmin
        .from("cart_recovery")
        .update({
          status: "queued",
          processed_at: nowBR().toISOString(),
          sent_at: null,
          recovery_message: message,
          zapi_message_id: json.messageId ?? json.id ?? null,
          zapi_zaap_id: json.zaapId ?? null,
          zapi_delivery_payload: null,
        } as any)
        .eq("id", row.id);
      return { ok: true };
    } catch (err: any) {
      console.error("Z-API resend exception", err);
      return { ok: false, reason: "exception" as const, message: err?.message ?? "unknown" };
    }
  });

// ---------- ADMIN: send recovery for a checkout_attempt ----------
export const sendRecoveryForAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { checkoutAttemptId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: attempt, error: aErr } = await supabaseAdmin
      .from("checkout_attempts")
      .select("id, session_id, payer_name, payer_phone, payer_email, cart_items, cart_total_cents, converted_order_id, last_activity_at")
      .eq("id", data.checkoutAttemptId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!attempt) throw new Error("Tentativa não encontrada");
    if (attempt.converted_order_id) {
      return { ok: false, reason: "already_converted" as const };
    }

    const cfg = await getAppConfig();
    await ensureZapiDeliveryWebhook();
    if (new Date(attempt.last_activity_at).getTime() > Date.now() - cfg.zapi_recovery_delay_minutes * 60 * 1000) {
      return { ok: false, reason: "not_ready" as const };
    }
    if (!cfg.zapi_instance_id || !cfg.zapi_token) {
      return { ok: false, reason: "missing_credentials" as const };
    }

    const phone = normalizeWhatsappPhone(attempt.payer_phone);
    if (!phone || phone.length < 12) {
      return { ok: false, reason: "invalid_phone" as const };
    }

    const total = (attempt.cart_total_cents ?? 0) / 100;
    const totalFmt = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const name = (attempt.payer_name ?? "").split(" ")[0] ?? "";
    const recoverUrl = `https://usegolraiz.com.br/checkout?recover=${attempt.id}&ch=wa`;
    const itensFmt = formatItensList(attempt.cart_items);

    const { data: cfgRows } = await supabaseAdmin.from("app_config").select("key, value");
    const cfgMap = new Map(cfgRows?.map((r) => [r.key, r.value]) ?? []);
    const template = cfgMap.get("cart_recovery_message") || DEFAULT_RECOVERY_TEMPLATE;
    const message = template
      .replace(/\{nome\}/g, name)
      .replace(/\{itens\}/g, itensFmt)
      .replace(/\{total\}/g, totalFmt)
      .replace(/\{link\}/g, recoverUrl);

    // Encontra ou cria a linha cart_recovery deste attempt (select+insert manual, mais robusto que upsert com partial index)
    const { data: existing } = await supabaseAdmin
      .from("cart_recovery")
      .select("id")
      .eq("checkout_attempt_id", attempt.id)
      .maybeSingle();

    let recoveryId = existing?.id as string | undefined;

    if (!recoveryId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("cart_recovery")
        .insert({
          checkout_attempt_id: attempt.id,
          session_id: attempt.session_id,
          lead_name: attempt.payer_name ?? null,
          lead_phone: attempt.payer_phone ?? null,
          lead_email: attempt.payer_email ?? null,
          cart_items: attempt.cart_items ?? [],
          cart_total_cents: attempt.cart_total_cents ?? 0,
          recovery_link: recoverUrl,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("cart_recovery insert error", insErr);
        return { ok: false, reason: "db_error" as const, message: insErr.message };
      }
      recoveryId = inserted.id;
    }

    const url = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/send-text`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": cfg.zapi_client_token },
        body: JSON.stringify({ phone, message }),
      });
      const body = await res.text().catch(() => "");
      let json: any = {};
      try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
      if (!res.ok || !zapiMessageAcceptedResponse(json)) {
        console.error("Z-API send failed", res.status, body);
        await supabaseAdmin
          .from("cart_recovery")
          .update({ status: "failed", processed_at: nowBR().toISOString(), sent_at: null })
          .eq("id", recoveryId);
        return { ok: false, reason: "api_error" as const, status: res.status, body };
      }
      await supabaseAdmin
        .from("cart_recovery")
        .update({
          status: "queued",
          processed_at: nowBR().toISOString(),
          sent_at: null,
          recovery_message: message,
          zapi_message_id: json.messageId ?? json.id ?? null,
          zapi_zaap_id: json.zaapId ?? null,
          zapi_delivery_payload: null,
        } as any)
        .eq("id", recoveryId);
      return { ok: true };
    } catch (err: any) {
      console.error("Z-API send exception", err);
      return { ok: false, reason: "exception" as const, message: err?.message ?? "unknown" };
    }
  });

// ---------- ADMIN: list config ----------
export const listAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("key, value, description")
      .order("key");
    if (error) throw new Error(error.message);
    return { config: data ?? [] };
  });

// ---------- ADMIN: list cart recovery entries ----------
export const listCartRecovery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("cart_recovery")
      .select("id, checkout_attempt_id, session_id, lead_name, lead_phone, lead_email, cart_total_cents, status, sent_at, created_at, processed_at, checkout_attempts!inner(last_activity_at, converted_order_id)")
      .is("checkout_attempts.converted_order_id", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// ---------- ADMIN: paginated dispatches per channel ----------
import { z as _z } from "zod";

function resolveBrtWindowIso(input: {
  preset?: "today" | "yesterday" | "7d" | "15d" | "30d" | "custom";
  customStart?: string;
  customEnd?: string;
}): { startIso: string; endIso: string } {
  const preset = input.preset ?? "today";
  const brToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(nowBR());
  const todayStart = new Date(`${brToday}T03:00:00.000Z`);
  if (preset === "today") {
    return { startIso: todayStart.toISOString(), endIso: new Date(todayStart.getTime() + 86400000).toISOString() };
  }
  if (preset === "yesterday") {
    const y = new Date(todayStart.getTime() - 86400000);
    return { startIso: y.toISOString(), endIso: todayStart.toISOString() };
  }
  if (preset === "custom" && input.customStart && input.customEnd) {
    const s = new Date(`${input.customStart}T03:00:00.000Z`);
    const e = new Date(new Date(`${input.customEnd}T03:00:00.000Z`).getTime() + 86400000);
    return { startIso: s.toISOString(), endIso: e.toISOString() };
  }
  const days = preset === "7d" ? 7 : preset === "15d" ? 15 : preset === "30d" ? 30 : 1;
  const start = new Date(todayStart.getTime() - (days - 1) * 86400000);
  return { startIso: start.toISOString(), endIso: new Date(todayStart.getTime() + 86400000).toISOString() };
}

export const listMessageDispatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    _z.object({
      channel: _z.enum(["cart", "cart2", "cart3", "pix1", "pix2", "confirmation"]),
      kind: _z.enum(["whatsapp", "email"]).default("whatsapp"),
      page: _z.number().int().min(1).max(500).default(1),
      pageSize: _z.number().int().min(1).max(50).default(10),
      preset: _z.enum(["today", "yesterday", "7d", "15d", "30d", "custom"]).optional(),
      customStart: _z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      customEnd: _z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const today = resolveBrtWindowIso({ preset: data.preset, customStart: data.customStart, customEnd: data.customEnd });

    // ---------- EMAIL ----------
    if (data.kind === "email") {
      if (data.channel === "cart" || data.channel === "cart2" || data.channel === "cart3") {
        const procCol = data.channel === "cart" ? "email_processed_at" : data.channel === "cart2" ? "email2_processed_at" : "email3_processed_at";
        const statusCol = data.channel === "cart" ? "email_status" : data.channel === "cart2" ? "email2_status" : "email3_status";
        const msgIdCol = data.channel === "cart" ? "email_message_id" : data.channel === "cart2" ? "email2_message_id" : "email3_message_id";
        const { data: rows, error, count } = await supabaseAdmin
          .from("cart_recovery")
          .select(`id, lead_name, lead_email, lead_phone, cart_total_cents, created_at, ${procCol}, ${statusCol}, ${msgIdCol}, checkout_attempts!inner(converted_order_id)`, { count: "exact" })
          .not(statusCol, "is", null)
          .gte("created_at", today.startIso)
          .lt("created_at", today.endIso)
          .is("checkout_attempts.converted_order_id", null)
          .order("created_at", { ascending: false })
          .range(from, to);
        if (error) throw new Error(error.message);
        const msgIds = ((rows ?? []) as any[]).map((r: any) => r[msgIdCol]).filter(Boolean);
        const statusByMsg = new Map<string, string>();
        if (msgIds.length) {
          const { data: logs } = await (supabaseAdmin as any)
            .from("email_send_log")
            .select("message_id, status")
            .in("message_id", msgIds);
          for (const l of logs ?? []) {
            const cur = statusByMsg.get(l.message_id!);
            // Prioridade: sent > dlq > failed > pending
            if (l.status === "sent") statusByMsg.set(l.message_id!, "sent");
            else if (l.status === "dlq" && cur !== "sent") statusByMsg.set(l.message_id!, "dlq");
            else if (!cur) statusByMsg.set(l.message_id!, l.status);
          }
        }
        const normalize = (s?: string | null) => {
          if (!s) return "pending";
          if (s === "sent") return "sent";
          if (s === "dlq" || s === "invalid_email" || s === "suppressed" || s === "enqueue_error") return "failed";
          if (s === "failed" || s === "pending" || s === "queued") return "pending";
          return s;
        };
        const items = ((rows ?? []) as any[]).map((r: any) => {
          const logSt = r[msgIdCol] ? statusByMsg.get(r[msgIdCol]) : undefined;
          const raw = logSt || r[statusCol] || "pending";
          return {
            id: r.id,
            when: r.created_at ?? r[procCol],
            name: r.lead_name,
            phone: r.lead_phone,
            email: r.lead_email,
            amountCents: r.cart_total_cents,
            status: normalize(raw),
            messageId: r[msgIdCol],
            resendable: true,
            channel: data.channel,
            kind: "email",
          };
        });
        return { items, total: count ?? 0 };
      }
      // pix1/pix2/confirmation email from orders
      const procCol = data.channel === "pix1" ? "email_pix_reminder_sent_at" : data.channel === "pix2" ? "email_pix_reminder2_sent_at" : "email_confirmation_sent_at";
      const statusCol = data.channel === "pix1" ? "email_pix_reminder_status" : data.channel === "pix2" ? "email_pix_reminder2_status" : "email_confirmation_status";
      const msgIdCol = data.channel === "pix1" ? "email_pix_reminder_message_id" : data.channel === "pix2" ? "email_pix_reminder2_message_id" : "email_confirmation_message_id";
      const { data: rows, error, count } = await supabaseAdmin
        .from("orders")
        .select(`id, payer_name, payer_email, payer_phone, amount_cents, created_at, ${procCol}, ${statusCol}, ${msgIdCol}`, { count: "exact" })
        .not(statusCol, "is", null)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const msgIds = ((rows ?? []) as any[]).map((r: any) => r[msgIdCol]).filter(Boolean);
      const statusByMsg = new Map<string, string>();
      if (msgIds.length) {
        const { data: logs } = await (supabaseAdmin as any)
          .from("email_send_log")
          .select("message_id, status")
          .in("message_id", msgIds);
        for (const l of logs ?? []) {
          const cur = statusByMsg.get(l.message_id!);
          if (l.status === "sent") statusByMsg.set(l.message_id!, "sent");
          else if (l.status === "dlq" && cur !== "sent") statusByMsg.set(l.message_id!, "dlq");
          else if (!cur) statusByMsg.set(l.message_id!, l.status);
        }
      }
      const normalize = (s?: string | null) => {
        if (!s) return "pending";
        if (s === "sent") return "sent";
        if (s === "dlq" || s === "invalid_email" || s === "suppressed" || s === "enqueue_error") return "failed";
        if (s === "failed" || s === "pending" || s === "queued") return "pending";
        return s;
      };
      const items = ((rows ?? []) as any[]).map((r: any) => {
        const logSt = r[msgIdCol] ? statusByMsg.get(r[msgIdCol]) : undefined;
        const raw = logSt || r[statusCol] || "pending";
        return {
          id: r.id,
          when: r.created_at ?? r[procCol],
          name: r.payer_name,
          phone: r.payer_phone,
          email: r.payer_email,
          amountCents: r.amount_cents,
          status: normalize(raw),
          messageId: r[msgIdCol],
          resendable: true,
          channel: data.channel,
          kind: "email",
        };
      });
      return { items, total: count ?? 0 };
    }

    // ---------- WHATSAPP (original) ----------
    if (data.channel === "cart" || data.channel === "cart2" || data.channel === "cart3") {
      const tsCol = data.channel === "cart" ? "created_at" : data.channel === "cart2" ? "stage2_processed_at" : "stage3_processed_at";
      const statusCol = data.channel === "cart" ? "status" : data.channel === "cart2" ? "stage2_status" : "stage3_status";
      const sentCol = data.channel === "cart" ? "sent_at" : data.channel === "cart2" ? "stage2_sent_at" : "stage3_sent_at";

      let q = supabaseAdmin
        .from("cart_recovery")
        .select(`id, lead_name, lead_phone, lead_email, cart_total_cents, created_at, status, sent_at, stage2_status, stage2_sent_at, stage2_processed_at, stage3_status, stage3_sent_at, stage3_processed_at, checkout_attempts!inner(converted_order_id)`, { count: "exact" })
        .is("checkout_attempts.converted_order_id", null)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso);
      if (data.channel !== "cart") q = q.not(statusCol, "is", null);
      const { data: rows, error, count } = await q
        .order(tsCol, { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const items = ((rows ?? []) as any[]).map((r: any) => ({
        id: r.id,
        when: r[tsCol] ?? r.created_at,
        name: r.lead_name,
        phone: r.lead_phone,
        email: r.lead_email,
        amountCents: r.cart_total_cents,
        status: r[statusCol] ?? "pending",
        sentAt: r[sentCol],
        resendable: data.channel === "cart",
      }));
      return { items, total: count ?? 0 };
    }

    const tsField =
      data.channel === "pix1" ? "pix_reminder_sent_at" :
      data.channel === "pix2" ? "pix_reminder2_sent_at" :
      "confirmation_sent_at";
    const statusField =
      data.channel === "pix1" ? "pix_reminder_status" :
      data.channel === "pix2" ? "pix_reminder2_status" :
      "confirmation_status";

    const { data: rows, error, count } = await supabaseAdmin
      .from("orders")
      .select("id, payer_name, payer_phone, payer_email, amount_cents, created_at, pix_reminder_sent_at, pix_reminder2_sent_at, confirmation_sent_at, pix_reminder_status, pix_reminder2_status, confirmation_status", { count: "exact" })
      .not(tsField, "is", null)
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    const items = ((rows ?? []) as any[]).map((r: any) => ({
      id: r.id,
      when: r.created_at ?? r[tsField],
      name: r.payer_name,
      phone: r.payer_phone,
      email: r.payer_email,
      amountCents: r.amount_cents,
      status: r[statusField] ?? "queued",
      sentAt: r[tsField],
      resendable: false,
    }));
    return { items, total: count ?? 0 };
  });

// ---------- ADMIN: reenviar e-mail de um disparo (cart/pix/confirmation) ----------
export const resendDispatchEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    _z.object({
      rowId: _z.string().uuid(),
      channel: _z.enum(["cart", "cart2", "cart3", "pix1", "pix2", "confirmation"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { enqueueAppEmail, renderTemplate } = await import("@/lib/email-dispatch-admin");
    const { data: cfgRows } = await supabaseAdmin.from("app_config").select("key, value");
    const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value ?? ""]));
    const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    if (data.channel === "cart" || data.channel === "cart2" || data.channel === "cart3") {
      const { data: row } = await supabaseAdmin
        .from("cart_recovery")
        .select("id, checkout_attempt_id, lead_name, lead_email, cart_items, cart_total_cents")
        .eq("id", data.rowId)
        .maybeSingle();
      if (!row?.lead_email) throw new Error("Sem e-mail");
      const stage = data.channel === "cart" ? 1 : data.channel === "cart2" ? 2 : 3;
      const subject = cfg.get(stage === 1 ? "email_cart_recovery_subject" : `email_cart_recovery${stage}_subject`) || "Seu carrinho está te esperando";
      const tpl = cfg.get(stage === 1 ? "email_cart_recovery_message" : `email_cart_recovery${stage}_message`) || "Olá {nome}!";
      const coupon = stage === 2 ? (cfg.get("cart_recovery_coupon2") || "CARRINHO5").toUpperCase()
                   : stage === 3 ? (cfg.get("cart_recovery_coupon3") || "CARRINHO10").toUpperCase()
                   : "";
      const items: any[] = Array.isArray(row.cart_items) ? (row.cart_items as any[]) : [];
      const itens = items.map((it: any) => `• ${Number(it?.quantity ?? 1)}× ${String(it?.title ?? "Produto")}`).join("\n");
      const link = coupon
        ? `https://usegolraiz.com.br/checkout?recover=${row.checkout_attempt_id ?? ""}&ch=email&st=${stage}&coupon=${coupon}`
        : `https://usegolraiz.com.br/checkout?recover=${row.checkout_attempt_id ?? ""}&ch=email&st=${stage}`;
      const message = renderTemplate(tpl, {
        nome: row.lead_name?.split(" ")[0] ?? "",
        itens, total: fmtBRL(row.cart_total_cents ?? 0), link, cupom: coupon,
      });
      const r = await enqueueAppEmail({
        to: row.lead_email, subject, text: message,
        templateName: `email_cart_recovery${stage === 1 ? "" : stage}`,
        label: `cart_recovery_stage_${stage}_resend`,
        idempotencyKey: `cart-${stage}-${row.id}-${Date.now()}`,
      });
      if (!r.ok) throw new Error(r.reason);
      const statusCol = stage === 1 ? "email_status" : stage === 2 ? "email2_status" : "email3_status";
      const procCol = stage === 1 ? "email_processed_at" : stage === 2 ? "email2_processed_at" : "email3_processed_at";
      const msgIdCol = stage === 1 ? "email_message_id" : stage === 2 ? "email2_message_id" : "email3_message_id";
      await supabaseAdmin.from("cart_recovery").update({
        [statusCol]: "queued", [procCol]: nowBR().toISOString(), [msgIdCol]: r.messageId,
      } as any).eq("id", row.id);
      return { ok: true, messageId: r.messageId };
    }

    // orders: pix1/pix2/confirmation
    const { data: o } = await supabaseAdmin
      .from("orders")
      .select("id, external_ref, payer_name, payer_email, amount_cents, pix_code")
      .eq("id", data.rowId)
      .maybeSingle();
    if (!o?.payer_email) throw new Error("Sem e-mail");
    const map = {
      pix1: { sub: "email_pix_reminder_subject", msg: "email_pix_reminder_message", status: "email_pix_reminder_status", sent: "email_pix_reminder_sent_at", mid: "email_pix_reminder_message_id" },
      pix2: { sub: "email_pix_reminder2_subject", msg: "email_pix_reminder2_message", status: "email_pix_reminder2_status", sent: "email_pix_reminder2_sent_at", mid: "email_pix_reminder2_message_id" },
      confirmation: { sub: "email_order_confirmation_subject", msg: "email_order_confirmation_message", status: "email_confirmation_status", sent: "email_confirmation_sent_at", mid: "email_confirmation_message_id" },
    } as const;
    const k = map[data.channel as "pix1" | "pix2" | "confirmation"];
    const subject = cfg.get(k.sub) || "Atualização do seu pedido";
    const tpl = cfg.get(k.msg) || "Olá {nome}!";
    const coupon = (cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase();
    const link = data.channel === "confirmation"
      ? `https://usegolraiz.com.br/pedido/${o.external_ref ?? ""}?t=${(o as any).order_secret ?? ""}`
      : data.channel === "pix2"
      ? `https://usegolraiz.com.br/checkout?coupon=${coupon}`
      : `https://usegolraiz.com.br/checkout/pix?ref=${o.external_ref ?? ""}`;
    const message = renderTemplate(tpl, {
      nome: (o.payer_name ?? "").split(" ")[0] ?? "",
      total: fmtBRL(o.amount_cents ?? 0),
      pedido: o.external_ref ?? "",
      cupom: coupon, link, pix: o.pix_code ?? "",
    });
    const r = await enqueueAppEmail({
      to: o.payer_email, subject, text: message,
      templateName: k.msg, label: `${data.channel}_email_resend`,
      idempotencyKey: `${data.channel}-${o.id}-${Date.now()}`,
    });
    if (!r.ok) throw new Error(r.reason);
    await supabaseAdmin.from("orders").update({
      [k.status]: "pending", [k.sent]: null, [k.mid]: r.messageId,
    } as any).eq("id", o.id);
    return { ok: true, messageId: r.messageId };
  });

// ---------- ADMIN: preview da mensagem enviada (WhatsApp/Email) ----------
export const getDispatchPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    _z.object({
      rowId: _z.string().uuid(),
      channel: _z.enum(["cart", "cart2", "cart3", "pix1", "pix2", "confirmation"]),
      kind: _z.enum(["whatsapp", "email"]).default("whatsapp"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { renderTemplate } = await import("@/lib/email-dispatch-admin");
    const { data: cfgRows } = await supabaseAdmin.from("app_config").select("key, value");
    const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value ?? ""]));
    const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    if (data.kind === "whatsapp") {
      if (data.channel === "cart" || data.channel === "cart2" || data.channel === "cart3") {
        const msgCol = data.channel === "cart" ? "recovery_message" : data.channel === "cart2" ? "stage2_message" : "stage3_message";
        const { data: row } = await supabaseAdmin
          .from("cart_recovery")
          .select(`id, lead_phone, ${msgCol}`)
          .eq("id", data.rowId)
          .maybeSingle();
        const msg = (row as any)?.[msgCol] ?? null;
        return {
          subject: null as string | null,
          to: row?.lead_phone ?? null,
          message: msg || "(Mensagem não armazenada para este disparo.)",
        };
      }
      const msgCol = data.channel === "pix1" ? "pix_reminder_message" : data.channel === "pix2" ? "pix_reminder2_message" : "order_confirmation_message";
      const { data: o } = await supabaseAdmin
        .from("orders")
        .select("id, external_ref, payer_name, payer_phone, amount_cents, pix_code, order_secret")
        .eq("id", data.rowId)
        .maybeSingle();
      const tpl = cfg.get(msgCol) || "Olá {nome}!";
      const coupon = (cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase();
      const link = data.channel === "confirmation"
        ? `https://usegolraiz.com.br/pedido/${o?.external_ref ?? ""}?t=${(o as any)?.order_secret ?? ""}`
        : data.channel === "pix2"
        ? `https://usegolraiz.com.br/checkout?coupon=${coupon}`
        : `https://usegolraiz.com.br/checkout/pix?ref=${o?.external_ref ?? ""}`;
      const message = renderTemplate(tpl, {
        nome: (o?.payer_name ?? "").split(" ")[0] ?? "",
        total: fmtBRL(o?.amount_cents ?? 0),
        pedido: o?.external_ref ?? "",
        cupom: coupon, link, pix: o?.pix_code ?? "",
      });
      return { subject: null as string | null, to: o?.payer_phone ?? null, message };
    }

    // EMAIL
    if (data.channel === "cart" || data.channel === "cart2" || data.channel === "cart3") {
      const { data: row } = await supabaseAdmin
        .from("cart_recovery")
        .select("id, checkout_attempt_id, lead_name, lead_email, cart_items, cart_total_cents")
        .eq("id", data.rowId)
        .maybeSingle();
      const stage = data.channel === "cart" ? 1 : data.channel === "cart2" ? 2 : 3;
      const subject = cfg.get(stage === 1 ? "email_cart_recovery_subject" : `email_cart_recovery${stage}_subject`) || "Seu carrinho está te esperando";
      const tpl = cfg.get(stage === 1 ? "email_cart_recovery_message" : `email_cart_recovery${stage}_message`) || "Olá {nome}!";
      const coupon = stage === 2 ? (cfg.get("cart_recovery_coupon2") || "CARRINHO5").toUpperCase()
                   : stage === 3 ? (cfg.get("cart_recovery_coupon3") || "CARRINHO10").toUpperCase()
                   : "";
      const items: any[] = Array.isArray(row?.cart_items) ? (row!.cart_items as any[]) : [];
      const itens = items.map((it: any) => `• ${Number(it?.quantity ?? 1)}× ${String(it?.title ?? "Produto")}`).join("\n");
      const link = coupon
        ? `https://usegolraiz.com.br/checkout?recover=${row?.checkout_attempt_id ?? ""}&ch=email&st=${stage}&coupon=${coupon}`
        : `https://usegolraiz.com.br/checkout?recover=${row?.checkout_attempt_id ?? ""}&ch=email&st=${stage}`;
      const message = renderTemplate(tpl, {
        nome: row?.lead_name?.split(" ")[0] ?? "",
        itens, total: fmtBRL(row?.cart_total_cents ?? 0), link, cupom: coupon,
      });
      return { subject: subject as string | null, to: row?.lead_email ?? null, message };
    }

    const { data: o } = await supabaseAdmin
      .from("orders")
      .select("id, external_ref, payer_name, payer_email, amount_cents, pix_code")
      .eq("id", data.rowId)
      .maybeSingle();
    const m = {
      pix1: { sub: "email_pix_reminder_subject", msg: "email_pix_reminder_message" },
      pix2: { sub: "email_pix_reminder2_subject", msg: "email_pix_reminder2_message" },
      confirmation: { sub: "email_order_confirmation_subject", msg: "email_order_confirmation_message" },
    } as const;
    const k = m[data.channel as "pix1" | "pix2" | "confirmation"];
    const subject = cfg.get(k.sub) || "Atualização do seu pedido";
    const tpl = cfg.get(k.msg) || "Olá {nome}!";
    const coupon = (cfg.get("pix_reminder2_coupon") || "PIX10").toUpperCase();
    const link = data.channel === "confirmation"
      ? `https://usegolraiz.com.br/checkout/sucesso?ref=${o?.external_ref ?? ""}`
      : data.channel === "pix2"
      ? `https://usegolraiz.com.br/checkout?coupon=${coupon}`
      : `https://usegolraiz.com.br/checkout/pix?ref=${o?.external_ref ?? ""}`;
    const message = renderTemplate(tpl, {
      nome: (o?.payer_name ?? "").split(" ")[0] ?? "",
      total: fmtBRL(o?.amount_cents ?? 0),
      pedido: o?.external_ref ?? "",
      cupom: coupon, link, pix: o?.pix_code ?? "",
    });
    return { subject: subject as string | null, to: o?.payer_email ?? null, message };
  });






// ---------- ADMIN: status atual do WhatsApp na Z-API ----------
export const getZapiConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const cfg = await getAppConfig();
    if (!cfg.zapi_instance_id || !cfg.zapi_token) {
      return { connected: false as const, reason: "missing_credentials" as const };
    }
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/status`,
        { method: "GET", headers: { "Client-Token": cfg.zapi_client_token } }
      );
      if (!res.ok) return { connected: false as const, reason: "api_error" as const, status: res.status };
      const json: any = await res.json().catch(() => ({}));
      return {
        connected: json?.connected === true,
        smartphoneConnected: json?.smartphoneConnected ?? null,
        raw: json,
      };
    } catch (err: any) {
      return { connected: false as const, reason: "exception" as const, message: err?.message ?? "unknown" };
    }
  });
