import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getClientIp(): string | null {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return String(ip).split(",")[0].trim();
  } catch {}
  try {
    const xf = getRequestHeader("x-forwarded-for");
    if (xf) return xf.split(",")[0].trim();
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf.trim();
  } catch {}
  return null;
}

import { isIpBlockedCached } from "./ip-blocklist.functions";

async function isIpBlocked(ip: string | null): Promise<boolean> {
  const { blocked } = await isIpBlockedCached(ip);
  return blocked;
}



// ---------- helpers ----------

// Início do dia em America/Sao_Paulo (UTC-3, sem horário de verão).
// Servidor roda em UTC; se usarmos new Date(y,m,d) o "hoje" vira às 21h SP.
function startOfDayBR(d: Date = new Date()): Date {
  const sp = new Date(d.getTime() - 3 * 3600_000); // desloca para "relógio" SP
  const y = sp.getUTCFullYear();
  const m = sp.getUTCMonth();
  const day = sp.getUTCDate();
  // 00:00 SP == 03:00 UTC
  return new Date(Date.UTC(y, m, day, 3, 0, 0, 0));
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

// Filtro simples de bots por User-Agent
function isLikelyBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  // Sem assinatura de browser real → bot/cliente HTTP
  if (!/mozilla\/|opera|safari\//.test(s)) return true;
  return /bot\b|crawl|spider|slurp|fetch|curl|wget|python|requests|axios|node-fetch|okhttp|java\/|go-http|headlesschrome|headless|phantom|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|monitor|uptimerobot|preview|prerender|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|googlebot|bingbot|yandex|duckduckbot|baidu|sogou|petalbot|bytespider|bytedancespider|bytedance|tiktokspider|tiktokbot|tiktok-ads|tt-?spider|ttbot|applebot|ahrefs|semrush|mj12bot|dotbot|seekport|chatgpt|gptbot|claudebot|oai-searchbot|perplexity|meta-externalagent|amazonbot|cloudflare|datadog|newrelic|statuspage|hetrix|rogerbot|exabot|qwant|coccocbot/.test(
    s,
  );
}


// Sessões originadas do editor / preview do Lovable não devem contar
function isLovableEditor(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    // editor do Lovable + qualquer subdomínio de preview lovable.app/lovable.dev
    return /(^|\.)lovable\.(app|dev)$/i.test(host);
  } catch {
    return false;
  }
}

// ---------- TRACKING (public, called from browser) ----------
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

export const trackHeartbeat = createServerFn({ method: "POST" })
  .validator((d: unknown) => HeartbeatSchema.parse(d))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    if (await isIpBlocked(ip)) return { ok: false, blocked: true as const };

    if (isLikelyBot(data.userAgent)) return { ok: true, skipped: "bot" };
    if ((data.path ?? "").startsWith("/painel-gr")) return { ok: true, skipped: "admin" };
    if (isLovableEditor(data.referrer)) return { ok: true, skipped: "editor" };

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const IDLE_MS = 30 * 60 * 1000;
    const clientStartedMs = data.sessionStartedAt ? Date.parse(data.sessionStartedAt) : NaN;
    const hasValidClientStartedAt =
      Number.isFinite(clientStartedMs) &&
      clientStartedMs <= nowMs + 2 * 60 * 1000 &&
      clientStartedMs >= nowMs - 12 * 60 * 60 * 1000;
    const sessionStartedAtIso = hasValidClientStartedAt ? new Date(clientStartedMs).toISOString() : nowIso;

    // Verifica se já existe sessão e quanto tempo desde a última atividade.
    // Se >30min de inatividade, é uma sessão nova — reseta created_at para
    // que "Na sessão" reflita o início da sessão atual (não a primeira visita).
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
    return { ok: true };
  });


