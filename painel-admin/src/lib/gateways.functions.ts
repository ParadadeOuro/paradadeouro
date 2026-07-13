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

export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payment_gateways")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error("Falha ao listar gateways");
    return { gateways: data ?? [] };
  });

export const setActiveGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ key: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    // Verify target exists and is enabled
    const { data: target, error: tErr } = await supabaseAdmin
      .from("payment_gateways")
      .select("id,enabled")
      .eq("key", data.key)
      .maybeSingle();
    if (tErr || !target) throw new Error("Gateway não encontrado");
    if (!target.enabled) throw new Error("Gateway está desabilitado");

    // Deactivate all first, then activate target (avoids unique constraint conflicts)
    const { error: dErr } = await supabaseAdmin
      .from("payment_gateways")
      .update({ is_active: false })
      .eq("is_active", true);
    if (dErr) throw new Error("Falha ao desativar gateway atual");

    const { error: uErr } = await supabaseAdmin
      .from("payment_gateways")
      .update({ is_active: true })
      .eq("id", target.id);
    if (uErr) throw new Error("Falha ao ativar gateway");

    return { ok: true, active: data.key };
  });

export const toggleGatewayEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ key: z.string().min(1).max(40), enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    // If disabling and it's active, prevent it
    const { data: row } = await supabaseAdmin
      .from("payment_gateways")
      .select("is_active")
      .eq("key", data.key)
      .maybeSingle();
    if (row?.is_active && !data.enabled) {
      throw new Error("Não é possível desabilitar o gateway ativo. Ative outro antes.");
    }

    const { error } = await supabaseAdmin
      .from("payment_gateways")
      .update({ enabled: data.enabled })
      .eq("key", data.key);
    if (error) throw new Error("Falha ao atualizar gateway");
    return { ok: true };
  });

export const updateGatewayFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      key: z.string().min(1).max(40),
      pix_fee_percent: z.number().min(0).max(100),
      pix_fee_fixed_cents: z.number().int().min(0).max(100_000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_gateways")
      .update({
        pix_fee_percent: data.pix_fee_percent,
        pix_fee_fixed_cents: data.pix_fee_fixed_cents,
      })
      .eq("key", data.key);
    if (error) throw new Error("Falha ao atualizar taxas");
    return { ok: true };
  });

/**
 * Retorna o gateway ativo (chave) — público, sem auth, usado pelo checkout.
 */
export const getActiveGateway = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("payment_gateways")
      .select("key,name")
      .eq("is_active", true)
      .eq("enabled", true)
      .maybeSingle();
    if (error) {
      console.error("getActiveGateway error", error);
      return { key: "monetrix" as string, name: "Monetrix" };
    }
    if (!data) return { key: "monetrix" as string, name: "Monetrix" };
    return { key: data.key, name: data.name };
  });
