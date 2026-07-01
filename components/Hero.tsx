"use client";

import { ArrowRight, ShieldCheck, Gem, Compass } from "lucide-react";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-brand-brown">
      {/* Background Image Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[10000ms] hover:scale-105"
        style={{ backgroundImage: "url('./hero.png')" }}
      />
      {/* Dark overlay gradients for contrast and luxury feeling */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-brown/95 via-brand-brown/70 to-transparent md:bg-gradient-to-r" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-brown via-transparent to-brand-brown/40" />

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-6 lg:px-12 pt-28 pb-16 flex flex-col justify-center h-full min-h-screen">
        <div className="max-w-2xl text-brand-offwhite">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-2 mb-4"
          >
            <span className="h-[1px] w-8 bg-brand-gold" />
            <span className="text-xs lg:text-sm font-semibold tracking-[0.25em] text-brand-gold uppercase">
              Parada de Ouro
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-display text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1] text-brand-offwhite mb-6"
          >
            Tradição <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold to-brand-tan">
              Redefinida
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-base sm:text-lg text-brand-offwhite/80 leading-relaxed font-sans font-light max-w-lg mb-10"
          >
            A elegância do campo em perfeita sintonia com a sofisticação urbana. Vestuário western de luxo, feito à mão para a nova geração do agronegócio brasileiro.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 mb-16"
          >
            <a
              href="/catalogue"
              className="px-8 py-4 bg-brand-gold hover:bg-brand-tan text-brand-brown font-semibold tracking-widest text-xs uppercase rounded-sm shadow-lg hover:shadow-brand-gold/10 transition-all duration-300 flex items-center justify-center gap-3 group"
            >
              Ver Catálogo
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#nossa-história"
              className="px-8 py-4 border border-brand-offwhite/20 hover:border-brand-gold hover:bg-brand-offwhite/5 text-brand-offwhite font-semibold tracking-widest text-xs uppercase rounded-sm transition-all duration-300 flex items-center justify-center"
            >
              Conhecer Nossa História
            </a>
          </motion.div>

          {/* Quick Pillars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="grid grid-cols-3 gap-6 pt-8 border-t border-brand-offwhite/10"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-offwhite/5 rounded-full text-brand-gold">
                <Gem className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-brand-gold">Premium</p>
                <p className="text-[10px] text-brand-offwhite/60">Couro selecionado</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-offwhite/5 rounded-full text-brand-gold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-brand-gold">Manual</p>
                <p className="text-[10px] text-brand-offwhite/60">Artesanal de luxo</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-offwhite/5 rounded-full text-brand-gold">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-brand-gold">Herança</p>
                <p className="text-[10px] text-brand-offwhite/60">Alma brasileira</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Down Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <span className="text-[9px] tracking-[0.3em] uppercase text-brand-offwhite/40 mb-2 font-medium">Deslizar</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-1 h-3 rounded-full bg-brand-gold/60"
        />
      </div>
    </section>
  );
}
