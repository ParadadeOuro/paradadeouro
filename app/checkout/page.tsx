'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/cartStore';
import {
  ChevronLeft,
  Minus,
  Plus,
  Lock,
  CreditCard,
  Pencil,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { checkoutSupabase } from '@/lib/checkoutSupabase';
import { toast, Toaster } from 'sonner';
import { getUtmParams } from '@/lib/utmUtils';
import { createTikTokEventId, trackTikTokEvent } from '@/lib/tiktokPixel';

interface PixData {
  id: string;
  shortId: string;
  qrCode: string;
  qrCodeUrl: string;
  expirationDate: string;
  amount: number;
}

type Step = 1 | 2 | 3 | 'pix' | 'card-success';

const INTEREST_RATE = 0.0399; // 3,99% a.m. a partir da 4ª parcela

function calcInstallment(
  totalCents: number,
  n: number
): { installmentCents: number; totalCents: number } {
  if (n <= 3) {
    const inst = Math.round(totalCents / n);
    return { installmentCents: inst, totalCents: inst * n };
  }
  const i = INTEREST_RATE;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  const inst = Math.round(totalCents * factor);
  return { installmentCents: inst, totalCents: inst * n };
}

export default function CheckoutPage() {
  const { state, total, updateQuantity, clearCart } = useCart();
  const items = state.items;
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const [showStoreInfo, setShowStoreInfo] = useState(false);
  const [paymentMethod] = useState<'pix' | 'card'>('pix');
  const [shippingMethod, setShippingMethod] = useState<'pac' | 'sedex'>('pac');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (currentStep !== 'pix' || !createdOrderId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await checkoutSupabase
          .from('orders')
          .select('status')
          .eq('external_id', createdOrderId)
          .single();
        if (data?.status === 'paid' || data?.status === 'approved') {
          clearCart();
          router.push(`/thank-you?orderId=${createdOrderId}`);
        }
      } catch (err) {
        console.error('Error polling order status:', err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [currentStep, createdOrderId, clearCart, router]);

  // Card state
  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvv: '' });
  const [installments, setInstallments] = useState(1);
  const [cardLoading] = useState(false);

  const stepNum = typeof currentStep === 'number' ? currentStep : 4;

  const [form, setForm] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: '',
    cep: '',
    address: '',
    number: '',
    neighborhood: '',
    complement: '',
    city: '',
    state: '',
  });

  const formatPrice = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const shippingCost = shippingMethod === 'sedex' ? 9.79 : 0;
  const pixDiscount = 0;
  const finalTotal = Math.max(
    0.01,
    Math.round((total + shippingCost - pixDiscount) * 100) / 100
  );

  // Build TikTok content from ParadaDeOuro cart items
  const tiktokContents = useMemo(
    () =>
      items.map((i) => ({
        content_id: i.id,
        content_type: 'product' as const,
        content_name: i.title,
        price: i.price,
        quantity: i.quantity,
      })),
    [items]
  );
  const tiktokContentIds = useMemo(
    () => tiktokContents.map((item) => item.content_id),
    [tiktokContents]
  );

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // TikTok: InitiateCheckout
  useEffect(() => {
    if (items.length === 0) return;
    trackTikTokEvent('InitiateCheckout', {
      contents: tiktokContents,
      content_ids: tiktokContentIds,
      content_type: 'product',
      value: total,
      currency: 'BRL',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAddressByCep = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {}
  }, []);

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const validateCpf = (cpf: string): boolean => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    if (rest !== parseInt(digits[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest === parseInt(digits[10]);
  };

  const cpfError = useMemo(() => {
    const digits = form.cpf.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length < 11) return '';
    return validateCpf(form.cpf) ? '' : 'CPF inválido';
  }, [form.cpf]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const phoneError = useMemo(() => {
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length < 10 || digits.length > 11) return 'Celular inválido';
    const ddd = parseInt(digits.slice(0, 2));
    if (ddd < 11 || ddd > 99) return 'DDD inválido';
    if (digits.length === 11 && digits[2] !== '9') return 'Celular deve começar com 9 após o DDD';
    return '';
  }, [form.phone]);

  const emailError = useMemo(() => {
    const value = form.email.trim();
    if (value.length === 0) return '';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(value) ? '' : 'E-mail inválido';
  }, [form.email]);

  const phoneDigits = form.phone.replace(/\D/g, '').length;
  const canGoStep2 =
    form.name &&
    form.email &&
    form.cpf &&
    form.phone &&
    !emailError &&
    !cpfError &&
    form.cpf.replace(/\D/g, '').length === 11 &&
    !phoneError &&
    (phoneDigits === 10 || phoneDigits === 11);
  const canGoStep3 = form.cep && form.address && form.number && form.neighborhood;

  const handleGeneratePix = async () => {
    setPixLoading(true);
    const addPaymentInfoEventId = createTikTokEventId();
    const purchaseEventId = createTikTokEventId();
    const tiktokUser = {
      email: form.email,
      phone: form.phone,
      external_id: form.cpf.replace(/\D/g, ''),
    };

    trackTikTokEvent(
      'AddPaymentInfo',
      {
        contents: tiktokContents,
        content_ids: tiktokContentIds,
        content_type: 'product',
        value: finalTotal,
        currency: 'BRL',
        description: 'pix',
      },
      tiktokUser,
      { eventId: addPaymentInfoEventId }
    );

    try {
      const cpfDigits = form.cpf.replace(/\D/g, '');
      const phoneDigitsClean = form.phone.replace(/\D/g, '');

      const { data, error } = await checkoutSupabase.functions.invoke('create-pix', {
        body: {
          amount: finalTotal,
          customer: {
            name: form.name,
            email: form.email,
            phone: phoneDigitsClean,
            document: {
              number: cpfDigits,
              type: cpfDigits.length === 11 ? 'cpf' : 'cnpj',
            },
          },
          items: items.map((i) => ({
            id: i.id,
            title: i.title,
            quantity: i.quantity,
          })),
          shippingMethod,
          tiktok: {
            addPaymentInfoEventId,
            purchaseEventId,
            user: tiktokUser,
            properties: {
              contents: tiktokContents,
              content_ids: tiktokContentIds,
              content_type: 'product',
              value: finalTotal,
              currency: 'BRL',
            },
            page: {
              url: window.location.href,
              user_agent: navigator.userAgent,
            },
          },
        },
      });

      if (error) throw new Error(error.message || 'Erro ao gerar PIX');
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (!data?.qrCode) {
        toast.error('Não foi possível gerar o PIX no momento.');
        return;
      }

      setPixData(data);
      setCurrentStep('pix');

      const utmParams = getUtmParams();
      const totalInCents = Math.round(finalTotal * 100);
      const orderId = data.id || data.shortId || crypto.randomUUID();
      setCreatedOrderId(orderId);

      trackTikTokEvent(
        'Purchase',
        {
          contents: tiktokContents,
          content_ids: tiktokContentIds,
          content_type: 'product',
          value: finalTotal,
          currency: 'BRL',
          description: `order_${orderId}`,
        },
        tiktokUser,
        { eventId: purchaseEventId }
      );

      const orderItems = items.map((i) => ({
        id: i.id,
        name: i.title,
        quantity: i.quantity,
        priceInCents: Math.round(i.price * 100),
      }));

      checkoutSupabase
        .from('orders')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          external_id: orderId,
          status: 'waiting_payment',
          payment_method: 'pix',
          customer_name: form.name,
          customer_email: form.email,
          customer_phone: phoneDigitsClean,
          customer_document: cpfDigits,
          total_cents: totalInCents,
          items: orderItems as never,
          utm_params: utmParams as never,
          pix_id: data.id || null,
          shipping_address: {
            cep: form.cep,
            address: form.address,
            number: form.number,
            neighborhood: form.neighborhood,
            complement: form.complement,
            city: form.city,
            state: form.state,
          } as never,
        } as never)
        .then(({ error: insertErr }) => {
          if (insertErr) console.error('Error saving order:', insertErr);
        });

      checkoutSupabase.functions
        .invoke('track-utmify', {
          body: {
            orderId,
            status: 'waiting_payment',
            paymentMethod: 'pix',
            customer: {
              name: form.name,
              email: form.email,
              phone: phoneDigitsClean,
              document: cpfDigits,
            },
            products: items.map((i) => ({
              id: i.id,
              name: i.title,
              quantity: i.quantity,
              price: i.price,
            })),
            trackingParameters: utmParams,
            commission: {
              totalPriceInCents: totalInCents,
              gatewayFeeInCents: Math.round(totalInCents * 0.05),
              userCommissionInCents: Math.round(totalInCents * 0.95),
            },
          },
        })
        .catch((err) => console.error('UTMify tracking error:', err));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar cobrança PIX');
    } finally {
      setPixLoading(false);
    }
  };

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

  const formatExp = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  };

  const cardNumberDigits = card.number.replace(/\s/g, '');
  const cardValid =
    cardNumberDigits.length >= 13 &&
    card.holder.trim().split(' ').length >= 2 &&
    /^\d{2}\/\d{2,4}$/.test(card.exp) &&
    card.cvv.length >= 3;

  const handleCardPayment = async () => {
    toast.error('Pagamento com cartão indisponível. Utilize PIX.');
  };

  const handleCopyPix = async () => {
    if (!pixData?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Erro ao copiar código');
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <p className="text-lg text-gray-500 mb-4">Seu carrinho está vazio</p>
        <Link href="/" className="text-yellow-600 underline">
          Voltar à loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <header className="bg-white border-b py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pagamento-seguro.png"
              alt="Parada de Ouro"
              className="h-[17px] cursor-pointer"
            />
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pagamento-seguro.png" alt="Pagamento 100% Seguro" className="h-7" />
        </div>
      </header>

      {/* Promo banner */}
      <div className="bg-black text-white py-2.5 text-xs sm:text-sm font-semibold">
        <div className="container mx-auto px-4 flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden style={{ filter: 'hue-rotate(90deg) saturate(2)' }}>🔥</span>
            <span>
              Oferta expira em{' '}
              <span className="text-[#67f104] font-bold tabular-nums">
                {mm}:{ss}
              </span>
            </span>
          </span>
          <span className="text-gray-500">•</span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>Checkout 100% seguro</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 flex-1">
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
          {/* Left: Steps */}
          <div className="flex-1 space-y-4 order-2 lg:order-1">
            {/* Step 1: Identificação */}
            <div className={`bg-white rounded-lg border p-5 ${currentStep !== 1 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      stepNum >= 1 ? 'text-white bg-[#67f104]' : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    1
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wide">Identificação</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">1 DE 3</span>
                  {currentStep !== 1 && (
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4 ml-8">
                Preencha seus dados para envio do pedido.
              </p>

              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome completo</label>
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="Digite seu nome completo"
                      className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        updateField('email', e.target.value.trim().toLowerCase())
                      }
                      placeholder="Digite seu e-mail"
                      className={`w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                        emailError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-yellow-500'
                      }`}
                    />
                    {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">CPF</label>
                    <input
                      value={form.cpf}
                      onChange={(e) => updateField('cpf', formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className={`w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 max-w-[220px] ${
                        cpfError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-yellow-500'
                      }`}
                    />
                    {cpfError && <p className="text-xs text-red-500 mt-1">{cpfError}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Celular/Whatsapp</label>
                    <div className="flex items-center gap-2 max-w-[260px]">
                      <span className="text-sm text-gray-500 border rounded-md px-3 py-2.5 bg-gray-50">
                        +55
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={form.phone}
                        onChange={(e) => updateField('phone', formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className={`flex-1 border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                          phoneError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-yellow-500'
                        }`}
                      />
                    </div>
                    {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                  </div>

                  <button
                    onClick={() => canGoStep2 && setCurrentStep(2)}
                    disabled={!canGoStep2}
                    className="w-full py-3.5 rounded-full text-white font-bold text-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-black"
                  >
                    Ir Para Entrega
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Entrega */}
            <div className={`bg-white rounded-lg border p-5 ${currentStep !== 2 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      stepNum >= 2 ? 'text-white bg-[#67f104]' : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    2
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wide">Entrega</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">2 DE 3</span>
                  {currentStep !== 2 && stepNum > 2 && (
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4 ml-8">
                Preencha seus dados para continuar
              </p>

              {currentStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">CEP</label>
                    <input
                      value={form.cep}
                      onChange={(e) => {
                        updateField('cep', e.target.value);
                        const clean = e.target.value.replace(/\D/g, '');
                        if (clean.length === 8) fetchAddressByCep(e.target.value);
                      }}
                      placeholder="00000-000"
                      className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 max-w-[200px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Endereço</label>
                    <input
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="Rua, Avenida..."
                      className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">N°</label>
                      <input
                        value={form.number}
                        onChange={(e) => updateField('number', e.target.value)}
                        className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Bairro</label>
                      <input
                        value={form.neighborhood}
                        onChange={(e) => updateField('neighborhood', e.target.value)}
                        className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Cidade</label>
                      <input
                        value={form.city}
                        onChange={(e) => updateField('city', e.target.value)}
                        className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Estado</label>
                      <input
                        value={form.state}
                        onChange={(e) => updateField('state', e.target.value)}
                        maxLength={2}
                        className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Complemento (Opcional)
                    </label>
                    <input
                      value={form.complement}
                      onChange={(e) => updateField('complement', e.target.value)}
                      className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>

                  {/* Frete */}
                  <div className="space-y-2">
                    <p className="text-sm font-bold mb-2">Escolha o frete:</p>

                    {/* PAC */}
                    <button
                      onClick={() => setShippingMethod('pac')}
                      className={`w-full flex items-center justify-between border-2 rounded-lg p-4 transition-colors ${
                        shippingMethod === 'pac' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            shippingMethod === 'pac' ? 'border-blue-600' : 'border-gray-300'
                          }`}
                        >
                          {shippingMethod === 'pac' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm">PAC - Correios</p>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">5 a 7 dias</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/pac-correios-logo.png"
                              alt="PAC"
                              className="h-4 object-contain"
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-bold">Grátis</span>
                    </button>

                    {/* SEDEX */}
                    <button
                      onClick={() => setShippingMethod('sedex')}
                      className={`w-full flex items-center justify-between border-2 rounded-lg p-4 transition-colors ${
                        shippingMethod === 'sedex'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            shippingMethod === 'sedex' ? 'border-blue-600' : 'border-gray-300'
                          }`}
                        >
                          {shippingMethod === 'sedex' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm">SEDEX</p>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">1 a 3 dias</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/sedex-logo.webp"
                              alt="SEDEX"
                              className="h-4 object-contain"
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-bold">R$ 9,79</span>
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                    >
                      <ChevronLeft className="w-4 h-4" /> Voltar
                    </button>
                    <button
                      onClick={() => canGoStep3 && setCurrentStep(3)}
                      disabled={!canGoStep3}
                      className="flex-1 py-3.5 rounded-full text-white font-bold text-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-black"
                    >
                      Ir Para Pagamento
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Pagamento */}
            <div className={`bg-white rounded-lg border p-5 ${currentStep !== 3 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      stepNum >= 3 ? 'text-white bg-[#67f104]' : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    3
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wide">Pagamento</h2>
                </div>
                <span className="text-xs text-gray-400">3 DE 3</span>
              </div>
              <p className="text-sm text-gray-500 mb-4 ml-8">
                Preencha os dados de entrega para continuar
              </p>

              {currentStep === 3 && (
                <div className="space-y-4">
                  {paymentMethod === 'pix' && (
                    <>
                      <div className="relative border-2 rounded-xl p-4 border-black">
                        <span className="absolute -top-2 right-3 text-white text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#67f104]">
                          5% OFF
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/logo-pix.png?v=1776298269"
                              alt="PIX"
                              className="w-8 h-8 object-contain"
                            />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-800">PIX</p>
                            <p className="text-xs font-medium text-[#67f104]">
                              Aprovação imediata · 5% de desconto
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                          <p className="text-xs text-gray-500">
                            O código Pix expira em 30 minutos após finalizar a compra.
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-700">Valor no Pix:</p>
                            <div className="text-right">
                              <span className="font-bold text-[#67f104]">
                                {formatPrice(finalTotal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cartão - Indisponível */}
                      <div
                        aria-disabled="true"
                        className="relative border-2 rounded-xl p-4 border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed select-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 flex items-center justify-center text-gray-400">
                              <CreditCard className="w-7 h-7" />
                            </div>
                            <div>
                              <p className="font-bold text-sm text-gray-500">Cartão de crédito</p>
                              <p className="text-xs text-gray-400">Sistema está fora do ar.</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-200 px-2 py-1 rounded">
                            Indisponível
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleGeneratePix}
                        disabled={pixLoading}
                        className="w-full py-4 rounded-lg text-white font-extrabold text-base uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 bg-black"
                      >
                        {pixLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Gerando PIX...
                          </>
                        ) : (
                          'FINALIZAR COMPRA'
                        )}
                      </button>
                    </>
                  )}

                  {paymentMethod === 'card' && (
                    <>
                      <div className="border-2 rounded-xl p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Número do cartão
                          </label>
                          <input
                            value={card.number}
                            onChange={(e) =>
                              setCard((c) => ({
                                ...c,
                                number: formatCardNumber(e.target.value),
                              }))
                            }
                            placeholder="0000 0000 0000 0000"
                            inputMode="numeric"
                            className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Nome impresso no cartão
                          </label>
                          <input
                            value={card.holder}
                            onChange={(e) =>
                              setCard((c) => ({
                                ...c,
                                holder: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="COMO ESTÁ NO CARTÃO"
                            className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1">Validade</label>
                            <input
                              value={card.exp}
                              onChange={(e) =>
                                setCard((c) => ({ ...c, exp: formatExp(e.target.value) }))
                              }
                              placeholder="MM/AA"
                              inputMode="numeric"
                              className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">CVV</label>
                            <input
                              value={card.cvv}
                              onChange={(e) =>
                                setCard((c) => ({
                                  ...c,
                                  cvv: e.target.value.replace(/\D/g, '').slice(0, 4),
                                }))
                              }
                              placeholder="000"
                              inputMode="numeric"
                              className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Parcelamento</label>
                          <select
                            value={installments}
                            onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                            className="w-full border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                          >
                            {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => {
                              const totalCents = Math.round(finalTotal * 100);
                              const { installmentCents, totalCents: chargedCents } =
                                calcInstallment(totalCents, n);
                              const noFee = n <= 3;
                              return (
                                <option key={n} value={n}>
                                  {n}x de {formatPrice(installmentCents / 100)}
                                  {noFee
                                    ? ' sem juros'
                                    : ` (total ${formatPrice(chargedCents / 100)})`}
                                </option>
                              );
                            })}
                          </select>
                          <p className="text-[11px] text-gray-500 mt-1">Até 3x sem juros!</p>
                        </div>
                      </div>

                      <button
                        onClick={handleCardPayment}
                        disabled={cardLoading || !cardValid}
                        className="w-full py-4 rounded-lg text-white font-extrabold text-base uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 bg-black"
                      >
                        {cardLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          'FINALIZAR COMPRA'
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* PIX QR Code Screen */}
            {currentStep === 'pix' && pixData && (
              <div className="bg-white rounded-lg border p-6 text-center space-y-6">
                <div>
                  <h2 className="font-extrabold text-2xl text-gray-900">Já é quase seu...</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Pague seu pix dentro de 30 minutos para garantir sua compra.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/pix-checkout.png?v=1776317496"
                    alt="Pix checkout"
                    className="mx-auto h-auto w-[70%]"
                    loading="lazy"
                  />
                  <p className="text-sm font-medium text-[#69F100]">
                    Aponte a câmera do seu celular
                  </p>
                  <div className="flex justify-center">
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 inline-block">
                      {pixData.qrCodeUrl && pixData.qrCodeUrl.startsWith('http') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pixData.qrCodeUrl}
                          alt="QR Code PIX"
                          className="w-56 h-56 object-contain"
                        />
                      ) : (
                        <QRCodeSVG
                          value={pixData.qrCode || pixData.qrCodeUrl || ''}
                          size={224}
                          level="M"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 bg-[#69F100] text-white font-bold text-sm px-6 py-2.5 rounded-full">
                    Aguardando pagamento
                    <span className="flex gap-0.5">
                      <span
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </span>
                  </span>
                </div>

                <div className="bg-gray-50 border rounded-lg p-3 break-all text-xs text-gray-600 font-mono max-h-20 overflow-y-auto">
                  {pixData.qrCode}
                </div>

                <button
                  onClick={handleCopyPix}
                  className="w-full py-3.5 rounded-full text-white font-bold text-sm uppercase tracking-wide transition-colors bg-[#69F100] hover:bg-[#5cd400] flex items-center justify-center gap-2 shadow-md"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar código pix
                    </>
                  )}
                </button>

                <p className="text-sm text-gray-600">
                  Valor do Pix:{' '}
                  <span className="font-bold text-[#69F100]">
                    {formatPrice(pixData.amount / 100)}
                  </span>
                </p>

                <div className="text-left space-y-3">
                  <h3 className="font-bold text-sm text-gray-800">Como pagar o pix:</h3>
                  <div className="space-y-2.5">
                    {[
                      <>Clique em <strong>copiar o código PIX</strong>, logo acima</>,
                      <><strong>Acesse</strong> o app do seu banco</>,
                      <>Vá até a opção <strong>PIX</strong></>,
                      <>Escolha a opção <strong>&ldquo;COPIA E COLA&rdquo;</strong></>,
                      <><strong>Insira</strong> o código copiado e finalize seu pagamento</>,
                    ].map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#67f104] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-sm text-gray-700">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Link href="/" className="text-sm text-gray-500 underline hover:text-gray-700">
                  Voltar à loja
                </Link>
              </div>
            )}

            {/* Card success screen */}
            {currentStep === 'card-success' && (
              <div className="bg-white rounded-lg border p-6 text-center space-y-5">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="w-9 h-9 text-white" />
                </div>
                <div>
                  <h2 className="font-extrabold text-2xl text-gray-900">Pedido recebido!</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail.
                  </p>
                </div>
                <div className="text-sm text-gray-700">
                  Total:{' '}
                  <span className="font-bold">
                    {formatPrice(
                      calcInstallment(Math.round(finalTotal * 100), installments).totalCents / 100
                    )}
                  </span>
                  {installments > 1 && (
                    <>
                      {' '}
                      em {installments}x de{' '}
                      {formatPrice(
                        calcInstallment(Math.round(finalTotal * 100), installments)
                          .installmentCents / 100
                      )}
                    </>
                  )}
                </div>
                <Link
                  href="/"
                  className="block w-full py-3.5 rounded-full text-white font-bold text-sm uppercase tracking-wide bg-black text-center"
                >
                  Voltar à loja
                </Link>
              </div>
            )}
          </div>

          {/* Right: Order Summary */}
          <div className="w-full lg:w-80 order-1 lg:order-2">
            <div className="bg-white rounded-lg border p-5 sticky top-24">
              <h3 className="font-bold text-base mb-4">Resumo do pedido</h3>

              <div className="space-y-2 text-sm border-b pb-3 mb-3">
                <div className="flex justify-between">
                  <span>Produtos</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Frete ({shippingMethod === 'sedex' ? 'SEDEX' : 'PAC'})</span>
                  <span className={shippingCost === 0 ? 'font-medium text-[#67f104]' : ''}>
                    {shippingCost === 0 ? 'Grátis' : formatPrice(shippingCost)}
                  </span>
                </div>
                {pixDiscount > 0 && (
                  <div className="flex justify-between text-[#67f104]">
                    <span>Desconto Pix (5%)</span>
                    <span>-{formatPrice(pixDiscount)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-bold text-base mb-4">
                <span>Total</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>

              {/* Cart items */}
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-3 border rounded-md p-2">
                    {item.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-14 h-14 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight">{item.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {Object.values(item.selectedOptions).join(' / ')}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-bold">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                        <div className="flex items-center border rounded">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="px-1.5 py-0.5 text-gray-500 hover:text-black"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs px-2">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="px-1.5 py-0.5 text-gray-500 hover:text-black"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-100 border-t py-8 mt-8">
        <div className="container mx-auto px-4 text-center space-y-4">
          <p className="text-sm font-semibold text-gray-700">Formas de pagamento</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/bandeiras-cartoes-credito-739px.webp?v=1776300423"
            alt="Formas de pagamento"
            className="mx-auto w-[65%]"
          />
          <button
            onClick={() => setShowStoreInfo(true)}
            className="text-sm text-gray-700 underline hover:no-underline"
          >
            Informações da loja
          </button>
          <p className="text-xs text-gray-500">Parada de Ouro | Todos os direitos reservados</p>
        </div>
      </footer>

      {/* Store Info Modal */}
      {showStoreInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setShowStoreInfo(false)}
        >
          <div
            className="bg-white rounded-t-lg shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto p-6 space-y-5 mx-[10px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Informações da loja</h2>
              <button
                onClick={() => setShowStoreInfo(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div>
              <h3 className="text-gray-900 font-bold text-sm uppercase tracking-wider mb-1">
                Fale Conosco
              </h3>
              <div className="w-8 h-0.5 mb-3 bg-[#67f104]" />
              <div className="space-y-2 text-sm text-gray-500">
                <p>Atendimento: Seg à Sex. 9h30 às 18h e Sáb. 10 às 15h</p>
                <p>Contato: +55 62 99878-7917</p>
                <p>Email: contato@paradadeOuro.com</p>
              </div>
            </div>

            <div>
              <h3 className="text-gray-900 font-bold text-sm uppercase tracking-wider mb-1">
                Endereço
              </h3>
              <div className="w-8 h-0.5 mb-3 bg-[#67f104]" />
              <div className="text-sm text-gray-500 space-y-1">
                <p>Atualizar com o endereço correto da loja</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
