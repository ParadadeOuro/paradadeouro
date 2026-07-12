"use client";

import { PhoneCall, Mail, MapPin } from "lucide-react";
import { Instagram, Youtube } from "./Icons";

export default function Footer() {
  return (
    <footer className="bg-brand-charcoal text-brand-offwhite border-t border-brand-offwhite/5 font-sans">
      
      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12">
        
        {/* Brand Info */}
        <div className="lg:col-span-4 space-y-6 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="flex flex-col items-center lg:items-start">
            <img src="/images/logo.png" alt="Parada de Ouro" className="h-24 w-auto object-contain" />
          </div>
          <p className="text-xs text-brand-offwhite/60 font-light leading-relaxed max-w-sm">
            Criando moda country premium para a nova era do agronegócio brasileiro. Unimos a beleza do feito à mão com a elegância do estilo western de luxo.
          </p>
          <div className="flex items-center justify-center lg:justify-start space-x-4 pt-2">
            <a href="#" className="p-2 bg-brand-offwhite/5 hover:bg-brand-gold hover:text-brand-brown rounded-full transition-all duration-300" aria-label="Instagram">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" className="p-2 bg-brand-offwhite/5 hover:bg-brand-gold hover:text-brand-brown rounded-full transition-all duration-300" aria-label="Youtube">
              <Youtube className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Categories Shop */}
        <div className="lg:col-span-2 space-y-4 text-center lg:text-left">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Comprar</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="/catalogue" className="hover:text-brand-gold transition-colors">Catálogo</a></li>
          </ul>
        </div>

        {/* Brand/Company */}
        <div className="lg:col-span-2 space-y-4 text-center lg:text-left">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Nossa Marca</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="/" className="hover:text-brand-gold transition-colors">Página Principal</a></li>
          </ul>
        </div>

        {/* Help/Support */}
        <div className="lg:col-span-2 space-y-4 text-center lg:text-left">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Suporte</h4>
          <ul className="space-y-2.5 text-xs text-brand-offwhite/70 font-light">
            <li><a href="#" className="hover:text-brand-gold transition-colors">Entregas e Prazos</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Trocas & Devoluções</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Guia de Tamanhos</a></li>
            <li><a href="#" className="hover:text-brand-gold transition-colors">Políticas de Privacidade</a></li>
          </ul>
        </div>

        {/* Contact Info */}
        <div className="lg:col-span-2 space-y-4 text-center lg:text-left">
          <h4 className="text-xs font-semibold tracking-wider text-brand-gold uppercase">Contato</h4>
          <ul className="space-y-3.5 text-xs text-brand-offwhite/70 font-light">
            <li className="flex flex-col lg:flex-row items-center lg:items-start gap-2.5">
              <MapPin className="w-4 h-4 text-brand-gold shrink-0 lg:mt-0.5" />
              <span>Av. Presidente Vargas, 1020<br />Ribeirão Preto - SP</span>
            </li>
            <li className="flex flex-col lg:flex-row items-center gap-2.5">
              <PhoneCall className="w-4 h-4 text-brand-gold shrink-0" />
              <span>(16) 3904-8000</span>
            </li>
            <li className="flex flex-col lg:flex-row items-center gap-2.5">
              <Mail className="w-4 h-4 text-brand-gold shrink-0" />
              <span>vip@paradadeouro.com.br</span>
            </li>
          </ul>
        </div>

      </div>

      {/* Bottom Footer Info */}
      <div className="border-t border-brand-offwhite/5 bg-black/35 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="text-[10px] text-brand-offwhite/40 font-light">
            © {new Date().getFullYear()} Parada de Ouro Ltda. CNPJ 67.415.581/0001-01. Todos os direitos reservados.
          </p>
          
          {/* Payment methods / icons */}
          <div className="flex flex-wrap justify-center md:justify-start items-center gap-4">
            <span className="text-[9px] uppercase tracking-wider text-brand-offwhite/60 mr-2 w-full md:w-auto">Pagamento Seguro:</span>
            <img src="/images/Logo_-_pix_powered_by_Banco_Central_(Brazil,_2020).png" alt="PIX" className="h-4 w-auto object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
            <img src="/images/visa-brandmark-blue-1960x622.png" alt="VISA" className="h-3 w-auto object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
            <img src="/images/ma_symbol_opt_73_3x.png" alt="MasterCard" className="h-4 w-auto object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
            <img src="/images/ELO_Marca_principal_RGB-02.png" alt="Elo" className="h-4 w-auto object-contain grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
          </div>
        </div>
      </div>
    </footer>
  );
}
