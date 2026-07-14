"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/lib/cartStore";
import { ChevronLeft, ShoppingBag, Check, Star, ChevronDown, ChevronUp, Upload } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { buildCsvUrl } from "@/lib/catalogueParser";

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

const getSpecsByProduct = (handle: string, type: string, title: string) => {
  const h = handle.toLowerCase();
  const t = type.toLowerCase();
  const tl = title.toLowerCase();
  
  if (h.includes("caneca") || tl.includes("caneca")) {
    return [
      { label: "Material", value: "Aço Inoxidável 18/8 (Livre de BPA)" },
      { label: "Isolamento Térmico", value: "Parede dupla com isolamento a vácuo (Gelado por 18h, Quente por 8h)" },
      { label: "Capacidade", value: "500 ml" },
      { label: "Gravação", value: "Laser de alta definição (permanente, não desbota)" },
      { label: "Tampa", value: "Antivazamento com abridor de garrafas integrado" }
    ];
  }
  
  if (h.includes("bota") || h.includes("botina") || t.includes("botas") || tl.includes("bota") || tl.includes("botina")) {
    return [
      { label: "Cabedal", value: "Couro Legítimo Nobre (Látego ou Nobuck selecionado)" },
      { label: "Forração", value: "Couro macio antitranspirante" },
      { label: "Palmilha", value: "Palmilha Ortopédica em Gel PU de alta densidade (Conforto Extremo)" },
      { label: "Solado", value: "Borracha antiderrapante costurada (Vira Francesa ou Goodyear Welt)" },
      { label: "Acabamento", value: "Costuras reforçadas feitas à mão" }
    ];
  }
  
  if (h.includes("cinto") || t.includes("cintos") || tl.includes("cinto")) {
    return [
      { label: "Tira", value: "Couro Bovino Legítimo Soleta de alta espessura" },
      { label: "Fivela", value: "Zamac maciço com banho de ouro e prata com verniz de proteção" },
      { label: "Largura da Tira", value: "40 mm (padrão western)" },
      { label: "Ajuste", value: "5 furos de regulagem" },
      { label: "Detalhes", value: "Trabalho entalhado à mão no couro" }
    ];
  }
  
  return [
    { label: "Qualidade", value: "Matéria-prima premium selecionada" },
    { label: "Produção", value: "Artesanal com rigoroso controle de qualidade" },
    { label: "Origem", value: "Fabricado no Brasil" }
  ];
};

const getCareAndWarranty = (handle: string, title: string) => {
  const h = handle.toLowerCase();
  const tl = title.toLowerCase();
  
  if (h.includes("caneca") || tl.includes("caneca")) {
    return "Lave com sabão neutro e esponja macia. Não utilize esponjas de aço ou abrasivos que possam riscar o revestimento. Não levar ao micro-ondas nem à lava-louças. Garantia de 3 meses contra perda de vácuo térmico e defeitos de fabricação.";
  }
  if (h.includes("bota") || h.includes("botina") || tl.includes("bota") || tl.includes("botina")) {
    return "Limpar com pano levemente úmido e sabão neutro. Deixar secar à sombra em local ventilado (nunca expor ao sol direto ou fontes de calor). Hidratar o couro periodicamente com pomadas específicas ou vaselina líquida. Garantia de 3 meses contra defeitos de fabricação e descolamento do solado.";
  }
  return "Evite contato com água em abundância e produtos químicos. Para artigos de couro, hidrate anualmente com creme específico. Armazene em local seco e arejado. Garantia de 3 meses contra defeitos de fabricação.";
};



function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const nextCh = csvText[i + 1];
    
    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = "";
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && nextCh === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      rows.push(currentRow);
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += ch;
    }
  }
  
  if (currentRow.length > 0 || currentVal) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  
  return rows;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Variant {
  sku: string;
  price: number;
  compareAtPrice: number;
  options: Record<string, string>;  // e.g. { Cor: "Marrom", Tamanho: "M" }
  image: string;
}

