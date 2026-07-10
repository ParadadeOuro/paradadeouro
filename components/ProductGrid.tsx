"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { buildCsvUrl, parseCatalogueProducts, CatalogueProduct } from "@/lib/catalogueParser";

const tabs = [
  { id: "camisas-denim", name: "Camisas & Denim" },
  { id: "canecas", name: "Canecas" },
  { id: "botas", name: "Botas" },
  { id: "chapeus", name: "Chapéus" },
  { id: "cintos", name: "Cintos" },
  { id: "bones", name: "Bonés" },
  { id: "fivelas", name: "Fivelas" },
  { id: "churrasco", name: "Cutelaria" },
];

const fallbackProducts: Record<string, Partial<CatalogueProduct>[]> = {
  chapeus: [
    {
      handle: "chapeu-feltro-pampa",
      title: "Chapéu Feltro Pampa Premium",
      price: "489.00",
      compareAtPrice: "650.00",
      image: "/images/categories/chapeus.png",
      vendor: "Pampa Selaria",
      type: "Chapéus",
      tags: "fallback",
    },
    {
      handle: "chapeu-classic-americano",
      title: "Chapéu Americano Classic Canvas",
      price: "379.00",
      compareAtPrice: "499.00",
      image: "https://images.unsplash.com/photo-1517462964-21fdcec3f25b?auto=format&fit=crop&q=80&w=800",
      vendor: "Classic Hats",
      type: "Chapéus",
      tags: "fallback",
    }
  ],
  cintos: [
    {
      handle: "cinto-couro-fivela-ouro",
      title: "Cinto Couro Legítimo Fivela Ouro",
      price: "289.00",
      compareAtPrice: "399.00",
      image: "/images/categories/cintos.png",
      vendor: "Parada de Ouro",
      type: "Cintos",
      tags: "fallback",
    },
    {
      handle: "cinto-western-entalhado",
      title: "Cinto Selaria Western Trabalhado",
      price: "199.00",
      compareAtPrice: "249.00",
      image: "https://images.unsplash.com/photo-1624224971170-2f84fed5eb5e?auto=format&fit=crop&q=80&w=800",
      vendor: "Selaria Dallas",
      type: "Cintos",
      tags: "fallback",
    }
  ]
};

const mapProductToCategory = (type: string, tags: string = "", title: string = "", handle: string = ""): string | null => {
  const t = type.toLowerCase();
  const tagList = tags.toLowerCase().split(",").map(x => x.trim());
  const tl = title.toLowerCase();
  const h = handle.toLowerCase();
  
  if (t.includes("chapéu") || t.includes("chapeu") || tagList.includes("chapéu") || tagList.includes("chapeu")) {
    return "chapeus";
  }
  if (t.includes("bota") || t.includes("pantufa") || t.includes("botina") || tagList.includes("bota") || tagList.includes("pantufa") || tagList.includes("botina")) {
    return "botas";
  }
  if (t.includes("cinto") || tagList.includes("cinto")) {
    return "cintos";
  }
  if (t.includes("camisa") || t.includes("denim") || t.includes("jaqueta") || tagList.includes("camisa") || tagList.includes("denim") || tagList.includes("jaqueta")) {
    return "camisas-denim";
  }
  if (tagList.includes("bone") || tagList.includes("bones") || tagList.includes("boné") || t.includes("boné") || tl.includes("boné")) {
    return "bones";
  }
  if (tagList.includes("fivela") || t.includes("fivela") || tl.includes("fivela")) {
    return "fivelas";
  }
  if (t.includes("kit churrasco") || tagList.includes("kit churrasco") || tagList.includes("cutelaria") || tl.includes("faca")) {
    return "churrasco";
  }
  if (tl.includes("caneca") || h.includes("caneca")) {
    return "canecas";
  }
  return null;
};

