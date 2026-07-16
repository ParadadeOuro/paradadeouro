"use client";

import React from "react";
import Link from "next/link";
import { Star, ShieldCheck, Flame, Compass, ArrowRight } from "lucide-react";

export default function FeaturedProductBanner() {
  const imageUrl = "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/cliente_3a7d0d43-999e-4f1d-b5f6-fe09c489b351.png?v=1781103632";

  return (
    <section className="py-16 bg-white text-[#2C1A0E] border-b border-[#E8E0D5]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Left Column: Image Showcase */}
          <div className="relative aspect-square w-full max-w-md mx-auto rounded-sm overflow-hidden bg-[#F0EBE3] shadow-md border border-[#E8E0D5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Caneca Térmica Rústica"
              className="w-full h-full object-contain p-6 transition-transform duration-500 hover:scale-105"
            />
            {/* Badges */}
            <div className="absolute top-4 left-4 bg-[#D4AF37] text-white text-[10px] font-bold px-3 py-1 rounded-sm uppercase tracking-wider shadow-sm">
              Campeão de Vendas
            </div>
            
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center gap-2">
              <span className="bg-[#2C1A0E]/85 backdrop-blur-xs text-white text-[9px] font-semibold px-2.5 py-1 rounded-sm uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Flame className="w-3 h-3 text-[#D4AF37]" /> Quente por 8h
              </span>
              <span className="bg-[#2C1A0E]/85 backdrop-blur-xs text-white text-[9px] font-semibold px-2.5 py-1 rounded-sm uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Compass className="w-3 h-3 text-[#D4AF37]" /> Gelado por 18h
              </span>
            </div>
          </div>

          {/* Right Column: Copywriting & CTA */}
          <div className="flex flex-col gap-6 w-full max-w-xl mx-auto lg:mx-0 text-left">
            <div>
              <p className="text-[#A89070] text-xs uppercase tracking-[0.25em] font-bold mb-2">
                Destaque da Semana
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#2C1A0E] mb-2 leading-tight">
                Caneca Térmica Rústica — Útil Para Bebidas Geladas e Quentes
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                  ))}
                </div>
                <span className="text-[#A89070] text-xs font-semibold">
                  5.0 (148 avaliações dos clientes)
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-4 py-2 border-y border-[#E8E0D5]">
              <span className="text-3xl font-extrabold text-[#2C1A0E]">
                R$ 97,50
              </span>
              <span className="text-base text-[#A89070] line-through">
                R$ 170,00
              </span>
              <span className="text-xs bg-[#D4AF37]/10 text-[#6B4C2A] font-bold px-2 py-1 rounded-sm">
                Economize R$ 72,50
              </span>
            </div>

            <p className="text-sm text-[#6B4C2A] leading-relaxed font-light">
              Desfrute de suas bebidas na temperatura perfeita do primeiro ao último gole. Nossa Caneca Rústica conta com parede dupla de isolamento térmico a vácuo, gravação a laser gratuita do brasão do seu time favorito e de seu nome, e um design robusto exclusivo.
            </p>

            <div className="flex flex-col gap-4">
              <Link
                href="/product/caneca-homem-de-respeito-times"
                className="inline-flex items-center justify-center gap-3 w-full sm:max-w-xs py-4 bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E] font-bold text-xs uppercase tracking-widest rounded-sm transition-all duration-300 shadow-md group"
              >
                Personalizar & Comprar
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              
              <div className="flex items-center gap-2 text-xs text-[#A89070] font-medium">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span>Gravação Grátis + Garantia Parada de Ouro</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
