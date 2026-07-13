import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfDayBR, nowBR } from "./datetime";

async function fetchMonetrixStatus(id: string): Promise<"PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "UNKNOWN"> {
  const apiKey = process.env.MONETRIX_API_KEY;
  if (!apiKey) return "UNKNOWN";
  try {
    const res = await fetch(`https://api.monetrixpay.online/v1/payment/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return "UNKNOWN";
    const j: any = await res.json().catch(() => null);
    const raw = String(j?.status ?? j?.data?.status ?? "").toUpperCase();
    if (["PAID", "APPROVED", "COMPLETED", "CONFIRMED"].includes(raw)) return "PAID";
    if (["PENDING", "WAITING", "PROCESSING", "CREATED"].includes(raw)) return "PENDING";
    if (["EXPIRED", "TIMEOUT"].includes(raw)) return "PENDING";
    if (["CANCELLED", "CANCELED", "REFUSED", "FAILED"].includes(raw)) return "CANCELLED";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

async function fetchMonetrixPixCode(id: string): Promise<string | null> {
  const apiKey = process.env.MONETRIX_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.monetrixpay.online/v1/payment/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const body: any = await res.json().catch(() => null);
    const d = body?.data ?? {};
    return (
      d.copypaste || d.copyPaste || d.qrcode || d.qrCode ||
      body?.qrcode || body?.pix?.qrcode || body?.pix?.copypaste || null
    );
  } catch {
    return null;
  }
}

async function fetchPixCodeByGateway(_gateway: string, paymentId: string): Promise<string | null> {
  return fetchMonetrixPixCode(paymentId);
}


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

function extractComprovantePath(value?: string | null) {
  if (!value) return null;
  if (!value.startsWith("http")) return value.replace(/^\/+/, "");
  try {
    const { pathname } = new URL(value);
    const markers = ["/storage/v1/object/public/comprovantes/", "/storage/v1/object/sign/comprovantes/"];
    for (const marker of markers) {
      const index = pathname.indexOf(marker);
      if (index >= 0) return decodeURIComponent(pathname.slice(index + marker.length));
    }
  } catch {
    return null;
  }
  return null;
}

async function addSignedComprovanteUrl<T extends { comprovante_url?: string | null }>(order: T) {
  const path = extractComprovantePath(order.comprovante_url);
  if (!path) return order;
  const { data, error } = await supabaseAdmin.storage.from("comprovantes").createSignedUrl(path, 60 * 60);
  return { ...order, comprovante_url: error ? null : (data?.signedUrl ?? null) };
}

const CreateOrderSchema = z.object({
  externalRef: z.string().min(1).max(80),
  paymentId: z.string().min(1).max(120).optional(),
  pixCode: z.string().min(1).max(2000).optional(),
  amountCents: z.number().int().nonnegative(),
  gateway: z.enum(["monetrix"]).default("monetrix"),
  sessionId: z.string().min(8).max(80).optional(),
  payer: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(160),
    taxId: z.string().min(11).max(20),
    phone: z.string().min(10).max(20),
  }),
  items: z.array(z.any()).max(100),
  delivery: z.any(),
  ttclid: z.string().optional(),
  ttp: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => CreateOrderSchema.parse(d))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true });
    const userAgent = getRequestHeader("user-agent");


    // Fallback servidor: se o front não enviou o pix_code mas temos paymentId,
    // re-consulta o gateway para garantir que o copia-e-cola seja salvo.
    let pixCode = data.pixCode ?? null;
    if (!pixCode && data.paymentId) {
      try {
        pixCode = await fetchPixCodeByGateway(data.gateway, data.paymentId);
      } catch (e) {
        console.error("fetchPixCodeByGateway error", e);
      }
    }

    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({
        external_ref: data.externalRef,
        payment_id: data.paymentId ?? null,
        pix_code: pixCode,
        status: "PENDING",
        amount_cents: data.amountCents,
        gateway: data.gateway,
        payer_name: data.payer.name,
        payer_email: data.payer.email,
        payer_taxid: data.payer.taxId,
        payer_phone: data.payer.phone,
        items: data.items,
        delivery: data.delivery,
        ttclid: data.ttclid ?? null,
        ttp: data.ttp ?? null,
        user_agent: data.userAgent ?? userAgent ?? null,
        ip_address: data.ipAddress ?? ip ?? null,
      })
      .select("id, order_secret")
      .single();

    if (error) {
      console.error("createOrder error", error);
      throw new Error(`Falha ao salvar pedido: ${error.message}`);
    }

    // Registra evento do funil + marca tentativa de checkout como convertida
    if (data.sessionId) {
      try {
        await supabaseAdmin.from("funnel_events").insert({
          session_id: data.sessionId,
          event_type: "pix_generated",
          order_ref: data.externalRef,
        });
        await supabaseAdmin.from("funnel_events").insert({
          session_id: data.sessionId,
          event_type: "add_payment_info",
          order_ref: data.externalRef,
          metadata: { source: "pix_generated" },
        });
        await supabaseAdmin
          .from("checkout_attempts")
          .update({ converted_order_id: row.id })
          .eq("session_id", data.sessionId);

        // Marca recuperação como CONVERTED somente se:
        //  1) a mensagem foi de fato entregue no WhatsApp (status='sent'), E
        //  2) o lead clicou no link de recuperação (recovery_link_clicked_at IS NOT NULL).
        // Caso contrário, encerra a recuperação sem contar como conversão atribuída.
        const { data: attempt } = await supabaseAdmin
          .from("checkout_attempts")
          .select("id")
          .eq("session_id", data.sessionId)
          .maybeSingle();
        if (attempt?.id) {
          const { data: recRow } = await supabaseAdmin
            .from("cart_recovery")
            .select("id, status, recovery_link_clicked_at")
            .eq("checkout_attempt_id", attempt.id)
            .maybeSingle();
          if (recRow) {
            const attributable = recRow.status === "sent" && !!(recRow as any).recovery_link_clicked_at;
            await supabaseAdmin
              .from("cart_recovery")
              .update({
                status: attributable ? "converted" : "skipped",
                processed_at: new Date().toISOString(),
              })
              .eq("id", recRow.id);
          }
        }

      } catch (e) {
        console.error("funnel/abandon link error", e);
      }
    }

    return { id: row.id, orderSecret: row.order_secret };
  });

const UploadSchema = z.object({
  orderId: z.string().uuid(),
  orderSecret: z.string().uuid(),
  filename: z.string().min(1).max(160),
  contentType: z.string().min(1).max(120),
  base64: z.string().min(1).max(8_000_000), // ~6MB encoded
});

async function assertOrderSecret(orderId: string, orderSecret: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("order_secret", orderSecret)
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar pedido");
  if (!data) throw new Error("Pedido inválido ou token expirado");
}

export const uploadComprovante = createServerFn({ method: "POST" })
  .validator((d: unknown) => UploadSchema.parse(d))
  .handler(async ({ data }) => {
    await assertOrderSecret(data.orderId, data.orderSecret);

    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error("Arquivo maior que 5MB");
    }
    const safeName = data.filename.replace(/[^\w.\-]+/g, "_");
    const path = `${data.orderId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("comprovantes")
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (upErr) {
      console.error("upload comprovante error", upErr);
      throw new Error(`Falha no upload: ${upErr.message}`);
    }

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ comprovante_url: path })
      .eq("id", data.orderId);
    if (updErr) {
      console.error("orders update comprovante error", updErr);
    }
    return { url: path };
  });

