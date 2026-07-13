export function formatCurrency(amountCents: number | undefined | null): string {
  if (amountCents == null) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}