const EventSchema = z.object({
  sessionId: z.string().min(8).max(80),
  type: z.enum(["visit", "view_product", "view_checkout", "pix_generated", "paid"]),
  productHandle: z.string().max(120).optional(),
  orderRef: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

export const trackEvent = createServerFn({ method: "POST" })
  .validator((d: unknown) => EventSchema.parse(d))
  .handler(async ({ data }) => {
    if (isLikelyBot(data.userAgent)) return { ok: true, skipped: "bot" };
    if (isLovableEditor(data.referrer)) return { ok: true, skipped: "editor" };

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
      if ((count ?? 0) > 0) return { ok: true, deduped: true };
    }

    await supabaseAdmin.from("funnel_events").insert({
      session_id: data.sessionId,
      event_type: data.type,
      product_handle: data.productHandle ?? null,
      order_ref: data.orderRef ?? null,
    });
    return { ok: true };
  });

const CheckoutAttemptSchema = z.object({
  sessionId: z.string().min(8).max(80),
  payerName: z.string().max(160).optional(),
  payerEmail: z.string().max(160).optional(),
  payerCpf: z.string().max(20).optional(),
  payerPhone: z.string().max(30).optional(),
  cartItems: z.array(z.any()).max(50).optional(),
  cartTotalCents: z.number().int().nonnegative().optional(),
  lastStep: z.number().int().min(1).max(3).optional(),
  userAgent: z.string().max(500).optional(),
});

export const upsertCheckoutAttempt = createServerFn({ method: "POST" })
  .validator((d: unknown) => CheckoutAttemptSchema.parse(d))
  .handler(async ({ data }) => {
    if (isLikelyBot(data.userAgent)) return { ok: true, skipped: "bot" };
    // Requer pelo menos UM campo de identificação preenchido
    const hasAny =
      (data.payerName && data.payerName.trim().length > 0) ||
      (data.payerEmail && data.payerEmail.trim().length > 0) ||
      (data.payerCpf && data.payerCpf.trim().length > 0) ||
      (data.payerPhone && data.payerPhone.trim().length > 0);
    if (!hasAny) return { ok: true, skipped: "empty" };

    const { data: upserted } = await supabaseAdmin
      .from("checkout_attempts")
      .upsert(
        {
          session_id: data.sessionId,
          payer_name: data.payerName ?? null,
          payer_email: data.payerEmail ?? null,
          payer_cpf: data.payerCpf ?? null,
          payer_phone: data.payerPhone ?? null,
          cart_items: data.cartItems ?? [],
          cart_total_cents: data.cartTotalCents ?? 0,
          last_step: data.lastStep ?? 1,
          last_activity_at: new Date().toISOString(),
        },
        { onConflict: "session_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    // Cria/atualiza entrada de recuperação de carrinho se tiver telefone
    if (upserted?.id && data.payerPhone && data.payerPhone.trim().length >= 10) {
      try {
        const { data: existingRec } = await supabaseAdmin
          .from("cart_recovery")
          .select("id, status")
          .eq("checkout_attempt_id", upserted.id)
          .maybeSingle();

        const payload = {
          checkout_attempt_id: upserted.id,
          session_id: data.sessionId,
          lead_name: data.payerName ?? null,
          lead_phone: data.payerPhone.trim(),
          lead_email: data.payerEmail ?? null,
          cart_items: data.cartItems ?? [],
          cart_total_cents: data.cartTotalCents ?? 0,
          recovery_link: `https://usegolraiz.com.br/checkout?recover=${upserted.id}`,
        };

        if (!existingRec) {
          await supabaseAdmin.from("cart_recovery").insert({ ...payload, status: "pending" });
        } else if (existingRec.status === "pending") {
          // Só atualiza dados se ainda não foi enviado
          await supabaseAdmin
            .from("cart_recovery")
            .update(payload)
            .eq("id", existingRec.id);
        }
      } catch (e) {
        console.error("cart_recovery upsert error", e);
      }
    }

    return { ok: true };
  });

// ---------- RECOVER CART (público, acessado via link de recuperação) ----------
const RecoverSchema = z.object({
  id: z.string().uuid(),
  ch: z.enum(["email", "wa"]).optional(),
  st: z.coerce.number().int().min(1).max(3).optional(),
});

export const getCheckoutAttempt = createServerFn({ method: "POST" })
  .validator((d: unknown) => RecoverSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("checkout_attempts")
      .select("id, payer_name, payer_email, payer_cpf, payer_phone, cart_items, cart_total_cents, converted_order_id, last_step")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false as const };

    // Registra o clique no link de recuperação (atribuição da conversão)
    try {
      const now = new Date().toISOString();
      const patch: Record<string, string> = { recovery_link_clicked_at: now };
      if (data.ch === "email" && data.st) {
        const col = data.st === 1 ? "email1_clicked_at" : data.st === 2 ? "email2_clicked_at" : "email3_clicked_at";
        patch[col] = now;
      } else if (data.ch === "wa") {
        patch.whatsapp_clicked_at = now;
      }
      await supabaseAdmin
        .from("cart_recovery")
        .update(patch as any)
        .eq("checkout_attempt_id", row.id);
    } catch (e) {
      console.error("recovery_link_clicked_at stamp error", e);
    }

    return {
      found: true as const,
      converted: !!row.converted_order_id,
      payerName: row.payer_name ?? "",
      payerEmail: row.payer_email ?? "",
      payerCpf: row.payer_cpf ?? "",
      payerPhone: row.payer_phone ?? "",
      cartItems: Array.isArray(row.cart_items) ? (row.cart_items as any[]) : [],
      cartTotalCents: row.cart_total_cents ?? 0,
      lastStep: (row.last_step ?? 1) as 1 | 2 | 3,
    };
  });



// ---------- ADMIN ANALYTICS ----------
function parseDevice(ua: string | null | undefined): { device: "mobile" | "tablet" | "desktop"; browser: string; os: string } {
  const s = (ua ?? "").toLowerCase();
  let device: "mobile" | "tablet" | "desktop" = "desktop";
  if (/ipad|tablet/.test(s)) device = "tablet";
  else if (/mobi|android|iphone|ipod/.test(s)) device = "mobile";
  let browser = "Outro";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/chrome\//.test(s) && !/edg\//.test(s)) browser = "Chrome";
  else if (/firefox\//.test(s)) browser = "Firefox";
  else if (/safari\//.test(s) && !/chrome\//.test(s)) browser = "Safari";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  let os = "Outro";
  if (/windows/.test(s)) os = "Windows";
  else if (/android/.test(s)) os = "Android";
  else if (/iphone|ipad|ipod|ios/.test(s)) os = "iOS";
  else if (/mac os|macintosh/.test(s)) os = "macOS";
  else if (/linux/.test(s)) os = "Linux";
  return { device, browser, os };
}

export const getLiveStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const now = new Date();
    const liveSince = new Date(now.getTime() - 60 * 1000).toISOString();
    const todayStart = startOfDayBR(now);
    const todayStartIso = todayStart.toISOString();
    // Ontem até o mesmo horário (para comparação)
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const yesterdaySameTime = new Date(now.getTime() - 86400000);
    const yesterdayStartIso = yesterdayStart.toISOString();
    const yesterdaySameTimeIso = yesterdaySameTime.toISOString();

    const [liveRes, todaySessionsRes, todayEventsRes, todayOrdersRes, recentEventsRes, recentPaidRes, yesterdayOrdersRes, yesterdaySessionsRes] = await Promise.all([
      supabaseAdmin
        .from("site_sessions")
        .select("session_id, current_path, in_checkout, last_seen_at, created_at, utm_source, referrer, user_agent")
        .eq("interacted", true)
        .gte("last_seen_at", liveSince)
        .order("last_seen_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("site_sessions")
        .select("session_id, created_at, last_seen_at")
        .eq("interacted", true)
        .gte("last_seen_at", todayStartIso)
        .limit(5000),
      supabaseAdmin
        .from("funnel_events")
        .select("session_id, event_type, created_at, product_handle")
        .gte("created_at", todayStartIso)
        .limit(20000),
      supabaseAdmin
        .from("orders")
        .select("amount_cents, status, created_at, paid_at")
        .gte("created_at", todayStartIso),
      supabaseAdmin
        .from("funnel_events")
        .select("session_id, event_type, created_at, product_handle, order_ref")
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("orders")
        .select("id, external_ref, amount_cents, payer_name, paid_at, items")
        .eq("status", "PAID")
        .gte("paid_at", todayStartIso)
        .order("paid_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("orders")
        .select("amount_cents, status, paid_at, created_at")
        .gte("created_at", yesterdayStartIso)
        .lt("created_at", yesterdaySameTimeIso),
      supabaseAdmin
        .from("site_sessions")
        .select("session_id, created_at")
        .eq("interacted", true)
        .gte("created_at", yesterdayStartIso)
        .lt("created_at", yesterdaySameTimeIso)
        .limit(5000),
    ]);

    if (liveRes.error) throw new Error(liveRes.error.message);

    // Defesa em profundidade: exclui painel admin e sessões originadas do editor Lovable
    const rawLiveList = liveRes.data ?? [];
    const liveList = rawLiveList.filter((s) => {
      if ((s.current_path ?? "").startsWith("/painel-gr")) return false;
      if (isLovableEditor(s.referrer)) return false;
      if (isLikelyBot(s.user_agent)) return false;
      // Bots de verificação (ex.: TikTok Ads) batem 1 vez e somem — sessão curta demais
      const durMs = new Date(s.last_seen_at).getTime() - new Date(s.created_at).getTime();
      if (durMs < 2000) return false;
      // Heurística anti-bot: Desktop + Linux é praticamente inexistente entre
      // compradores reais no Brasil. Bots de verificação de anúncio
      // (TikTok/Meta/AdSpy/Minea, previews de link em WhatsApp Web etc.) rodam
      // em VPS Linux com Chrome headless e se apresentam exatamente assim.
      const { device, os } = parseDevice(s.user_agent);
      if (device === "desktop" && os === "Linux") return false;
      return true;
    });


    const onSite = liveList.length;
    const inCheckout = liveList.filter((s) => s.in_checkout).length;
    const onProduct = liveList.filter((s) => (s.current_path ?? "").startsWith("/product/")).length;

    // Lookup carrinhos atuais para sessões em checkout (mostrar valor + itens)
    const checkoutSessionIds = liveList.filter((s) => s.in_checkout).map((s) => s.session_id);
    const cartBySession = new Map<string, { totalCents: number; items: number }>();
    if (checkoutSessionIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from("checkout_attempts")
        .select("session_id, cart_total_cents, cart_items, last_activity_at")
        .in("session_id", checkoutSessionIds)
        .order("last_activity_at", { ascending: false });
      for (const a of attempts ?? []) {
        if (cartBySession.has(a.session_id)) continue;
        const items = Array.isArray(a.cart_items) ? a.cart_items : [];
        const qty = items.reduce((s: number, it: any) => s + (Number(it?.quantity) || 0), 0);
        cartBySession.set(a.session_id, { totalCents: a.cart_total_cents ?? 0, items: qty });
      }
    }

    // Top páginas e fontes ATIVAS agora
    const pathCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const deviceCounts = { mobile: 0, tablet: 0, desktop: 0 };
    for (const s of liveList) {
      const p = s.current_path ?? "/";
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
      const src = s.utm_source ?? (s.referrer ? (() => { try { return new URL(s.referrer!).hostname; } catch { return "direto"; } })() : "direto");
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
      const { device } = parseDevice(s.user_agent);
      deviceCounts[device]++;
    }
    const topActivePaths = [...pathCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count }));
    const topActiveSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([source, count]) => ({ source, count }));

    const todaySessions = todaySessionsRes.data ?? [];
    const visitsToday = todaySessions.length;
    const uniqueVisitorsToday = new Set(todaySessions.map((s) => s.session_id)).size;

    let totalDurSec = 0;
    let durCount = 0;
    for (const s of todaySessions) {
      const d = Math.max(0, (new Date(s.last_seen_at).getTime() - new Date(s.created_at).getTime()) / 1000);
      if (d > 0) { totalDurSec += d; durCount++; }
    }
    const avgSessionSeconds = durCount > 0 ? totalDurSec / durCount : 0;

    const events = todayEventsRes.data ?? [];
    const pageEventsBySession = new Map<string, number>();
    for (const e of events) {
      if (e.event_type === "visit" || e.event_type === "view_product" || e.event_type === "view_checkout") {
        pageEventsBySession.set(e.session_id, (pageEventsBySession.get(e.session_id) ?? 0) + 1);
      }
    }
    let totalPerPage = 0;
    let perPageCount = 0;
    for (const s of todaySessions) {
      const dur = Math.max(0, (new Date(s.last_seen_at).getTime() - new Date(s.created_at).getTime()) / 1000);
      const pages = Math.max(1, pageEventsBySession.get(s.session_id) ?? 1);
      if (dur > 0) { totalPerPage += dur / pages; perPageCount++; }
    }
    const avgTimePerPageSeconds = perPageCount > 0 ? totalPerPage / perPageCount : 0;

    const hourMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourMap.set(h, 0);
    for (const e of events) {
      if (e.event_type !== "visit") continue;
      const h = new Date(new Date(e.created_at).getTime() - 3 * 3600_000).getUTCHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
    }
    const visitsPerHour: { hour: string; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      visitsPerHour.push({ hour: String(h).padStart(2, "0") + ":00", count: hourMap.get(h) ?? 0 });
    }
    const peakHours = [...visitsPerHour].sort((a, b) => b.count - a.count).slice(0, 6);

    // Receita por hora (hoje)
    const revenueByHour = new Map<number, number>();
    for (let h = 0; h < 24; h++) revenueByHour.set(h, 0);
    const ordersToday = todayOrdersRes.data ?? [];
    const paidToday = ordersToday.filter((o) => o.status === "PAID");
    for (const o of paidToday) {
      const ts = o.paid_at ?? o.created_at;
      if (!ts) continue;
      const h = new Date(new Date(ts).getTime() - 3 * 3600_000).getUTCHours();
      revenueByHour.set(h, (revenueByHour.get(h) ?? 0) + (o.amount_cents ?? 0));
    }
    const revenuePerHour: { hour: string; cents: number }[] = [];
    for (let h = 0; h < 24; h++) {
      revenuePerHour.push({ hour: String(h).padStart(2, "0") + ":00", cents: revenueByHour.get(h) ?? 0 });
    }

    const revenueToday = paidToday.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const ordersTodayCount = paidToday.length;
    const avgTicketToday = ordersTodayCount > 0 ? revenueToday / ordersTodayCount : 0;
    const conversionToday = visitsToday > 0 ? (ordersTodayCount / visitsToday) * 100 : 0;

    // Comparação com ontem (mesma janela horária)
    const yOrders = (yesterdayOrdersRes.data ?? []).filter((o) => o.status === "PAID");
    const yRevenue = yOrders.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const yOrdersCount = yOrders.length;
    const yVisits = (yesterdaySessionsRes.data ?? []).length;
    const pctDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    // Feed de eventos recentes
    const recentEvents = (recentEventsRes.data ?? []).map((e) => ({
      sessionId: e.session_id,
      type: e.event_type,
      productHandle: e.product_handle,
      orderRef: e.order_ref,
      createdAt: e.created_at,
    }));

    // Feed de pedidos pagos recentes
    const recentPaidOrders = (recentPaidRes.data ?? []).map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const qty = items.reduce((s: number, it: any) => s + (Number(it?.quantity) || 0), 0);
      return {
        id: o.id,
        externalRef: o.external_ref,
        amountCents: o.amount_cents,
        payerName: o.payer_name,
        paidAt: o.paid_at,
        itemsCount: qty,
      };
    });

    return {
      onSite,
      inCheckout,
      onProduct,
      generatedAt: now.toISOString(),
      sessions: liveList.map((s) => {
        const dev = parseDevice(s.user_agent);
        const cart = cartBySession.get(s.session_id);
        return {
          sessionId: s.session_id,
          path: s.current_path,
          inCheckout: s.in_checkout,
          lastSeenAt: s.last_seen_at,
          createdAt: s.created_at,
          utmSource: s.utm_source,
          referrer: s.referrer,
          device: dev.device,
          browser: dev.browser,
          os: dev.os,
          cartTotalCents: cart?.totalCents ?? null,
          cartItems: cart?.items ?? null,
        };
      }),
      topActivePaths,
      topActiveSources,
      deviceCounts,
      recentEvents,
      recentPaidOrders,
      compare: {
        revenueDeltaPct: pctDelta(revenueToday, yRevenue),
        ordersDeltaPct: pctDelta(ordersTodayCount, yOrdersCount),
        visitsDeltaPct: pctDelta(visitsToday, yVisits),
        yesterday: { revenueCents: yRevenue, orders: yOrdersCount, visits: yVisits },
      },
      today: {
        revenueCents: revenueToday,
        orders: ordersTodayCount,
        avgTicketCents: avgTicketToday,
        conversionPct: conversionToday,
        visits: visitsToday,
        uniqueVisitors: uniqueVisitorsToday,
        avgSessionSeconds,
        avgTimePerPageSeconds,
        visitsPerHour,
        revenuePerHour,
        peakHours,
      },
    };
  });

