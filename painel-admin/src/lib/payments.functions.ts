import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { _createMonetrixPix, _getMonetrixStatus } from "./monetrix.functions";
import { sendTiktokAddPaymentInfo, sendTiktokCompletePayment, buildContentsFromOrderItems } from "@/lib/tiktok-events.functions";

const PayerSchema = z.object({
  name: z.string().min(1),
  taxId: z.string().min(11),
  email: z.string().email(),
  phone: z.string().min(10),
});

const ItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative(),
  type: z.enum(["PHYSICAL", "DIGITAL"]).default("PHYSICAL"),
});

const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(8),
  country: z.string().default("BR"),
});

const PixInput = z.object({
  amount: z.number().int().positive(),
  description: z.string().max(120),
  externalRef: z.string().min(1),
  payer: PayerSchema,
  items: z.array(ItemSchema).min(1),
  delivery: z.object({ fee: z.number().int().nonnegative(), address: AddressSchema }),
  tracking: z.object({
    ttclid: z.string().min(1).max(500).optional(),
    ttp: z.string().min(1).max(500).optional(),
    url: z.string().url().optional(),
    userAgent: z.string().min(1).max(500).optional(),
  }).optional(),
});

type GatewayKey = "monetrix";

async function getActiveKey(): Promise<GatewayKey> {
  try {
    const { data } = await supabaseAdmin
      .from("payment_gateways")
      .select("key")
      .eq("is_active", true)
      .eq("enabled", true)
      .maybeSingle();
    return ((data?.key as GatewayKey) ?? "monetrix");
  } catch (e) {
    console.error("getActiveKey error, defaulting monetrix", e);
    return "monetrix";
  }
}

export const createPixPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) => PixInput.parse(d))
  .handler(async ({ data }) => {
    const gateway = await getActiveKey();
    const result = await _createMonetrixPix(data);
    if (result.qrCode || result.qrCodeBase64) {
      const contents = buildContentsFromOrderItems(data.items);
      const baseEvent = {
        value: data.amount / 100,
        currency: "BRL",
        email: data.payer.email,
        phone: data.payer.phone,
        externalId: data.payer.taxId,
        url: data.tracking?.url,
        userAgent: data.tracking?.userAgent,
        ttclid: data.tracking?.ttclid,
        ttp: data.tracking?.ttp,
        contents,
      };
      await Promise.all([
        sendTiktokAddPaymentInfo({ ...baseEvent, eventId: `add-payment-info-${data.externalRef}` }),
        sendTiktokCompletePayment({ ...baseEvent, eventId: `complete-payment-${data.externalRef}` }),
      ]);
    }
    return { ...result, gateway };
  });

export const getPixPaymentStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      id: z.string().min(1),
      gateway: z.enum(["monetrix"]).default("monetrix"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    return _getMonetrixStatus(data.id);
  });
