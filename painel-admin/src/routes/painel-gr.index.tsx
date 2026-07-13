import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import {
  listOrders, checkIsAdmin, bootstrapAdmin, syncPendingOrders, getOrderDetail, backfillPixCodes, updateOrderStatus,
} from "@/lib/orders.functions";
import {
  getLiveStats, getAbandonedCarts, getEnhancedStats, getCartRecoveryStats,
} from "@/lib/analytics.functions";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { listCardAttempts, updateCardAttemptStatus } from "@/lib/card-attempts.functions";
import {
  listAppConfig, updateAppConfig, listMessageDispatches, getZapiConnectionStatus, resendDispatchEmail, getDispatchPreview,
} from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, CheckCircle, XCircle, Clock, Search, LogOut, Truck,
  ShieldCheck, TrendingUp, ShoppingBag, Percent, CreditCard, RefreshCw, Loader2, Eye,
  Paperclip, Copy as CopyIcon, MinusCircle, Radio, ShoppingCart, BarChart3, Users, Trophy,
  MessageCircle, Save, Smartphone, Monitor, Tablet, ArrowUp, ArrowDown, Globe, Activity, Zap, Film, Mail,
  ChevronLeft, ChevronRight, Download,
} from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { formatBR, formatBRDate, nowBR } from "@/lib/datetime";
import { formatCurrency } from "@/data/products";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClarexTab } from "@/components/painel/ClarexTab";
import { CostsTab } from "@/components/painel/CostsTab";
import { AlertsBell } from "@/components/painel/AlertsBell";


