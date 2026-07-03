"use client";

const messages = [
  "✦ Produtos com até 50% OFF",
  "✦ Frete para todo o Brasil",
  "✦ Troca grátis em até 30 dias",
  "✦ Produtos com até 50% OFF",
  "✦ Pagamento 100% seguro",
  "✦ Produtos com até 50% OFF",
  "✦ Frete para todo o Brasil",
  "✦ Troca grátis em até 30 dias",
  "✦ Produtos com até 50% OFF",
  "✦ Pagamento 100% seguro",
];

export default function AnnouncementBar() {
  return (
    <div
      className="w-full overflow-hidden bg-[#1a0f08] border-b border-brand-gold/20 relative flex items-center"
      style={{ height: "var(--announcement-h, 32px)" }}
    >
      <div className="marquee-track flex whitespace-nowrap">
        {[...messages, ...messages].map((msg, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-3 px-6 text-[11px] font-semibold tracking-[0.22em] uppercase text-brand-gold leading-none"
          >
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
}
