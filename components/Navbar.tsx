"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, User, ShoppingBag, Menu, X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cartStore";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { openCart, count } = useCart();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${isScrolled
            ? "bg-brand-brown/95 backdrop-blur-md py-4 shadow-lg border-b border-brand-tan/10 text-brand-offwhite"
            : "bg-gradient-to-b from-brand-brown/80 to-transparent py-6 text-brand-offwhite"
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex flex-col items-start group">
            <span className="font-display text-2xl lg:text-3xl font-bold tracking-widest text-brand-gold group-hover:text-brand-tan transition-colors">
              PARADA DE OURO
            </span>
            <span className="text-[10px] tracking-[0.3em] font-sans text-brand-tan uppercase mt-0.5">
              Premium Western Wear
            </span>
          </a>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-8 lg:space-x-12">
            {(["Coleções", "Nossa História"] as string[]).map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(" ", "-")}`}
                className="relative py-2 text-sm font-medium tracking-wider uppercase hover:text-brand-gold transition-colors duration-300 group"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-gold transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
            <Link
              href="/catalogue"
              className="relative py-2 text-sm font-medium tracking-wider uppercase hover:text-brand-gold transition-colors duration-300 group"
            >
              Catálogo
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-brand-gold transition-all duration-300 group-hover:w-full" />
            </Link>
          </div>

          {/* Desktop Icons & CTA */}
          <div className="hidden md:flex items-center space-x-6">
            <button
              onClick={openCart}
              className="p-2 hover:text-brand-gold transition-colors relative"
              aria-label="Sacola"
            >
              <ShoppingBag className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-gold text-brand-brown text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
            <a
              href="#coleções"
              className="px-6 py-2.5 bg-brand-gold hover:bg-brand-tan text-brand-brown font-medium text-xs tracking-widest uppercase rounded-sm shadow-sm transition-all duration-300 flex items-center gap-2"
            >
              Comprar
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center space-x-4">
            <button
              onClick={openCart}
              className="p-2 relative"
              aria-label="Sacola"
            >
              <ShoppingBag className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-gold text-brand-brown text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-brand-offwhite"
              aria-label="Abrir Menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-brand-brown z-40 pt-28 px-8 flex flex-col justify-between pb-12 md:hidden"
          >
            <div className="flex flex-col space-y-6">
              {(["Coleções", "Nossa História"] as string[]).map((item) => (
                <a
                  key={item}
                  onClick={() => setIsMobileMenuOpen(false)}
                  href={`#${item.toLowerCase().replace(" ", "-")}`}
                  className="text-2xl font-display font-medium text-brand-offwhite hover:text-brand-gold transition-colors"
                >
                  {item}
                </a>
              ))}
              <Link
                href="/catalogue"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-2xl font-display font-medium text-brand-offwhite hover:text-brand-gold transition-colors"
              >
                Catálogo
              </Link>
            </div>

            <div className="flex flex-col space-y-6">
              <a
                href="#coleções"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-4 bg-brand-gold hover:bg-brand-tan text-brand-brown text-center font-bold tracking-widest uppercase rounded-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                Explorar Coleção
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
