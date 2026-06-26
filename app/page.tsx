import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ProductGrid from "@/components/ProductGrid";
import BrandStory from "@/components/BrandStory";
import Newsletter from "@/components/Newsletter";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F8F5F0]">
      <Navbar />
      <main className="flex-grow">
        <Hero />
        <ProductGrid />
        <BrandStory />
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
}
