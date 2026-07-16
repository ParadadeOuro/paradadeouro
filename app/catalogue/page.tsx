"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { buildCsvUrl } from "@/lib/catalogueParser";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  handle: string;
  title: string;
  type: string;
  vendor: string;
  price: string;
  compareAtPrice: string;
  image: string;
  tags: string;
}

// ─── CSV fetch & parse ────────────────────────────────────────────────────────
// Supabase storage CSV fetch configuration
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET;
const SUPABASE_CSV_PATH = process.env.NEXT_PUBLIC_SUPABASE_CSV_PATH; // e.g., "catalogue.csv"

/**
 * Minimal RFC-4180 CSV row parser that respects quoted fields.
 */
function parseCsvRows(csvText: string): string[][] {
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

function parseCsv(text: string): Product[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());

  // Column indices (Shopify export format)
  const iHandle = header.findIndex((h) => h === "");            // col 0 (handle, no name in header row)
  const iTitle = header.indexOf("title");
  const iType = header.indexOf("type");
  const iVendor = header.indexOf("vendor");
  const iTags = header.indexOf("tags");
  const iPrice = header.indexOf("variant price");
  const iCompare = header.indexOf("variant compare at price");
  const iImage = header.indexOf("image src");

  const productMap = new Map<string, Product>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 5) continue;

    const handle = cols[iHandle >= 0 ? iHandle : 0]?.trim();
    if (!handle) continue;

    const title = cols[iTitle]?.trim();
    const image = cols[iImage]?.trim();
    const price = cols[iPrice]?.trim();
    const compareAtPrice = cols[iCompare]?.trim();

    const parsedPrice = price ? parseFloat(price.replace(",", ".")) : NaN;
    const hasValidPrice = !isNaN(parsedPrice) && parsedPrice > 0;

    if (productMap.has(handle)) {
      // Update image if this row has one and the existing entry doesn't
      const existing = productMap.get(handle)!;
      if (!existing.image && image) {
        existing.image = image;
      }
      // Keep lowest price
      if (hasValidPrice) {
        const existingPrice = existing.price ? parseFloat(existing.price.replace(",", ".")) : NaN;
        if (isNaN(existingPrice) || existingPrice <= 0 || parsedPrice < existingPrice) {
          existing.price = price;
          existing.compareAtPrice = compareAtPrice || existing.compareAtPrice;
        }
      }
    } else {
      productMap.set(handle, {
        handle,
        title: title || handle,
        type: inferProductType(cols[iType]?.trim() || "", cols[iTags]?.trim() || "", title || "", handle),
        vendor: cols[iVendor]?.trim() || "",
        tags: cols[iTags]?.trim() || "",
        price: hasValidPrice ? price : "",
        compareAtPrice: hasValidPrice ? (compareAtPrice || "") : "",
        image: image || "",
      });
    }
  }

  return Array.from(productMap.values()).filter((p) => p.title && p.image);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function inferProductType(type: string, tags: string, title: string, handle: string): string {
  const t = type.toLowerCase();
  const tagList = tags.toLowerCase().split(",").map(x => x.trim());
  const tl = title.toLowerCase();
  const h = handle.toLowerCase();
  
  if (t.includes("chapéu") || t.includes("chapeu") || tagList.includes("chapéu") || tagList.includes("chapeu")) return "Chapéus";
  if (t.includes("bota") || t.includes("pantufa") || t.includes("botina") || tagList.includes("bota") || tagList.includes("pantufa") || tagList.includes("botina")) return "Botas";
  if (t.includes("cinto") || tagList.includes("cinto")) return "Cintos";
  if (t.includes("camisa") || t.includes("denim") || t.includes("jaqueta") || tagList.includes("camisa") || tagList.includes("denim") || tagList.includes("jaqueta")) return "Camisas & Denim";
  if (tagList.includes("bone") || tagList.includes("bones") || tagList.includes("boné") || t.includes("boné") || tl.includes("boné")) return "Bonés";
  if (tagList.includes("fivela") || t.includes("fivela") || tl.includes("fivela")) return "Fivelas";
  if (t.includes("kit churrasco") || tagList.includes("kit churrasco") || tagList.includes("cutelaria") || tl.includes("faca")) return "Cutelaria";
  if (tl.includes("caneca") || h.includes("caneca")) return "Canecas";
  
  return type || "Outros"; // fallback
}

function formatPrice(value: string) {
  const num = parseFloat(value.replace(",", "."));
  if (isNaN(num)) return value;
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
}

const mapCategoryToCsvType = (category: string, availableTypes: string[]): string => {
  const mapping: Record<string, string> = {
    "chapeus": "Chapéus",
    "botas": "Botas",
    "cintos": "Cintos",
    "camisas-denim": "Camisas & Denim",
    "bones": "Bonés",
    "fivelas": "Fivelas",
    "churrasco": "Cutelaria",
    "canecas": "Canecas"
  };
  
  const mapped = mapping[category.toLowerCase()];
  return availableTypes.includes(mapped) ? mapped : "Todos";
};

