"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Star, ShieldCheck, Flame, Compass, ArrowRight } from "lucide-react";

export default function FeaturedProductBanner() {
  const [selectedVariant, setSelectedVariant] = useState("Brasil");

  const variants: Record<string, { image: string; title: string }> = {
    Brasil: {
      image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/limpa_Prancheta2copiar2_2500x_8f99177f-85f1-40fb-bc35-b925d3360398.webp?v=1781097894",
      title: "Bandeira do Brasil"
    },
    Americana: {
      image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/Aco_INOX_com_Parede_Dupla_6.png?v=1781098168",
      title: "Bandeira Americana"
    },
    Gatilho: {
      image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/Aco_INOX_com_Parede_Dupla_8.png?v=1781098246",
      title: "Com Dedal/Gatilho"
    }
  };

  const activeImage = variants[selectedVariant].image;

  return (
    <section className="py-16 bg-white text-[#2C1A0E] border-b border-[#E8E0D5]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Left Column: Image Showcase */}
          <div className="flex flex-col gap-6">
            <div className="relative aspect-square w-full max-w-md mx-auto rounded-sm overflow-hidden bg-[#F0EBE3] shadow-md border border-[#E8E0D5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImage}
                alt={`Caneca Rústica - ${variants[selectedVariant].title}`}
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

            {/* Selector Thumbnails */}
            <div className="flex justify-center gap-2 mt-1">
              {Object.entries(variants).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setSelectedVariant(key)}
                  className={`w-12 h-12 rounded-sm overflow-hidden border-2 transition-all duration-200 bg-[#F0EBE3] ${
                    selectedVariant === key
                      ? "border-[#D4AF37] opacity-100 scale-105"
                      : "border-transparent opacity-50 hover:opacity-100"
                  }`}
                >
                  <img src={value.image} alt={value.title} className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Copywriting & CTA */}
          <div className="flex flex-col gap-6 w-full max-w-xl mx-auto lg:mx-0 text-left">
            <div>
              <p className="text-[#A89070] text-xs uppercase tracking-[0.25em] font-bold mb-2">
                Destaque da Loja
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
                  5.0 (214 avaliações dos clientes)
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
              Desfrute de suas bebidas na temperatura ideal com estilo e robustez. Nossa Caneca Térmica Rústica conta com parede dupla e isolamento térmico a vácuo em aço inoxidável. Disponível com as gravações das bandeiras do Brasil, Americana ou na versão com dedal/gatilho.
            </p>

            {/* Custom Interactive Model Selectors */}
            <div className="flex flex-col gap-3">
              <span className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block">
                Escolha o Modelo: <span className="text-[#2C1A0E] font-bold">{variants[selectedVariant].title}</span>
              </span>
              <div className="flex gap-2">
                {Object.keys(variants).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedVariant(key)}
                    className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-sm border transition-all duration-200 cursor-pointer ${
                      selectedVariant === key
                        ? "bg-[#2C1A0E] border-[#2C1A0E] text-[#D4AF37] shadow-sm"
                        : "border-[#C8B99A] text-[#6B4C2A] hover:border-[#2C1A0E] hover:text-[#2C1A0E]"
                    }`}
                  >
                    {key === "Gatilho" ? "Dedal / Gatilho" : key}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-2">
              <Link
                href="/product/caneca-rustica"
                className="inline-flex items-center justify-center gap-3 w-full sm:max-w-xs py-4 bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E] font-bold text-xs uppercase tracking-widest rounded-sm transition-all duration-300 shadow-md group"
              >
                Personalizar & Comprar
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              
              <div className="flex items-center gap-2 text-xs text-[#A89070] font-medium">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span>Gravação Permanente + Garantia Parada de Ouro</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
