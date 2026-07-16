'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
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
  ShoppingBag,
} from 'lucide-react';
import { buildCsvUrl, parseCatalogueProducts, CatalogueProduct } from '@/lib/catalogueParser';
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
  const { state, total, updateQuantity, clearCart, addItem } = useCart();
  const items = state.items;
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<Step>(1);

  const completedSteps = useMemo(() => {
    if (currentStep === 1) return 1;
    if (currentStep === 2) return 2;
    if (currentStep === 3) return 3;
    return 4;
  }, [currentStep]);

  // ── Order Bump: fetch 'Outros' products ────────────────────────────────
  const [bumpProducts, setBumpProducts] = useState<CatalogueProduct[]>([]);
  const [bumpAdded, setBumpAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const url = buildCsvUrl();
    if (!url) return;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        const all = parseCatalogueProducts(text);
        const outros = all
          .filter((p) => p.type?.toLowerCase() === 'outros' && p.handle !== 'produto-teste-001')
          .slice(0, 6);
        setBumpProducts(outros);
      })
      .catch(() => {});
  }, []);

  const handleBumpAdd = (p: CatalogueProduct) => {
    addItem({
      handle: p.handle,
      title: p.title,
      image: p.image,
      selectedOptions: {},
      price: parseFloat(p.price) || 0,
    });
    setBumpAdded((prev) => ({ ...prev, [p.handle]: true }));
    setTimeout(() => setBumpAdded((prev) => ({ ...prev, [p.handle]: false })), 2000);
  };
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const [showStoreInfo, setShowStoreInfo] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
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
          .eq('external_ref', createdOrderId)
          .single();
        if (data?.status === 'PAID' || data?.status === 'approved') {
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
  const [pagouElements, setPagouElements] = useState<any>(null);
  const [installments, setInstallments] = useState(1);
  const [cardLoading, setCardLoading] = useState(false);
  const [externalRef, setExternalRef] = useState<string>('');

  useEffect(() => {
    if (currentStep === 3 && paymentMethod === 'card' && !pagouElements && typeof window !== 'undefined') {
      const initPagou = () => {
        // @ts-ignore
        if (!window.Pagou) return;
        
        const pk = process.env.NEXT_PUBLIC_PAGOUAI_PUBLIC_KEY;
        
        if (!pk || pk === "COLOQUE_SUA_CHAVE_PUBLICA_AQUI") {
          console.warn("Chave pública da Pagou.ai não configurada.");
          toast.error("Configuração de pagamento incompleta (Chave Pública ausente).");
          return;
        }

        try {
          // @ts-ignore
          const elements = window.Pagou.elements({
            publicKey: pk,
            locale: "pt-BR",
            origin: window.location.origin,
          });
          
          const cardElement = elements.create("card", { theme: "default" });
          cardElement.mount("#card-element");
          setPagouElements(elements);
        } catch (e) {
          console.error("Erro ao inicializar Pagou SDK:", e);
        }
      };

      // @ts-ignore
      if (window.Pagou) {
        initPagou();
      } else {
        const interval = setInterval(() => {
          // @ts-ignore
          if (window.Pagou) {
            initPagou();
            clearInterval(interval);
          }
        }, 500);
        return () => clearInterval(interval);
      }
    }
  }, [currentStep, paymentMethod, pagouElements]);

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
      let currentExternalRef = externalRef;
      if (!currentExternalRef) {
        currentExternalRef = crypto.randomUUID();
        setExternalRef(currentExternalRef);
      }

      const response = await fetch('/api/checkout/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(finalTotal * 100),
          description: "Pedido Parada de Ouro",
          externalRef: currentExternalRef,
          payer: {
            name: form.name,
            email: form.email,
            phone: phoneDigitsClean,
            taxId: cpfDigits,
          },
          items: items.map((i) => ({
            name: i.title,
            quantity: i.quantity,
            price: Math.round(i.price * 100),
            type: "PHYSICAL",
          })),
          delivery: {
            fee: Math.round(shippingCost * 100),
            address: {
              line1: form.address,
              city: form.city,
              state: form.state,
              zipCode: form.cep.replace(/\D/g, ''),
              country: "BR"
            }
          }
        }),
      });

      let data: any = null;
      let error: any = null;

      try {
        data = await response.json();
        if (!response.ok) {
          error = { message: data.error || 'Erro ao gerar PIX' };
        }
      } catch (err) {
        error = { message: 'Erro ao conectar com a API de pagamento' };
      }

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
      const orderId = currentExternalRef;
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

      await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalRef: currentExternalRef,
          items: items.map(item => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
            options: item.selectedOptions
          })),
          amount: Math.round(finalTotal * 100),
          payer: {
            name: form.name,
            email: form.email,
            phone: phoneDigitsClean,
            document: cpfDigits,
          },
          delivery: {
            fee: Math.round(shippingCost * 100),
            address: {
              line1: `${form.address}, ${form.number}`,
              city: form.city,
              state: form.state,
              zipCode: form.cep.replace(/\D/g, ''),
              country: 'BR'
            }
          },
          paymentMethod: 'pix'
        })
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

  const handleCardPayment = async () => {
    if (!pagouElements) {
      toast.error('Pagamento indisponível. Verifique as configurações (chave pública).');
      return;
    }
    
    setCardLoading(true);
    
    // Generate UUID if we haven't already
    let currentExternalRef = externalRef;
    if (!currentExternalRef) {
      currentExternalRef = crypto.randomUUID();
      setExternalRef(currentExternalRef);
    }
    
    try {
      // 1. Create order in Supabase via api/checkout/create-order
      const orderRes = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalRef: currentExternalRef,
          items: items.map(item => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
            options: item.selectedOptions
          })),
          amount: Math.round(finalTotal * 100), // in cents
          payer: {
            name: form.name,
            email: form.email,
            phone: form.phone.replace(/\D/g, ''),
            document: form.cpf.replace(/\D/g, ''),
          },
          delivery: {
            fee: Math.round(shippingCost * 100),
            address: {
              line1: `${form.address}, ${form.number}`,
              city: form.city,
              state: form.state,
              zipCode: form.cep.replace(/\D/g, ''),
              country: 'BR'
            }
          },
          paymentMethod: 'card'
        })
      });
      
      const orderData = await orderRes.json();
      
      if (!orderRes.ok) {
        throw new Error(orderData.error || 'Erro ao salvar pedido.');
      }
      
      const dbOrderId = orderData.orderId;
      setCreatedOrderId(dbOrderId);
      
      // 2. Submit via Pagou Elements SDK to tokenize and call our API
      const result = await pagouElements.submit({
        createTransaction: async (tokenData: any) => {
          const paymentRes = await fetch('/api/checkout/create-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(finalTotal * 100),
              externalRef: currentExternalRef,
              installments: installments,
              payer: {
                name: form.name,
                email: form.email,
                document: form.cpf.replace(/\D/g, ''),
              },
              items: items.map(i => ({
                title: i.title,
                quantity: i.quantity,
                unit_price: Math.round(i.price * 100)
              })),
              token: tokenData.token
            })
          });
          
          const paymentData = await paymentRes.json();
          
          if (!paymentRes.ok) {
            throw new Error(paymentData.error || 'Erro ao processar cartão.');
          }
          
          return paymentData.data ?? paymentData;
        }
      });
      
      // Clear cart
      clearCart();
      setCurrentStep('card-success');
      toast.success('Pedido processado com sucesso!');
      
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro inesperado ao processar cartão.');
    } finally {
      setCardLoading(false);
    }
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-offwhite p-4">
        <p className="text-lg text-brand-charcoal/60 mb-4 font-sans font-light">Seu carrinho está vazio</p>
        <Link href="/" className="text-brand-gold hover:text-brand-tan underline uppercase tracking-wider text-xs font-bold transition-colors">
          Voltar à loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-offwhite text-brand-charcoal flex flex-col font-sans animate-in fade-in duration-500">
      <Script src="https://js.pagou.ai/payments/v3.js" strategy="lazyOnload" />
      <Toaster richColors position="top-right" />

      {/* Header */}
      <header className="bg-brand-brown text-brand-offwhite border-b border-brand-tan/10 py-4 shadow-md">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.png"
              alt="Parada de Ouro"
              className="h-10 sm:h-12 w-auto object-contain cursor-pointer transition-transform hover:scale-105 duration-300"
            />
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="/pagamento-seguro.png" 
            alt="Pagamento 100% Seguro" 
            className="h-7 opacity-90 filter brightness-110" 
          />
        </div>
      </header>

      {/* Promo banner */}
      <div className="bg-[#1a0f08] border-b border-brand-gold/10 text-brand-offwhite/90 py-2.5 text-xs sm:text-sm font-semibold">
        <div className="container mx-auto px-4 flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>⭐</span>
            <span>
              Oferta expira em{' '}
              <span className="text-brand-gold font-bold tabular-nums">
                {mm}:{ss}
              </span>
            </span>
          </span>
          <span className="text-brand-gold/20">•</span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-brand-gold" />
            <span>Checkout 100% seguro</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
          {/* Left: Steps */}
          <div className="flex-1 space-y-4 order-2 lg:order-1">
            {/* Step 1: Identificação */}
            <div className={`bg-white rounded-sm border border-brand-tan/15 p-6 shadow-sm transition-opacity duration-300 ${currentStep !== 1 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tracking-tighter ${
                      stepNum >= 1 
                        ? 'text-brand-brown bg-brand-gold' 
                        : 'bg-brand-offwhite border border-brand-tan/20 text-brand-charcoal/40'
                    }`}
                  >
                    1
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wider text-brand-brown">Identificação</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-charcoal/40 tracking-wider font-semibold">1 DE 3</span>
                  {currentStep !== 1 && (
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="text-brand-tan hover:text-brand-brown transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-brand-charcoal/60 mb-6 ml-8 font-light">
                Preencha seus dados para envio do pedido.
              </p>

              {currentStep === 1 && (
                <div className="space-y-4 ml-0 sm:ml-8 animate-in fade-in duration-300">
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Nome completo</label>
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="Digite seu nome completo"
                      className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        updateField('email', e.target.value.trim().toLowerCase())
                      }
                      placeholder="Digite seu e-mail"
                      className={`w-full border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 bg-brand-offwhite/5 transition-all ${
                        emailError 
                          ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : 'border-brand-tan/20 focus:ring-brand-gold focus:border-brand-gold'
                      }`}
                    />
                    {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">CPF</label>
                    <input
                      value={form.cpf}
                      onChange={(e) => updateField('cpf', formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className={`w-full border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 bg-brand-offwhite/5 max-w-[220px] transition-all ${
                        cpfError 
                          ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : 'border-brand-tan/20 focus:ring-brand-gold focus:border-brand-gold'
                      }`}
                    />
                    {cpfError && <p className="text-xs text-red-500 mt-1">{cpfError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Celular/Whatsapp</label>
                    <div className="flex items-center gap-2 max-w-[260px]">
                      <span className="text-sm text-brand-charcoal/60 border border-brand-tan/20 rounded-sm px-3 py-2.5 bg-brand-offwhite/20 select-none">
                        +55
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={form.phone}
                        onChange={(e) => updateField('phone', formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className={`flex-1 border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 bg-brand-offwhite/5 transition-all ${
                          phoneError 
                            ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                            : 'border-brand-tan/20 focus:ring-brand-gold focus:border-brand-gold'
                        }`}
                      />
                    </div>
                    {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                  </div>

                  <button
                    onClick={() => canGoStep2 && setCurrentStep(2)}
                    disabled={!canGoStep2}
                    className="w-full py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan disabled:bg-brand-tan/30 disabled:text-brand-brown/40 font-bold text-xs uppercase tracking-widest disabled:cursor-not-allowed transition-all duration-300 shadow-sm cursor-pointer mt-6"
                  >
                    Ir Para Entrega
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Entrega */}
            <div className={`bg-white rounded-sm border border-brand-tan/15 p-6 shadow-sm transition-opacity duration-300 ${currentStep !== 2 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tracking-tighter ${
                      stepNum >= 2 
                        ? 'text-brand-brown bg-brand-gold' 
                        : 'bg-brand-offwhite border border-brand-tan/20 text-brand-charcoal/40'
                    }`}
                  >
                    2
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wider text-brand-brown">Entrega</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-charcoal/40 tracking-wider font-semibold">2 DE 3</span>
                  {currentStep !== 2 && stepNum > 2 && (
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-brand-tan hover:text-brand-brown transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-brand-charcoal/60 mb-6 ml-8 font-light">
                Preencha seus dados para continuar
              </p>

              {currentStep === 2 && (
                <div className="space-y-4 ml-0 sm:ml-8 animate-in fade-in duration-300">
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">CEP</label>
                    <input
                      value={form.cep}
                      onChange={(e) => {
                        updateField('cep', e.target.value);
                        const clean = e.target.value.replace(/\D/g, '');
                        if (clean.length === 8) fetchAddressByCep(e.target.value);
                      }}
                      placeholder="00000-000"
                      className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 max-w-[200px] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Endereço</label>
                    <input
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="Rua, Avenida..."
                      className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">N°</label>
                      <input
                        value={form.number}
                        onChange={(e) => updateField('number', e.target.value)}
                        className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Bairro</label>
                      <input
                        value={form.neighborhood}
                        onChange={(e) => updateField('neighborhood', e.target.value)}
                        className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Cidade</label>
                      <input
                        value={form.city}
                        onChange={(e) => updateField('city', e.target.value)}
                        className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">Estado</label>
                      <input
                        value={form.state}
                        onChange={(e) => updateField('state', e.target.value)}
                        maxLength={2}
                        className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1.5">
                      Complemento (Opcional)
                    </label>
                    <input
                      value={form.complement}
                      onChange={(e) => updateField('complement', e.target.value)}
                      className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-brand-offwhite/5 transition-all"
                    />
                  </div>

                  {/* Frete */}
                  <div className="space-y-3 pt-2">
                    <p className="text-xs font-bold text-brand-brown uppercase tracking-wider mb-2">Escolha o frete:</p>

                    {/* PAC */}
                    <button
                      onClick={() => setShippingMethod('pac')}
                      className={`w-full flex items-center justify-between border rounded-sm p-4 transition-all duration-300 cursor-pointer ${
                        shippingMethod === 'pac' 
                          ? 'border-brand-gold bg-brand-gold/5 shadow-sm' 
                          : 'border-brand-tan/15 hover:border-brand-tan/30 bg-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            shippingMethod === 'pac' ? 'border-brand-gold' : 'border-brand-tan/30'
                          }`}
                        >
                          {shippingMethod === 'pac' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-brand-gold" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm text-brand-brown">PAC - Correios</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-brand-charcoal/50">5 a 7 dias úteis</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/pac-correios-logo.png"
                              alt="PAC"
                              className="h-4 object-contain opacity-70"
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-brand-tan">Grátis</span>
                    </button>

                    {/* SEDEX */}
                    <button
                      onClick={() => setShippingMethod('sedex')}
                      className={`w-full flex items-center justify-between border rounded-sm p-4 transition-all duration-300 cursor-pointer ${
                        shippingMethod === 'sedex' 
                          ? 'border-brand-gold bg-brand-gold/5 shadow-sm' 
                          : 'border-brand-tan/15 hover:border-brand-tan/30 bg-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            shippingMethod === 'sedex' ? 'border-brand-gold' : 'border-brand-tan/30'
                          }`}
                        >
                          {shippingMethod === 'sedex' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-brand-gold" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm text-brand-brown">SEDEX</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-brand-charcoal/50">1 a 3 dias úteis</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/sedex-logo.webp"
                              alt="SEDEX"
                              className="h-4 object-contain opacity-70"
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-brand-brown">R$ 9,79</span>
                    </button>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="flex items-center gap-1 text-xs uppercase tracking-wider font-bold text-brand-tan hover:text-brand-brown transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> Voltar
                    </button>
                    <button
                      onClick={() => canGoStep3 && setCurrentStep(3)}
                      disabled={!canGoStep3}
                      className="flex-1 py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan disabled:bg-brand-tan/30 disabled:text-brand-brown/40 font-bold text-xs uppercase tracking-widest disabled:cursor-not-allowed transition-all duration-300 shadow-sm cursor-pointer"
                    >
                      Ir Para Pagamento
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Pagamento */}
            <div className={`bg-white rounded-sm border border-brand-tan/15 p-6 shadow-sm transition-opacity duration-300 ${currentStep !== 3 ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tracking-tighter ${
                      stepNum >= 3 
                        ? 'text-brand-brown bg-brand-gold' 
                        : 'bg-brand-offwhite border border-brand-tan/20 text-brand-charcoal/40'
                    }`}
                  >
                    3
                  </span>
                  <h2 className="font-bold text-base uppercase tracking-wider text-brand-brown">Pagamento</h2>
                </div>
                <span className="text-xs text-brand-charcoal/40 tracking-wider font-semibold">3 DE 3</span>
              </div>
              <p className="text-xs text-brand-charcoal/60 mb-6 ml-8 font-light">
                Preencha os dados de entrega para continuar
              </p>

              {currentStep === 3 && (
                <div className="space-y-5 ml-0 sm:ml-8 animate-in fade-in duration-300">
                  {/* Payment Method Tabs */}
                  <div className="flex bg-brand-offwhite/50 border border-brand-tan/20 rounded-sm p-1">
                    <button
                      onClick={() => setPaymentMethod('pix')}
                      className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all duration-300 ${
                        paymentMethod === 'pix'
                          ? 'bg-white shadow-sm text-brand-brown'
                          : 'text-brand-charcoal/50 hover:text-brand-charcoal/80'
                      }`}
                    >
                      PIX (-5%)
                    </button>
                    <button
                      onClick={() => setPaymentMethod('card')}
                      className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all duration-300 ${
                        paymentMethod === 'card'
                          ? 'bg-white shadow-sm text-brand-brown'
                          : 'text-brand-charcoal/50 hover:text-brand-charcoal/80'
                      }`}
                    >
                      Cartão
                    </button>
                  </div>

                  {paymentMethod === 'pix' && (
                    <>
                      <div className="relative border rounded-sm p-5 border-brand-gold bg-brand-gold/5 shadow-sm animate-in zoom-in-95 duration-300">
                        <span className="absolute -top-2 right-3 text-brand-brown text-[9px] tracking-wider uppercase font-bold px-2 py-0.5 rounded-sm bg-brand-gold shadow-sm">
                          5% OFF
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 flex items-center justify-center bg-white rounded-sm p-1 border border-brand-tan/10 shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/logo-pix.png?v=1776298269"
                              alt="PIX"
                              className="w-8 h-8 object-contain"
                            />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-brand-brown">PIX</p>
                            <p className="text-xs font-semibold text-emerald-700 animate-pulse">
                              Aprovação imediata · 5% de desconto
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-brand-tan/10 space-y-2">
                          <p className="text-[11px] text-brand-charcoal/60 leading-relaxed font-light">
                            O código Pix expira em 30 minutos após finalizar a compra.
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-brand-brown">Valor no Pix:</p>
                            <div className="text-right">
                              <span className="font-extrabold text-sm text-brand-brown">
                                {formatPrice(finalTotal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleGeneratePix}
                        disabled={pixLoading}
                        className="w-full py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan font-extrabold text-xs uppercase tracking-widest transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md mt-4"
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
                      <div className="border border-brand-tan/15 rounded-sm p-5 space-y-4">
                        <div id="card-element" className="min-h-[60px] bg-white border border-brand-tan/20 rounded-sm p-3"></div>
                        <div>
                          <label className="block text-xs font-semibold text-brand-brown uppercase tracking-wider mb-1">Parcelamento</label>
                          <select
                            value={installments}
                            onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                            className="w-full border border-brand-tan/20 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold focus:border-brand-gold bg-white"
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
                          <p className="text-[11px] text-brand-tan font-semibold mt-1">Até 3x sem juros!</p>
                        </div>
                      </div>

                      <button
                        onClick={handleCardPayment}
                        disabled={cardLoading || !pagouElements}
                        className="w-full py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan font-extrabold text-xs uppercase tracking-widest transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md mt-4"
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
              <div className="bg-white rounded-sm border border-brand-tan/15 p-8 text-center space-y-6 shadow-md animate-in fade-in zoom-in-95 duration-500">
                <div>
                  <h2 className="font-display font-semibold text-2xl text-brand-brown">Já é quase seu...</h2>
                  <p className="text-xs text-brand-charcoal/60 mt-1 font-light">
                    Pague seu Pix dentro de 30 minutos para garantir sua compra.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/pix-checkout.png?v=1776317496"
                    alt="Pix checkout"
                    className="mx-auto h-auto w-[70%] max-w-[280px] opacity-90"
                    loading="lazy"
                  />
                  <p className="text-sm font-semibold text-brand-tan animate-pulse">
                    Aponte a câmera do seu celular
                  </p>
                  <div className="flex justify-center">
                    <div className="bg-white border border-brand-tan/15 rounded-sm p-4 inline-block shadow-sm">
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
                  <span className="inline-flex items-center gap-2 bg-brand-gold text-brand-brown font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded-full shadow-sm">
                    Aguardando pagamento
                    <span className="flex gap-0.5">
                      <span
                        className="w-1.5 h-1.5 bg-brand-brown rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-brand-brown rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-brand-brown rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </span>
                  </span>
                </div>

                <div className="bg-brand-offwhite/50 border border-brand-tan/10 rounded-sm p-3 break-all text-xs text-brand-charcoal/80 font-mono max-h-20 overflow-y-auto">
                  {pixData.qrCode}
                </div>

                <button
                  onClick={handleCopyPix}
                  className="w-full py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan font-bold text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
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

                <p className="text-sm text-brand-charcoal">
                  Valor do Pix:{' '}
                  <span className="font-extrabold text-brand-brown">
                    {formatPrice(pixData.amount / 100)}
                  </span>
                </p>

                <div className="text-left space-y-4 pt-4 border-t border-brand-tan/10 animate-in slide-in-from-bottom duration-500">
                  <h3 className="font-bold text-sm text-brand-brown uppercase tracking-wider">Como pagar o Pix:</h3>
                  <div className="space-y-3">
                    {[
                      <>Clique em <strong>copiar o código PIX</strong> acima</>,
                      <><strong>Acesse</strong> o app do seu banco preferido</>,
                      <>Vá na área de <strong>PIX</strong></>,
                      <>Escolha a opção <strong>&ldquo;Copia e Cola&rdquo;</strong></>,
                      <><strong>Insira</strong> o código copiado e confirme o pagamento</>,
                    ].map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-brown text-brand-offwhite text-xs font-bold flex items-center justify-center mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-xs sm:text-sm text-brand-charcoal/80 leading-relaxed font-light">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Link href="/" className="inline-block text-xs uppercase tracking-wider font-bold text-brand-tan hover:text-brand-brown transition-colors underline pt-2">
                  Voltar à loja
                </Link>
              </div>
            )}

            {/* Card success screen */}
            {currentStep === 'card-success' && (
              <div className="bg-white rounded-sm border border-brand-tan/15 p-8 text-center space-y-5 shadow-md animate-in zoom-in-95 duration-500">
                <div className="mx-auto w-16 h-16 rounded-full bg-brand-gold flex items-center justify-center shadow-inner">
                  <Check className="w-8 h-8 text-brand-brown" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-2xl text-brand-brown">Pedido recebido!</h2>
                  <p className="text-xs text-brand-charcoal/60 mt-1 font-light">
                    Seu pagamento está sendo processado. Você receberá uma confirmação por e-mail em instantes.
                  </p>
                </div>
                <div className="text-sm text-brand-charcoal pt-2">
                  Total:{' '}
                  <span className="font-extrabold text-brand-brown">
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
                  className="block w-full py-4 rounded-sm text-brand-brown bg-brand-gold hover:bg-brand-tan text-center font-bold text-xs uppercase tracking-widest transition-all duration-300 shadow-sm cursor-pointer mt-4"
                >
                  Voltar à loja
                </Link>
              </div>
            )}
          </div>

          {/* Right: Order Summary */}
          <div className="w-full lg:w-80 order-1 lg:order-2">
            <div className="sticky top-24 space-y-4">
              <div className="bg-white rounded-sm border border-brand-tan/15 p-6 shadow-sm">
                <h3 className="font-bold text-sm text-brand-brown uppercase tracking-wider mb-4">Resumo do pedido</h3>

                <div className="space-y-3 text-xs text-brand-charcoal/80 border-b border-brand-tan/10 pb-4 mb-4 font-light">
                  <div className="flex justify-between">
                    <span>Produtos</span>
                    <span className="font-semibold text-brand-brown">{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Frete ({shippingMethod === 'sedex' ? 'SEDEX' : 'PAC'})</span>
                    <span className={shippingCost === 0 ? 'font-semibold text-brand-tan' : 'font-semibold text-brand-brown'}>
                      {shippingCost === 0 ? 'Grátis' : formatPrice(shippingCost)}
                    </span>
                  </div>
                  {pixDiscount > 0 && (
                    <div className="flex justify-between text-brand-tan font-semibold">
                      <span>Desconto Pix (5%)</span>
                      <span>-{formatPrice(pixDiscount)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-bold text-base text-brand-brown mb-6">
                  <span>Total</span>
                  <span className="font-extrabold">{formatPrice(finalTotal)}</span>
                </div>

                {/* Cart items */}
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-3 border border-brand-tan/10 rounded-sm p-3 bg-brand-offwhite/10 hover:bg-brand-offwhite/20 transition-all duration-300">
                      {item.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-12 h-12 rounded-sm object-cover border border-brand-tan/10 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-brand-brown leading-tight truncate">{item.title}</p>
                        <p className="text-[10px] text-brand-charcoal/50 mt-0.5">
                          {Object.values(item.selectedOptions).join(' / ')}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-bold text-brand-brown">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                          <div className="flex items-center border border-brand-tan/20 rounded-sm bg-white overflow-hidden">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="px-1.5 py-1 text-brand-charcoal/50 hover:text-brand-brown hover:bg-brand-offwhite transition-colors cursor-pointer animate-press"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs px-2 font-semibold text-brand-brown">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="px-1.5 py-1 text-brand-charcoal/50 hover:text-brand-brown hover:bg-brand-offwhite transition-colors cursor-pointer animate-press"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Order Bump ────────────────────────────────────── */}
                {bumpProducts.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-brand-tan/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-tan mb-3">
                      ✨ Você também pode gostar
                    </p>
                    <div className="space-y-2">
                      {bumpProducts.map((p) => (
                        <div
                          key={p.handle}
                          className="flex items-center gap-3 border border-brand-tan/10 rounded-sm p-2.5 bg-brand-offwhite/10 hover:bg-brand-offwhite/25 transition-all duration-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.image}
                            alt={p.title}
                            className="w-10 h-10 rounded-sm object-cover border border-brand-tan/10 shrink-0"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-brand-brown leading-tight truncate">{p.title}</p>
                            <p className="text-[10px] text-brand-tan font-bold mt-0.5">
                              {p.price ? `R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => handleBumpAdd(p)}
                            className={`shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-sm transition-all duration-200 cursor-pointer ${
                              bumpAdded[p.handle]
                                ? 'bg-brand-tan text-white'
                                : 'bg-brand-gold text-brand-brown hover:bg-brand-tan hover:text-white'
                            }`}
                          >
                            {bumpAdded[p.handle] ? (
                              <><Check className="w-2.5 h-2.5" /> Adicionado</>
                            ) : (
                              <><ShoppingBag className="w-2.5 h-2.5" /> Add</>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Barra de Progresso do Checkout (Azul da Paleta) */}
              <div className="bg-white rounded-sm border border-brand-tan/15 p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-brand-brown uppercase tracking-wider">Progresso da Compra</span>
                  <span className="text-[10px] font-bold text-promo-babyblue">{completedSteps * 25}% concluído</span>
                </div>
                
                <div className="relative flex items-center justify-between w-full">
                  {/* Linha de fundo */}
                  <div className="absolute left-[12.5%] right-[12.5%] top-3.5 h-0.5 bg-brand-offwhite border-b border-brand-tan/10 -translate-y-1/2 z-0" />
                  
                  {/* Linha ativa */}
                  <div 
                    className="absolute left-[12.5%] top-3.5 h-0.5 bg-promo-babyblue -translate-y-1/2 z-0 transition-all duration-500 ease-in-out"
                    style={{ width: `${(completedSteps - 1) * 25}%` }}
                  />

                  {[
                    { label: "Produtos", num: 1 },
                    { label: "Identificação", num: 2 },
                    { label: "Entrega", num: 3 },
                    { label: "Pagamento", num: 4 }
                  ].map((s) => {
                    const isDone = completedSteps >= s.num;
                    return (
                      <div key={s.num} className="relative z-10 flex flex-col items-center flex-1">
                        <div 
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all duration-300 ${
                            isDone 
                              ? "bg-promo-babyblue border-promo-babyblue text-white" 
                              : "bg-white border-brand-tan/20 text-brand-charcoal/40"
                          }`}
                        >
                          {isDone ? (
                            <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
                          ) : (
                            <span>{s.num}</span>
                          )}
                        </div>
                        <span className={`text-[8px] sm:text-[9px] uppercase font-bold tracking-wider mt-1.5 text-center transition-colors duration-300 ${
                          isDone ? "text-brand-brown" : "text-brand-charcoal/40"
                        }`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-brand-charcoal text-brand-offwhite/85 border-t border-brand-offwhite/5 py-10 mt-12 font-sans">
        <div className="container mx-auto px-4 text-center space-y-6">
          <div>
            <p className="text-xs tracking-[0.2em] font-bold text-brand-gold uppercase mb-3">Formas de pagamento</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.shopify.com/s/files/1/0715/5292/5807/files/bandeiras-cartoes-credito-739px.webp?v=1776300423"
              alt="Formas de pagamento"
              className="mx-auto w-full max-w-[400px] opacity-80 filter brightness-90 saturate-50"
            />
          </div>
          <div>
            <button
              onClick={() => setShowStoreInfo(true)}
              className="text-xs tracking-widest font-bold text-brand-gold hover:text-brand-tan uppercase transition-colors cursor-pointer"
            >
              Informações da loja
            </button>
          </div>
          <p className="text-[10px] text-brand-offwhite/40 tracking-wider font-light">
            &copy; {new Date().getFullYear()} Parada de Ouro | Todos os direitos reservados
          </p>
        </div>
      </footer>

      {/* Store Info Modal */}
      {showStoreInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-brown/60 backdrop-blur-sm"
          onClick={() => setShowStoreInfo(false)}
        >
          <div
            className="bg-brand-brown border border-brand-gold/15 rounded-t-sm shadow-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-8 space-y-6 mx-[10px] text-brand-offwhite animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-brand-gold/10 font-sans">
              <h2 className="font-semibold text-lg text-brand-gold">Informações da loja</h2>
              <button
                onClick={() => setShowStoreInfo(false)}
                className="text-brand-gold hover:text-brand-tan text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-brand-gold font-bold text-xs uppercase tracking-widest">
                Fale Conosco
              </h3>
              <div className="w-8 h-0.5 bg-brand-gold mb-3" />
              <div className="space-y-2 text-xs text-brand-offwhite/70 leading-relaxed font-light">
                <p>Atendimento: Seg à Sex. 9h30 às 18h e Sáb. 10 às 15h</p>
                <p>Contato: +55 62 99878-7917</p>
                <p>Email: contato@paradadeOuro.com</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-brand-gold font-bold text-xs uppercase tracking-widest">
                Endereço
              </h3>
              <div className="w-8 h-0.5 bg-brand-gold mb-3" />
              <div className="text-xs text-brand-offwhite/70 leading-relaxed font-light">
                <p>Atualizar com o endereço correto da loja</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
