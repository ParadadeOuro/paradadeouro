import type { Metadata } from "next";
import { Sancreek, Sora } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cartStore";
import CartDrawer from "@/components/CartDrawer";
import ScrollRevealProvider from "@/components/ScrollRevealProvider";

const sancreek = Sancreek({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parada de Ouro | Premium Western Wear",
  description:
    "Moda country premium brasileira. Chapéus, botas, cintos e acessórios inspirados no estilo de vida do agronegócio moderno e cultura de rodeio de luxo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${sancreek.variable} ${sora.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full bg-[#F8F5F0] text-[#232323] font-sans flex flex-col">
        <ScrollRevealProvider />
        <CartProvider>
          {children}
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