// ─── Content Component ────────────────────────────────────────────────────────
function CatalogueContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");

  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("Todos");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
        const url = buildCsvUrl();
        if (!url) throw new Error('Supabase configuration missing');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
      const data = parseCsv(text);
      setProducts(data);
      setFiltered(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Set initial active filter from search query parameters when products are loaded
  useEffect(() => {
    if (products.length > 0 && categoryParam) {
      const availableTypes = Array.from(new Set(products.map((p) => p.type).filter(Boolean)));
      const mappedType = mapCategoryToCsvType(categoryParam, availableTypes);
      setActiveType(mappedType);
    }
  }, [products, categoryParam]);

  // Types for filter tabs
  const types = ["Todos", ...Array.from(new Set(products.map((p) => p.type).filter(Boolean)))];

  // Filter whenever search or type changes
  useEffect(() => {
    let result = products;
    if (activeType !== "Todos") {
      result = result.filter((p) => p.type === activeType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.tags.toLowerCase().includes(q) ||
          p.vendor.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, activeType, products]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
      <Navbar />

      {/* ── Page Header ─────────────────────────────────── */}
      <section className="pt-32 pb-10 px-6 bg-[#2C1A0E] text-center">
        <h1
          className="font-display text-4xl md:text-5xl font-bold text-[#D4AF37] tracking-widest uppercase mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Catálogo
        </h1>
        <p className="text-[#C8B99A] text-sm tracking-widest uppercase">
          Toda a nossa coleção em um só lugar
        </p>
      </section>

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="sticky top-16 z-30 bg-[#F8F5F0]/95 backdrop-blur-sm border-b border-[#D4AF37]/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          {/* Search */}
          <input
            type="text"
            placeholder="Buscar produtos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs px-4 py-2 rounded-sm border border-[#D4AF37]/40 bg-white text-[#2C1A0E] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 placeholder:text-[#A89070]"
          />

          {/* Type tabs */}
          <div className="flex flex-wrap gap-2 justify-center">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-widest rounded-sm border transition-all duration-200 ${
                  activeType === t
                    ? "bg-[#D4AF37] text-[#2C1A0E] border-[#D4AF37]"
                    : "border-[#D4AF37]/40 text-[#6B4C2A] hover:border-[#D4AF37] hover:text-[#2C1A0E]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────── */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin" />
            <p className="text-[#6B4C2A] text-sm tracking-widest uppercase">
              Carregando catálogo…
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 mb-4">Erro ao carregar: {error}</p>
            <button
              onClick={fetchProducts}
              className="px-6 py-2 bg-[#D4AF37] text-[#2C1A0E] text-sm font-bold uppercase tracking-widest rounded-sm hover:bg-[#C8A030] transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 text-[#6B4C2A]">
            <p className="text-lg">Nenhum produto encontrado.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <p className="text-xs text-[#A89070] uppercase tracking-widest mb-6">
              {filtered.length} produto{filtered.length !== 1 ? "s" : ""} encontrado
              {filtered.length !== 1 ? "s" : ""}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {filtered.map((product) => (
                <ProductCard key={product.handle} product={product} />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ─── Export Component with Suspense ───────────────────────────────────────────
export default function CataloguePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
        <Navbar />
        <div className="flex-grow flex items-center justify-center py-32">
          <div className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin" />
        </div>
        <Footer />
      </div>
    }>
      <CatalogueContent />
    </Suspense>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product }: { product: Product }) {
  const [imgError, setImgError] = useState(false);
  const hasDiscount =
    product.compareAtPrice &&
    parseFloat(product.compareAtPrice) > parseFloat(product.price);

  const discountPct = hasDiscount
    ? Math.round(
        ((parseFloat(product.compareAtPrice) - parseFloat(product.price)) /
          parseFloat(product.compareAtPrice)) *
          100
      )
    : 0;

  const isCaneca = product.handle.toLowerCase().includes("caneca") || product.title.toLowerCase().includes("caneca");

  return (
    <Link
      href={`/product/${product.handle}`}
      className="group bg-white rounded-sm overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col border border-[#E8E0D5]"
    >
      <article>
      {/* Image */}
      <div className="relative overflow-hidden bg-[#F0EBE3] aspect-square">
        {product.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isCaneca ? "object-top" : "object-center"}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#C8B99A]">
            <svg className="w-16 h-16 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {hasDiscount && (
          <div className="absolute top-2 left-2 w-10 h-10 md:w-14 md:h-14 flex items-center justify-center">
            <img src="/images/discount.png" alt="Desconto" className="absolute inset-0 w-full h-full animate-[spin_8s_linear_infinite]" />
            <span className="relative z-10 text-white text-[10px] md:text-[13px] font-black tracking-widest drop-shadow-md">
              -{discountPct}%
            </span>
          </div>
        )}

        {/* Vendor badge */}
        {product.vendor && (
          <span className="absolute top-2 right-2 bg-[#2C1A0E]/70 backdrop-blur-sm text-[#D4AF37] text-[9px] font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wider">
            {product.vendor}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-grow p-3 gap-1.5">
        {product.type && (
          <span className="text-[9px] uppercase tracking-widest font-semibold text-[#A89070]">
            {product.type}
          </span>
        )}

        <h2
          className="text-sm font-semibold text-[#2C1A0E] leading-tight line-clamp-2"
          title={product.title}
        >
          {product.title}
        </h2>

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div>
            {hasDiscount && (
              <p className="text-[10px] text-[#A89070] line-through">
                {formatPrice(product.compareAtPrice)}
              </p>
            )}
            <p className="text-base font-bold text-[#2C1A0E]">
              {product.price ? formatPrice(product.price) : "—"}
            </p>
          </div>
          <span className="shrink-0 px-3 py-1.5 bg-[#2C1A0E] group-hover:bg-[#D4AF37] text-white group-hover:text-[#2C1A0E] text-[10px] font-bold uppercase tracking-widest rounded-full transition-all duration-200">
            Ver
          </span>
        </div>
      </div>
    </article>
    </Link>
  );
}
