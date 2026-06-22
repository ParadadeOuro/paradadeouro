"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

function ThankYouContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId");

  return (
    <div className="flex-grow flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="bg-white rounded-sm border border-[#E8E0D5] shadow-xl p-12 max-w-lg w-full">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-500" strokeWidth={1.5} />
          </div>
        </div>

        <h1
          className="font-display text-3xl font-bold text-[#2C1A0E] tracking-widest uppercase mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pedido Confirmado!
        </h1>

        <p className="text-[#6B4C2A] text-sm leading-relaxed mb-2">
          Obrigado por comprar na Parada de Ouro. Seu pedido foi recebido com sucesso.
        </p>

        {orderId && (
          <p className="text-[10px] text-[#A89070] uppercase tracking-widest mb-8">
            Número do pedido:{" "}
            <span className="text-[#D4AF37] font-bold">{orderId.slice(0, 8).toUpperCase()}</span>
          </p>
        )}

        <div className="space-y-3">
          <div className="bg-[#F8F5F0] rounded-sm p-4 text-xs text-[#6B4C2A] space-y-1 text-left">
            <p>✓ Você receberá uma confirmação por e-mail em breve.</p>
            <p>✓ Seu pedido será enviado em até 3 dias úteis.</p>
            <p>✓ Acompanhe pelo rastreamento enviado por e-mail.</p>
          </div>

          <Link
            href="/catalogue"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E] font-bold text-xs uppercase tracking-widest rounded-sm transition-all duration-200"
          >
            Continuar Comprando
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <Link
            href="/"
            className="block text-xs text-[#A89070] hover:text-[#D4AF37] transition-colors"
          >
            Voltar à página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex-grow flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <ThankYouContent />
      </Suspense>
      <Footer />
    </div>
  );
}
