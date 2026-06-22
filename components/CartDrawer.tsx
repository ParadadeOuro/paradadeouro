"use client";

import { useCart } from "@/lib/cartStore";
import { X, Minus, Plus, ShoppingBag, ArrowRight, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export default function CartDrawer() {
  const { state, closeCart, removeItem, updateQuantity, total, count } = useCart();

  return (
    <AnimatePresence>
      {state.isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 35 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#F8F5F0] z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E0D5] bg-[#2C1A0E]">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
                <h2
                  className="font-display text-lg font-bold text-[#D4AF37] tracking-widest uppercase"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Sacola
                </h2>
                {count > 0 && (
                  <span className="bg-[#D4AF37] text-[#2C1A0E] text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {count}
                  </span>
                )}
              </div>
              <button
                onClick={closeCart}
                className="p-1.5 text-[#C8B99A] hover:text-[#D4AF37] transition-colors"
                aria-label="Fechar sacola"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-grow overflow-y-auto px-6 py-4 space-y-4">
              {state.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
                  <ShoppingBag className="w-16 h-16 text-[#C8B99A]" strokeWidth={1} />
                  <p className="text-[#6B4C2A] font-medium">Sua sacola está vazia</p>
                  <p className="text-[#A89070] text-sm">
                    Adicione produtos do catálogo para continuar.
                  </p>
                  <Link
                    href="/catalogue"
                    onClick={closeCart}
                    className="mt-2 px-6 py-2.5 bg-[#2C1A0E] text-[#D4AF37] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#D4AF37] hover:text-[#2C1A0E] transition-all duration-200"
                  >
                    Ver Catálogo
                  </Link>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {state.items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-4 bg-white rounded-sm p-3 border border-[#E8E0D5] shadow-sm"
                    >
                      {/* Image */}
                      <div className="w-20 h-20 shrink-0 rounded-sm overflow-hidden bg-[#F0EBE3]">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#C8B99A]">
                            <ShoppingBag className="w-8 h-8 opacity-30" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-grow min-w-0">
                        <h3 className="text-xs font-semibold text-[#2C1A0E] leading-snug line-clamp-2 mb-1">
                          {item.title}
                        </h3>
                        {/* Selected options */}
                        {Object.entries(item.selectedOptions).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-block text-[9px] bg-[#F0EBE3] text-[#6B4C2A] px-1.5 py-0.5 rounded-sm mr-1 mb-1 uppercase tracking-wide font-medium"
                          >
                            {k}: {v}
                          </span>
                        ))}

                        {/* Qty + price row */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-[#E8E0D5] rounded-sm">
                            <button
                              onClick={() =>
                                item.quantity === 1
                                  ? removeItem(item.id)
                                  : updateQuantity(item.id, item.quantity - 1)
                              }
                              className="px-2 py-1 text-[#6B4C2A] hover:text-[#2C1A0E] transition-colors"
                              aria-label="Diminuir"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 text-xs font-semibold text-[#2C1A0E] min-w-[24px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.quantity + 1)
                              }
                              className="px-2 py-1 text-[#6B4C2A] hover:text-[#2C1A0E] transition-colors"
                              aria-label="Aumentar"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <p className="text-sm font-bold text-[#2C1A0E]">
                            {formatBRL(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 self-start p-1 text-[#C8B99A] hover:text-red-400 transition-colors"
                        aria-label="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {state.items.length > 0 && (
              <div className="border-t border-[#E8E0D5] px-6 py-5 bg-white space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#6B4C2A] uppercase tracking-widest font-medium">
                    Total
                  </span>
                  <span className="text-xl font-bold text-[#2C1A0E]">
                    {formatBRL(total)}
                  </span>
                </div>
                <p className="text-[10px] text-[#A89070] text-center">
                  Frete calculado no checkout
                </p>
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-[#D4AF37] hover:bg-[#C8A030] text-[#2C1A0E] font-bold text-sm uppercase tracking-widest rounded-sm transition-all duration-200 shadow-md"
                >
                  Finalizar Compra
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