export const markPixCopied = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), orderSecret: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await assertOrderSecret(data.orderId, data.orderSecret);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ pix_copied_at: nowBR().toISOString() })
      .eq("id", data.orderId)
      .is("pix_copied_at", null);
    if (error) console.error("markPixCopied error", error);
    return { ok: true };
  });

export const reconcileOrderPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), orderSecret: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,order_secret,payment_id,status,gateway,external_ref,payer_email,payer_phone,amount_cents,items,ttclid,ttp,user_agent,ip_address")
      .eq("id", data.orderId)
      .eq("order_secret", data.orderSecret)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido inválido ou token expirado");
    if (order.status === "PAID") return { status: "PAID" as const, changed: false };
    if (!order.payment_id) return { status: "UNKNOWN" as const, changed: false };

    const status = await fetchMonetrixStatus(order.payment_id);
    if (status !== "PAID") return { status, changed: false };

    const { data: changed, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "PAID", paid_at: nowBR().toISOString() })
      .eq("id", order.id)
      .neq("status", "PAID")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error("Falha ao atualizar pagamento");
    if (!changed) return { status: "PAID" as const, changed: false };

    // 🔕 TikTok CompletePayment foi movido para o momento da geração do PIX
    // (em createPixPayment). Não dispara mais aqui na transição para PAID.

    const { data: pixEvent } = await supabaseAdmin
      .from("funnel_events")
      .select("session_id")
      .eq("event_type", "pix_generated")
      .eq("order_ref", order.external_ref)
      .maybeSingle();
    if (pixEvent?.session_id) {
      await supabaseAdmin.from("funnel_events").insert({
        session_id: pixEvent.session_id,
        event_type: "paid",
        order_ref: order.external_ref,
      });
    }
    return { status: "PAID" as const, changed: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("listOrders error", error);
      throw new Error("Falha ao listar pedidos");
    }
    const orders = await Promise.all((data ?? []).map((order) => addSignedComprovanteUrl(order)));
    return { orders };
  });

/**
 * Bootstrap: se ainda não existir nenhum admin, promove o usuário autenticado
 * a admin. Após o primeiro admin existir, retorna erro de acesso negado.
 */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (cErr) throw new Error("Falha ao verificar admins");
    if ((count ?? 0) > 0) throw new Error("Já existe um administrador");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(`Falha ao criar admin: ${error.message}`);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.log("EXEC checkIsAdmin handler with context:", context.userId);
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    console.log("checkIsAdmin result:", data);
    return { isAdmin: !!data };
  });


