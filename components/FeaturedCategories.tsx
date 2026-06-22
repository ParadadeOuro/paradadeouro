"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const categories = [
  {
    id: "chapeus",
    title: "Chapéus Premium",
    subtitle: "A assinatura do estilo western",
    description: "Confeccionados com feltro nobre e pelos selecionados, inspirados na herança dos grandes campos.",
    image: "https://images.unsplash.com/photo-1517462964-21fdcec3f25b?auto=format&fit=crop&q=80&w=800",
    link: "#chapeus",
    gridArea: "md:col-span-2 md:row-span-1",
  },
  {
    id: "botas",
    title: "Botas de Couro",
    subtitle: "Durabilidade e maestria",
    description: "Construção legítima Goodyear Welt, com couro curtido artesanalmente para conforto incomparável.",
    image: "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&q=80&w=800",
    link: "#botas",
    gridArea: "md:col-span-1 md:row-span-2",
  },
  {
    id: "cintos",
    title: "Cintos & Acessórios",
    subtitle: "Detalhes em ouro e metal",
    description: "Fivelas robustas e couro trabalhado à mão com acabamento premium.",
    image: "https://images.unsplash.com/photo-1624224971170-2f84fed5eb5e?auto=format&fit=crop&q=80&w=800",
    link: "#cintos",
    gridArea: "md:col-span-1 md:row-span-1",
  },
  {
    id: "denim",
    title: "Coleção Denim",
    subtitle: "O dia a dia do agro moderno",
    description: "Modelagem impecável e costuras reforçadas para quem exige elegância e resistência.",
    image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=800",
    link: "#denim",
    gridArea: "md:col-span-2 md:row-span-1",
  },
];

export default function FeaturedCategories() {
  return (
    <section id="coleções" className="py-24 bg-brand-offwhite">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-[1px] w-6 bg-brand-tan" />
              <span className="text-xs font-bold tracking-[0.2em] text-brand-tan uppercase">
                Categorias Selecionadas
              </span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-brand-brown tracking-tight">
              O Essencial do Western de Luxo
            </h2>
          </div>
          <p className="mt-4 md:mt-0 text-sm text-brand-charcoal/70 max-w-xs leading-relaxed font-light">
            Cada peça da Parada de Ouro é selecionada sob critérios rigorosos de acabamento, material e design exclusivo.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[320px]">
          {categories.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className={`relative overflow-hidden group rounded-sm shadow-sm ${category.gridArea}`}
            >
              {/* Card Image */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url('${category.image}')` }}
              />
              {/* Overlay Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-brand-brown/95 via-brand-brown/40 to-transparent transition-opacity duration-500 group-hover:opacity-90" />
              
              {/* Card Content */}
              <div className="absolute inset-0 p-8 flex flex-col justify-end text-brand-offwhite">
                <span className="text-xs font-semibold tracking-wider text-brand-gold uppercase mb-1">
                  {category.subtitle}
                </span>
                <h3 className="font-display text-2xl lg:text-3xl font-bold tracking-tight mb-2">
                  {category.title}
                </h3>
                
                {/* Expandable description on Hover (desktop) */}
                <p className="text-xs text-brand-offwhite/70 font-light leading-relaxed max-h-0 opacity-0 overflow-hidden group-hover:max-h-24 group-hover:opacity-100 transition-all duration-500 ease-in-out mb-4">
                  {category.description}
                </p>

                <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-brand-gold group-hover:text-brand-offwhite transition-colors duration-300">
                  Explorar
                  <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
