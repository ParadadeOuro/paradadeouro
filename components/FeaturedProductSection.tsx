"use client";

import { useState, useEffect } from "react";
import { Star, ShoppingBag, Check, ShieldCheck, Flame, Compass } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cartStore";

interface Variant {
  model: string;
  color: string;
  image: string;
}

const variants: Variant[] = [
  {
    model: "Flamengo",
    color: "PRETA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/cliente_3a7d0d43-999e-4f1d-b5f6-fe09c489b351.png?v=1781103632",
  },
  {
    model: "Flamengo",
    color: "BRANCA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/flbranco.png?v=1781098804",
  },
  {
    model: "Vasco",
    color: "PRETA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/vaspreto.png?v=1781098806",
  },
  {
    model: "Vasco",
    color: "BRANCA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/vasbranco.png?v=1781098804",
  },
  {
    model: "Corinthians",
    color: "PRETA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/corinpreto.png?v=1781098804",
  },
  {
    model: "Corinthians",
    color: "BRANCA",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/corinbranco.png?v=1781098805",
  },
];

const models = ["Flamengo", "Vasco", "Corinthians"];
const colors = ["PRETA", "BRANCA"];

export default function FeaturedProductSection() {
  const { addItem } = useCart();
  const [selectedModel, setSelectedModel] = useState("Flamengo");
  const [selectedColor, setSelectedColor] = useState("PRETA");
  const [engravingText, setEngravingText] = useState("");
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState("");

  // Update active image when model/color selections change
  useEffect(() => {
    const matched = variants.find(
      (v) => v.model === selectedModel && v.color === selectedColor
    );
    if (matched) {
      setActiveImage(matched.image);
    }
  }, [selectedModel, selectedColor]);

  const handleAddToCart = () => {
    const options: Record<string, string> = {
      Modelos: selectedModel,
      "Escolha a cor": selectedColor,
    };
    if (engravingText.trim()) {
      options["Texto para gravação"] = engravingText.trim();
    }

    addItem({
      handle: "caneca-homem-de-respeito-times",
      title: "Caneca Térmica Rústica - ESCOLHA AQUI Seu Time",
      image: activeImage,
      selectedOptions: options,
      price: 97.50,
    });

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <section className="py-24 bg-white text-[#2C1A0E] border-b border-[#E8E0D5]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Image Display */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-square w-full max-w-lg mx-auto rounded-sm overflow-hidden bg-[#F8F5F0] shadow-md border border-[#E8E0D5]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeImage}
                  src={activeImage}
                  alt={`Caneca Rústica ${selectedModel}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full object-cover"
                />
              </AnimatePresence>

              {/* Tag/Badges */}
              <div className="absolute top-4 left-4 bg-[#D4AF37] text-white text-[10px] font-bold px-3 py-1 rounded-sm uppercase tracking-wider shadow-sm">
                Gravação Grátis
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center gap-2">
                <span className="bg-[#2C1A0E]/80 backdrop-blur-xs text-white text-[9px] font-semibold px-2 py-1 rounded-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3 h-3 text-[#D4AF37]" /> Quente por 8h
                </span>
                <span className="bg-[#2C1A0E]/80 backdrop-blur-xs text-white text-[9px] font-semibold px-2 py-1 rounded-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="w-3 h-3 text-[#D4AF37]" /> Gelado por 18h
                </span>
              </div>
            </div>

            {/* Micro Thumbnails */}
            <div className="flex justify-center gap-2 mt-2">
              {variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedModel(v.model);
                    setSelectedColor(v.color);
                  }}
                  className={`w-12 h-12 rounded-sm overflow-hidden border-2 transition-all duration-200 ${
                    selectedModel === v.model && selectedColor === v.color
                      ? "border-[#D4AF37] opacity-100 scale-105"
                      : "border-transparent opacity-50 hover:opacity-100"
                  }`}
                >
                  <img src={v.image} alt={v.model} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Details & Adding to Cart */}
          <div className="flex flex-col gap-6 w-full max-w-xl mx-auto lg:mx-0">
            {/* Header info */}
            <div>
              <p className="text-[#A89070] text-xs uppercase tracking-[0.2em] font-semibold mb-1">
                Destaque Especial
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#2C1A0E] mb-2 leading-tight">
                Caneca Térmica Rústica
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                  ))}
                </div>
                <span className="text-[#A89070] text-xs font-medium">
                  5.0 (148 avaliações dos clientes)
                </span>
              </div>
            </div>

            {/* Price section */}
            <div className="flex items-baseline gap-4 py-2 border-y border-[#E8E0D5]">
              <span className="text-3xl font-bold text-[#2C1A0E]">
                R$ 97,50
              </span>
              <span className="text-base text-[#A89070] line-through">
                R$ 170,00
              </span>
              <span className="text-xs bg-[#D4AF37]/15 text-[#6B4C2A] font-bold px-2 py-0.5 rounded-sm">
                Economize R$ 72,50
              </span>
            </div>

            {/* Short specs list */}
            <p className="text-sm text-[#6B4C2A] leading-relaxed font-light">
              Construída com parede dupla de aço inoxidável e isolamento a vácuo, a Caneca Térmica Rústica garante sua bebida gelada ou quente até o último gole. Escolha o brasão do seu time e personalize com seu nome gravado a laser sem custos adicionais.
            </p>

            {/* Product Configuration Options */}
            <div className="flex flex-col gap-5">
              {/* Option 1: Times/Modelos */}
              <div>
                <span className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block mb-2.5">
                  Time / Modelo: <span className="text-[#2C1A0E] font-bold">{selectedModel}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {models.map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedModel(m)}
                      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-sm border transition-all duration-200 cursor-pointer ${
                        selectedModel === m
                          ? "bg-[#2C1A0E] border-[#2C1A0E] text-[#D4AF37] shadow-sm"
                          : "border-[#C8B99A] text-[#6B4C2A] hover:border-[#2C1A0E] hover:text-[#2C1A0E]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 2: Cores */}
              <div>
                <span className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block mb-2.5">
                  Cor: <span className="text-[#2C1A0E] font-bold">{selectedColor}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-sm border transition-all duration-200 cursor-pointer ${
                        selectedColor === c
                          ? "bg-[#2C1A0E] border-[#2C1A0E] text-[#D4AF37] shadow-sm"
                          : "border-[#C8B99A] text-[#6B4C2A] hover:border-[#2C1A0E] hover:text-[#2C1A0E]"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 3: Custom Laser Engraving Text Input */}
              <div className="pt-2 border-t border-[#E8E0D5]/60">
                <label
                  htmlFor="engraving-input"
                  className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block mb-2"
                >
                  Personalização Gravada a Laser (Opcional):
                </label>
                <input
                  id="engraving-input"
                  type="text"
                  placeholder="Ex: Seu Nome, Sobrenome ou Frase"
                  value={engravingText}
                  onChange={(e) => setEngravingText(e.target.value)}
                  maxLength={30}
                  className="w-full px-4 py-3 border border-[#C8B99A] bg-white rounded-sm text-[#2C1A0E] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] placeholder:text-[#A89070]/60 transition-all"
                />
                <span className="text-[10px] text-[#A89070] mt-1 block">
                  Máximo 30 caracteres. Sem custo adicional.
                </span>
              </div>
            </div>

            {/* Add to Cart Actions */}
            <div className="pt-4 flex flex-col gap-3">
              <motion.button
                onClick={handleAddToCart}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center justify-center gap-2.5 w-full py-4.5 font-bold text-sm uppercase tracking-widest rounded-sm shadow-md transition-all duration-300 cursor-pointer ${
                  added
                    ? "bg-green-600 text-white"
                    : "bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E]"
                }`}
              >
                {added ? (
                  <>
                    <Check className="w-4 h-4" />
                    Adicionado à Sacola!
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    Adicionar à Sacola
                  </>
                )}
              </motion.button>
              
              <div className="flex items-center justify-center gap-1.5 text-xs text-[#A89070]">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span>Garantia de Satisfação Parada de Ouro</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
