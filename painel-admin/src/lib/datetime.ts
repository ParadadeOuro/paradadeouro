// Helpers de formatação de data/hora — SEMPRE em horário de Brasília (America/Sao_Paulo).
// Use sempre esses helpers no painel/admin; nunca chame toLocaleString direto,
// pois ele usa o fuso do navegador do operador.

const TZ = "America/Sao_Paulo";
const BRT_OFFSET = 3 * 3600_000; // Brasília = UTC-3 (fixo)

/** Retorna a data/hora atual no fuso de Brasília (BRT) */
export function nowBR(): Date {
  return new Date();
}

type DateInput = string | number | Date | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** "28/05/2026 20:39" */
export function formatBR(v: DateInput, fallback = "—"): string {
  const d = toDate(v);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "28/05/2026" */
export function formatBRDate(v: DateInput, fallback = "—"): string {
  const d = toDate(v);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** "20:39:12" */
export function formatBRTime(v: DateInput, fallback = "—"): string {
  const d = toDate(v);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

/**
 * Retorna o início do dia (00:00:00) em Brasília, normalizado para UTC.
 * Brasília 00:00:00 = UTC 03:00:00
 */
export function startOfDayBR(d: Date = new Date()): Date {
  const brDate = new Date(d.getTime() - BRT_OFFSET);
  const year = brDate.getUTCFullYear();
  const month = brDate.getUTCMonth();
  const day = brDate.getUTCDate();
  // Retorna o início do dia em UTC que corresponde ao 00:00 BRT
  return new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
}

/**
 * Retorna o fim do dia (23:59:59.999) em Brasília, normalizado para UTC.
 */
export function endOfDayBR(d: Date = new Date()): Date {
  const start = startOfDayBR(d);
  return new Date(start.getTime() + 24 * 3600_000 - 1);
}

/**
 * Retorna uma data relativa (D-n) no início do dia BR.
 */
export function daysAgoBR(n: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime() - n * 24 * 3600_000);
  return startOfDayBR(d);
}

