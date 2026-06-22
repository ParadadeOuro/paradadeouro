"use client";

import { useState } from "react";
import { Star, ShoppingBag, Eye, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const products = [
  {
    id: 1,
    name: "Chapéu Eldorado Feltro Nobre",
    category: "chapeus",
    price: "R$ 1.490,00",
    rating: 5,
    tag: "Exclusivo",
    image: "https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?auto=format&fit=crop&q=80&w=600",
  },
  {
    id: 2,
    name: "Bota Chelsea Mangalarga Imperial",
    category: "botas",
    price: "R$ 1.890,00",
    rating: 5,
    tag: "Mais Vendido",
    image: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&q=80&w=600",
  },
  {
    id: 3,
    name: "Cinto Fivela Ouro Velho",
    category: "cintos",
    price: "R$ 780,00",
    rating: 4,
    tag: "Edição Limitada",
    image: "https://images.unsplash.com/photo-1624224971170-2f84fed5eb5e?auto=format&fit=crop&q=80&w=600",
  },
  {
    id: 4,
    name: "Camisa de Linho Fazendeiro",
    category: "vestuario",
    price: "R$ 520,00",
    rating: 5,
    tag: "Novo",
    image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=600",
  },
  {
    id: 5,
    name: "Bota Texana Tradicional Ouro",
    category: "botas",
    price: "R$ 2.450,00",
    rating: 5,
    tag: "Exclusivo",
    image: "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&q=80&w=600",
  },
  {
    id: 6,
    name: "Chapéu Fedora Pantanal Tan",
    category: "chapeus",
    price: "R$ 1.150,00",
    rating: 4,
    tag: "Novo",
    image: "https://images.unsplash.com/photo-1533827432537-70133748f5c8?auto=format&fit=crop&q=80&w=600",
  },
];

export default function ProductGrid() {
  const [activeTab, setActiveTab] = useState("todos");
  const [favorites, setFavorites] = useState<number[]>([]);

  const filteredProducts = activeTab === "todos"
    ? products
    : products.filter(p => p.category === activeTab);

  const toggleFavorite = (id: number) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(favId => favId !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  return (
    <section id="vitrine" className="py-24 bg-brand-brown text-brand-offwhite">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        
        {/* Header Section */}
        <div className="text-center max-w-xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-2 mb-3">
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

        {/* Tab Filters */}
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          {[
            { id: "todos", label: "Ver Tudo" },
            { id: "chapeus", label: "Chapéus" },
            { id: "botas", label: "Botas" },
            { id: "cintos", label: "Cintos" },
            { id: "vestuario", label: "Vestuário" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-300 ${
                activeTab === tab.id
                  ? "bg-brand-gold text-brand-brown"
                  : "bg-brand-offwhite/5 border border-brand-offwhite/10 text-brand-offwhite hover:bg-brand-offwhite/10 hover:border-brand-gold/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <motion.div 
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                key={product.id}
                className="group relative flex flex-col justify-between bg-brand-offwhite/[0.02] border border-brand-offwhite/5 p-4 rounded-sm hover:border-brand-gold/20 transition-all duration-500 hover:shadow-2xl hover:shadow-black/20"
              >
                {/* Product Image Area */}
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-brand-brown/50 mb-6">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                    style={{ backgroundImage: `url('${product.image}')` }}
                  />
                  {/* Subtle vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
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
                      className="p-2.5 bg-brand-brown/85 hover:bg-brand-gold text-brand-offwhite hover:text-brand-brown rounded-full shadow-md transition-colors"
                      aria-label="Favoritar"
                    >
                      <Heart 
                        className={`w-4 h-4 ${favorites.includes(product.id) ? "fill-current" : ""}`} 
                      />
                    </button>
                    <button
                      className="p-2.5 bg-brand-brown/85 hover:bg-brand-gold text-brand-offwhite hover:text-brand-brown rounded-full shadow-md transition-colors"
                      aria-label="Espiar"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Add to Cart Overlay */}
                  <div className="absolute bottom-4 left-4 right-4 translate-y-6 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <button className="w-full py-3 bg-brand-gold hover:bg-brand-tan text-brand-brown text-xs font-bold tracking-widest uppercase rounded-sm shadow-md transition-all flex items-center justify-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      Adicionar à Sacola
                    </button>
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
                  <h3 className="font-display text-lg lg:text-xl font-medium tracking-tight text-brand-offwhite group-hover:text-brand-gold transition-colors duration-300 mb-2">
                    {product.name}
                  </h3>
                  <p className="text-base font-semibold text-brand-tan tracking-wide">
                    {product.price}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
