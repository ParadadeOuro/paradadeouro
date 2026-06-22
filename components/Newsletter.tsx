"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
      setEmail("");
    }
  };

  return (
    <section className="py-24 bg-brand-brown relative overflow-hidden border-t border-brand-tan/10">
      {/* Background visual details */}
      <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
        <div className="absolute -top-[50%] -left-[20%] w-[80%] h-[150%] rounded-full bg-gradient-to-br from-brand-gold to-transparent filter blur-3xl" />
        <div className="absolute -bottom-[50%] -right-[20%] w-[80%] h-[150%] rounded-full bg-gradient-to-tl from-brand-tan to-transparent filter blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="h-[1px] w-6 bg-brand-gold" />
          <span className="text-xs font-bold tracking-[0.25em] text-brand-gold uppercase">
            Clube Exclusivo
          </span>
          <span className="h-[1px] w-6 bg-brand-gold" />
        </div>

        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-brand-offwhite mb-6">
          Faça Parte da Nossa Comitiva
        </h2>

        <p className="text-base text-brand-offwhite/70 max-w-xl mx-auto mb-10 font-light leading-relaxed">
          Assine nossa newsletter e receba acesso antecipado a coleções limitadas, convites para camarotes parceiros nos maiores rodeios do país e curadoria de moda western de luxo.
        </p>

        <div className="max-w-md mx-auto">
          {!submitted ? (
            <motion.form 
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Seu e-mail principal"
                className="flex-grow px-5 py-4 bg-brand-offwhite/5 border border-brand-offwhite/10 rounded-sm text-brand-offwhite placeholder-brand-offwhite/30 text-sm focus:outline-none focus:border-brand-gold transition-colors duration-300"
              />
              <button
                type="submit"
                className="px-6 py-4 bg-brand-gold hover:bg-brand-tan text-brand-brown font-semibold tracking-widest text-xs uppercase rounded-sm shadow-lg transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                Cadastrar
                <Send className="w-3.5 h-3.5" />
              </button>
            </motion.form>
          ) : (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-6 bg-brand-offwhite/5 border border-brand-gold/20 rounded-sm flex flex-col items-center justify-center text-brand-offwhite"
            >
              <CheckCircle2 className="w-8 h-8 text-brand-gold mb-3 animate-bounce" />
              <h3 className="font-display text-lg font-bold mb-1">Inscrição Confirmada</h3>
              <p className="text-xs text-brand-offwhite/60 font-light">
                Bem-vindo à comitiva. Em breve você receberá nossos editoriais exclusivos.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
