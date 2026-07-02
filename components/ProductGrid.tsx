"use client";

import { useState, useEffect } from "react";
import { Star, ShoppingBag, Eye, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const products = [
  {
    id: 1,
    name: "Caneca Térmica Rústica",
    category: "acessorios",
    price: "R$ 97,50",
    rating: 5,
    tag: "Exclusivo",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/cliente_3a7d0d43-999e-4f1d-b5f6-fe09c489b351.png?v=1781103632",
    slug: "caneca-homem-de-respeito-times",
  },
  {
    id: 2,
    name: "Pantufa Texana Bota Cowboy",
    category: "botas",
    price: "R$ 97,90",
    rating: 5,
    tag: "Mais Vendido",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/pantufa-texana-marrom-1-BwtUpJUt.webp?v=1781105203",
    slug: "pantufa-texana-bota-cowboy",
  },
  {
    id: 3,
    name: "Jaqueta Masculina Ariat Nylon",
    category: "jaquetas",
    price: "R$ 97,90",
    rating: 5,
    tag: "Coleção Frio",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/ariat-nylon-marrom-1-tMOsz5tf.webp?v=1781105201",
    slug: "jaqueta-masculina-ariat-nylon-bordado-marrom",
  },
  {
    id: 4,
    name: "Jaqueta Softshell Feminina",
    category: "jaquetas",
    price: "R$ 97,90",
    rating: 5,
    tag: "Novidade",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/ariat-softshell-fem-1-DMI5fI3.webp?v=1781105199",
    slug: "jaqueta-ariat-softshell-importada-feminina",
  },
  {
    id: 5,
    name: "Jaqueta Ariat Jeans Trucker",
    category: "jaquetas",
    price: "R$ 97,90",
    rating: 5,
    tag: "Clássico",
    image: "https://cdn.shopify.com/s/files/1/0787/4769/7349/files/ariat-jeans-1-D1Vs79jD.webp?v=1781105213",
    slug: "jaqueta-ariat-jeans-importada-masculina",
  },
];

export default function ProductGrid() {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(3);

  useEffect(() => {
    const updateItemsPerPage = () => {
      if (window.innerWidth >= 1024) {
        setItemsPerPage(3);
      } else if (window.innerWidth >= 640) {
        setItemsPerPage(2);
      } else {
        setItemsPerPage(1);
      }
    };
    updateItemsPerPage();
    window.addEventListener("resize", updateItemsPerPage);
    return () => window.removeEventListener("resize", updateItemsPerPage);
  }, []);

  // Ensure currentIndex stays within bounds when itemsPerPage changes
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, products.length - itemsPerPage)));
  }, [itemsPerPage]);

  const toggleFavorite = (id: number) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter((favId) => favId !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, products.length - itemsPerPage));
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  const maxIndex = Math.max(0, products.length - itemsPerPage);

  return (
    <section id="vitrine" className="py-24 bg-brand-brown text-brand-offwhite overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-[1px] w-6 bg-brand-gold" />
              <span className="text-xs font-bold tracking-[0.2em] text-brand-gold uppercase">
                Seleção da Casa
              </span>
              <span className="h-[1px] w-6 bg-brand-gold" />
            </div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-brand-offwhite mb-4">
              Peças em Destaque
            </h2>
            <p className="text-sm text-brand-offwhite/60 font-light leading-relaxed">
              Descubra as criações exclusivas da Parada de Ouro, unindo o melhor da tradição com a inovação em design de moda sertaneja.
            </p>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={prevSlide}
              disabled={currentIndex === 0}
              className={`p-3 rounded-full border border-brand-gold/30 text-brand-gold transition-all duration-300 ${
                currentIndex === 0
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-brand-gold hover:text-brand-brown hover:border-brand-gold cursor-pointer"
              }`}
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextSlide}
              disabled={currentIndex >= maxIndex}
              className={`p-3 rounded-full border border-brand-gold/30 text-brand-gold transition-all duration-300 ${
                currentIndex >= maxIndex
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-brand-gold hover:text-brand-brown hover:border-brand-gold cursor-pointer"
              }`}
              aria-label="Próximo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Products Carousel Container */}
        <div className="relative overflow-visible">
          <div className="overflow-hidden -mx-4 px-4">
            <motion.div
              className="flex"
              animate={{ x: `-${currentIndex * (100 / itemsPerPage)}%` }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              style={{ width: `${(products.length / itemsPerPage) * 100}%` }}
            >
              {products.map((product) => (
                <div
                  key={product.id}
                  style={{ width: `${100 / products.length}%` }}
                  className="px-4 shrink-0"
                >
                  <div className="group relative flex flex-col justify-between bg-brand-offwhite/[0.02] border border-brand-offwhite/5 p-4 rounded-sm hover:border-brand-gold/20 transition-all duration-500 hover:shadow-2xl hover:shadow-black/20 h-full">
                    {/* Product Image Area */}
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-brand-brown/50 mb-6">
                      <Link href={`/product/${product.slug}`} className="absolute inset-0 z-0">
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                          style={{ backgroundImage: `url('${product.image}')` }}
                        />
                      </Link>
                      {/* Subtle vignette */}
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Badges & Icons */}
                      <div className="absolute top-4 left-4 flex flex-col gap-2">
                        {product.tag && (
                          <span className="px-3 py-1 bg-brand-gold/90 text-brand-brown text-[10px] font-bold tracking-wider uppercase rounded-sm backdrop-blur-xs">
                            {product.tag}
                          </span>
                        )}
                      </div>

                      <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                        <button
                          onClick={() => toggleFavorite(product.id)}
                          className="p-2.5 bg-brand-brown/85 hover:bg-brand-gold text-brand-offwhite hover:text-brand-brown rounded-full shadow-md transition-colors cursor-pointer"
                          aria-label="Favoritar"
                        >
                          <Heart
                            className={`w-4 h-4 ${favorites.includes(product.id) ? "fill-current" : ""}`}
                          />
                        </button>
                        <button
                          className="p-2.5 bg-brand-brown/85 hover:bg-brand-gold text-brand-offwhite hover:text-brand-brown rounded-full shadow-md transition-colors cursor-pointer"
                          aria-label="Espiar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Add to Cart Overlay */}
                      <div className="absolute bottom-4 left-4 right-4 translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10">
                        <Link href={`/product/${product.slug}`} className="w-full py-3 bg-brand-gold hover:bg-brand-tan text-brand-brown text-xs font-bold tracking-widest uppercase rounded-sm shadow-md transition-all flex items-center justify-center gap-2">
                          <ShoppingBag className="w-4 h-4" />
                          Comprar Agora
                        </Link>
                      </div>
                    </div>

                    {/* Info Area */}
                    <div className="flex flex-col flex-grow">
                      <div className="flex items-center gap-1 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < product.rating
                                ? "fill-brand-gold text-brand-gold"
                                : "text-brand-offwhite/20"
                            }`}
                          />
                        ))}
                      </div>
                      <Link href={`/product/${product.slug}`}>
                        <h3 className="font-display text-lg lg:text-xl font-medium tracking-tight text-brand-offwhite group-hover:text-brand-gold transition-colors duration-300 mb-2">
                          {product.name}
                        </h3>
                      </Link>
                      <p className="text-base font-semibold text-brand-tan tracking-wide">
                        {product.price}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Pagination Dots */}
        {maxIndex > 0 && (
          <div className="flex justify-center items-center gap-2.5 mt-12">
            {[...Array(maxIndex + 1)].map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`h-2 transition-all duration-300 rounded-full cursor-pointer ${
                  currentIndex === index ? "bg-brand-gold w-6" : "bg-brand-offwhite/20 w-2 hover:bg-brand-offwhite/40"
                }`}
                aria-label={`Ir para slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

