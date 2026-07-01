"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

export default function BrandStory() {
  return (
    <section id="nossa-história" className="py-24 bg-brand-offwhite text-brand-brown overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">

          {/* Text Content Area */}
          <div className="lg:col-span-6 space-y-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-[1px] w-6 bg-brand-tan" />
                <span className="text-xs font-bold tracking-[0.2em] text-brand-tan uppercase">
                  O Espírito Parada de Ouro
                </span>
              </div>
              <h2 className="font-display text-4xl lg:text-5xl font-semibold tracking-tight text-brand-brown leading-tight">
                Do Coração do Campo ao Luxo Western
              </h2>
            </div>

            <p className="text-base text-brand-charcoal/80 font-light leading-relaxed">
              Nascemos da paixão pelo estilo de vida do agronegócio e pela rica cultura dos rodeios brasileiros. A Parada de Ouro surgiu para redefinir o conceito de moda country no Brasil, unindo a robustez do campo à sofisticação das passarelas de luxo.
            </p>

            <p className="text-base text-brand-charcoal/80 font-light leading-relaxed">
              Nossas criações são inspiradas na tradição dos grandes fabricantes westerns mundiais, mas adaptadas à leveza, modernidade e clima do Brasil. Produzimos em lotes limitados e numerados, garantindo que cada peça carregue uma história de exclusividade.
            </p>

            {/* Pillar Grid */}
            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-brand-tan/20">
              <div>
                <h3 className="font-display text-xl font-semibold text-brand-tan mb-2">Artesanal</h3>
                <p className="text-xs text-brand-charcoal/70 leading-relaxed font-light">
                  Processo manual de curtimento e costura realizado por mestres artesãos.
                </p>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-brand-tan mb-2">Exclusivo</h3>
                <p className="text-xs text-brand-charcoal/70 leading-relaxed font-light">
                  Design próprio e coleções que não se repetem. Feito para ser único.
                </p>
              </div>
            </div>

            <div className="pt-4">
              <a
                href="#vitrine"
                className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-brand-brown hover:text-brand-gold transition-colors duration-300 group"
              >
                Conhecer a Produção
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>

          {/* Editorial Image Area */}
          <div className="lg:col-span-6 relative">
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="relative aspect-[4/5] w-full max-w-lg mx-auto overflow-hidden rounded-sm shadow-xl"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 hover:scale-105"
                style={{
                  backgroundImage: "url('https://images.unsplash.com/photo-1624125278860-381b6acd3b44?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')",
                }}
              />
              {/* Elegant Gold-bordered inner frame */}
              <div className="absolute inset-4 border border-brand-gold/25 pointer-events-none" />
              {/* Warm filter overlay */}
              <div className="absolute inset-0 bg-brand-brown/10 mix-blend-multiply" />
            </motion.div>

            {/* Floating brand signature card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute -bottom-8 -left-8 hidden sm:block bg-brand-brown text-brand-offwhite p-8 rounded-sm shadow-2xl max-w-[260px] border border-brand-gold/15"
            >
              <p className="font-display text-2xl font-semibold text-brand-gold mb-2">100%</p>
              <p className="text-xs uppercase tracking-wider font-bold mb-1">Origem Brasileira</p>
              <p className="text-[10px] text-brand-offwhite/60 leading-relaxed font-light">
                Valorizamos a mão de obra nacional, com couros vindos dos melhores curtumes do país.
              </p>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
