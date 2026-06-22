"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/lib/cartStore";
import { ChevronLeft, ShoppingBag, Check, Star } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ─── CSV helpers (same as catalogue) ─────────────────────────────────────────
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1j_fTweGpNZZ_zeb2Op-aEjuwsBHIpFgNWRCajl-aSSY/export?format=csv";

function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
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
  const lines = csvText.split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines.length < 2) return null;

  const header = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());

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

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
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
    const addOpt = (nameIdx: number, valIdx: number) => {
      const n = cols[nameIdx]?.trim();
      const v = cols[valIdx]?.trim();
      if (n && v) { options[n] = v; optionNameSet.add(n); }
    };
    addOpt(iOpt1Name, iOpt1Val);
    addOpt(iOpt2Name, iOpt2Val);
    addOpt(iOpt3Name, iOpt3Val);

    const price = parseFloat((cols[iPrice] || "0").replace(",", "."));
    const compare = parseFloat((cols[iCompare] || "0").replace(",", "."));

    product.variants.push({
      sku: cols[iSku]?.trim() || "",
      price: isNaN(price) ? 0 : price,
      compareAtPrice: isNaN(compare) ? 0 : compare,
      options,
      image: varImg || imgSrc || "",
    });
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

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CSV_URL);
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
    addItem({
      handle: product.handle,
      title: product.title,
      image: product.images[0] || "",
      selectedOptions,
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
          <div className="flex gap-4">
            {/* Thumbnails */}
            {product.images.length > 1 && (
              <div className="flex flex-col gap-2 w-16 shrink-0">
                {product.images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-16 rounded-sm overflow-hidden border-2 transition-all duration-200 ${
                      activeImage === i
                        ? "border-[#D4AF37]"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`View ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className="flex-grow relative aspect-square rounded-sm overflow-hidden bg-[#F0EBE3] shadow-lg">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeImage}
                  src={product.images[activeImage] || ""}
                  alt={product.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-full h-full object-cover"
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

        {/* ── Description ─────────────────────────────────────────────────── */}
        {product.bodyHtml && (
          <div className="bg-white border-t border-[#E8E0D5]">
            <div className="max-w-4xl mx-auto px-6 py-14">
              <h2
                className="font-display text-2xl font-bold text-[#2C1A0E] mb-6 tracking-wide"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Sobre o Produto
              </h2>
              <div className="prose prose-sm max-w-none text-[#4A3728] leading-relaxed">
                <p className="whitespace-pre-line text-sm leading-7">
                  {stripHtml(product.bodyHtml)}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
