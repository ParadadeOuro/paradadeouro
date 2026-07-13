import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, TrendingUp, DollarSign, Receipt, Percent, Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  getFinanceSummary, listAdSpend, upsertAdSpend, deleteAdSpend,
} from "@/lib/finance.functions";
import { formatCurrency } from "@/data/products";
import { formatBRDate } from "@/lib/datetime";

type Preset = "today" | "yesterday" | "7d" | "15d" | "30d" | "custom";
const PRESET_LABELS: Record<Preset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "15d": "15 dias",
  "30d": "30 dias",
  custom: "Personalizado",
};

function brTodayKey() {
  const d = new Date(Date.now() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export function CostsTab() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customStart, setCustomStart] = useState(brTodayKey());
  const [customEnd, setCustomEnd] = useState(brTodayKey());
  const qc = useQueryClient();
  const fetchSummary = useServerFn(getFinanceSummary);
  const fetchSpends = useServerFn(listAdSpend);
  const doUpsert = useServerFn(upsertAdSpend);
  const doDelete = useServerFn(deleteAdSpend);

  const queryPayload =
    preset === "custom"
      ? { preset, customStart, customEnd }
      : { preset };

  const queryKeyPart =
    preset === "custom" ? ["custom", customStart, customEnd] : [preset];

  const sumQ = useQuery({
    queryKey: ["finance-summary", ...queryKeyPart],
    queryFn: () => fetchSummary({ data: queryPayload }),
    refetchInterval: 60_000,
  });

  const spendsQ = useQuery({
    queryKey: ["ad-spend", ...queryKeyPart],
    queryFn: () => fetchSpends({ data: queryPayload }),
  });

  const upsertMut = useMutation({
    mutationFn: (v: { id?: string; spend_date: string; amount_cents: number; notes?: string }) =>
      doUpsert({ data: v }),
    onSuccess: () => {
      toast.success("Gasto salvo");
      qc.invalidateQueries({ queryKey: ["ad-spend"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["ad-spend"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const s = sumQ.data;
  const periodLabel =
    preset === "custom"
      ? `${formatBRDate(customStart + "T12:00:00")} → ${formatBRDate(customEnd + "T12:00:00")}`
      : PRESET_LABELS[preset].toLowerCase();

  return (
    <div className="space-y-6">
      {/* Filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Período:</span>
        {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => {
          const active = p === preset;
          return (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                active ? "bg-[#FFCC00] text-black border-[#FFCC00]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}

        {preset === "custom" && (
          <div className="flex items-end gap-2 ml-2">
            <label className="text-xs font-medium text-gray-700">
              De
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1 block px-2 py-1.5 text-sm border border-gray-300 rounded"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Até
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={brTodayKey()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 block px-2 py-1.5 text-sm border border-gray-300 rounded"
              />
            </label>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={<TrendingUp className="h-4 w-4" />}
          label={`Faturamento Líquido (${periodLabel})`}
          value={s ? formatCurrency((s.revenue.net) / 100) : "—"}
          hint={s ? `Bruto: ${formatCurrency(s.revenue.gross / 100)}` : ""}
          tone="neutral"
        />
        <Card
          icon={<Megaphone className="h-4 w-4" />}
          label="Gastos com anúncios"
          value={s ? formatCurrency(s.costs.ads / 100) : "—"}
          hint="Soma dos lançamentos no período"
          tone="neutral"
        />
        <Card
          icon={<Receipt className="h-4 w-4" />}
          label="Taxas"
          value={s ? formatCurrency(s.costs.fees / 100) : "—"}
          hint="Calculado por gateway (PIX)"
          tone="neutral"
        />
        <Card
          icon={<DollarSign className="h-4 w-4" />}
          label="Lucro"
          value={s ? formatCurrency(s.profit / 100) : "—"}
          hint={s ? `Margem ${s.margin.toFixed(1)}%` : ""}
          tone={s && s.profit >= 0 ? "good" : "bad"}
        />
        <Card
          icon={<Percent className="h-4 w-4" />}
          label="ROAS"
          value={s?.roas != null ? s.roas.toFixed(2) + "x" : "—"}
          hint="Faturamento ÷ Anúncios"
          tone="neutral"
        />
        <Card
          icon={<Percent className="h-4 w-4" />}
          label="ROI"
          value={s?.roi != null ? s.roi.toFixed(1) + "%" : "—"}
          hint="Lucro ÷ Anúncios"
          tone="neutral"
        />
        <Card
          icon={<Receipt className="h-4 w-4" />}
          label="Vendas Pendentes"
          value={s ? formatCurrency(s.revenue.pending / 100) : "—"}
          hint={s ? `${s.orders.pending} pedido(s)` : ""}
          tone="neutral"
        />
        <Card
          icon={<Receipt className="h-4 w-4" />}
          label="Vendas Reembolsadas"
          value={s ? formatCurrency(s.revenue.refunded / 100) : "—"}
          hint={s ? `${s.orders.refunded} pedido(s)` : ""}
          tone="neutral"
        />
      </div>

      {/* Lançamentos de anúncio */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[#FFCC00]" /> Gastos com anúncios
          </h2>
        </div>

        <AdSpendForm onSubmit={(v) => upsertMut.mutate(v)} isPending={upsertMut.isPending} />

        <div className="mt-5">
          {spendsQ.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : (spendsQ.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Nenhum lançamento no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Data</th>
                    <th className="text-right py-2 px-2">Valor</th>
                    <th className="text-left py-2 px-2">Observação</th>
                    <th className="text-right py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(spendsQ.data?.items ?? []).map((it: any) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="py-2 px-2 text-gray-700">{formatBRDate(it.spend_date + "T12:00:00")}</td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums">
                        {formatCurrency((it.amount_cents ?? 0) / 100)}
                      </td>
                      <td className="py-2 px-2 text-gray-600">{it.notes || "—"}</td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => {
                            if (confirm("Remover lançamento?")) delMut.mutate(it.id);
                          }}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({
  icon, label, value, hint, tone,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; tone: "good" | "bad" | "neutral" }) {
  const valueCls =
    tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {icon} {label}
      </div>
      <div className={`mt-1.5 text-xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function AdSpendForm({
  onSubmit, isPending,
}: { onSubmit: (v: { spend_date: string; amount_cents: number; notes?: string }) => void; isPending: boolean }) {
  const today = brTodayKey();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round((Number(amount.replace(",", ".")) || 0) * 100);
        if (cents <= 0) { toast.error("Informe um valor maior que zero"); return; }
        onSubmit({ spend_date: date, amount_cents: cents, notes: notes || undefined });
        setAmount("");
        setNotes("");
      }}
      className="grid sm:grid-cols-[140px_140px_1fr_auto] gap-2 items-end"
    >
      <label className="text-xs font-medium text-gray-700">
        Data
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
        />
      </label>
      <label className="text-xs font-medium text-gray-700">
        Valor (R$)
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
        />
      </label>
      <label className="text-xs font-medium text-gray-700">
        Observação (opcional)
        <input
          type="text"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Meta Ads campanha selecoes"
          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded bg-[#FFCC00] text-black font-medium hover:bg-[#e6b800] disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Adicionar
      </button>
    </form>
  );
}