export const getAbandonedCarts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    // Considera abandonado imediatamente: qualquer tentativa sem conversão
    const { data, error } = await supabaseAdmin
      .from("checkout_attempts")
      .select("*")
      .is("converted_order_id", null)
      .order("last_activity_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { carts: data ?? [] };
  });

const RangeSchema = z.object({
  rangeDays: z.union([z.literal(1), z.literal(7), z.literal(15), z.literal(30)]).optional(),
});

export const getEnhancedStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const rangeDays = data.rangeDays ?? 1;
    const now = new Date();
    const start =
      rangeDays === 1
        ? startOfDayBR(now)
        : new Date(now.getTime() - rangeDays * 86400000);
    const startIso = start.toISOString();

    const [{ data: ordersRange }, { data: eventsRange }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("amount_cents, status, items, created_at, paid_at")
        .gte("created_at", startIso),
      supabaseAdmin
        .from("funnel_events")
        .select("event_type, session_id, created_at")
        .gte("created_at", startIso),
    ]);

    const all = ordersRange ?? [];
    const events = eventsRange ?? [];
    const paid = all.filter((o) => o.status === "PAID");

    const revenue = paid.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const orders = paid.length;
    const avgTicket = orders > 0 ? revenue / orders : 0;

    const pixGenerated = all.length;
    const pixConversion = pixGenerated > 0 ? (orders / pixGenerated) * 100 : 0;

    const uniqBy = (type: string) =>
      new Set(events.filter((e) => e.event_type === type).map((e) => e.session_id)).size;
    const funnel = {
      visits: uniqBy("visit"),
      viewProduct: uniqBy("view_product"),
      viewCheckout: uniqBy("view_checkout"),
      pixGenerated: uniqBy("pix_generated"),
      paid: uniqBy("paid"),
    };

    const trend: { day: string; cents: number }[] = [];
    if (rangeDays === 1) {
      const map = new Map<string, number>();
      for (let h = 0; h < 24; h++) map.set(String(h).padStart(2, "0") + "h", 0);
      for (const o of paid) {
        const d = new Date(o.paid_at ?? o.created_at);
        const k = String(new Date(d.getTime() - 3 * 3600_000).getUTCHours()).padStart(2, "0") + "h";
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (o.amount_cents ?? 0));
      }
      for (const [day, cents] of map) trend.push({ day, cents });
    } else {
      const map = new Map<string, number>();
      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        map.set(d.toISOString().slice(0, 10), 0);
      }
      for (const o of paid) {
        const k = (o.paid_at ?? o.created_at).slice(0, 10);
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (o.amount_cents ?? 0));
      }
      for (const [day, cents] of map) trend.push({ day, cents });
    }

    const productMap = new Map<string, { qty: number; revenueCents: number }>();
    for (const o of paid) {
      const items = Array.isArray(o.items) ? (o.items as any[]) : [];
      for (const it of items) {
        const name = String(it?.name ?? it?.title ?? "Produto");
        const qty = Number(it?.quantity ?? 1);
        const priceC = Number(it?.price ?? 0);
        const cur = productMap.get(name) ?? { qty: 0, revenueCents: 0 };
        cur.qty += qty;
        cur.revenueCents += priceC * qty;
        productMap.set(name, cur);
      }
    }
    const topProducts = Array.from(productMap.entries())
      .map(([name, v]) => ({ name, qty: v.qty, revenueCents: v.revenueCents }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);

    return {
      rangeDays,
      kpis: { revenue, orders, avgTicket, pixGenerated, pixConversion },
      funnel,
      trend,
      topProducts,
    };
  });