export default function ProductGrid() {
  const [activeCategory, setActiveCategory] = useState("camisas-denim");
  const [productsByCategory, setProductsByCategory] = useState<Record<string, CatalogueProduct[]>>({
    chapeus: [],
    botas: [],
    cintos: [],
    "camisas-denim": [],
    bones: [],
    fivelas: [],
    churrasco: [],
    canecas: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildCsvUrl();
      if (!url) throw new Error("Supabase configuration missing");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = parseCatalogueProducts(text);
      
      const grouped: Record<string, CatalogueProduct[]> = {
        chapeus: [],
        botas: [],
        cintos: [],
        "camisas-denim": [],
        bones: [],
        fivelas: [],
        churrasco: [],
        canecas: [],
      };
      
      data.forEach((p) => {
        const cat = mapProductToCategory(p.type, p.tags, p.title, p.handle);
        if (cat && grouped[cat]) {
          grouped[cat].push(p);
        }
      });
      
      setProductsByCategory(grouped);
    } catch (e: unknown) {
      console.error("Error loading products for home grid:", e);
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Determine what to show in the active category tab
  const csvProducts = productsByCategory[activeCategory] || [];
  // If CSV has no products for this category, use our premium fallbacks
  const displayProducts = csvProducts.length > 0 
    ? csvProducts 
    : (fallbackProducts[activeCategory] || []) as CatalogueProduct[];

  return (
    <section id="vitrine" className="py-16 md:py-24 bg-brand-brown text-brand-offwhite overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6 reveal-on-scroll">
          <div className="max-w-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-[1px] w-8 bg-brand-gold" />
              <span className="text-xs font-bold tracking-[0.2em] text-brand-gold uppercase">
                Seleção da Casa
              </span>
              <span className="h-[1px] w-8 bg-brand-gold" />
            </div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-brand-offwhite mb-6">
              Peças em Destaque
            </h2>
            <p className="text-base text-brand-offwhite/60 font-light leading-relaxed">
              Explore o melhor da moda country sertaneja de luxo, com produtos selecionados à mão pela Parada de Ouro.
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex justify-center gap-3 mb-16 flex-wrap">
          {tabs.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-widest rounded-full border transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-brand-gold text-brand-brown border-brand-gold shadow-md scale-105"
                    : "border-brand-gold/30 text-brand-offwhite hover:border-brand-gold hover:text-brand-gold"
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
            <p className="text-brand-gold text-xs tracking-widest uppercase">Carregando Vitrine...</p>
          </div>
        )}

        {/* Products Grid */}
        {!loading && (
          <motion.div 
            layout 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 min-h-[400px]"
          >
            <AnimatePresence mode="popLayout">
              {displayProducts.map((product) => {
                const hasDiscount = product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price);
                const discountPct = hasDiscount
                  ? Math.round(
                      ((parseFloat(product.compareAtPrice) - parseFloat(product.price)) /
                        parseFloat(product.compareAtPrice)) *
                        100
                    )
                  : 0;

                const formattedPrice = `R$ ${parseFloat(product.price).toFixed(2).replace(".", ",")}`;
                const formattedComparePrice = product.compareAtPrice ? `R$ ${parseFloat(product.compareAtPrice).toFixed(2).replace(".", ",")}` : "";

                const isFallback = product.tags === "fallback";
                const isCaneca = product.handle?.toLowerCase().includes("caneca") || product.title?.toLowerCase().includes("caneca");

                return (
                  <motion.div
                    key={product.handle}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="group relative flex flex-col justify-between bg-[#2C1A0E]/40 border border-brand-gold/10 p-5 rounded-sm hover:border-brand-gold/30 transition-all duration-500 hover:shadow-2xl hover:shadow-black/40 h-full reveal-on-scroll"
                  >
                    {/* Product Image Area */}
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-brand-brown/50 mb-8">
                      <Link href={isFallback ? `/catalogue` : `/product/${product.handle}`} className="absolute inset-0 z-0">
                        <div
                          className={`absolute inset-0 bg-cover transition-transform duration-700 ease-out group-hover:scale-105 ${
                            isCaneca ? "bg-top" : "bg-center"
                          }`}
                          style={{ backgroundImage: `url('${product.image}')` }}
                        />
                      </Link>
                      {/* Vignette overlay */}
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Badges */}
                      <div className="absolute top-4 left-4 flex flex-col gap-2">
                        {isFallback ? (
                          <span className="px-3 py-1 bg-brand-brown/90 text-brand-gold text-[10px] font-bold tracking-wider uppercase rounded-sm border border-brand-gold/20 backdrop-blur-xs">
                            Estilo Western
                          </span>
                        ) : hasDiscount && (
                          <div className="relative w-14 h-14 flex items-center justify-center">
                            <img src="/images/discount.png" alt="Desconto" className="absolute inset-0 w-full h-full animate-[spin_8s_linear_infinite]" />
                            <span className="relative z-10 text-white text-[13px] font-black tracking-widest drop-shadow-md">
                              -{discountPct}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Add to Cart Overlay */}
                      <div className="absolute bottom-4 left-4 right-4 translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10">
                        <Link 
                          href={isFallback ? `/catalogue?category=${activeCategory}` : `/product/${product.handle}`} 
                          className="w-full py-3 bg-brand-gold hover:bg-brand-tan text-brand-brown text-xs font-bold tracking-widest uppercase rounded-full shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          {isFallback ? "Ver no Catálogo" : "Comprar Agora"}
                        </Link>
                      </div>
                    </div>

                    {/* Info Area */}
                    <div className="flex flex-col flex-grow">
                      <div className="flex items-center gap-1 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="w-3.5 h-3.5 fill-brand-gold text-brand-gold"
                          />
                        ))}
                      </div>
                      <Link href={isFallback ? `/catalogue?category=${activeCategory}` : `/product/${product.handle}`}>
                        <h3 className="font-display text-lg lg:text-xl font-medium tracking-tight text-brand-offwhite group-hover:text-brand-gold transition-colors duration-300 mb-2">
                          {product.title}
                        </h3>
                      </Link>
                      <div className="flex items-baseline gap-2 mt-auto">
                        <p className="text-base font-semibold text-brand-gold tracking-wide">
                          {formattedPrice}
                        </p>
                        {hasDiscount && (
                          <p className="text-xs text-brand-offwhite/40 line-through">
                            {formattedComparePrice}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Error State / Fallback Action */}
        {!loading && error && displayProducts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">Não foi possível carregar os produtos desta vitrine.</p>
            <button
              onClick={fetchProducts}
              className="px-6 py-2.5 bg-brand-gold text-brand-brown text-xs font-bold uppercase tracking-widest rounded-full hover:bg-brand-tan transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        )}

      </div>
    </section>
  );
}
