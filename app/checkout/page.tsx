"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/lib/cartStore";
import { ShoppingBag, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

const INITIAL_FORM: FormData = {
  name: "", email: "", phone: "", address: "", city: "", state: "", zipCode: "",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { state, total, clearCart } = useCart();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!state.items.length) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: state.items.map((i) => ({
            handle: i.handle,
            title: i.title,
            image: i.image,
            selectedOptions: i.selectedOptions,
            price: i.price,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar pedido.");

      clearCart();

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      router.push(`/thank-you?orderId=${data.orderId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  };

  if (!state.items.length) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
        <Navbar />
        <div className="flex-grow flex flex-col items-center justify-center gap-4 text-center px-6">
          <ShoppingBag className="w-20 h-20 text-[#C8B99A]" strokeWidth={1} />
          <h1 className="font-display text-2xl font-bold text-[#2C1A0E]" style={{ fontFamily: "var(--font-display)" }}>
            Sacola vazia
          </h1>
          <p className="text-[#6B4C2A] text-sm">Adicione produtos antes de finalizar a compra.</p>
          <Link
            href="/catalogue"
            className="mt-2 px-8 py-3 bg-[#D4AF37] text-[#2C1A0E] font-bold text-xs uppercase tracking-widest rounded-sm hover:bg-[#C8A030] transition-all"
          >
            Ver Catálogo
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
      <Navbar />

      <main className="flex-grow pt-28 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          <h1
            className="font-display text-3xl md:text-4xl font-bold text-[#2C1A0E] tracking-widest uppercase mb-10 text-center"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Finalizar Compra
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {/* ── Form ──────────────────────────────────────────────────── */}
            <form
              onSubmit={handleSubmit}
              className="lg:col-span-3 bg-white rounded-sm border border-[#E8E0D5] p-8 shadow-sm space-y-6"
            >
              <h2 className="text-sm font-bold uppercase tracking-widest text-[#2C1A0E] border-b border-[#E8E0D5] pb-3">
                Informações de Entrega
              </h2>

              {/* Name */}
              <Field label="Nome completo *" id="name">
                <input
                  id="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Seu nome completo"
                  className={inputCls}
                />
              </Field>

              {/* Email + Phone row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="E-mail *" id="email">
                  <input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={set("email")}
                    placeholder="seu@email.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefone" id="phone">
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="(00) 00000-0000"
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* CEP + Address */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="CEP *" id="zipCode">
                  <input
                    id="zipCode"
                    type="text"
                    required
                    value={form.zipCode}
                    onChange={set("zipCode")}
                    placeholder="00000-000"
                    className={inputCls}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Endereço completo *" id="address">
                    <input
                      id="address"
                      type="text"
                      required
                      value={form.address}
                      onChange={set("address")}
                      placeholder="Rua, número, complemento"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              {/* City + State */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Cidade *" id="city">
                  <input
                    id="city"
                    type="text"
                    required
                    value={form.city}
                    onChange={set("city")}
                    placeholder="Sua cidade"
                    className={inputCls}
                  />
                </Field>
                <Field label="Estado *" id="state">
                  <input
                    id="state"
                    type="text"
                    required
                    maxLength={2}
                    value={form.state}
                    onChange={set("state")}
                    placeholder="SP"
                    className={inputCls}
                  />
                </Field>
              </div>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-sm px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full py-4 bg-[#D4AF37] hover:bg-[#C8A030] disabled:bg-[#E8E0D5] disabled:text-[#A89070] text-[#2C1A0E] font-bold text-sm uppercase tracking-widest rounded-sm shadow-md transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando…
                  </>
                ) : (
                  <>
                    Confirmar Pedido
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* ── Order Summary ──────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-sm border border-[#E8E0D5] p-6 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#2C1A0E] border-b border-[#E8E0D5] pb-3 mb-4">
                  Resumo do Pedido
                </h2>
                <div className="space-y-3">
                  {state.items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-12 h-12 shrink-0 rounded-sm overflow-hidden bg-[#F0EBE3]">
                        {item.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-semibold text-[#2C1A0E] line-clamp-1">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-[#A89070]">
                          {Object.entries(item.selectedOptions)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </p>
                        <p className="text-xs text-[#6B4C2A] mt-0.5">
                          {item.quantity}× {formatBRL(item.price)}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-[#2C1A0E] shrink-0">
                        {formatBRL(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[#E8E0D5] mt-4 pt-4 space-y-2">
                  <div className="flex justify-between text-xs text-[#6B4C2A]">
                    <span>Subtotal</span>
                    <span>{formatBRL(total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#A89070]">
                    <span>Frete</span>
                    <span>A calcular</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-[#2C1A0E] pt-2 border-t border-[#E8E0D5]">
                    <span>Total</span>
                    <span>{formatBRL(total)}</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-[#A89070] text-center space-y-1">
                <p>🔒 Pagamento 100% seguro via Corvex</p>
                <p>✓ Seus dados são protegidos</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Helpers
const inputCls =
  "w-full px-4 py-2.5 border border-[#D4AF37]/30 bg-[#FDFAF6] text-[#2C1A0E] text-sm rounded-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 placeholder:text-[#C8B99A] transition-all";

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-widest text-[#6B4C2A]">
        {label}
      </label>
      {children}
    </div>
  );
}
