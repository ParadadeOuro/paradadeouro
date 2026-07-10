"use client";

import { PhoneCall, Mail, MapPin } from "lucide-react";
import { Instagram, Youtube } from "./Icons";

export default function Footer() {
  return (
    <footer className="bg-brand-charcoal text-brand-offwhite border-t border-brand-offwhite/5 font-sans">
      
      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12">
        
        {/* Brand Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex flex-col">
            <img src="/images/logo.png" alt="Parada de Ouro" className="h-24 w-auto object-contain self-start" />
          </div>
          <p className="text-xs text-brand-offwhite/60 font-light leading-relaxed max-w-sm">
            Criando moda country premium para a nova era do agronegócio brasileiro. Unimos a beleza do feito à mão com a elegância do estilo western de luxo.
          </p>
          <div className="flex items-center space-x-4 pt-2">
            <a href="#" className="p-2 bg-brand-offwhite/5 hover:bg-brand-gold hover:text-brand-brown rounded-full transition-all duration-300" aria-label="Instagram">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" className="p-2 bg-brand-offwhite/5 hover:bg-brand-gold hover:text-brand-brown rounded-full transition-all duration-300" aria-label="Youtube">
              <Youtube className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Categories Shop */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Comprar</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="/catalogue" className="hover:text-brand-gold transition-colors">Catálogo</a></li>
          </ul>
        </div>

        {/* Brand/Company */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Nossa Marca</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="/" className="hover:text-brand-gold transition-colors">Página Principal</a></li>
          </ul>
        </div>

        {/* Help/Support */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Suporte</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="#" className="hover:text-brand-gold transition-colors">Entregas e Prazos</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Trocas & Devoluções</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Guia de Tamanhos</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Políticas de Privacidade</a></li>
          </ul>
        </div>

        {/* Contact Info */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Contato</h4>
          <ul className="space-y-3.5 text-xs text-brand-offwhite/70 font-light">
            <li className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
              <span>Av. Presidente Vargas, 1020<br />Ribeirão Preto - SP</span>
            </li>
            <li className="flex items-center gap-2.5">
              <PhoneCall className="w-4 h-4 text-brand-gold shrink-0" />
              <span>(16) 3904-8000</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-brand-gold shrink-0" />
              <span>vip@paradadeouro.com.br</span>
            </li>
          </ul>
        </div>

      </div>

      {/* Bottom Footer Info */}
      <div className="border-t border-brand-offwhite/5 bg-black/35 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-brand-offwhite/40 font-light">
            © {new Date().getFullYear()} Parada de Ouro Ltda. CNPJ 00.000.000/0001-00. Todos os direitos reservados.
          </p>
          
          {/* Mock payment methods / icons */}
          <div className="flex items-center space-x-3 opacity-60">
            <span className="text-[9px] uppercase tracking-wider text-brand-offwhite/60 mr-2">Pagamento Seguro:</span>
            <span className="px-2 py-0.5 border border-brand-offwhite/20 text-[9px] font-bold rounded-sm">PIX</span>
            <span className="px-2 py-0.5 border border-brand-offwhite/20 text-[9px] font-bold rounded-sm">VISA</span>
            <span className="px-2 py-0.5 border border-brand-offwhite/20 text-[9px] font-bold rounded-sm">MASTERCARD</span>
            <span className="px-2 py-0.5 border border-brand-offwhite/20 text-[9px] font-bold rounded-sm">ELO</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