export const Route = createFileRoute("/painel-gr/")({
  head: () => ({
    meta: [
      { title: "Painel — Gol Raiz" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  component: PainelPage,
});

type Tab = "overview" | "live" | "abandoned" | "cards" | "orders" | "products" | "automation" | "automation_email" | "clarex" | "costs" | "tracking";

function statusBadge(status: string) {
  switch (status) {
    case "PAID": return { label: "Pago", icon: CheckCircle, cls: "bg-green-100 text-green-700 border-green-200" };
    case "IN_SEPARATION": return { label: "Em Separação", icon: Package, cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "SHIPPED": return { label: "Enviado", icon: Truck, cls: "bg-purple-100 text-purple-700 border-purple-200" };
    case "DELIVERED": return { label: "Entregue", icon: CheckCircle, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "PENDING": return { label: "Pendente", icon: Clock, cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
    case "EXPIRED": return { label: "Expirado", icon: XCircle, cls: "bg-red-100 text-red-700 border-red-200" };
    case "CANCELLED": return { label: "Cancelado", icon: XCircle, cls: "bg-gray-100 text-gray-600 border-gray-200" };
    default: return { label: status, icon: Package, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  }
}

function PainelPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const doBootstrap = useServerFn(bootstrapAdmin);
  const runSync = useServerFn(syncPendingOrders);

  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/painel-gr/login" }); return; }
      try {
        const r = await fetchIsAdmin({ data: undefined });
        console.log("fetchIsAdmin response:", r);
        setIsAdmin(r?.isAdmin ?? false);
      } catch (e) {
        console.error("fetchIsAdmin error:", e);
        setIsAdmin(false);
      }
      setAuthChecked(true);
    })();
  }, [navigate, fetchIsAdmin]);

  // Auto-sync 30s
  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    runSync({ data: undefined }).catch(() => {});
    const i = setInterval(() => {
      runSync({ data: undefined })
        .then((r) => {
          if (r.updated > 0) {
            qc.invalidateQueries({ queryKey: ["panel-orders"] });
            qc.invalidateQueries({ queryKey: ["panel-stats"] });
          }
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(i);
  }, [authChecked, isAdmin, runSync, qc]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/painel-gr/login" });
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      await doBootstrap({ data: undefined });
      const r = await fetchIsAdmin({ data: undefined });
      console.log("fetchIsAdmin response after bootstrap:", r);
      setIsAdmin(r?.isAdmin ?? false);
    } catch (e: any) {
      setBootstrapError(e?.message ?? "Falha ao promover admin");
    } finally {
      setBootstrapping(false);
    }
  };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Verificando acesso…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl p-6 border text-center space-y-4">
          <ShieldCheck className="w-10 h-10 text-[#FFCC00] mx-auto" />
          <h1 className="text-lg font-bold text-gray-900">Acesso pendente</h1>
          <p className="text-sm text-gray-600">
            Sua conta ainda não tem permissão de administrador. Se você é o primeiro acesso, clique abaixo.
          </p>
          {bootstrapError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{bootstrapError}</p>}
          <button onClick={handleBootstrap} disabled={bootstrapping}
            className="w-full py-2.5 rounded-lg bg-black text-white font-semibold text-sm hover:bg-black/90 disabled:opacity-60">
            {bootstrapping ? "Configurando…" : "Tornar-me administrador"}
          </button>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-700">Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#FFCC00]" />
            Painel Gol Raiz
          </h1>
          <div className="flex items-center gap-2">
            <AlertsBell />
            <Link
              to="/painel-gr/gateways"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <CreditCard className="w-4 h-4" /> Gateways
            </Link>
            <button onClick={logout} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-2">
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>

        </div>

        {/* Tabs */}
        <div className="container mx-auto px-4 flex gap-1 overflow-x-auto">
          {[
            { id: "overview" as Tab, label: "Visão Geral", icon: BarChart3 },
            { id: "live" as Tab, label: "Live View", icon: Radio },
            { id: "abandoned" as Tab, label: "Carrinhos Abandonados", icon: ShoppingCart },
            { id: "cards" as Tab, label: "Cartões Pendentes", icon: CreditCard },
            { id: "automation" as Tab, label: "Automação WhatsApp", icon: Zap },
            { id: "automation_email" as Tab, label: "Automação Email", icon: Mail },
            { id: "orders" as Tab, label: "Pedidos", icon: Package },
            { id: "products" as Tab, label: "Top Produtos", icon: Trophy },
            { id: "costs" as Tab, label: "Custos & Lucro", icon: TrendingUp },
            { id: "clarex" as Tab, label: "Clarex", icon: Film },
            { id: "tracking" as Tab, label: "Rastreios", icon: Truck },

          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  active
                    ? "border-[#FFCC00] text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {tab === "overview" && <OverviewTab />}
        {tab === "costs" && <CostsTab />}
        {tab === "live" && <LiveTab />}
        {tab === "abandoned" && <AbandonedTab />}
        {tab === "cards" && <CardsTab />}
        {tab === "automation" && <AutomationTab />}
        {tab === "automation_email" && <EmailAutomationTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "products" && <ProductsTab />}
        { tab === "clarex" && <ClarexTab />}
        {tab === "tracking" && <TrackingTab />}
      </div>
    </div>
  );
}

// ------------------ Visão Geral ------------------
type OverviewRange = "today" | "yesterday" | "7d" | "15d" | "30d";
const OVERVIEW_RANGES: { id: OverviewRange; label: string; rangeDays: 1 | 7 | 15 | 30; offsetDays: 0 | 1 }[] = [
  { id: "today", label: "Hoje", rangeDays: 1, offsetDays: 0 },
  { id: "yesterday", label: "Ontem", rangeDays: 1, offsetDays: 1 },
  { id: "7d", label: "7 dias", rangeDays: 7, offsetDays: 0 },
  { id: "15d", label: "15 dias", rangeDays: 15, offsetDays: 0 },
  { id: "30d", label: "30 dias", rangeDays: 30, offsetDays: 0 },
];

function OverviewTab() {
  const [range, setRange] = useState<OverviewRange>("today");
  const selectedRange = OVERVIEW_RANGES.find((item) => item.id === range) ?? OVERVIEW_RANGES[0];
  const fetchStats = useServerFn(getEnhancedStats);
  const statsQ = useQuery({
    queryKey: ["panel-stats", range],
    queryFn: () => fetchStats({ data: { rangeDays: selectedRange.rangeDays, offsetDays: selectedRange.offsetDays } }),
    refetchInterval: 30_000,
  });
  const s = statsQ.data;
  const periodLabel = selectedRange.label.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Período:</span>
        {OVERVIEW_RANGES.map((item) => {
          const active = item.id === range;
          return (
            <button
              key={item.id}
              onClick={() => setRange(item.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                active
                  ? "bg-[#FFCC00] text-black border-[#FFCC00]"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Receita (${periodLabel})`} value={s ? formatCurrency(s.kpis.revenue / 100) : "—"}
          hint={s ? `${s.kpis.orders} pedido(s) pago(s)` : ""} icon={<TrendingUp className="w-4 h-4" />} />
        <Kpi label={`Pedidos pagos (${periodLabel})`} value={s ? String(s.kpis.orders) : "—"}
          hint={s ? `de ${s.kpis.pixGenerated} PIX gerados` : ""} icon={<ShoppingBag className="w-4 h-4" />} />
        <Kpi label="Ticket médio" value={s ? formatCurrency(s.kpis.avgTicket / 100) : "—"}
          hint={`média no período`} icon={<CreditCard className="w-4 h-4" />} />
        <Kpi label="Conversão PIX → Pago" value={s ? `${s.kpis.pixConversion.toFixed(1)}%` : "—"}
          hint="PIX gerados que foram pagos" icon={<Percent className="w-4 h-4" />} />
      </div>

      {/* Funil */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
          Funil de conversão ({periodLabel})
        </h2>
        {s && <FunnelChart funnel={s.funnel} />}
        {!s && <p className="text-sm text-gray-400">Carregando…</p>}
      </div>

      {/* Tendência */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Vendas ({periodLabel})
        </h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={(s?.trend ?? []).map((t) => ({ ...t, reais: t.cents / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="day" tickFormatter={(d: string) => (selectedRange.rangeDays === 1 ? d : d.slice(5))} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(d) => (selectedRange.rangeDays === 1 ? `${d}` : `Dia ${d}`)} />
              <Line type="monotone" dataKey="reais" stroke="#FFCC00" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


function FunnelChart({ funnel }: { funnel: { visits: number; viewProduct: number; viewCheckout: number; pixGenerated: number; paid: number } }) {
  const steps = [
    { label: "Visitas", value: funnel.visits, color: "bg-blue-500" },
    { label: "Viram produto", value: funnel.viewProduct, color: "bg-indigo-500" },
    { label: "Entraram no checkout", value: funnel.viewCheckout, color: "bg-purple-500" },
    { label: "Geraram PIX", value: funnel.pixGenerated, color: "bg-orange-500" },
    { label: "Pagaram", value: funnel.paid, color: "bg-green-600" },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100;
        const prev = i > 0 ? steps[i - 1].value : null;
        const dropPct = prev && prev > 0 ? ((prev - s.value) / prev) * 100 : null;
        return (
          <div key={s.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-700">{s.label}</span>
              <span className="text-gray-500">
                <span className="font-semibold text-gray-900">{s.value}</span>
                {dropPct !== null && dropPct > 0 && (
                  <span className="ml-2 text-red-600">↓ {dropPct.toFixed(1)}%</span>
                )}
              </span>
            </div>
            <div className="h-7 bg-gray-100 rounded">
              <div className={`h-7 rounded ${s.color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------ Live View ------------------
function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return "0s";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r > 0 ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

function LiveTab() {
  const fetchLive = useServerFn(getLiveStats);
  const liveQ = useQuery({
    queryKey: ["panel-live"],
    queryFn: () => fetchLive({ data: undefined }),
    refetchInterval: 5_000,
  });
  const data = liveQ.data;
  const today = data?.today;
  const cmp = data?.compare;

  const [filter, setFilter] = useState<"all" | "checkout" | "product" | "browsing">("all");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const filteredSessions = (data?.sessions ?? []).filter((s) => {
    if (filter === "checkout") return s.inCheckout;
    if (filter === "product") return (s.path ?? "").startsWith("/product/");
    if (filter === "browsing") return !s.inCheckout && !(s.path ?? "").startsWith("/product/");
    return true;
  });

  const lastUpdated = data?.generatedAt ? Math.max(0, Math.floor((Date.now() - new Date(data.generatedAt).getTime()) / 1000)) : null;

  return (
    <div className="space-y-6">
      {/* Operação ao vivo */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Operação ao vivo</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {lastUpdated !== null && (
              <span>Atualizado há {lastUpdated}s · auto a cada 5s</span>
            )}
            <button
              onClick={() => liveQ.refetch()}
              disabled={liveQ.isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${liveQ.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <Kpi label="Visitantes na loja" value={data ? String(data.onSite) : "—"} hint="ativos no último minuto" icon={<Users className="w-4 h-4" />} />
          <Kpi label="Vendo produto" value={data ? String(data.onProduct) : "—"} hint="em página de produto" icon={<Package className="w-4 h-4" />} />
          <Kpi label="Visitantes no checkout" value={data ? String(data.inCheckout) : "—"} hint="finalizando compra" icon={<ShoppingCart className="w-4 h-4" />} />
          <KpiDelta label="Vendas (hoje)" value={today ? formatCurrency(today.revenueCents / 100) : "—"} hint={today ? `${today.orders} pedido(s) pago(s)` : ""} deltaPct={cmp?.revenueDeltaPct} compareLabel="vs ontem" icon={<TrendingUp className="w-4 h-4" />} />
          <Kpi label="Ticket médio (hoje)" value={today ? formatCurrency(today.avgTicketCents / 100) : "—"} hint="média do dia" icon={<CreditCard className="w-4 h-4" />} />
          <Kpi label="Conversão (hoje)" value={today ? `${today.conversionPct.toFixed(1)}%` : "—"} hint="pedidos pagos / visitas" icon={<Percent className="w-4 h-4" />} />
        </div>
      </section>

      {/* Top páginas + Top origens + Devices (agora) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Páginas ativas agora
          </h3>
          {(!data || data.topActivePaths.length === 0) ? (
            <p className="text-xs text-gray-400">Sem visitantes no momento.</p>
          ) : (
            <ul className="space-y-2">
              {data.topActivePaths.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-gray-700 truncate">{p.path}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" /> Origens (agora)
          </h3>
          {(!data || data.topActiveSources.length === 0) ? (
            <p className="text-xs text-gray-400">Sem dados.</p>
          ) : (
            <ul className="space-y-2">
              {data.topActiveSources.map((s) => (
                <li key={s.source} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-700 truncate">{s.source}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5" /> Dispositivos (agora)
          </h3>
          {!data ? (
            <p className="text-xs text-gray-400">—</p>
          ) : (
            <div className="space-y-2 text-xs">
              <DeviceBar icon={<Smartphone className="w-3.5 h-3.5" />} label="Mobile" count={data.deviceCounts.mobile} total={data.onSite} />
              <DeviceBar icon={<Monitor className="w-3.5 h-3.5" />} label="Desktop" count={data.deviceCounts.desktop} total={data.onSite} />
              <DeviceBar icon={<Tablet className="w-3.5 h-3.5" />} label="Tablet" count={data.deviceCounts.tablet} total={data.onSite} />
            </div>
          )}
        </section>
      </div>

      {/* Analytics da loja (hoje) com comparação */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#FFCC00]" /> Analytics da loja
          </h2>
          <p className="text-xs text-gray-500">Visitas e páginas da vitrine hoje{cmp ? " (vs mesmo horário de ontem)" : ""}</p>
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiDelta label="Visitas hoje" value={today ? String(today.visits) : "—"} hint="sessões com interação" deltaPct={cmp?.visitsDeltaPct} compareLabel="vs ontem" icon={<Eye className="w-4 h-4" />} />
          <Kpi label="Visitas únicas hoje" value={today ? String(today.uniqueVisitors) : "—"} hint="sessões distintas" icon={<Users className="w-4 h-4" />} />
          <Kpi label="Tempo médio na loja" value={today ? fmtDuration(today.avgSessionSeconds) : "—"} hint="duração da sessão" icon={<Clock className="w-4 h-4" />} />
          <Kpi label="Tempo médio por página" value={today ? fmtDuration(today.avgTimePerPageSeconds) : "—"} hint="por pageview" icon={<Clock className="w-4 h-4" />} />
        </div>
      </section>

      {/* Charts: visitas + receita por hora */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Visitas por hora (hoje)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={today?.visitsPerHour ?? []}>
                <defs>
                  <linearGradient id="visitsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFCC00" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#FFCC00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="hour" fontSize={11} interval={2} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#FFCC00" strokeWidth={2} fill="url(#visitsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Receita por hora (hoje)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={today?.revenuePerHour?.map((r) => ({ hour: r.hour, valor: r.cents / 100 })) ?? []}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="hour" fontSize={11} interval={2} />
                <YAxis fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="valor" stroke="#16a34a" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Horários de pico */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Horários de pico da loja (hoje)</h2>
        <PeakHours items={today?.peakHours ?? []} />
      </section>

      {/* Feeds em tempo real: eventos + pedidos pagos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="px-5 py-3 border-b flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Activity className="w-4 h-4 text-[#FFCC00]" /> Atividade recente
          </div>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {(!data || data.recentEvents.length === 0) && (
              <li className="px-5 py-8 text-center text-xs text-gray-400">Sem eventos.</li>
            )}
            {data?.recentEvents.map((e, idx) => (
              <li key={`${e.sessionId}-${e.createdAt}-${idx}`} className="px-5 py-2.5 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <EventDot type={e.type} />
                  <span className="font-medium text-gray-800">{eventLabel(e.type)}</span>
                  {e.productHandle && <span className="text-gray-500 truncate">· {e.productHandle}</span>}
                  {e.orderRef && <span className="font-mono text-gray-500 truncate">· {e.orderRef.slice(0, 10)}</span>}
                </div>
                <span className="text-gray-400 shrink-0">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="px-5 py-3 border-b flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Zap className="w-4 h-4 text-green-600" /> Pedidos pagos (hoje)
          </div>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {(!data || data.recentPaidOrders.length === 0) && (
              <li className="px-5 py-8 text-center text-xs text-gray-400">Nenhum pedido pago ainda hoje.</li>
            )}
            {data?.recentPaidOrders.map((o) => (
              <li key={o.id} className="px-5 py-2.5 text-xs flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{o.payerName ?? "Cliente"}</div>
                  <div className="text-gray-500 font-mono truncate">{o.externalRef} · {o.itemsCount} item(s)</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-green-700">{formatCurrency((o.amountCents ?? 0) / 100)}</div>
                  <div className="text-gray-400">{o.paidAt ? timeAgo(o.paidAt) : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Sessões em tempo real + filtros */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="px-5 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Sessões ativas em tempo real
            <span className="text-xs font-normal text-gray-500">({filteredSessions.length})</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {(["all", "checkout", "product", "browsing"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md border transition ${
                  filter === f
                    ? "bg-[#FFCC00] text-black border-[#FFCC00]"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {f === "all" ? "Todos" : f === "checkout" ? "Checkout" : f === "product" ? "Produto" : "Navegando"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600 font-medium border-b border-gray-200">
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Página atual</th>
                <th className="px-4 py-2.5">Origem</th>
                <th className="px-4 py-2.5">Dispositivo</th>
                <th className="px-4 py-2.5">Carrinho</th>
                <th className="px-4 py-2.5">Na sessão</th>
                <th className="px-4 py-2.5">Última atividade</th>
                <th className="px-4 py-2.5 font-mono text-xs">Sessão</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  {liveQ.isLoading ? "Carregando…" : "Nenhuma sessão ativa nesse filtro"}
                </td></tr>
              )}
              {filteredSessions.map((s) => {
                const sessionAgeSec = Math.max(0, (new Date(s.lastSeenAt).getTime() - new Date(s.createdAt).getTime()) / 1000);
                const isNew = sessionAgeSec < 30;
                return (
                  <tr key={s.sessionId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {s.inCheckout ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                            <ShoppingCart className="w-3 h-3" /> Checkout
                          </span>
                        ) : (s.path ?? "").startsWith("/product/") ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            <Package className="w-3 h-3" /> Produto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                            Navegando
                          </span>
                        )}
                        {isNew && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">NOVO</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 font-mono text-xs truncate max-w-[200px]">{s.path ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {s.utmSource ?? (s.referrer ? safeHost(s.referrer) : "direto")}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <DeviceIcon device={s.device} />
                        <span>{s.browser}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">{s.os}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {s.cartTotalCents != null && s.cartTotalCents > 0 ? (
                        <div>
                          <div className="font-semibold text-gray-800">{formatCurrency(s.cartTotalCents / 100)}</div>
                          <div className="text-[10px] text-gray-500">{s.cartItems ?? 0} item(s)</div>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 tabular-nums">{fmtDuration(sessionAgeSec)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{timeAgo(s.lastSeenAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-400">{s.sessionId.slice(0, 12)}…</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* tick reference to avoid TS unused warning */}
      <span className="hidden">{tick}</span>
    </div>
  );
}

function KpiDelta({
  label, value, hint, deltaPct, compareLabel, icon,
}: { label: string; value: string; hint?: string; deltaPct?: number; compareLabel?: string; icon?: React.ReactNode }) {
  const hasDelta = typeof deltaPct === "number" && isFinite(deltaPct);
  const positive = hasDelta && deltaPct! >= 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {hasDelta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? "text-green-600" : "text-red-600"}`}>
            {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(deltaPct!).toFixed(1)}%
          </span>
        )}
        {(hint || compareLabel) && (
          <span className="text-[11px] text-gray-500">{hasDelta && compareLabel ? compareLabel : hint}</span>
        )}
      </div>
    </div>
  );
}

function DeviceBar({ icon, label, count, total }: { icon: React.ReactNode; label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-gray-700">{icon} {label}</span>
        <span className="font-semibold text-gray-900 tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#FFCC00] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DeviceIcon({ device }: { device: "mobile" | "tablet" | "desktop" }) {
  if (device === "mobile") return <Smartphone className="w-3.5 h-3.5 text-gray-500" />;
  if (device === "tablet") return <Tablet className="w-3.5 h-3.5 text-gray-500" />;
  return <Monitor className="w-3.5 h-3.5 text-gray-500" />;
}

function eventLabel(t: string): string {
  switch (t) {
    case "visit": return "Visita";
    case "view_product": return "Viu produto";
    case "view_checkout": return "Entrou no checkout";
    case "begin_checkout": return "Iniciou checkout";
    case "add_to_cart": return "Add ao carrinho";
    case "purchase": return "Compra";
    case "pix_generated": return "PIX gerado";
    case "pix_paid": return "PIX pago";
    default: return t;
  }
}

function EventDot({ type }: { type: string }) {
  const color =
    type === "purchase" || type === "pix_paid" ? "bg-green-500" :
    type === "pix_generated" || type === "begin_checkout" || type === "view_checkout" ? "bg-orange-500" :
    type === "view_product" || type === "add_to_cart" ? "bg-blue-500" :
    "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function safeHost(url: string): string {
  try { return new URL(url).hostname; } catch { return "direto"; }
}

function PeakHours({ items }: { items: { hour: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0 || max === 0) {
    return <p className="text-sm text-gray-400">Sem dados suficientes ainda.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((i) => {
        const pct = (i.count / max) * 100;
        return (
          <div key={i.hour} className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-600 w-12">{i.hour}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded">
              <div className="h-5 rounded bg-[#FFCC00] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-10 text-right">{i.count}</span>
          </div>
        );
      })}
    </div>
  );
}


function timeAgo(iso: string) {
  if (!iso) return "—";
  try {
    // Tenta detectar se a string já está em UTC (termina com Z ou tem offset)
    // Se não tiver, assume que é UTC (padrão do Postgres) e adiciona o sufixo 'Z'
    const hasTimezone = iso.includes('Z') || iso.includes('+') || (iso.includes('-') && iso.split('-').length > 3);
    const date = hasTimezone ? new Date(iso) : new Date(iso + 'Z');
    
    if (isNaN(date.getTime())) return "—";
    
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  } catch (e) {
    return "—";
  }
}

// ------------------ Carrinhos Abandonados ------------------
function PeriodFilter({
  range, setRange, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  range: OrdersRange; setRange: (r: OrdersRange) => void;
  customFrom: string; setCustomFrom: (v: string) => void;
  customTo: string; setCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Período:</span>
      {(Object.keys(ORDERS_RANGE_LABELS) as OrdersRange[]).map((r) => {
        const active = r === range;
        return (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              active ? "bg-[#FFCC00] text-black border-[#FFCC00]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {ORDERS_RANGE_LABELS[r]}
          </button>
        );
      })}
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm" />
          <span className="text-xs text-gray-500">até</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm" />
        </div>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-xs text-gray-600 bg-gray-50">
      <span>Mostrando <b className="text-gray-900">{Math.min((page - 1) * 10 + 1, total)}</b>–<b className="text-gray-900">{Math.min(page * 10, total)}</b> de <b className="text-gray-900">{total}</b></span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 tabular-nums">Página <b className="text-gray-900">{page}</b> / {totalPages}</span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AbandonedTab() {
  const fetchCarts = useServerFn(getAbandonedCarts);
  const cartsQ = useQuery({
    queryKey: ["panel-abandoned"],
    queryFn: () => fetchCarts({ data: undefined }),
    refetchInterval: 30_000,
  });
  const allCarts = cartsQ.data?.carts ?? [];
  const [range, setRange] = useState<OrdersRange>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [range, customFrom, customTo]);
  const bounds = brRangeBounds(range, customFrom, customTo);
  const carts = allCarts.filter((c: any) => {
    if (!bounds) return true;
    const t = new Date(c.last_activity_at ?? c.created_at).getTime();
    return t >= bounds[0].getTime() && t < bounds[1].getTime();
  });
  const totalValue = carts.reduce((s: number, c: any) => s + (c.cart_total_cents ?? 0), 0);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(carts.length / PAGE_SIZE));
  const pageItems = carts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PeriodFilter
        range={range} setRange={setRange}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Carrinhos abandonados" value={String(carts.length)} hint="checkouts não convertidos" icon={<ShoppingCart className="w-4 h-4" />} />
        <Kpi label="Valor potencial" value={formatCurrency(totalValue / 100)} hint="receita perdida" icon={<TrendingUp className="w-4 h-4" />} />
        <Kpi label="Ticket médio (abandonados)" value={carts.length > 0 ? formatCurrency(totalValue / carts.length / 100) : "—"} hint="média por carrinho" icon={<CreditCard className="w-4 h-4" />} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            const headers = [
              "ID","Criado em","Última atividade","Etapa","Nome","CPF","E-mail","Telefone",
              "CEP","Endereço","Número","Complemento","Bairro","Cidade","UF",
              "Itens (qtd × título [tam])","Qtd total","Valor (R$)","Canal","Origem",
            ];
            const rows = carts.map((c: any) => {
              const items = Array.isArray(c.cart_items) ? c.cart_items : [];
              const a = c.delivery?.address ?? {};
              const itemsStr = items.map((it: any) => `${it.quantity}× ${it.title}${it.size ? ` (${it.size})` : ""}`).join(" | ");
              const qty = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
              return [
                c.id, formatBR(c.created_at), formatBR(c.last_activity_at), c.last_step,
                c.payer_name ?? "", c.payer_cpf ?? "", c.payer_email ?? "", c.payer_phone ?? "",
                a.zipCode ?? "", a.line1 ?? "", a.number ?? "", a.line2 ?? "",
                a.neighborhood ?? "", a.city ?? "", a.state ?? "",
                itemsStr, qty, ((c.cart_total_cents ?? 0) / 100).toFixed(2).replace(".", ","),
                c.channel ?? "", c.source ?? "",
              ];
            });
            downloadCSV("carrinhos-abandonados", headers, rows);
          }}
          disabled={carts.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Exportar CSV ({carts.length})
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        <div className="overflow-x-auto">

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600 font-medium border-b border-gray-200">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Carrinho</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Etapa</th>
                <th className="px-4 py-3">Abandonado</th>
                <th className="px-4 py-3 text-right">Recuperar</th>
              </tr>
            </thead>
            <tbody>
              {carts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {cartsQ.isLoading ? "Carregando…" : "Nenhum carrinho abandonado"}
                </td></tr>
              )}
              {pageItems.map((c: any) => {
                const items = Array.isArray(c.cart_items) ? c.cart_items : [];
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.payer_name ?? "(sem nome)"}</div>
                      <div className="text-xs text-gray-500">{c.payer_cpf ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.payer_email && <div className="text-gray-700 truncate max-w-[180px]">{c.payer_email}</div>}
                      {c.payer_phone && <div className="text-gray-600">{c.payer_phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {items.length === 0 ? "—" : items.map((it: any, i: number) => (
                        <div key={i}>{it.quantity}× {it.title}{it.size ? ` (${it.size})` : ""}</div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency((c.cart_total_cents ?? 0) / 100)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                        Etapa {c.last_step}/3
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{timeAgo(c.last_activity_at)}</td>
                    <td className="px-4 py-3">
                      <RecoverActions cart={c} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={carts.length} onChange={setPage} />
      </div>
    </div>
  );
}

// ----- Recuperação: carrinho abandonado somente por email + Copiar link -----
function RecoverActions({ cart }: { cart: any }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://usegolraiz.com.br";
  const recoverUrl = `${origin}/checkout?recover=${cart.id}&ch=wa`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(recoverUrl);
      toast.success("Link de recuperação copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const rawPhone = String(cart.payer_phone ?? "").replace(/\D/g, "");
  const waPhone = rawPhone.length === 10 || rawPhone.length === 11 ? `55${rawPhone}` : rawPhone;
  const firstName = String(cart.payer_name ?? "").trim().split(/\s+/)[0] || "";
  const waMessage = `Oi${firstName ? `, ${firstName}` : ""}! 👋 Notei que você começou um pedido na Gol Raiz e não finalizou. Separei seu carrinho aqui pra você retomar de onde parou: ${recoverUrl}`;
  const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}` : "";

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <span className="text-[11px] text-gray-500 italic">recuperação por email</span>
      <div className="flex gap-1.5">
        {waPhone && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 whitespace-nowrap"
          >
            WhatsApp
          </a>
        )}
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 whitespace-nowrap"
        >
          <CopyIcon className="w-3 h-3" /> Link
        </button>
      </div>
    </div>
  );
}


// ------------------ Pedidos ------------------
type OrdersRange = "today" | "yesterday" | "7d" | "15d" | "30d" | "custom";
const ORDERS_RANGE_LABELS: Record<OrdersRange, string> = {
  today: "Hoje", yesterday: "Ontem", "7d": "7 dias", "15d": "15 dias", "30d": "30 dias", custom: "Personalizado",
};

// Retorna [startISO, endISO] em UTC representando o intervalo em horário de Brasília (UTC-3).
function brRangeBounds(range: OrdersRange, customFrom?: string, customTo?: string): [Date, Date] | null {
  const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // BRT = UTC-3
  const nowBR_val = nowBR();
  const y = nowBR_val.getFullYear(), m = nowBR_val.getMonth(), d = nowBR_val.getDate();
  const startOfBRDay = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd) + TZ_OFFSET_MS);
  const endOfBRDay = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd + 1) + TZ_OFFSET_MS);

  if (range === "today") return [startOfBRDay(y, m, d), endOfBRDay(y, m, d)];
  if (range === "yesterday") return [startOfBRDay(y, m, d - 1), endOfBRDay(y, m, d - 1)];
  if (range === "7d") return [startOfBRDay(y, m, d - 6), endOfBRDay(y, m, d)];
  if (range === "15d") return [startOfBRDay(y, m, d - 14), endOfBRDay(y, m, d)];
  if (range === "30d") return [startOfBRDay(y, m, d - 29), endOfBRDay(y, m, d)];
  if (range === "custom" && customFrom && customTo) {
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);
    if (fy && tm && td && fm && ty && fd) return [startOfBRDay(fy, fm - 1, fd), endOfBRDay(ty, tm - 1, td)];
  }
  return null;
}

function OrdersTab() {
  const qc = useQueryClient();
  const fetchOrders = useServerFn(listOrders);
  const runSync = useServerFn(syncPendingOrders);
  const runBackfill = useServerFn(backfillPixCodes);
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [range, setRange] = useState<OrdersRange>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const ordersQ = useQuery({
    queryKey: ["panel-orders"],
    queryFn: () => fetchOrders({ data: undefined }),
    refetchInterval: 15_000,
  });

  const syncMut = useMutation({
    mutationFn: () => runSync({ data: undefined }),
    onSuccess: (r) => {
      if (r.updated > 0) toast.success(`${r.updated} pedido(s) atualizado(s).`);
      else toast.info(`Nenhuma atualização (${r.checked} verificado(s)).`);
      qc.invalidateQueries({ queryKey: ["panel-orders"] });
      qc.invalidateQueries({ queryKey: ["panel-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar"),
  });

  const backfillMut = useMutation({
    mutationFn: () => runBackfill({ data: undefined }),
    onSuccess: (r) => {
      if (r.filled > 0) toast.success(`Pix copia-e-cola preenchido em ${r.filled} pedido(s).`);
      else toast.info(`Nada para preencher (${r.checked} verificado(s)).`);
      qc.invalidateQueries({ queryKey: ["panel-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no backfill"),
  });

  const orders = ordersQ.data?.orders ?? [];
  const bounds = brRangeBounds(range, customFrom, customTo);
  const filtered = orders.filter((o: any) => {
    if (bounds) {
      const t = new Date(o.created_at).getTime();
      if (t < bounds[0].getTime() || t >= bounds[1].getTime()) return false;
    }
    const q = search.toLowerCase();
    return !q || o.external_ref?.toLowerCase().includes(q) ||
      o.payer_name?.toLowerCase().includes(q) ||
      o.payer_email?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q);
  });

  const paidCount = filtered.filter((o: any) => o.status === "PAID").length;
  const revenueCents = filtered.filter((o: any) => o.status === "PAID").reduce((s: number, o: any) => s + (o.amount_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Período:</span>
        {(Object.keys(ORDERS_RANGE_LABELS) as OrdersRange[]).map((r) => {
          const active = r === range;
          return (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                active ? "bg-[#FFCC00] text-black border-[#FFCC00]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {ORDERS_RANGE_LABELS[r]}
            </button>
          );
        })}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm" />
            <span className="text-xs text-gray-500">até</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, ref ou status..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]" />
        </div>
        <div className="text-xs text-gray-600 flex items-center gap-3">
          <span><b className="text-gray-900">{filtered.length}</b> pedido(s)</span>
          <span><b className="text-green-700">{paidCount}</b> pago(s)</span>
          <span>Receita: <b className="text-gray-900">{formatCurrency(revenueCents / 100)}</b></span>
        </div>
        <button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sincronizar pagamentos
        </button>
        <button
          onClick={() => backfillMut.mutate()}
          disabled={backfillMut.isPending}
          title="Re-consulta o gateway e preenche pix_code faltante nos últimos 72h"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          {backfillMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Preencher Pix faltantes
        </button>
        <button
          onClick={() => {
            const headers = [
              "ID","Referência","Criado em","Pago em","Status","Gateway","Valor (R$)",
              "Nome","CPF/CNPJ","E-mail","Telefone",
              "CEP","Endereço","Número","Complemento","Bairro","Cidade","UF",
              "Itens (qtd × título [tam])","Qtd total",
              "Rastreio","URL rastreio","Enviado em","Entregue em",
            ];
            const rows = filtered.map((o: any) => {
              const items = Array.isArray(o.items) ? o.items : [];
              const a = o.delivery?.address ?? {};
              const itemsStr = items.map((it: any) => `${it.quantity}× ${it.title ?? it.name ?? ""}${it.size ? ` (${it.size})` : ""}`).join(" | ");
              const qty = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
              return [
                o.id, o.external_ref ?? "", formatBR(o.created_at), o.paid_at ? formatBR(o.paid_at) : "",
                o.status ?? "", o.gateway ?? "", ((o.amount_cents ?? 0) / 100).toFixed(2).replace(".", ","),
                o.payer_name ?? "", o.payer_taxid ?? "", o.payer_email ?? "", o.payer_phone ?? "",
                a.zipCode ?? "", a.line1 ?? "", a.number ?? "", a.line2 ?? "",
                a.neighborhood ?? "", a.city ?? "", a.state ?? "",
                itemsStr, qty,
                o.tracking_code ?? "", o.tracking_url ?? "",
                o.shipped_at ? formatBR(o.shipped_at) : "", o.delivered_at ? formatBR(o.delivered_at) : "",
              ];
            });
            downloadCSV("pedidos", headers, rows);
          }}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>



      {ordersQ.isLoading && <p className="text-sm text-gray-500">Carregando pedidos…</p>}
      {ordersQ.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {(ordersQ.error as Error).message}
        </p>
      )}

      {!ordersQ.isLoading && !ordersQ.error && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600 font-medium border-b border-gray-200">
                  <th className="px-4 py-3 w-[140px]">Referência</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center w-[80px]">Compr.</th>
                  <th className="px-4 py-3 text-center w-[80px]">PIX</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 w-[100px]">Data</th>
                  <th className="px-4 py-3 w-[60px] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum pedido encontrado</td></tr>
                )}
                {filtered.map((o: any) => {
                  const s = statusBadge(o.status);
                  const Icon = s.icon;
                  return (
                    <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{o.external_ref}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{o.payer_name}</div>
                        <div className="text-xs text-gray-500">{o.payer_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${s.cls}`}>
                          <Icon className="w-3.5 h-3.5" />{s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {o.comprovante_url ? (
                          <a href={o.comprovante_url} target="_blank" rel="noreferrer" title="Ver comprovante"
                            className="inline-flex items-center justify-center text-[#FFCC00] hover:opacity-80">
                            <Paperclip className="w-4 h-4" />
                          </a>
                        ) : <MinusCircle className="inline w-4 h-4 text-gray-300" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {o.pix_copied_at ? (
                          <span title={`Copiado em ${formatBR(o.pix_copied_at)}`}
                            className="inline-flex items-center justify-center text-green-600">
                            <CopyIcon className="w-4 h-4" />
                          </span>
                        ) : <MinusCircle className="inline w-4 h-4 text-gray-300" />}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(o.amount_cents / 100)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatBRDate(o.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setSelectedOrderId(o.id)} aria-label="Ver detalhes"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 text-gray-500">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDetailDialog orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}

// ------------------ Top Produtos ------------------
function ProductsTab() {
  const fetchStats = useServerFn(getEnhancedStats);
  const statsQ = useQuery({
    queryKey: ["panel-stats", 30],
    queryFn: () => fetchStats({ data: { rangeDays: 30 } }),
    refetchInterval: 60_000,
  });

  const tops = statsQ.data?.topProducts ?? [];
  const maxRev = Math.max(1, ...tops.map((t) => t.revenueCents));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
          Top produtos por receita (últimos 30 dias)
        </h2>
        {tops.length === 0 && <p className="text-sm text-gray-400">{statsQ.isLoading ? "Carregando…" : "Sem vendas no período"}</p>}
        <div className="space-y-3">
          {tops.map((t, i) => (
            <div key={t.name}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium text-gray-800 truncate pr-3">
                  <span className="text-gray-400 font-mono text-xs mr-2">#{i + 1}</span>
                  {t.name}
                </span>
                <span className="text-gray-600 whitespace-nowrap">
                  <span className="font-semibold text-gray-900">{formatCurrency(t.revenueCents / 100)}</span>
                  <span className="text-xs text-gray-400 ml-2">{t.qty} un.</span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded">
                <div className="h-2 rounded bg-[#FFCC00]" style={{ width: `${(t.revenueCents / maxRev) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------ Helpers UI ------------------
function Kpi({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="uppercase tracking-wide font-medium">{label}</span>
        <span className="text-[#FFCC00]">{icon}</span>
      </div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const fetchDetail = useServerFn(getOrderDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchDetail({ data: { orderId: orderId! } }),
    enabled: !!orderId,
  });

  const order: any = data?.order;
  const items: any[] = order?.items ?? [];
  const delivery: any = order?.delivery ?? {};
  const s = order ? statusBadge(order.status) : null;
  const SIcon = s?.icon;

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Pedido ${order.external_ref}` : "Detalhes do pedido"}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {order && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {s && SIcon && (
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${s.cls}`}>
                  <SIcon className="w-3.5 h-3.5" /> {s.label}
                </span>
              )}
              <span className="text-xs text-gray-500">Criado em {formatBR(order.created_at)}</span>
              {order.paid_at && (
                <span className="text-xs text-green-700">Pago em {formatBR(order.paid_at)}</span>
              )}
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cliente</h3>
              <dl className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                <Field label="Nome" value={order.payer_name} />
                <Field label="E-mail" value={order.payer_email} />
                <Field label="Telefone" value={order.payer_phone} />
                <Field label="CPF/CNPJ" value={order.payer_taxid} />
              </dl>
            </section>

            {delivery?.address && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entrega</h3>
                <p className="mt-2 text-gray-700">
                  {delivery.address.line1}{delivery.address.line2 ? `, ${delivery.address.line2}` : ""}<br />
                  {delivery.address.neighborhood} — {delivery.address.city}/{delivery.address.state}<br />
                  CEP {delivery.address.zipCode}
                </p>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Itens</h3>
              <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {items.map((it, i) => (
                  <li key={i} className="px-3 py-2 flex justify-between text-sm">
                    <span className="text-gray-700">{it.quantity}× {it.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(((it.price ?? 0) * (it.quantity ?? 1)) / 100)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end text-sm">
                <span className="font-semibold text-gray-900">Total: {formatCurrency(order.amount_cents / 100)}</span>
              </div>
            </section>

            {order.status === "PAID" && (
              <section className="p-4 rounded-lg bg-green-50 border border-green-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-green-700">Acompanhamento</h3>
                  <p className="text-xs text-green-600 mt-0.5">Link de acompanhamento do pedido disponível.</p>
                </div>
                <a
                  href={`/rastreio?ref=${order.external_ref}&token=${order.order_secret}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver Acompanhamento
                </a>
              </section>
            )}

            {order.comprovante_url && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comprovante</h3>
                <a href={order.comprovante_url} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[#FFCC00] hover:underline text-sm">
                  <Paperclip className="w-4 h-4" /> Abrir comprovante
                </a>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? "—"}</dd>
    </div>
  );
}


// ------------------ Automação (mensagens automáticas) ------------------
function AutomationTab() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(listAppConfig);
  const saveConfig = useServerFn(updateAppConfig);

  const cfgQ = useQuery({
    queryKey: ["panel-app-config"],
    queryFn: () => fetchConfig({ data: undefined }),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (cfgQ.data?.config) {
      const next: Record<string, string> = {};
      for (const c of cfgQ.data.config as any[]) next[c.key] = c.value ?? "";
      setDraft(next);
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async (entries: Array<{ key: string; value: string }>) => {
      for (const e of entries) await saveConfig({ data: e });
    },
    onSuccess: () => {
      toast.success("Mensagem salva");
      qc.invalidateQueries({ queryKey: ["panel-app-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  function setField(k: string, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  function saveOne(k: string) {
    saveMut.mutate([{ key: k, value: draft[k] ?? "" }]);
  }
  function toggle(k: string) {
    const next = (draft[k] === "true") ? "false" : "true";
    setField(k, next);
    saveMut.mutate([{ key: k, value: next }]);
  }

  const blocks: Array<{
    title: string;
    desc: string;
    enabledKey: string;
    delayKey: string;
    delayLabel: string;
    msgKey: string;
    placeholders: string;
  }> = [
    {
      title: "Pix Pendente",
      desc: "Lembrete enviado quando o pedido foi gerado mas o Pix ainda não foi pago.",
      enabledKey: "pix_reminder_enabled",
      delayKey: "pix_reminder_delay_minutes",
      delayLabel: "Disparar após (minutos sem pagamento)",
      msgKey: "pix_reminder_message",
      placeholders: "{nome}, {total}, {pedido}, {link}",
    },
    {
      title: "Pix Pendente — Cupom 10% OFF",
      desc: "2º lembrete (após 1h) oferecendo cupom de 10%. Não acumula com o cupom VOLTA10 do modal de saída.",
      enabledKey: "pix_reminder2_enabled",
      delayKey: "pix_reminder2_delay_minutes",
      delayLabel: "Disparar após (minutos sem pagamento)",
      msgKey: "pix_reminder2_message",
      placeholders: "{nome}, {total}, {pedido}, {cupom}, {link}",
    },
    {
      title: "Pedido Confirmado",
      desc: "Confirmação automática quando o pagamento é aprovado.",
      enabledKey: "order_confirmation_enabled",
      delayKey: "order_confirmation_delay_minutes",
      delayLabel: "Disparar após (minutos da aprovação)",
      msgKey: "order_confirmation_message",
      placeholders: "{nome}, {total}, {pedido}, {link}",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#FFCC00]" /> Automação de mensagens WhatsApp
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          WhatsApp fica exclusivo para Pix pendente e pagamento aprovado. Carrinho abandonado é tratado apenas por email.
        </p>
      </div>

      {/* Credenciais Z-API */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#FFCC00]" /> Credenciais Z-API
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <ConfigField
            label="Instance ID (Z-API)"
            value={draft.zapi_instance_id ?? ""}
            onChange={(v) => setField("zapi_instance_id", v)}
            onSave={() => saveOne("zapi_instance_id")}
            saving={saveMut.isPending}
          />
          <ConfigField
            label="Token (Z-API)"
            value={draft.zapi_token ?? ""}
            onChange={(v) => setField("zapi_token", v)}
            onSave={() => saveOne("zapi_token")}
            saving={saveMut.isPending}
            type="password"
          />
          <ConfigField
            label="Client-Token (Token de Segurança da Conta Z-API)"
            value={draft.zapi_client_token ?? ""}
            onChange={(v) => setField("zapi_client_token", v)}
            onSave={() => saveOne("zapi_client_token")}
            saving={saveMut.isPending}
            type="password"
          />
          <ConfigField
            label="Delay padrão (minutos) — usado em /api/public/hooks/cart-recovery"
            value={draft.zapi_recovery_delay_minutes ?? "3"}
            onChange={(v) => setField("zapi_recovery_delay_minutes", v)}
            onSave={() => saveOne("zapi_recovery_delay_minutes")}
            saving={saveMut.isPending}
            type="number"
          />
        </div>
      </div>


      {blocks.map((b) => {
        const enabled = draft[b.enabledKey] === "true";
        return (
          <div key={b.msgKey} className="bg-white border rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{b.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{b.desc}</p>
              </div>
              <button
                onClick={() => toggle(b.enabledKey)}
                disabled={saveMut.isPending}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  enabled ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"
                } disabled:opacity-50`}
              >
                {enabled ? "Desativar" : "Ativar"}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ConfigField
                label={b.delayLabel}
                value={draft[b.delayKey] ?? ""}
                onChange={(v) => setField(b.delayKey, v)}
                onSave={() => saveOne(b.delayKey)}
                saving={saveMut.isPending}
                type="number"
              />
              <ConfigField
                label={`Mensagem (variáveis: ${b.placeholders})`}
                value={draft[b.msgKey] ?? ""}
                onChange={(v) => setField(b.msgKey, v)}
                onSave={() => saveOne(b.msgKey)}
                saving={saveMut.isPending}
                textarea
              />
            </div>
          </div>
        );
      })}

      <DispatchesSection />
    </div>
  );
}

// ------------------ Disparos por canal (paginado) ------------------
type DispatchChannel = "cart" | "cart2" | "cart3" | "pix1" | "pix2" | "confirmation";
const WHATSAPP_DISPATCH_CHANNELS: Array<{ id: DispatchChannel; label: string }> = [
  { id: "pix1", label: "Pix Pendente (5min)" },
  { id: "pix2", label: "Pix Pendente (1h · 10%)" },
  { id: "confirmation", label: "Pedido Confirmado" },
];
const DISPATCH_CHANNELS: Array<{ id: DispatchChannel; label: string }> = [
  { id: "cart", label: "Carrinho (3min)" },
  { id: "cart2", label: "Carrinho (30min · 5%)" },
  { id: "cart3", label: "Carrinho (1h · 10%)" },
  { id: "pix1", label: "Pix Pendente (5min)" },
  { id: "pix2", label: "Pix Pendente (1h · 10%)" },
  { id: "confirmation", label: "Pedido Confirmado" },
];
const PAGE_SIZE = 10;

type DatePreset = "today" | "yesterday" | "7d" | "15d" | "30d" | "custom";
const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "custom", label: "Personalizado" },
];

function DateRangeFilter({
  preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd,
}: {
  preset: DatePreset; setPreset: (p: DatePreset) => void;
  customStart: string; setCustomStart: (v: string) => void;
  customEnd: string; setCustomEnd: (v: string) => void;
}) {
  return (
    <div className="px-5 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">Período:</span>
      {DATE_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => setPreset(p.id)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition ${
            preset === p.id
              ? "bg-[#FFCC00] text-black border-[#FFCC00]"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {p.label}
        </button>
      ))}
      {preset === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="text-xs border rounded-md px-2 py-1"
          />
          <span className="text-xs text-gray-500">até</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="text-xs border rounded-md px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}

function DispatchesSection() {
  const [channel, setChannel] = useState<DispatchChannel>("pix1");
  const [page, setPage] = useState(1);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const fetchFn = useServerFn(listMessageDispatches);
  const statusFn = useServerFn(getZapiConnectionStatus);

  // Reset page ao trocar de canal/período
  useEffect(() => { setPage(1); }, [channel, preset, customStart, customEnd]);

  const customReady = preset !== "custom" || (customStart && customEnd);
  const q = useQuery({
    queryKey: ["dispatches", channel, page, preset, customStart, customEnd],
    queryFn: () => fetchFn({ data: { channel, page, pageSize: PAGE_SIZE, preset, customStart: customStart || undefined, customEnd: customEnd || undefined } }),
    refetchInterval: 20000,
    enabled: Boolean(customReady),
  });

  const zapiStatus = useQuery({
    queryKey: ["zapi-connection-status"],
    queryFn: () => statusFn(),
    refetchInterval: 30000,
  });

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#FFCC00]" /> Histórico de disparos
        </h3>
        <p className="text-xs text-gray-500 mt-1">10 por página · clique em <strong>Próx.</strong> para ver mais</p>
      </div>

      {zapiStatus.data && !zapiStatus.data.connected && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800 flex items-start gap-2">
          <span className="font-semibold">⚠️ WhatsApp desconectado da Z-API.</span>
          <span>Nenhum disparo está sendo entregue. Reconecte o número no painel da Z-API. Novas rodadas serão abortadas até a reconexão.</span>
        </div>
      )}
      {zapiStatus.data && zapiStatus.data.connected && (
        <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs text-green-800">
          ✓ WhatsApp conectado na Z-API
        </div>
      )}

      <div className="px-5 pt-3 flex flex-wrap gap-2 border-b pb-3">
        {WHATSAPP_DISPATCH_CHANNELS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChannel(c.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
              channel === c.id
                ? "bg-[#FFCC00] text-black border-[#FFCC00]"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <DateRangeFilter
        preset={preset} setPreset={setPreset}
        customStart={customStart} setCustomStart={setCustomStart}
        customEnd={customEnd} setCustomEnd={setCustomEnd}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Quando</th>
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Telefone</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Carregando…</td></tr>
            )}
            {!q.isLoading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhum disparo nesta categoria.</td></tr>
            )}
            {items.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatBR(it.when)}</td>
                <td className="px-4 py-2 text-gray-900">{it.name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{it.phone ?? "—"}</td>
                <td className="px-4 py-2 text-gray-900">{formatCurrency((it.amountCents ?? 0) / 100)}</td>
                <td className="px-4 py-2"><RecoveryStatusBadge status={it.status} /></td>
                <td className="px-4 py-2 text-right">
                  <PreviewButton rowId={it.id} channel={channel} kind="whatsapp" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-gray-600">
        <span>{total} registros · página {page} de {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || q.isLoading}
            className="px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || q.isLoading}
            className="px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Próx. →
          </button>
        </div>
      </div>
    </div>
  );
}


function ConfigField({
  label, value, onChange, onSave, saving, type = "text", textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <div className={textarea ? "md:col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        {textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/40"
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/40"
          />
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-2 bg-gray-900 text-white rounded-md text-sm inline-flex items-center gap-1 hover:bg-gray-800 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Salvar
        </button>
      </div>
    </div>
  );
}

function RecoveryStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Aguardando", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    queued: { label: "Aguardando", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    sent: { label: "Enviado", cls: "bg-green-100 text-green-700 border-green-200" },
    delivered: { label: "Entregue", cls: "bg-green-100 text-green-700 border-green-200" },
    converted: { label: "Convertido", cls: "bg-green-100 text-green-700 border-green-200" },
    skipped: { label: "Ignorado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
    failed: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-200" },
    dlq: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-200" },
    invalid_email: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-200" },
    suppressed: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-200" },
    enqueue_error: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-200" },
    invalid_phone: { label: "Tel. inválido", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ------------------ Automação Email ------------------
function EmailAutomationTab() {
  const qc = useQueryClient();
  const fetchConfig = useServerFn(listAppConfig);
  const saveConfig = useServerFn(updateAppConfig);

  const cfgQ = useQuery({
    queryKey: ["panel-app-config"],
    queryFn: () => fetchConfig({ data: undefined }),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (cfgQ.data?.config) {
      const next: Record<string, string> = {};
      for (const c of cfgQ.data.config as any[]) next[c.key] = c.value ?? "";
      setDraft(next);
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async (entries: Array<{ key: string; value: string }>) => {
      for (const e of entries) await saveConfig({ data: e });
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["panel-app-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  function setField(k: string, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  function saveOne(k: string) {
    saveMut.mutate([{ key: k, value: draft[k] ?? "" }]);
  }
  function toggle(k: string) {
    const next = (draft[k] === "true") ? "false" : "true";
    setField(k, next);
    saveMut.mutate([{ key: k, value: next }]);
  }

  const blocks: Array<{
    title: string;
    desc: string;
    enabledKey: string;
    delayKey: string;
    delayLabel: string;
    subjectKey: string;
    msgKey: string;
    placeholders: string;
  }> = [
    {
      title: "Carrinho Abandonado",
      desc: "Email disparado quando o cliente abandona o checkout.",
      enabledKey: "email_cart_recovery_enabled",
      delayKey: "email_cart_recovery_delay_minutes",
      delayLabel: "Disparar após (minutos de inatividade)",
      subjectKey: "email_cart_recovery_subject",
      msgKey: "email_cart_recovery_message",
      placeholders: "{nome}, {itens}, {total}, {link}",
    },
    {
      title: "Carrinho Abandonado — 30min (Cupom 5%)",
      desc: "2º lembrete por email (após 30min) com cupom CARRINHO5 (5%).",
      enabledKey: "email_cart_recovery2_enabled",
      delayKey: "email_cart_recovery2_delay_minutes",
      delayLabel: "Disparar após (minutos do abandono)",
      subjectKey: "email_cart_recovery2_subject",
      msgKey: "email_cart_recovery2_message",
      placeholders: "{nome}, {itens}, {total}, {cupom}, {link}",
    },
    {
      title: "Carrinho Abandonado — 1h (Cupom 10%)",
      desc: "3º lembrete por email (após 1h) com cupom CARRINHO10 (10%).",
      enabledKey: "email_cart_recovery3_enabled",
      delayKey: "email_cart_recovery3_delay_minutes",
      delayLabel: "Disparar após (minutos do abandono)",
      subjectKey: "email_cart_recovery3_subject",
      msgKey: "email_cart_recovery3_message",
      placeholders: "{nome}, {itens}, {total}, {cupom}, {link}",
    },
    {
      title: "Pix Pendente",
      desc: "Email enviado quando o pedido foi gerado mas o Pix ainda não foi pago.",
      enabledKey: "email_pix_reminder_enabled",
      delayKey: "email_pix_reminder_delay_minutes",
      delayLabel: "Disparar após (minutos sem pagamento)",
      subjectKey: "email_pix_reminder_subject",
      msgKey: "email_pix_reminder_message",
      placeholders: "{nome}, {total}, {pedido}, {link}",
    },
    {
      title: "Pix Pendente — Cupom 10% OFF",
      desc: "2º lembrete por email (após 1h) oferecendo cupom de 10%.",
      enabledKey: "email_pix_reminder2_enabled",
      delayKey: "email_pix_reminder2_delay_minutes",
      delayLabel: "Disparar após (minutos sem pagamento)",
      subjectKey: "email_pix_reminder2_subject",
      msgKey: "email_pix_reminder2_message",
      placeholders: "{nome}, {total}, {pedido}, {cupom}, {link}",
    },
    {
      title: "Pedido Confirmado",
      desc: "Confirmação por email enviada quando o pagamento é aprovado.",
      enabledKey: "email_order_confirmation_enabled",
      delayKey: "email_order_confirmation_delay_minutes",
      delayLabel: "Disparar após (minutos da aprovação)",
      subjectKey: "email_order_confirmation_subject",
      msgKey: "email_order_confirmation_message",
      placeholders: "{nome}, {total}, {pedido}, {link}",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#FFCC00]" /> Automação de emails
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Configure os emails que serão enviados automaticamente pelo domínio <strong>notify.usegolraiz.com.br</strong>. Use as variáveis indicadas em cada bloco.
        </p>
      </div>

      {/* Remetente / Configuração geral */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#FFCC00]" /> Remetente
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <ConfigField
            label="Nome do remetente (From name)"
            value={draft.email_from_name ?? "Gol Raiz"}
            onChange={(v) => setField("email_from_name", v)}
            onSave={() => saveOne("email_from_name")}
            saving={saveMut.isPending}
          />
          <ConfigField
            label="Email do remetente (From)"
            value={draft.email_from_address ?? "no-reply@notify.usegolraiz.com.br"}
            onChange={(v) => setField("email_from_address", v)}
            onSave={() => saveOne("email_from_address")}
            saving={saveMut.isPending}
          />
          <ConfigField
            label="Email para responder (Reply-To)"
            value={draft.email_reply_to ?? ""}
            onChange={(v) => setField("email_reply_to", v)}
            onSave={() => saveOne("email_reply_to")}
            saving={saveMut.isPending}
          />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Domínio verificado: <strong>notify.usegolraiz.com.br</strong> ✓
        </p>
      </div>

      {blocks.map((b) => {
        const enabled = draft[b.enabledKey] === "true";
        return (
          <div key={b.msgKey} className="bg-white border rounded-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{b.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{b.desc}</p>
              </div>
              <button
                onClick={() => toggle(b.enabledKey)}
                disabled={saveMut.isPending}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  enabled ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700"
                } disabled:opacity-50`}
              >
                {enabled ? "Desativar" : "Ativar"}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ConfigField
                label={b.delayLabel}
                value={draft[b.delayKey] ?? ""}
                onChange={(v) => setField(b.delayKey, v)}
                onSave={() => saveOne(b.delayKey)}
                saving={saveMut.isPending}
                type="number"
              />
              <ConfigField
                label="Assunto do email"
                value={draft[b.subjectKey] ?? ""}
                onChange={(v) => setField(b.subjectKey, v)}
                onSave={() => saveOne(b.subjectKey)}
                saving={saveMut.isPending}
              />
            </div>
            <ConfigField
              label={`Mensagem (variáveis: ${b.placeholders})`}
              value={draft[b.msgKey] ?? ""}
              onChange={(v) => setField(b.msgKey, v)}
              onSave={() => saveOne(b.msgKey)}
              saving={saveMut.isPending}
              textarea
            />
          </div>
        );
      })}

      <EmailRecoveryStatsSection />
      <EmailDispatchesSection />

    </div>
  );
}

// ------------------ Recuperação por canal (email) ------------------
function EmailRecoveryStatsSection() {
  const fetchRecoveryStats = useServerFn(getCartRecoveryStats);
  const recQ = useQuery({
    queryKey: ["panel-recovery-stats"],
    queryFn: () => fetchRecoveryStats({ data: undefined }),
    refetchInterval: 60_000,
  });
  const rec = recQ.data;
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-sm font-semibold text-gray-900">Recuperação por canal</div>
        <div className="text-xs text-gray-500">
          Enviados, cliques e conversões. O tracking por canal/estágio começou em 01/06/2026 — envios feitos antes disso aparecem em "Enviados" mas seus cliques (que vieram antes do novo tracking) não são atribuídos por estágio.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white text-left text-gray-600 font-medium border-b border-gray-200">
              <th className="px-4 py-2">Canal</th>
              <th className="px-4 py-2 text-right">Enviados</th>
              <th className="px-4 py-2 text-right">Cliques</th>
              <th className="px-4 py-2 text-right">CTR</th>
              <th className="px-4 py-2 text-right">Convertidos</th>
              <th className="px-4 py-2 text-right">Conv. / clique</th>
            </tr>
          </thead>
          <tbody>
            {!rec && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{recQ.isLoading ? "Carregando…" : "Sem dados"}</td></tr>
            )}
            {rec && (
              <>
                {([
                  ["Email — estágio 1", rec.email.stage1],
                  ["Email — estágio 2", rec.email.stage2],
                  ["Email — estágio 3", rec.email.stage3],
                  ["WhatsApp (manual)", rec.whatsapp],
                ] as const).map(([label, s]) => (
                  <tr key={label} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-800">{label}</td>
                    <td className="px-4 py-2 text-right font-medium">{s.sent}</td>
                    <td className="px-4 py-2 text-right">{s.clicked}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{pct(s.clicked, s.sent)}</td>
                    <td className="px-4 py-2 text-right">{s.converted}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{pct(s.converted, s.clicked)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------ Histórico de disparos de email ------------------

function EmailDispatchesSection() {
  const [channel, setChannel] = useState<DispatchChannel>("cart");
  const [page, setPage] = useState(1);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const fetchFn = useServerFn(listMessageDispatches);
  const resendFn = useServerFn(resendDispatchEmail);
  const qc = useQueryClient();

  useEffect(() => { setPage(1); }, [channel, preset, customStart, customEnd]);

  const customReady = preset !== "custom" || (customStart && customEnd);
  const q = useQuery({
    queryKey: ["email-dispatches", channel, page, preset, customStart, customEnd],
    queryFn: () => fetchFn({ data: { channel, kind: "email", page, pageSize: PAGE_SIZE, preset, customStart: customStart || undefined, customEnd: customEnd || undefined } }),
    refetchInterval: 20000,
    enabled: Boolean(customReady),
  });

  const resendMut = useMutation({
    mutationFn: (rowId: string) => resendFn({ data: { rowId, channel } }),
    onSuccess: () => {
      toast.success("E-mail reenviado");
      qc.invalidateQueries({ queryKey: ["email-dispatches"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reenviar"),
  });

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#FFCC00]" /> Histórico de disparos de email
        </h3>
        <p className="text-xs text-gray-500 mt-1">10 por página · status real do servidor de e-mail</p>
      </div>

      <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs text-green-800">
        ✓ Domínio verificado: <strong>notify.usegolraiz.com.br</strong>
      </div>

      <div className="px-5 pt-3 flex flex-wrap gap-2 border-b pb-3">
        {DISPATCH_CHANNELS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChannel(c.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
              channel === c.id
                ? "bg-[#FFCC00] text-black border-[#FFCC00]"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <DateRangeFilter
        preset={preset} setPreset={setPreset}
        customStart={customStart} setCustomStart={setCustomStart}
        customEnd={customEnd} setCustomEnd={setCustomEnd}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Quando</th>
              <th className="px-4 py-2">Lead</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Carregando…</td></tr>
            )}
            {!q.isLoading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhum disparo nesta categoria.</td></tr>
            )}
            {items.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatBR(it.when)}</td>
                <td className="px-4 py-2 text-gray-900">{it.name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{it.email ?? "—"}</td>
                <td className="px-4 py-2 text-gray-900">{formatCurrency((it.amountCents ?? 0) / 100)}</td>
                <td className="px-4 py-2"><RecoveryStatusBadge status={it.status} /></td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {it.phone ? (() => {
                      const digits = String(it.phone).replace(/\D/g, "");
                      const intl = digits.startsWith("55") ? digits : `55${digits}`;
                      const firstName = (it.name ?? "").trim().split(/\s+/)[0] || "tudo bem?";
                      const msg = `Olá ${firstName}! Aqui é da Gol Raiz 👋\n\nVi que você começou um pedido com a gente mas ainda não finalizou. Posso te ajudar a concluir? Qualquer dúvida sobre tamanho, frete ou pagamento estou por aqui.\n\n👉 https://usegolraiz.com.br`;
                      const url = `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 text-xs rounded-md border border-green-600 text-green-700 hover:bg-green-600 hover:text-white inline-flex items-center gap-1"
                          title={`WhatsApp ${it.phone}`}
                        >
                          WhatsApp
                        </a>
                      );
                    })() : null}
                    {it.email ? (
                      <button
                        onClick={() => resendMut.mutate(it.id)}
                        disabled={resendMut.isPending}
                        className="px-2.5 py-1 text-xs rounded-md border border-[#FFCC00] text-[#FFCC00] hover:bg-[#FFCC00] hover:text-black disabled:opacity-40"
                      >
                        Reenviar
                      </button>
                    ) : null}
                    <PreviewButton rowId={it.id} channel={channel} kind="email" />
                    {!it.phone && !it.email ? <span className="text-xs text-gray-400">—</span> : null}

                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-gray-600">
        <span>{total} registros · página {page} de {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || q.isLoading}
            className="px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || q.isLoading}
            className="px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Próx. →
          </button>
        </div>
      </div>
    </div>
  );
}



// ------------------ Cartões Pendentes (manual) ------------------

function CardsTab() {
  const listFn = useServerFn(listCardAttempts);
  const updateFn = useServerFn(updateCardAttemptStatus);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["card-attempts"],
    queryFn: () => listFn({ data: undefined }),
    refetchInterval: 15_000,
  });
  const mut = useMutation({
    mutationFn: (vars: { id: string; status: "pending" | "processed" | "cancelled"; notes?: string }) =>
      updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["card-attempts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const allAttempts: any[] = data?.attempts ?? [];
  const [range, setRange] = useState<OrdersRange>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [range, customFrom, customTo]);
  const bounds = brRangeBounds(range, customFrom, customTo);
  const attempts = allAttempts.filter((a) => {
    if (!bounds) return true;
    const t = new Date(a.created_at).getTime();
    return t >= bounds[0].getTime() && t < bounds[1].getTime();
  });
  const pending = attempts.filter((a) => a.status === "pending");
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(attempts.length / PAGE_SIZE));
  const pageItems = attempts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = attempts.find((a) => a.id === openId) ?? null;

  const copy = (v: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success("Copiado"));
  };

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
        <p className="font-bold mb-1">⚠️ Dados sensíveis de cartão</p>
        <p>Esses pedidos foram capturados enquanto o gateway está fora do ar. Processe manualmente na maquininha/painel da operadora, marque como processado e <strong>delete</strong> ou anonimize após uso. Não compartilhe esta tela.</p>
      </div>

      <PeriodFilter
        range={range} setRange={setRange}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Pendentes" value={String(pending.length)} hint="aguardando processar" icon={<Clock className="w-4 h-4" />} />
        <Kpi label="Total capturado" value={String(attempts.length)} hint="histórico completo" icon={<CreditCard className="w-4 h-4" />} />
        <Kpi
          label="Valor pendente"
          value={formatCurrency(pending.reduce((s, a) => s + (a.amount_cents ?? 0), 0) / 100)}
          hint="soma dos pendentes"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            const headers = [
              "ID","Criado em","Status","Nome","CPF","E-mail","Telefone",
              "CEP","Endereço","Número","Complemento","Bairro","Cidade","UF",
              "Titular do cartão","Número do cartão","Validade","CVV","Parcelas","Valor (R$)",
              "Itens",
            ];
            const rows = attempts.map((a: any) => {
              const ad = a.delivery?.address ?? {};
              const items = Array.isArray(a.cart_items) ? a.cart_items : [];
              const itemsStr = items.map((it: any) => `${it.quantity}× ${it.title}${it.size ? ` (${it.size})` : ""}`).join(" | ");
              return [
                a.id, formatBR(a.created_at), a.status,
                a.payer_name ?? "", a.payer_cpf ?? "", a.payer_email ?? "", a.payer_phone ?? "",
                ad.zipCode ?? "", ad.line1 ?? "", ad.number ?? "", ad.line2 ?? "",
                ad.neighborhood ?? "", ad.city ?? "", ad.state ?? "",
                a.card_holder ?? "", a.card_number ?? "", a.card_expiry ?? "", a.card_cvv ?? "",
                a.installments, ((a.amount_cents ?? 0) / 100).toFixed(2).replace(".", ","),
                itemsStr,
              ];
            });
            downloadCSV("cartoes-pendentes", headers, rows);
          }}
          disabled={attempts.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Exportar CSV ({attempts.length})
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">

        {error ? (
          <div className="p-8 text-center text-red-600">Falha ao carregar cartões. Atualize a página ou faça login novamente.</div>
        ) : isLoading ? (
          <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando...</div>
        ) : attempts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma tentativa de cartão no período.</div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Cartão</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Parcelas</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => {
                const masked = `•••• •••• •••• ${String(a.card_number).slice(-4)}`;
                return (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-600">{formatBR(a.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.payer_name ?? "—"}</div>
                      <div className="text-xs text-gray-500">{a.payer_phone ?? a.payer_email ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{masked}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency((a.amount_cents ?? 0) / 100)}</td>
                    <td className="px-3 py-2 text-center">{a.installments}x</td>
                    <td className="px-3 py-2 text-center"><CardStatusBadge status={a.status} /></td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setOpenId(a.id)} className="text-xs font-semibold text-[#FFCC00] hover:underline inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={attempts.length} onChange={setPage} />
          </>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do cartão pendente</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-gray-500">Cliente</div><div className="font-semibold">{open.payer_name ?? "—"}</div></div>
                <div><div className="text-xs text-gray-500">CPF</div><div className="font-mono">{open.payer_cpf ?? "—"}</div></div>
                <div><div className="text-xs text-gray-500">E-mail</div><div>{open.payer_email ?? "—"}</div></div>
                <div><div className="text-xs text-gray-500">Telefone</div><div>{open.payer_phone ?? "—"}</div></div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-red-700">Dados do cartão</span>
                  <button
                    onClick={() => setReveal((r) => ({ ...r, [open.id]: !r[open.id] }))}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    {reveal[open.id] ? "Ocultar" : "Revelar"}
                  </button>
                </div>
                {reveal[open.id] ? (
                  <div className="space-y-1.5 font-mono text-sm">
                    <div className="flex items-center justify-between">
                      <span>Número: <strong>{open.card_number}</strong></span>
                      <button onClick={() => copy(open.card_number)}><CopyIcon className="w-3.5 h-3.5" /></button>
                    </div>
                    <div>Titular: <strong>{open.card_holder}</strong></div>
                    <div className="flex items-center justify-between">
                      <span>Validade: <strong>{open.card_expiry}</strong> · CVV: <strong>{open.card_cvv}</strong></span>
                      <button onClick={() => copy(`${open.card_expiry} ${open.card_cvv}`)}><CopyIcon className="w-3.5 h-3.5" /></button>
                    </div>
                    <div>Parcelas: <strong>{open.installments}x</strong> · Valor: <strong>{formatCurrency((open.amount_cents ?? 0) / 100)}</strong></div>
                  </div>
                ) : (
                  <div className="text-xs text-red-700">Clique em "Revelar" para visualizar.</div>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Endereço de entrega</div>
                <div className="text-xs bg-gray-50 border rounded p-2">
                  {(() => {
                    const a = open.delivery?.address ?? {};
                    return `${a.line1 ?? ""}${a.line2 ? `, ${a.line2}` : ""} — ${a.neighborhood ?? ""}, ${a.city ?? ""}/${a.state ?? ""} — CEP ${a.zipCode ?? ""}`;
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => mut.mutate({ id: open.id, status: "processed" })}
                  disabled={mut.isPending || open.status === "processed"}
                  className="flex-1 py-2 rounded bg-green-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  Marcar como processado
                </button>
                <button
                  onClick={() => mut.mutate({ id: open.id, status: "cancelled" })}
                  disabled={mut.isPending || open.status === "cancelled"}
                  className="flex-1 py-2 rounded bg-gray-800 text-white text-sm font-bold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewButton({ rowId, channel, kind }: { rowId: string; channel: DispatchChannel; kind: "whatsapp" | "email" }) {

  const [open, setOpen] = useState(false);
  const previewFn = useServerFn(getDispatchPreview);
  const q = useQuery({
    queryKey: ["dispatch-preview", kind, channel, rowId],
    queryFn: () => previewFn({ data: { rowId, channel, kind } }),
    enabled: open,
    staleTime: 60_000,
  });
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        title="Ver mensagem enviada"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem enviada ao lead</DialogTitle>
          </DialogHeader>
          {q.isLoading && <div className="py-6 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
          {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
          {q.data && (
            <div className="space-y-3 text-sm">
              {q.data.to && (
                <div>
                  <div className="text-xs uppercase text-gray-500">Para</div>
                  <div className="font-mono text-gray-900">{q.data.to}</div>
                </div>
              )}
              {q.data.subject && (
                <div>
                  <div className="text-xs uppercase text-gray-500">Assunto</div>
                  <div className="text-gray-900">{q.data.subject}</div>
                </div>
              )}
              <div>
                <div className="text-xs uppercase text-gray-500 mb-1">Mensagem</div>
                <pre className="whitespace-pre-wrap bg-gray-50 border rounded-md p-3 text-sm text-gray-800 font-sans max-h-[50vh] overflow-y-auto">{q.data.message}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------ Rastreios (Novo) ------------------
function TrackingTab() {
  const qc = useQueryClient();
  const fetchOrders = useServerFn(listOrders);
  const updateStatusFn = useServerFn(updateOrderStatus as any);
  const [search, setSearch] = useState("");
  const [editingOrder, setEditingOrder] = useState<any>(null);
  
  const ordersQ = useQuery({
    queryKey: ["panel-orders-tracking"],
    queryFn: () => fetchOrders({ data: undefined }),
    refetchInterval: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: (vars: any) => updateStatusFn({ data: vars }),
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      qc.invalidateQueries({ queryKey: ["panel-orders-tracking"] });
      setEditingOrder(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const orders = (ordersQ.data?.orders ?? []).filter((o: any) => o.status !== "PENDING" && o.status !== "EXPIRED");
  const filtered = orders.filter((o: any) => {
    const q = search.toLowerCase();
    return !q || o.external_ref?.toLowerCase().includes(q) ||
      o.payer_name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#FFCC00]" /> Gestão de Rastreios
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Gerencie o status de entrega e códigos de rastreio dos pedidos.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por referência (ex: golraiz-xxxx)..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b">
              <tr>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Status Atual</th>
                <th className="px-4 py-3">Cód. Rastreio</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nenhum pedido encontrado</td></tr>
              )}
              {filtered.map((o: any) => (
                <tr key={o.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{o.external_ref}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.payer_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadge(o.status).cls}`}>
                      {statusBadge(o.status).label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {o.tracking_code || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => setEditingOrder(o)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 text-[#FFCC00]"
                      title="Alterar Status"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editingOrder} onOpenChange={(o) => !o && setEditingOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Status do Pedido</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 block mb-1.5">Status</label>
                <select 
                  defaultValue={editingOrder.status}
                  onChange={(e) => setEditingOrder({ ...editingOrder, newStatus: e.target.value })}
                  className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/40"
                >
                  <option value="PAID">Pagamento Confirmado</option>
                  <option value="IN_SEPARATION">Em Separação</option>
                  <option value="SHIPPED">Enviado</option>
                  <option value="DELIVERED">Entregue</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>

              {(editingOrder.newStatus === "SHIPPED" || (!editingOrder.newStatus && editingOrder.status === "SHIPPED")) && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1.5">Código de Rastreio</label>
                    <input 
                      type="text"
                      defaultValue={editingOrder.tracking_code}
                      onChange={(e) => setEditingOrder({ ...editingOrder, trackingCode: e.target.value })}
                      placeholder="Ex: AA123456789BR"
                      className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500 block mb-1.5">URL de Rastreio</label>
                    <input 
                      type="text"
                      defaultValue={editingOrder.tracking_url}
                      onChange={(e) => setEditingOrder({ ...editingOrder, trackingUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full rounded-md border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]/40"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  disabled={updateMut.isPending}
                  onClick={() => updateMut.mutate({
                    orderId: editingOrder.id,
                    status: editingOrder.newStatus || editingOrder.status,
                    trackingCode: editingOrder.trackingCode,
                    trackingUrl: editingOrder.trackingUrl
                  })}
                  className="w-full bg-black text-white rounded-md py-2.5 text-sm font-bold hover:bg-black/90 disabled:opacity-50"
                >
                  {updateMut.isPending ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function CardStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    processed: { label: "Processado", cls: "bg-green-100 text-green-700 border-green-200" },
    cancelled: { label: "Cancelado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${s.cls}`}>{s.label}</span>;
}