export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const now = nowBR();
    const startDayDate = startOfDayBR(now);
    const startDay = startDayDate.toISOString();
    const startWeek = new Date(startDayDate.getTime() - 7 * 86400000).toISOString();

    const [{ data: weekData }, { data: allData }] = await Promise.all([
      supabaseAdmin.from("orders").select("amount_cents,status,created_at").gte("created_at", startWeek),
      supabaseAdmin.from("orders").select("amount_cents,status"),
    ]);

    const week = weekData ?? [];
    const all = allData ?? [];
    const paidToday = week.filter((o) => o.status === "PAID" && o.created_at >= startDay);
    const paidWeek = week.filter((o) => o.status === "PAID");
    const paidAll = all.filter((o) => o.status === "PAID");

    const salesToday = paidToday.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const salesWeek = paidWeek.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const totalOrders = all.length;
    const pending = all.filter((o) => o.status === "PENDING").length;
    const paidCount = paidAll.length;
    const conversionRate = totalOrders > 0 ? (paidCount / totalOrders) * 100 : 0;
    const avgTicket = paidCount > 0 ? paidAll.reduce((s, o) => s + (o.amount_cents ?? 0), 0) / paidCount : 0;

    const trendMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startDayDate.getTime() - i * 86400000);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of paidWeek) {
      const k = o.created_at.slice(0, 10);
      if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + (o.amount_cents ?? 0));
    }
    const trend = Array.from(trendMap.entries()).map(([day, cents]) => ({ day, cents }));

    return { kpis: { salesToday, salesWeek, pending, totalOrders, paidOrders: paidCount, conversionRate, avgTicket }, trend };
  });

export const syncPendingOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: pending } = await supabaseAdmin
      .from("orders")
      .select("id,payment_id,status,gateway,external_ref,payer_email,payer_phone,amount_cents,items,ttclid,ttp,user_agent,ip_address")
      .eq("status", "PENDING")
      .not("payment_id", "is", null)
      .gte("created_at", cutoff)
      .limit(50);

    let checked = 0;
    let updated = 0;
    for (const o of pending ?? []) {
      if (!o.payment_id) continue;
      checked++;
      const s = await fetchMonetrixStatus(o.payment_id);
      if (s === "UNKNOWN" || s === o.status) continue;
      const patch: { status: string; paid_at?: string } = { status: s };
      if (s === "PAID") patch.paid_at = nowBR().toISOString(); // TZ fixed manually if needed, but current code uses ISO
      const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", o.id);
      if (!error) {
        updated++;
        if (s === "PAID") {
          // 🔕 TikTok CompletePayment foi movido para a geração do PIX (createPixPayment).
          // Registra evento "paid" no funil (linkado via order_ref)
          try {
            const { data: pixEvt } = await supabaseAdmin
              .from("funnel_events")
              .select("session_id")
              .eq("event_type", "pix_generated")
              .eq("order_ref", o.external_ref ?? "")
              .maybeSingle();
            if (pixEvt?.session_id) {
              const { data: already } = await supabaseAdmin
                .from("funnel_events")
                .select("id")
                .eq("event_type", "paid")
                .eq("order_ref", o.external_ref ?? "")
                .maybeSingle();
              if (!already) {
                await supabaseAdmin.from("funnel_events").insert({
                  session_id: pixEvt.session_id,
                  event_type: "paid",
                  order_ref: o.external_ref ?? null,
                });
              }
            }
          } catch (e) {
            console.error("funnel paid event error", e);
          }
        }
      }
    }
    return { checked, updated, total: pending?.length ?? 0 };
  });

export const getOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: order, error } = await supabaseAdmin.from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    return { order: await addSignedComprovanteUrl(order) };
  });

export const backfillPixCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select("id,payment_id,gateway,pix_code,status")
      .in("status", ["PENDING", "EXPIRED"])
      .is("pix_code", null)
      .not("payment_id", "is", null)
      .gte("created_at", cutoff)
      .limit(100);
    if (error) throw new Error(error.message);

    let checked = 0;
    let filled = 0;
    for (const o of rows ?? []) {
      if (!o.payment_id) continue;
      checked++;
      const code = await fetchPixCodeByGateway(o.gateway ?? "monetrix", o.payment_id);
      if (!code) continue;
      const { error: updErr } = await supabaseAdmin
        .from("orders")
        .update({ pix_code: code })
        .eq("id", o.id);
      if (!updErr) filled++;
    }
    return { checked, filled, total: rows?.length ?? 0 };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ 
    orderId: z.string().uuid(), 
    status: z.string(),
    trackingCode: z.string().optional(),
    trackingUrl: z.string().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: any = { status: data.status };
    
    if (data.status === "SHIPPED") {
      patch.shipped_at = nowBR().toISOString();
      if (data.trackingCode) patch.tracking_code = data.trackingCode;
      if (data.trackingUrl) patch.tracking_url = data.trackingUrl;
    } else if (data.status === "DELIVERED") {
      patch.delivered_at = nowBR().toISOString();
    }
    
    const { error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", data.orderId);
      
    if (error) throw new Error(`Falha ao atualizar status: ${error.message}`);
    return { ok: true };
  });
