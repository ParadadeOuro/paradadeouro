"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  CatalogueProduct,
  parseCatalogueProducts,
  buildCsvUrl,
  formatPrice,
} from "@/lib/catalogueParser";

export default function NavbarSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch catalogue on first open
  const fetchCatalogue = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const url = buildCsvUrl();
      if (!url) throw new Error("CSV URL not configured");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setProducts(parseCatalogueProducts(text));
      setFetched(true);
    } catch {
      // Silently fail — search will show "no results"
    } finally {
      setLoading(false);
    }
  }, [fetched]);

  // Filter products by query
  const results =
    query.trim().length >= 2
      ? products.filter((p) => {
          const q = query.toLowerCase();
          return (
            p.title.toLowerCase().includes(q) ||
            p.tags.toLowerCase().includes(q) ||
            p.vendor.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q)
          );
        })
      : [];

  // Open search, fetch data, focus input
  const openSearch = () => {
    setIsOpen(true);
    fetchCatalogue();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setIsOpen(false);
    setQuery("");
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeSearch();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Search trigger button */}
      <button
        onClick={openSearch}
        className="p-2 hover:text-brand-gold transition-colors cursor-pointer"
        aria-label="Pesquisar"
      >
        <Search className="w-5 h-5" />
      </button>

      {/* Search overlay dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-full mt-3 w-[340px] sm:w-[400px] bg-[#2C1A0E] border border-brand-gold/20 rounded-sm shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-gold/10">
              <Search className="w-4 h-4 text-brand-gold shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar produtos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-brand-offwhite placeholder:text-brand-offwhite/40 outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-0.5 text-brand-offwhite/40 hover:text-brand-gold transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Results area */}
            <div className="max-h-[360px] overflow-y-auto overscroll-contain">
              {loading && (
                <div className="flex items-center justify-center py-8 gap-2 text-brand-offwhite/50 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando catálogo…
                </div>
              )}

              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <div className="text-center py-8 px-4">
                  <p className="text-brand-offwhite/40 text-xs tracking-wider">
                    Nenhum produto encontrado para &ldquo;{query}&rdquo;
                  </p>
                </div>
              )}

              {!loading && query.trim().length < 2 && query.trim().length > 0 && (
                <div className="text-center py-6 px-4">
                  <p className="text-brand-offwhite/40 text-xs tracking-wider">
                    Digite pelo menos 2 caracteres…
                  </p>
                </div>
              )}

              {!loading && query.trim().length === 0 && (
                <div className="text-center py-6 px-4">
                  <p className="text-brand-offwhite/40 text-xs tracking-wider">
                    Busque por nome, categoria ou marca
                  </p>
                </div>
              )}

              {results.slice(0, 8).map((product) => (
                <Link
                  key={product.handle}
                  href={`/product/${product.handle}`}
                  onClick={closeSearch}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-brand-gold/10 transition-colors border-b border-brand-offwhite/5 last:border-b-0 group"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-sm overflow-hidden bg-brand-offwhite/5 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-offwhite group-hover:text-brand-gold transition-colors truncate font-medium">
                      {product.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {product.type && (
                        <span className="text-[10px] text-brand-offwhite/40 uppercase tracking-wider">
                          {product.type}
                        </span>
                      )}
                      <span className="text-xs text-brand-gold font-semibold">
                        {formatPrice(product.price)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}

              {results.length > 8 && (
                <Link
                  href={`/catalogue?q=${encodeURIComponent(query)}`}
                  onClick={closeSearch}
                  className="block text-center py-3 text-xs text-brand-gold hover:text-brand-tan transition-colors uppercase tracking-widest font-semibold border-t border-brand-gold/10"
                >
                  Ver todos os {results.length} resultados →
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