interface Product {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  type: string;
  tags: string[];
  images: string[];          // all unique images in order
  variants: Variant[];
  optionNames: string[];     // e.g. ["Cor", "Tamanho"]
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseProduct(csvText: string, handle: string): Product | null {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return null;

  // Find the header line, ignoring markdown frontmatter if present
  let headerRowIndex = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes("Title") && rows[i].includes("Body (HTML)")) {
      headerRowIndex = i;
      break;
    }
  }

  const header = rows[headerRowIndex].map((h) => h.trim().toLowerCase());

  const iHandle    = 0;
  const iTitle     = header.indexOf("title");
  const iBody      = header.indexOf("body (html)");
  const iVendor    = header.indexOf("vendor");
  const iType      = header.indexOf("type");
  const iTags      = header.indexOf("tags");
  const iOpt1Name  = header.indexOf("option1 name");
  const iOpt1Val   = header.indexOf("option1 value");
  const iOpt2Name  = header.indexOf("option2 name");
  const iOpt2Val   = header.indexOf("option2 value");
  const iOpt3Name  = header.indexOf("option3 name");
  const iOpt3Val   = header.indexOf("option3 value");
  const iSku       = header.indexOf("variant sku");
  const iPrice     = header.indexOf("variant price");
  const iCompare   = header.indexOf("variant compare at price");
  const iImgSrc    = header.indexOf("image src");
  const iVarImg    = header.indexOf("variant image");

  let product: Product | null = null;
  const seenImages = new Set<string>();
  const optionNameSet = new Set<string>();
  let opt1Name = "";
  let opt2Name = "";
  let opt3Name = "";

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 5) continue;
    if (cols[iHandle]?.trim() !== handle) continue;

    // First matching row → build the product shell
    if (!product) {
      product = {
        handle,
        title: cols[iTitle]?.trim() || handle,
        bodyHtml: cols[iBody]?.trim() || "",
        vendor: cols[iVendor]?.trim() || "",
        type: cols[iType]?.trim() || "",
        tags: (cols[iTags] || "").split(",").map((t) => t.trim()).filter(Boolean),
        images: [],
        variants: [],
        optionNames: [],
      };
    }

    // Capture option names dynamically as they can appear in different rows
    const o1 = cols[iOpt1Name]?.trim();
    if (o1) { opt1Name = o1; optionNameSet.add(o1); }
    const o2 = cols[iOpt2Name]?.trim();
    if (o2) { opt2Name = o2; optionNameSet.add(o2); }
    const o3 = cols[iOpt3Name]?.trim();
    if (o3) { opt3Name = o3; optionNameSet.add(o3); }

    // Collect images
    const imgSrc = cols[iImgSrc]?.trim();
    if (imgSrc && !seenImages.has(imgSrc)) {
      seenImages.add(imgSrc);
      product.images.push(imgSrc);
    }
    const varImg = cols[iVarImg]?.trim();
    if (varImg && !seenImages.has(varImg)) {
      seenImages.add(varImg);
      product.images.push(varImg);
    }

    // Collect variant options
    const options: Record<string, string> = {};
    const v1 = cols[iOpt1Val]?.trim();
    if (opt1Name && v1) options[opt1Name] = v1;
    const v2 = cols[iOpt2Val]?.trim();
    if (opt2Name && v2) options[opt2Name] = v2;
    const v3 = cols[iOpt3Val]?.trim();
    if (opt3Name && v3) options[opt3Name] = v3;

    const sku = cols[iSku]?.trim() || "";
    const price = parseFloat((cols[iPrice] || "0").replace(",", "."));
    const compare = parseFloat((cols[iCompare] || "0").replace(",", "."));

    // Pushing variant if SKU or first option value is present to exclude image-only rows
    if (sku || v1) {
      product.variants.push({
        sku,
        price: isNaN(price) ? 0 : price,
        compareAtPrice: isNaN(compare) ? 0 : compare,
        options,
        image: varImg || imgSrc || "",
      });
    }
  }

  if (product) {
    product.optionNames = Array.from(optionNameSet);
    // Keep only the first image as primary if many
    product.images = product.images.slice(0, 8);
  }

  return product;
}

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProductPage() {
  const { handle } = useParams<{ handle: string }>();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

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
      
      const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "CSV File";
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

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildCsvUrl();
      if (!url) throw new Error("Supabase configuration missing");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseProduct(text, handle);
      if (!parsed) throw new Error("Produto não encontrado.");
      setProduct(parsed);

      // Pre-select first available option value for each option name
      const defaults: Record<string, string> = {};
      parsed.optionNames.forEach((name) => {
        const firstVal = parsed.variants.find((v) => v.options[name])?.options[name];
        if (firstVal) defaults[name] = firstVal;
      });
      setSelectedOptions(defaults);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  // Find matching variant from selected options
  const matchedVariant = product?.variants.find((v) =>
    product.optionNames.every((name) => v.options[name] === selectedOptions[name])
  );

  const isCaneca = product ? (product.handle.toLowerCase().includes("caneca") || product.title.toLowerCase().includes("caneca")) : false;

  // Get all unique values for each option
  function getOptionValues(name: string): string[] {
    if (!product) return [];
    return Array.from(
      new Set(product.variants.map((v) => v.options[name]).filter(Boolean))
    );
  }

  // When a variant with an image is selected, switch the main image
  useEffect(() => {
    if (matchedVariant?.image && product) {
      const idx = product.images.indexOf(matchedVariant.image);
      if (idx >= 0) setActiveImage(idx);
    }
  }, [matchedVariant, product]);

  const handleAddToCart = () => {
    if (!product || !matchedVariant) return;
    
    const cartOptions = { ...selectedOptions };
    if (uploadedImageUrl) {
      cartOptions["Imagem Personalizada"] = uploadedImageUrl;
    }

    addItem({
      handle: product.handle,
      title: product.title,
      image: product.images[0] || "",
      selectedOptions: cartOptions,
      price: matchedVariant.price,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const discount =
    matchedVariant && matchedVariant.compareAtPrice > matchedVariant.price
      ? Math.round(
          ((matchedVariant.compareAtPrice - matchedVariant.price) /
            matchedVariant.compareAtPrice) *
            100
        )
      : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
        <Navbar />
        <div className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin" />
            <p className="text-[#6B4C2A] text-sm tracking-widest uppercase">Carregando…</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
        <Navbar />
        <div className="flex-grow flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-red-500 text-lg">{error || "Produto não encontrado."}</p>
          <Link href="/catalogue" className="text-[#D4AF37] underline text-sm">
            ← Voltar ao catálogo
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
      <Navbar />

      <main className="flex-grow pt-24">
        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link
            href="/catalogue"
            className="inline-flex items-center gap-1.5 text-[#6B4C2A] hover:text-[#D4AF37] text-xs uppercase tracking-widest transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Catálogo
          </Link>
        </div>

        {/* Product layout */}
        <div className="max-w-7xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* ── Gallery ───────────────────────────────────────────────────── */}
          <div className="flex flex-col-reverse lg:flex-row items-start gap-4">
            {/* Thumbnails */}
            {product.images.length > 1 && (
              <div className="flex lg:flex-col gap-2 w-full lg:w-16 shrink-0 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
                {product.images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-16 shrink-0 rounded-sm overflow-hidden border-2 transition-all duration-200 ${
                      activeImage === i
                        ? "border-[#D4AF37]"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={src} 
                      alt={`View ${i + 1}`} 
                      loading="lazy"
                      className={`w-full h-full object-cover ${isCaneca ? "object-top" : "object-center"}`} 
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className="flex-grow w-full aspect-square relative rounded-sm overflow-hidden bg-[#F0EBE3] shadow-lg">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeImage}
                  src={product.images[activeImage] || ""}
                  alt={product.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`w-full h-full object-cover ${isCaneca ? "object-top" : "object-center"}`}
                />
              </AnimatePresence>

              {discount > 0 && (
                <div className="absolute top-4 left-4 bg-[#D4AF37] text-[#2C1A0E] text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider">
                  -{discount}%
                </div>
              )}
            </div>
          </div>

          {/* ── Info ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div>
              {product.vendor && (
                <p className="text-[#A89070] text-xs uppercase tracking-widest mb-1">
                  {product.vendor}
                </p>
              )}
              <h1
                className="font-display text-2xl md:text-3xl font-bold text-[#2C1A0E] leading-snug"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {product.title}
              </h1>

              {/* Stars (decorative) */}
              <div className="flex items-center gap-1 mt-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                ))}
                <span className="text-[#A89070] text-xs ml-1">(Premium)</span>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-[#2C1A0E]">
                {matchedVariant ? formatBRL(matchedVariant.price) : "—"}
              </span>
              {matchedVariant && matchedVariant.compareAtPrice > matchedVariant.price && (
                <span className="text-base text-[#A89070] line-through mb-0.5">
                  {formatBRL(matchedVariant.compareAtPrice)}
                </span>
              )}
            </div>

            {/* Options */}
            {product.optionNames.map((name) => {
              const values = getOptionValues(name);
              return (
                <div key={name}>
                  <p className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold mb-2">
                    {name}:{" "}
                    <span className="text-[#2C1A0E] normal-case tracking-normal font-bold">
                      {selectedOptions[name] || "—"}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => {
                      const isActive = selectedOptions[name] === val;
                      return (
                        <button
                          key={val}
                          onClick={() =>
                            setSelectedOptions((prev) => ({ ...prev, [name]: val }))
                          }
                          className={`px-3 py-1.5 text-xs font-semibold border rounded-sm transition-all duration-200 uppercase tracking-wide ${
                            isActive
                              ? "bg-[#2C1A0E] border-[#2C1A0E] text-[#D4AF37]"
                              : "border-[#C8B99A] text-[#6B4C2A] hover:border-[#2C1A0E] hover:text-[#2C1A0E]"
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Custom Image Upload for Mugs */}
            {product.handle.includes("caneca") && (
              <div className="pt-2 border-t border-[#E8E0D5]/60 mb-4">
                <span className="text-xs uppercase tracking-widest text-[#6B4C2A] font-semibold block mb-2">
                  Envie sua Foto ou Logomarca (Opcional):
                </span>
                
                {uploadedImageUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-white border border-[#D4AF37]/40 rounded-sm">
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
                      id="product-image-upload"
                    />
                    <label
                      htmlFor="product-image-upload"
                      className={`flex flex-col items-center justify-center border-2 border-dashed border-[#C8B99A] hover:border-[#D4AF37] rounded-sm p-4 cursor-pointer bg-white transition-all text-center ${
                        uploading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {uploading ? (
                        <>
                          <div className="w-4 h-4 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin mb-1.5" />
                          <span className="text-xs text-[#A89070]">Enviando imagem...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-[#A89070] mb-1.5" />
                          <span className="text-xs font-semibold text-[#6B4C2A]">Clique para enviar sua imagem</span>
                          <span className="text-[10px] text-[#A89070] mt-0.5">PNG, JPG de até 5MB</span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Add to cart */}
            <div className="flex flex-col gap-3 pt-2">
              <motion.button
                onClick={handleAddToCart}
                disabled={!matchedVariant}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center justify-center gap-2 w-full py-4 font-bold text-sm uppercase tracking-widest rounded-sm shadow-md transition-all duration-300 ${
                  added
                    ? "bg-green-600 text-white"
                    : matchedVariant
                    ? "bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E]"
                    : "bg-[#E8E0D5] text-[#A89070] cursor-not-allowed"
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

              {!matchedVariant && (
                <p className="text-center text-xs text-[#A89070]">
                  Selecione todas as opções para continuar.
                </p>
              )}
            </div>

            {/* Tags */}
            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {product.tags.slice(0, 8).map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] bg-[#F0EBE3] text-[#6B4C2A] px-2 py-0.5 rounded-sm uppercase tracking-wider border border-[#E8E0D5]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[#E8E0D5] pt-4">
              <div className="flex flex-col gap-2 text-xs text-[#6B4C2A]">
                <p>✓ Frete para todo o Brasil</p>
                <p>✓ Troca grátis em até 30 dias</p>
                <p>✓ Pagamento 100% seguro</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Description (Shopify-Style Accordions) ─────────────────────── */}
        <div className="bg-white border-t border-[#E8E0D5]">
          <div className="max-w-4xl mx-auto px-6 py-14">
            <h2
              className="font-display text-2xl font-bold text-[#2C1A0E] mb-6 tracking-wide"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Detalhes do Produto
            </h2>
            
            <div className="mt-4 border-t border-[#E8E0D5]">
              {product.bodyHtml && (
                <AccordionItem
                  title="Sobre o Produto"
                  isOpen={openAccordion === "desc"}
                  onToggle={() => setOpenAccordion(openAccordion === "desc" ? null : "desc")}
                >
                  {stripHtml(product.bodyHtml)}
                </AccordionItem>
              )}
              
              <AccordionItem
                title="Especificações Técnicas"
                isOpen={openAccordion === "specs"}
                onToggle={() => setOpenAccordion(openAccordion === "specs" ? null : "specs")}
              >
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-medium max-w-lg">
                  {getSpecsByProduct(product.handle, product.type, product.title).map((spec, i) => (
                    <React.Fragment key={i}>
                      <span className="text-[#A89070] border-t border-[#E8E0D5]/50 pt-2 first:border-0 first:pt-0">{spec.label}</span>
                      <span className="text-[#2C1A0E] text-right border-t border-[#E8E0D5]/50 pt-2 first:border-0 first:pt-0">{spec.value}</span>
                    </React.Fragment>
                  ))}
                </div>
              </AccordionItem>

              <AccordionItem
                title="Envio & Prazos"
                isOpen={openAccordion === "shipping"}
                onToggle={() => setOpenAccordion(openAccordion === "shipping" ? null : "shipping")}
              >
                {product.handle.includes("caneca") ? (
                  <>
                    • Produção: 1 a 3 dias úteis para personalização após confirmação dos dados.<br />
                    • Envio Seguro: Frete com código de rastreamento enviado por e-mail/WhatsApp para todo o Brasil.<br />
                    • Garantia de Carga: Seguro completo contra extravios ou danos no transporte.
                  </>
                ) : (
                  <>
                    • Envio Rápido: Despacho em até 24h úteis após aprovação do pagamento.<br />
                    • Código de Rastreamento: Enviado automaticamente por e-mail/WhatsApp.<br />
                    • Frete Seguro: Parceria com as melhores transportadoras e Correios com seguro total.
                  </>
                )}
              </AccordionItem>

              <AccordionItem
                title="Instruções de Cuidado & Garantia"
                isOpen={openAccordion === "care"}
                onToggle={() => setOpenAccordion(openAccordion === "care" ? null : "care")}
              >
                {getCareAndWarranty(product.handle, product.title)}
              </AccordionItem>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
