"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

const categories = [
  {
    id: "chapeus",
    title: "Chapéus Premium",
    subtitle: "A assinatura do estilo western",
    description: "Confeccionados com feltro nobre e pelos selecionados, inspirados na herança dos grandes campos.",
    image: "/images/categories/chapeus.png",
    link: "/catalogue?category=chapeus",
    gridArea: "md:col-span-2 md:row-span-1",
  },
  {
    id: "botas",
    title: "Botas de Couro",
    subtitle: "Durabilidade e maestria",
    description: "Construção legítima Goodyear Welt, com couro curtido artesanalmente para conforto incomparável.",
    image: "/images/categories/botas.png",
    link: "/catalogue?category=botas",
    gridArea: "md:col-span-1 md:row-span-2",
  },
  {
    id: "cintos",
    title: "Cintos & Acessórios",
    subtitle: "Detalhes em ouro e metal",
    description: "Fivelas robustas e couro trabalhado à mão com acabamento premium.",
    image: "/images/categories/cintos.png",
    link: "/catalogue?category=cintos",
    gridArea: "md:col-span-1 md:row-span-1",
  },
  {
    id: "camisas-denim",
    title: "Coleção Denim",
    subtitle: "O dia a dia do agro moderno",
    description: "Modelagem impecável e costuras reforçadas para quem exige elegância e resistência.",
    image: "/images/categories/denim.png",
    link: "/catalogue?category=camisas-denim",
    gridArea: "md:col-span-2 md:row-span-1",
  },
];

export default function FeaturedCategories() {
  return (
    <section id="coleções" className="py-16 md:py-20 bg-brand-offwhite">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
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

        {/* Categories List */}
        <div className="flex flex-col gap-6">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              href={category.link}
              className="block group bg-white border border-[#E8E0D5] rounded-sm overflow-hidden hover:shadow-xl transition-all duration-300"
            >
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="flex flex-col md:flex-row min-h-[220px]"
              >
                {/* Image Section */}
                <div className="w-full md:w-2/5 lg:w-1/3 h-[240px] md:h-auto relative overflow-hidden bg-[#F0EBE3]">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${category.image}')` }}
                  />
                  {/* Subtle overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-brown/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                
                {/* Content Section */}
                <div className="flex-1 p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37] uppercase mb-2">
                    {category.subtitle}
                  </span>
                  <h3 className="font-display text-3xl font-bold tracking-tight text-[#2C1A0E] mb-4 group-hover:text-[#A89070] transition-colors duration-300">
                    {category.title}
                  </h3>
                  <p className="text-sm text-[#6B4C2A] font-light leading-relaxed max-w-2xl mb-8">
                    {category.description}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#2C1A0E] mt-auto">
                    Explorar Coleção
                    <ArrowRight className="w-4 h-4 text-[#D4AF37] transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