// ---------- CART RECOVERY STATS (por canal/estágio) ----------
export const getCartRecoveryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: rows, error } = await supabaseAdmin
      .from("cart_recovery")
      .select(
        "id, checkout_attempt_id, status, sent_at, email_status, email2_status, email3_status, email1_clicked_at, email2_clicked_at, email3_clicked_at, whatsapp_clicked_at, recovery_link_clicked_at"
      );
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const attemptIds = Array.from(
      new Set(all.map((r: any) => r.checkout_attempt_id).filter(Boolean))
    );

    let convertedSet = new Set<string>();
    if (attemptIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from("checkout_attempts")
        .select("id, converted_order_id")
        .in("id", attemptIds);
      convertedSet = new Set(
        (attempts ?? [])
          .filter((a: any) => !!a.converted_order_id)
          .map((a: any) => a.id as string)
      );
    }

    const isSent = (v: any) =>
      v === "sent" || v === "queued" || v === "delivered" || v === "read";

    const stage = (sentKey: string, clickKey: string) => {
      let sent = 0,
        clicked = 0,
        converted = 0;
      for (const r of all as any[]) {
        if (!isSent(r[sentKey])) continue;
        sent++;
        const clickedTs = r[clickKey];
        if (clickedTs) clicked++;
        if (r.checkout_attempt_id && convertedSet.has(r.checkout_attempt_id) && clickedTs) {
          converted++;
        }
      }
      return { sent, clicked, converted };
    };

    const email1 = stage("email_status", "email1_clicked_at");
    const email2 = stage("email2_status", "email2_clicked_at");
    const email3 = stage("email3_status", "email3_clicked_at");

    // WhatsApp legado: usa coluna `status` + `sent_at`. Não é segmentado por estágio.
    let waSent = 0,
      waClicked = 0,
      waConverted = 0;
    for (const r of all as any[]) {
      if (!(r.sent_at && isSent(r.status))) continue;
      waSent++;
      const clickedTs = r.whatsapp_clicked_at;
      if (clickedTs) waClicked++;
      if (r.checkout_attempt_id && convertedSet.has(r.checkout_attempt_id) && clickedTs) {
        waConverted++;
      }
    }

    return {
      email: { stage1: email1, stage2: email2, stage3: email3 },
      whatsapp: { sent: waSent, clicked: waClicked, converted: waConverted },
      totalRows: all.length,
    };
  });


