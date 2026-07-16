"use client";

import { useState, useEffect } from "react";
import { Star, ShoppingBag, Check, ShieldCheck, Flame, Compass, ChevronDown, ChevronUp, Upload, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cartStore";

interface AccordionItemProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionItem({ title, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div className="border-b border-[#E8E0D5]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-4 flex justify-between items-center text-left text-sm font-semibold uppercase tracking-wider text-[#2C1A0E] hover:text-[#D4AF37] transition-colors cursor-pointer"
      >
        <span>{title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-[#D4AF37]" /> : <ChevronDown className="w-4 h-4 text-[#A89070]" />}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pb-4 text-sm text-[#6B4C2A] leading-relaxed font-light whitespace-pre-line">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  
  // Image Upload and Accordion States
  const [uploading, setUploading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [openAccordion, setOpenAccordion] = useState<string | null>("desc");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5MB.");
      return;
    }

    setUploading(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      
      const bucket = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET || "custom-images";
      const fileExt = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      setUploadedImageUrl(publicUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      alert("Erro ao enviar imagem: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImageUrl("");
  };

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
    if (uploadedImageUrl) {
      options["Imagem Personalizada"] = uploadedImageUrl;
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
    <section className="py-16 md:py-20 bg-white text-[#2C1A0E] border-b border-[#E8E0D5]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center reveal-on-scroll">
          
          {/* Left Column: Image Display */}
          <div className="flex flex-col gap-6">
            <div className="relative aspect-square w-full max-w-lg mx-auto rounded-sm overflow-hidden bg-[#F0EBE3] shadow-lg">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeImage}
                  src={activeImage}
                  alt={`Caneca Rústica ${selectedModel}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full object-contain p-4"
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
                  <img src={v.image} alt={v.model} className="w-full h-full object-contain p-1" />
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
                      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-full border transition-all duration-200 cursor-pointer ${
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

              {/* Option 4: Custom Image Upload */}
              <div className="pt-4 border-t border-[#E8E0D5]/60">
                <span className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block mb-2">
                  Envie sua Foto ou Logomarca (Opcional):
                </span>
                
                {uploadedImageUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-[#F8F5F0] border border-[#D4AF37]/40 rounded-sm">
                    <img src={uploadedImageUrl} alt="Preview" className="w-12 h-12 object-cover rounded-sm border border-[#E8E0D5]" />
                    <div className="flex-grow min-w-0">
                      <p className="text-xs font-semibold text-[#2C1A0E] truncate">Imagem enviada com sucesso!</p>
                      <button 
                        type="button" 
                        onClick={handleRemoveImage}
                        className="text-[10px] text-red-500 hover:underline mt-0.5"
                      >
                        Remover imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      className="hidden"
                      id="custom-image-upload"
                    />
                    <label
                      htmlFor="custom-image-upload"
                      className={`flex flex-col items-center justify-center border-2 border-dashed border-[#C8B99A] hover:border-[#D4AF37] rounded-sm p-5 cursor-pointer bg-white transition-all text-center ${
                        uploading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {uploading ? (
                        <>
                          <div className="w-5 h-5 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin mb-2" />
                          <span className="text-xs text-[#A89070]">Enviando imagem...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-[#A89070] mb-2" />
                          <span className="text-xs font-semibold text-[#6B4C2A]">Clique para enviar sua imagem</span>
                          <span className="text-[10px] text-[#A89070] mt-1">PNG, JPG de até 5MB</span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>

            </div>

            {/* Add to Cart Actions */}
            <div className="pt-4 flex flex-col gap-3">
              <motion.button
                onClick={handleAddToCart}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center justify-center gap-2.5 w-full py-4.5 font-bold text-sm uppercase tracking-widest rounded-full shadow-md transition-all duration-300 cursor-pointer ${
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

            {/* Shopify-style Accordion */}
            <div className="mt-8 border-t border-[#E8E0D5] pt-2">
              <AccordionItem
                title="Descrição Geral"
                isOpen={openAccordion === "desc"}
                onToggle={() => setOpenAccordion(openAccordion === "desc" ? null : "desc")}
              >
                Caneca térmica rústica premium em aço inox. Ideal para manter sua bebida trincando, seu tereré gelado ou seu café quente até o último gole. Acompanha tampa hermética com abridor de garrafas integrado e personalização gratuita a laser de nome e time.
              </AccordionItem>
              
              <AccordionItem
                title="Especificações Técnicas"
                isOpen={openAccordion === "specs"}
                onToggle={() => setOpenAccordion(openAccordion === "specs" ? null : "specs")}
              >
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-medium">
                  <span className="text-[#A89070]">Capacidade</span>
                  <span className="text-[#2C1A0E] text-right">500 ml</span>
                  <span className="text-[#A89070] border-t border-[#E8E0D5]/50 pt-2">Material</span>
                  <span className="text-[#2C1A0E] text-right border-t border-[#E8E0D5]/50 pt-2">Aço Inoxidável 304 (Double Wall)</span>
                  <span className="text-[#A89070] border-t border-[#E8E0D5]/50 pt-2">Isolamento Térmico</span>
                  <span className="text-[#2C1A0E] text-right border-t border-[#E8E0D5]/50 pt-2">Parede dupla a vácuo (18h gelado, 8h quente)</span>
                  <span className="text-[#A89070] border-t border-[#E8E0D5]/50 pt-2">Gravação</span>
                  <span className="text-[#2C1A0E] text-right border-t border-[#E8E0D5]/50 pt-2">Laser de fibra de alta precisão (permanente)</span>
                  <span className="text-[#A89070] border-t border-[#E8E0D5]/50 pt-2">Extra</span>
                  <span className="text-[#2C1A0E] text-right border-t border-[#E8E0D5]/50 pt-2">Tampa com abridor de garrafas integrado</span>
                </div>
              </AccordionItem>

              <AccordionItem
                title="Envio & Prazos"
                isOpen={openAccordion === "shipping"}
                onToggle={() => setOpenAccordion(openAccordion === "shipping" ? null : "shipping")}
              >
                • Produção: 1 a 3 dias úteis para personalização após confirmação dos dados.
                • Envio Seguro: Frete com código de rastreamento enviado por e-mail/WhatsApp para todo o Brasil.
                • Garantia de Carga: Seguro completo contra extravios ou danos no transporte.
              </AccordionItem>

              <AccordionItem
                title="Instruções de Cuidado"
                isOpen={openAccordion === "care"}
                onToggle={() => setOpenAccordion(openAccordion === "care" ? null : "care")}
              >
                • Lavar com sabão neutro e esponja macia.
                • Não utilizar esponjas de aço ou abrasivos que possam riscar o revestimento.
                • Não levar ao micro-ondas ou lava-louças para preservar a integridade da gravação.
              </AccordionItem>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
