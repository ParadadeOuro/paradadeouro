import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listClarexRecordings,
  getClarexRecordingUrl,
  deleteClarexRecording,
} from "@/lib/clarex.functions";
import {
  listBlockedIps,
  blockIp,
  blockSessionIp,
  unblockIp,
} from "@/lib/ip-blocklist.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Film,
  Play,
  Trash2,
  Search,
  Loader2,
  AlertTriangle,
  MapPin,
  Smartphone,
  Monitor,
  Tablet,
  Eye,
  Sparkles,
  Map as MapIcon,
  HelpCircle,
  Ban,
  ShieldOff,
} from "lucide-react";
import { formatBR } from "@/lib/datetime";
import { toast } from "sonner";


type Range = "today" | "week" | "month" | "all";
type Filter = "all" | "attention" | "short" | "long" | "located";
type View = "recordings" | "heatmap" | "insights" | "help" | "blacklist";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function deviceIcon(t?: string | null) {
  if (t === "mobile") return <Smartphone className="w-3.5 h-3.5" />;
  if (t === "tablet") return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
}

function flagFor(cc?: string | null) {
  if (!cc) return "—";
  if (cc.length !== 2) return cc;
  const codePoints = cc
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

export function ClarexTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listClarexRecordings);
  const delFn = useServerFn(deleteClarexRecording);
  const blockSessionFn = useServerFn(blockSessionIp);

  const [range, setRange] = useState<Range>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<View>("recordings");
  const [insightRange, setInsightRange] = useState<Range>("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["clarex", range, filter, search],
    queryFn: () => listFn({ data: { range, filter, search } }),
    refetchInterval: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gravação excluída");
      qc.invalidateQueries({ queryKey: ["clarex"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockMut = useMutation({
    mutationFn: (sessionId: string) =>
      blockSessionFn({ data: { sessionId, reason: "Bloqueado via painel Clarex" } }),
    onSuccess: (r) => {
      toast.success(`IP ${r.ip} bloqueado`);
      qc.invalidateQueries({ queryKey: ["blocked-ips"] });
      qc.invalidateQueries({ queryKey: ["clarex"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = data?.stats ?? { total: 0, listed: 0, attention: 0, located: 0 };
  const rows = data?.rows ?? [];


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Clarex</h2>
        <p className="text-sm text-gray-500">
          Replay, gravações e mapas de calor para entender a navegação dos visitantes.
        </p>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Sessões no período"
          value={stats.total}
          icon={<Film className="w-4 h-4 text-gray-500" />}
        />
        <StatCard
          label="Na lista (página)"
          value={stats.listed}
          icon={<Eye className="w-4 h-4 text-gray-500" />}
        />
        <StatCard
          label="Insights prioritários"
          value={stats.attention}
          sub="Severidade alta"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          label="Com localização"
          value={stats.located}
          sub={`${stats.located} sessões`}
          icon={<MapPin className="w-4 h-4 text-gray-500" />}
        />
      </div>

      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Área de análise</h3>
            <p className="text-xs text-gray-500">Gravações, mapa de calor, insights e ajuda.</p>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 border rounded-lg p-1">
            {(
              [
                ["recordings", "Gravações", Film],
                ["heatmap", "Mapa de calor", MapIcon],
                ["insights", "Insights", Sparkles],
                ["blacklist", "IP Blacklist", Ban],
                ["help", "Ajuda", HelpCircle],
              ] as [View, string, typeof Film][]
            ).map(([id, label, Icon]) => {
              const active = view === id;
              const badge = id === "insights" && stats.attention > 0 ? stats.attention : null;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    active
                      ? "bg-white text-gray-900 shadow-sm border"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                  {badge !== null && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-violet-600 text-white">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {view === "recordings" && (
          <>
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por URL..."
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(["today", "week", "month", "all"] as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition ${
                      range === r
                        ? "bg-[#FFCC00] text-black border-[#FFCC00]"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {r === "today"
                      ? "Hoje"
                      : r === "week"
                        ? "Semana"
                        : r === "month"
                          ? "Mês"
                          : "Todos"}
                  </button>
                ))}
              </div>

              <div className="flex gap-4 border-b">
                {(
                  [
                    ["all", "Todas"],
                    ["attention", "Atenção"],
                    ["short", "Curtas"],
                    ["long", "Longas"],
                    ["located", "Com localização"],
                  ] as [Filter, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={`pb-2 text-sm font-medium border-b-2 transition ${
                      filter === id
                        ? "border-[#FFCC00] text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="ml-auto pb-2 text-xs text-gray-500">{rows.length} sessões</div>
              </div>
            </div>

            <div className="overflow-x-auto mt-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : error ? (
                <div className="text-center py-8 text-sm text-red-600">
                  Erro ao carregar: {(error as Error).message}{" "}
                  <button onClick={() => refetch()} className="ml-2 underline">
                    tentar novamente
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  Nenhuma gravação encontrada. As sessões aparecem aqui após visitantes interagirem
                  no site.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500 border-b">
                      <th className="text-left py-2 font-medium">Gravação</th>
                      <th className="text-left py-2 font-medium">Superfície</th>
                      <th className="text-left py-2 font-medium">Dispositivo</th>
                      <th className="text-left py-2 font-medium">Duração</th>
                      <th className="text-left py-2 font-medium">Eventos</th>
                      <th className="text-left py-2 font-medium">Local</th>
                      <th className="text-left py-2 font-medium">IP</th>
                      <th className="text-right py-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPlayerId(r.id)}
                              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                              aria-label="Reproduzir"
                            >
                              <Play className="w-3.5 h-3.5 text-gray-700" />
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900 text-xs">
                                  {r.id.slice(0, 8)}…
                                </span>
                                {r.has_attention && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    Atenção
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate max-w-[260px]">
                                {formatBR(r.created_at)} ·{" "}
                                {r.page_url ?? "/"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="px-2 py-0.5 text-[11px] rounded-md bg-gray-100 text-gray-700 capitalize">
                            {r.surface}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            {deviceIcon(r.device_type)}
                            <span className="capitalize">{r.device_type ?? "—"}</span>
                            {r.browser && <span>· {r.browser}</span>}
                            {r.os && <span>· {r.os}</span>}
                          </div>
                        </td>
                        <td className="text-xs text-gray-700">{formatDuration(r.duration_ms)}</td>
                        <td className="text-xs text-gray-700">{r.event_count}</td>
                        <td className="text-base">{flagFor(r.country_code)}</td>
                        <td className="text-xs font-mono text-gray-700">
                          {(r as { ip_address?: string | null }).ip_address ?? (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setPlayerId(r.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-[#FFCC00] text-black rounded-md hover:bg-[#e6b800]"
                            >
                              <Play className="w-3 h-3" /> Abrir
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Bloquear o IP desta sessão (${r.session_id.slice(0, 8)}…)? Ele perderá acesso ao site imediatamente.`)) {
                                  blockMut.mutate(r.session_id);
                                }
                              }}
                              disabled={blockMut.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50"
                              title="Bloquear IP desta sessão"
                            >
                              <Ban className="w-3 h-3" /> Bloquear
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Excluir esta gravação?")) deleteMut.mutate(r.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {view === "insights" && (
          <InsightsView
            range={insightRange}
            onRangeChange={setInsightRange}
            allRows={rows}
            loading={isLoading}
          />
        )}

        {view === "heatmap" && (
          <div className="text-center py-16 text-sm text-gray-500">
            <MapIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            Mapa de calor em breve. Os cliques já estão sendo gravados — a visualização agregada
            será liberada em uma próxima atualização.
          </div>
        )}

        {view === "help" && (
          <div className="text-sm text-gray-700 space-y-2 py-4 max-w-2xl">
            <p>
              <strong>O que é o Clarex?</strong> É o seu sistema de replay de sessões. Cada
              visitante que toca, rola ou clica no site é gravado e fica disponível por 7 dias.
            </p>
            <p>
              <strong>Insights:</strong> destaque automático dos sinais mais importantes (etapas com
              maior abandono, rage clicks, conversão até o sucesso).
            </p>
            <p>
              <strong>Gravações:</strong> lista completa filtrável; clique em "Abrir" para
              reproduzir.
            </p>
            <p>
              <strong>Privacidade:</strong> senhas, emails e telefones são mascarados
              automaticamente.
            </p>
          </div>
        )}

        {view === "blacklist" && <BlacklistView />}
      </div>

      <Dialog open={!!playerId} onOpenChange={(o) => !o && setPlayerId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Reproduzir gravação</DialogTitle>
          </DialogHeader>
          {playerId && <PlayerView id={playerId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        {icon}
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function PlayerView({ id }: { id: string }) {
  const getUrl = useServerFn(getClarexRecordingUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    let player: { $destroy?: () => void } | null = null;

    (async () => {
      try {
        setStatus("loading");
        const pako = await import("pako");
        const { url, urls } = await getUrl({ data: { id } });
        const replayUrls = urls?.length ? urls : [url];
        const chunks = await Promise.all(
          replayUrls.map(async (replayUrl) => {
            const res = await fetch(replayUrl);
            if (!res.ok) throw new Error("Falha ao baixar gravação");
            const buf = new Uint8Array(await res.arrayBuffer());
            const jsonStr = pako.ungzip(buf, { to: "string" });
            return JSON.parse(jsonStr) as unknown[];
          }),
        );
        const events = chunks.flat();
        if (cancelled) return;

        if (!events || events.length < 2) {
          setErrorMsg("Gravação muito curta para reproduzir");
          setStatus("error");
          return;
        }

        const RRPlayer = (await import("rrweb-player")).default as unknown as new (
          opts: unknown,
        ) => { $destroy?: () => void };
        await import("rrweb-player/dist/style.css");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        player = new RRPlayer({
          target: containerRef.current,
          props: {
            events,
            width: containerRef.current.clientWidth || 900,
            height: 500,
            autoPlay: true,
            showController: true,
          },
        });
        setStatus("ready");
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        player?.$destroy?.();
      } catch {
        // ignore player cleanup errors
      }
    };
  }, [id, getUrl]);

  return (
    <div className="w-full">
      {status === "loading" && (
        <div className="flex items-center justify-center h-[400px] text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando gravação...
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center justify-center h-[400px] text-red-600 text-sm">
          {errorMsg}
        </div>
      )}
      <div ref={containerRef} className={status === "ready" ? "block" : "hidden"} />
    </div>
  );
}

function InsightsView({
  range,
  onRangeChange,
  allRows,
  loading,
}: {
  range: Range;
  onRangeChange: (r: Range) => void;
  allRows: Array<{
    id: string;
    created_at: string;
    surface: string;
    page_url: string | null;
    has_attention: boolean;
    duration_ms: number;
  }>;
  loading: boolean;
}) {
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === "today"
        ? now - 24 * 3600_000
        : range === "week"
          ? now - 7 * 24 * 3600_000
          : range === "month"
            ? now - 30 * 24 * 3600_000
            : 0;
    return cutoff === 0
      ? allRows
      : allRows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  }, [allRows, range]);

  const insights = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return [];

    const out: Array<{ id: string; title: string; body: string; priority?: boolean }> = [];

    // 1) Maior abandono — checkout sessions agrupadas por URL
    const checkout = filtered.filter((r) => r.surface === "checkout");
    if (checkout.length > 0) {
      const byPath = new Map<string, number>();
      for (const r of checkout) {
        const path = (r.page_url ?? "/checkout").split("?")[0];
        byPath.set(path, (byPath.get(path) ?? 0) + 1);
      }
      const top = [...byPath.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        out.push({
          id: "abandon",
          title: "Maior abandono",
          body: `Muitas sessões pararam em "${top[0]}" (${top[1]} sessões). Assista replays filtrados por essa URL/etapa.`,
        });
      }
    }

    // 2) Rage clicks
    const rage = filtered.filter((r) => r.has_attention).length;
    if (rage > 0) {
      const pct = ((rage / total) * 100).toFixed(1);
      out.push({
        id: "rage",
        title: "Rage clicks detectados",
        body: `${rage} sessão(ões) (${pct}%) com cliques repetidos de frustração. Revise os elementos mais clicados no heatmap.`,
      });
    }

    // 3) Conversão até sucesso
    if (checkout.length > 0) {
      const success = checkout.filter(
        (r) => (r.page_url ?? "").includes("/sucesso") || (r.page_url ?? "").includes("/obrigado"),
      ).length;
      const pct = ((success / checkout.length) * 100).toFixed(0);
      out.push({
        id: "conv",
        title: "Conversão até sucesso",
        body: `${success} de ${checkout.length} sessões com checkout marcaram etapa de sucesso (${pct}%).`,
        priority: success / checkout.length < 0.1,
      });
    }

    return out;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h4 className="font-semibold text-gray-900 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" /> Insights automáticos
          </h4>
          <p className="text-xs text-gray-500">
            Sinais detectados no período para priorizar onde agir.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-50 border rounded-lg p-1">
          {(
            [
              ["today", "Hoje"],
              ["week", "Semana"],
              ["month", "Mês"],
              ["all", "Todos"],
            ] as [Range, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onRangeChange(id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                range === id ? "bg-[#FFCC00] text-black" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">{filtered.length} sessões analisadas no período</div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando insights...
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 border border-dashed rounded-lg">
          Nenhum insight no período. Assim que houver sessões com sinais relevantes (abandono, rage
          clicks, baixa conversão), eles aparecem aqui automaticamente.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((i) => (
            <div
              key={i.id}
              className={`border rounded-lg p-3 ${i.priority ? "bg-amber-50 border-amber-200" : "bg-white"}`}
            >
              {i.priority && (
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">
                  Prioritário
                </div>
              )}
              <div className="font-semibold text-sm text-gray-900">{i.title}</div>
              <div className="text-xs text-gray-600 mt-1">{i.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlacklistView() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBlockedIps);
  const blockFn = useServerFn(blockIp);
  const unblockFn = useServerFn(unblockIp);
  const [ipInput, setIpInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["blocked-ips"],
    queryFn: () => listFn({ data: undefined }),
    refetchInterval: 30_000,
  });

  const addMut = useMutation({
    mutationFn: (vars: { ip: string; reason?: string }) =>
      blockFn({ data: { ip: vars.ip, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("IP bloqueado");
      setIpInput("");
      setReasonInput("");
      qc.invalidateQueries({ queryKey: ["blocked-ips"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => unblockFn({ data: { id } }),
    onSuccess: () => {
      toast.success("IP desbloqueado");
      qc.invalidateQueries({ queryKey: ["blocked-ips"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4 py-2">
      <div>
        <h4 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-600" /> IP Blacklist
        </h4>
        <p className="text-xs text-gray-500">
          IPs aqui não conseguem mais acessar o site — são redirecionados para uma página de bloqueio.
        </p>
      </div>

      <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
        <div className="text-xs font-semibold text-gray-700">Bloquear novo IP</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder="Ex: 187.45.12.34"
            className="px-3 py-1.5 border rounded-md text-sm font-mono flex-1 min-w-[180px]"
          />
          <input
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            placeholder="Motivo (opcional)"
            className="px-3 py-1.5 border rounded-md text-sm flex-1 min-w-[180px]"
          />
          <button
            onClick={() => {
              if (!ipInput.trim()) return;
              addMut.mutate({ ip: ipInput.trim(), reason: reasonInput.trim() || undefined });
            }}
            disabled={addMut.isPending || !ipInput.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            <Ban className="w-3.5 h-3.5" /> Bloquear
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500 border border-dashed rounded-lg">
          Nenhum IP bloqueado no momento.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-500 border-b">
              <th className="text-left py-2 font-medium">IP</th>
              <th className="text-left py-2 font-medium">Motivo</th>
              <th className="text-left py-2 font-medium">Sessão origem</th>
              <th className="text-left py-2 font-medium">Bloqueado em</th>
              <th className="text-right py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-2 font-mono text-xs">{r.ip_address}</td>
                <td className="text-xs text-gray-600">{r.reason ?? "—"}</td>
                <td className="text-xs font-mono text-gray-500">
                  {r.origin_session_id ? `${r.origin_session_id.slice(0, 8)}…` : "—"}
                </td>
                <td className="text-xs text-gray-600">{formatBR(r.created_at)}</td>
                <td className="text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Desbloquear ${r.ip_address}?`)) removeMut.mutate(r.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    <ShieldOff className="w-3 h-3" /> Desbloquear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
