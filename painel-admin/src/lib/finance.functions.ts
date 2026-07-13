import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}


// "YYYY-MM-DD" no fuso BR
function brDateKey(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3600_000);
  return sp.toISOString().slice(0, 10);
}

// Converte "YYYY-MM-DD" (data BR) em Date UTC do início desse dia em BR (00:00 BR = 03:00 UTC).
function brDateKeyToStartUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 3, 0, 0, 0));
}

const RangeSchema = z
  .object({
    rangeDays: z.union([z.literal(1), z.literal(7), z.literal(15), z.literal(30)]).optional(),
    preset: z.enum(["today", "yesterday", "7d", "15d", "30d", "custom"]).optional(),
    customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (v) => v.preset !== "custom" || (!!v.customStart && !!v.customEnd),
    { message: "customStart/customEnd obrigatórios quando preset=custom" },
  );

type RangeInput = z.infer<typeof RangeSchema>;

function resolveWindow(input: RangeInput): {
  startUtc: Date;
  endUtc: Date | null;
  startDate: string;
  endDate: string | null;
} {
  if (input.preset == null && input.rangeDays != null) {
    const rd = input.rangeDays;
    const startUtc =
      rd === 1
        ? brDateKeyToStartUtc(brDateKey(new Date()))
        : new Date(Date.now() - rd * 86400000);
    return { startUtc, endUtc: null, startDate: brDateKey(startUtc), endDate: null };
  }
  const preset = input.preset ?? "today";
  const todayKey = brDateKey(new Date());
  if (preset === "today") {
    const s = brDateKeyToStartUtc(todayKey);
    return { startUtc: s, endUtc: null, startDate: todayKey, endDate: null };
  }
  if (preset === "yesterday") {
    const t = brDateKeyToStartUtc(todayKey);
    const y = new Date(t.getTime() - 86400000);
    return { startUtc: y, endUtc: t, startDate: brDateKey(y), endDate: brDateKey(y) };
  }
  if (preset === "custom") {
    const sKey = input.customStart!;
    const eKey = input.customEnd!;
    const startUtc = brDateKeyToStartUtc(sKey);
    const endUtc = new Date(brDateKeyToStartUtc(eKey).getTime() + 86400000);
    return { startUtc, endUtc, startDate: sKey, endDate: eKey };
  }
  const days = preset === "7d" ? 7 : preset === "15d" ? 15 : 30;
  const startUtc = new Date(Date.now() - days * 86400000);
  return { startUtc, endUtc: null, startDate: brDateKey(startUtc), endDate: null };
}

// ------------------ Ad Spend CRUD ------------------

export const listAdSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const win = resolveWindow(data);
    let q = supabaseAdmin
      .from("ad_spend")
      .select("*")
      .gte("spend_date", win.startDate)
      .order("spend_date", { ascending: false })
      .limit(500);
    if (win.endDate) q = q.lte("spend_date", win.endDate);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  spend_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.number().int().nonnegative().max(100_000_000),
  platform: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertAdSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const payload = {
      spend_date: data.spend_date,
      amount_cents: data.amount_cents,
      platform: data.platform ?? null,
      notes: data.notes ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("ad_spend").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("ad_spend")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteAdSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("ad_spend").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------ Resumo financeiro ------------------

export const getFinanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RangeSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const win = resolveWindow(data);
    const startIso = win.startUtc.toISOString();
    const endIso = win.endUtc ? win.endUtc.toISOString() : null;

    let ordersQ = supabaseAdmin
      .from("orders")
      .select("amount_cents,status,gateway,created_at,paid_at")
      .gte("created_at", startIso);
    if (endIso) ordersQ = ordersQ.lt("created_at", endIso);

    let spendQ = supabaseAdmin
      .from("ad_spend")
      .select("amount_cents,spend_date")
      .gte("spend_date", win.startDate);
    if (win.endDate) spendQ = spendQ.lte("spend_date", win.endDate);

    const [{ data: ordersRows }, { data: gws }, { data: spends }] = await Promise.all([
      ordersQ,
      supabaseAdmin
        .from("payment_gateways")
        .select("key,pix_fee_percent,pix_fee_fixed_cents"),
      spendQ,
    ]);

    const feeMap = new Map<string, { pct: number; fixed: number }>();
    for (const g of gws ?? []) {
      feeMap.set(g.key, {
        pct: Number(g.pix_fee_percent ?? 0),
        fixed: Number(g.pix_fee_fixed_cents ?? 0),
      });
    }

    const paid = (ordersRows ?? []).filter((o) => o.status === "PAID");
    const refunded = (ordersRows ?? []).filter((o) => o.status === "REFUNDED");
    const pending = (ordersRows ?? []).filter((o) => o.status === "PENDING");

    const grossRevenue = paid.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const pendingTotal = pending.reduce((s, o) => s + (o.amount_cents ?? 0), 0);
    const refundedTotal = refunded.reduce((s, o) => s + (o.amount_cents ?? 0), 0);

    let feesTotal = 0;
    for (const o of paid) {
      const fee = feeMap.get(o.gateway ?? "") ?? { pct: 0, fixed: 0 };
      const amt = o.amount_cents ?? 0;
      feesTotal += Math.round((amt * fee.pct) / 100) + fee.fixed;
    }

    const adsTotal = (spends ?? []).reduce((s, x) => s + (x.amount_cents ?? 0), 0);

    const netRevenue = grossRevenue - feesTotal;
    const profit = netRevenue - adsTotal;
    const margin = grossRevenue > 0 ? (profit / grossRevenue) * 100 : 0;
    const roas = adsTotal > 0 ? grossRevenue / adsTotal : null;
    const roi = adsTotal > 0 ? (profit / adsTotal) * 100 : null;

    return {
      preset: data.preset ?? null,
      rangeDays: data.rangeDays ?? null,
      window: { startDate: win.startDate, endDate: win.endDate },
      orders: { paid: paid.length, pending: pending.length, refunded: refunded.length },
      revenue: {
        gross: grossRevenue,
        net: netRevenue,
        pending: pendingTotal,
        refunded: refundedTotal,
      },
      costs: {
        fees: feesTotal,
        ads: adsTotal,
        productCost: 0,
        extras: 0,
      },
      profit,
      margin,
      roas,
      roi,
    };
  });
