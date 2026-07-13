import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  ref: z.string().min(1).max(100),
  token: z.string().uuid(),
});

export type SafeTrackedOrder = {
  external_ref: string;
  status: string;
  amount_cents: number;
  payer_name: string;
  items: Array<any>;
  delivery: any;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
};

// Alias para compatibilidade com código existente.
export type TrackedOrder = SafeTrackedOrder;

export const getTrackedOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<
    { ok: true; order: SafeTrackedOrder } | { ok: false; reason: "not_found" }
  > => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client-admin");
    const columns = [
      "external_ref",
      "status",
      "amount_cents",
      "payer_name",
      "items",
      "delivery",
      "created_at",
      "paid_at",
      "shipped_at",
      "delivered_at",
      "tracking_code",
      "tracking_url",
    ].join(",");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(columns)
      .eq("external_ref", data.ref)
      .eq("order_secret", data.token)
      .maybeSingle();

    if (error || !order) return { ok: false, reason: "not_found" };
    return { ok: true, order: order as unknown as SafeTrackedOrder };
  });