import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

const InputSchema = z.object({
  amount: z.number().int().positive(),
  description: z.string().max(120),
  externalRef: z.string().min(1),
  payer: PayerSchema,
  items: z.array(ItemSchema).min(1),
  delivery: z.object({ fee: z.number().int().nonnegative(), address: AddressSchema }),
});

export type MonetrixPixInput = z.infer<typeof InputSchema>;

export async function _createMonetrixPix(data: MonetrixPixInput) {
  const apiKey = process.env.MONETRIX_API_KEY;
  if (!apiKey) throw new Error("MONETRIX_API_KEY não configurada");

  const payload = {
    amount: data.amount,
    currency: "BRL",
    method: "PIX",
    description: data.description,
    externalRef: data.externalRef,
    payer: data.payer,
    items: data.items,
    delivery: data.delivery,
  };

  const res = await fetch("https://api.monetrixpay.online/v1/payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

  if (!res.ok) {
    console.error("Monetrix error", res.status, body);
    const detailMsg =
      body?.details && typeof body.details === "object"
        ? Object.entries(body.details).map(([k, v]) =>
            typeof v === "object" ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`
          ).join(" | ")
        : "";
    throw new Error(
      `Falha ao gerar PIX (${res.status}): ${body?.message || "erro"}${detailMsg ? " — " + detailMsg : ""}`,
    );
  }

  const d = body?.data ?? {};
  const qrCode: string | null =
    d.copypaste || d.copyPaste || d.qrcode || d.qrCode || body?.qrcode || null;
  const qrCodeBase64: string | null =
    d.qrcodeBase64 || d.qrCodeBase64 || d.imageBase64 || null;
  const id: string | null = body?.id ?? null;
  const status: string | null = body?.status ?? null;

  return { id, status, qrCode, qrCodeBase64 };
}

export async function _getMonetrixStatus(id: string) {
  const apiKey = process.env.MONETRIX_API_KEY;
  if (!apiKey) throw new Error("MONETRIX_API_KEY não configurada");

  const res = await fetch(`https://api.monetrixpay.online/v1/payment/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

  if (!res.ok) {
    console.error("Monetrix status error", res.status, body);
    return { status: "UNKNOWN" as const, error: body?.message || `HTTP ${res.status}` };
  }

  const raw = String(body?.status ?? body?.data?.status ?? "").toUpperCase();
  let status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "UNKNOWN" = "UNKNOWN";
  if (["PAID", "APPROVED", "COMPLETED", "CONFIRMED"].includes(raw)) status = "PAID";
  else if (["PENDING", "WAITING", "PROCESSING", "CREATED"].includes(raw)) status = "PENDING";
  else if (["EXPIRED", "TIMEOUT"].includes(raw)) status = "EXPIRED";
  else if (["CANCELLED", "CANCELED", "REFUSED", "FAILED"].includes(raw)) status = "CANCELLED";

  return { status, raw, paidAt: body?.paidAt ?? body?.data?.paidAt ?? null };
}

export const createMonetrixPixPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => _createMonetrixPix(data));

export const getMonetrixPaymentStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => _getMonetrixStatus(data.id));
