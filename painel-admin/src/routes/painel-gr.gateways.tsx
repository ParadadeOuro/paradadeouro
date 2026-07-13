import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listGateways, setActiveGateway, toggleGatewayEnabled, updateGatewayFees } from "@/lib/gateways.functions";
import { checkIsAdmin } from "@/lib/orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, Power, Loader2, ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/painel-gr/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways — Painel" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: GatewaysPage,
});

function GatewaysPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchGateways = useServerFn(listGateways);
  const doActivate = useServerFn(setActiveGateway);
  const doToggle = useServerFn(toggleGatewayEnabled);
  const doUpdateFees = useServerFn(updateGatewayFees);

  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/painel-gr/login" }); return; }
      try {
        const r = await fetchIsAdmin({ data: undefined });
        setIsAdmin(r?.isAdmin ?? false);
      } catch { setIsAdmin(false); }
      setAuthChecked(true);
    })();
  }, [navigate, fetchIsAdmin]);

  const q = useQuery({
    queryKey: ["payment-gateways"],
    queryFn: () => fetchGateways({ data: undefined }),
    enabled: authChecked && isAdmin,
  });

  const activateMut = useMutation({
    mutationFn: (key: string) => doActivate({ data: { key } }),
    onSuccess: (r) => {
      toast.success(`Gateway ativo: ${r.active}`);
      qc.invalidateQueries({ queryKey: ["payment-gateways"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao ativar"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => doToggle({ data: v }),
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["payment-gateways"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const feesMut = useMutation({
    mutationFn: (v: { key: string; pix_fee_percent: number; pix_fee_fixed_cents: number }) =>
      doUpdateFees({ data: v }),
    onSuccess: () => {
      toast.success("Taxas atualizadas");
      qc.invalidateQueries({ queryKey: ["payment-gateways"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar taxas"),
  });

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-600">Acesso restrito.</p>
      </div>
    );
  }

  const gateways = q.data?.gateways ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/painel-gr" className="text-gray-500 hover:text-gray-900 flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Painel
          </Link>
          <h1 className="text-xl font-bold ml-2 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#FFCC00]" />
            Gateways de Pagamento
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-600 mb-4">
          Apenas um gateway pode estar ativo por vez. As taxas PIX abaixo são usadas para calcular o
          campo <strong>Taxas</strong> na aba <em>Custos &amp; Lucro</em>.
        </p>

        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="grid gap-3">
            {gateways.map((g: any) => (
              <GatewayCard
                key={g.id}
                g={g}
                onActivate={() => activateMut.mutate(g.key)}
                onToggle={() => toggleMut.mutate({ key: g.key, enabled: !g.enabled })}
                onSaveFees={(pct, fixed) =>
                  feesMut.mutate({ key: g.key, pix_fee_percent: pct, pix_fee_fixed_cents: fixed })
                }
                isSavingFees={feesMut.isPending}
                isActivating={activateMut.isPending}
                isToggling={toggleMut.isPending}
              />
            ))}
          </div>
        )}

        <div className="mt-8 text-xs text-gray-500 space-y-1">
          <p><strong>Monetrix:</strong> requer a secret <code>MONETRIX_API_KEY</code>. Webhook em <code>/api/public/monetrix-webhook</code>.</p>
        </div>
      </main>
    </div>
  );
}

function GatewayCard({
  g, onActivate, onToggle, onSaveFees, isSavingFees, isActivating, isToggling,
}: {
  g: any;
  onActivate: () => void;
  onToggle: () => void;
  onSaveFees: (pct: number, fixedCents: number) => void;
  isSavingFees: boolean;
  isActivating: boolean;
  isToggling: boolean;
}) {
  const [pct, setPct] = useState<string>(String(g.pix_fee_percent ?? 0));
  const [fixedR, setFixedR] = useState<string>(((g.pix_fee_fixed_cents ?? 0) / 100).toFixed(2));

  useEffect(() => {
    setPct(String(g.pix_fee_percent ?? 0));
    setFixedR(((g.pix_fee_fixed_cents ?? 0) / 100).toFixed(2));
  }, [g.pix_fee_percent, g.pix_fee_fixed_cents]);

  const dirty =
    Number(pct) !== Number(g.pix_fee_percent ?? 0) ||
    Math.round(Number(fixedR) * 100) !== Number(g.pix_fee_fixed_cents ?? 0);

  return (
    <div className={`bg-white border rounded-lg p-4 ${g.is_active ? "border-green-300 ring-1 ring-green-200" : "border-gray-200"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
            g.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            <Power className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              {g.name}
              {g.is_active && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" /> Ativo
                </span>
              )}
              {!g.enabled && (
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Desabilitado</span>
              )}
            </div>
            <div className="text-xs text-gray-500">key: {g.key}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            disabled={isToggling}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {g.enabled ? "Desabilitar" : "Habilitar"}
          </button>
          <button
            onClick={onActivate}
            disabled={g.is_active || !g.enabled || isActivating}
            className="px-3 py-1.5 text-sm rounded bg-[#FFCC00] text-black font-medium hover:bg-[#e6b800] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {g.is_active ? "Em uso" : "Ativar"}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t pt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs font-medium text-gray-700">
          Taxa PIX (%)
          <input
            type="number"
            step="0.001"
            min="0"
            max="100"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#FFCC00] focus:border-[#FFCC00]"
          />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Taxa fixa PIX (R$)
          <input
            type="number"
            step="0.01"
            min="0"
            value={fixedR}
            onChange={(e) => setFixedR(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#FFCC00] focus:border-[#FFCC00]"
          />
        </label>
        <button
          onClick={() => onSaveFees(Number(pct) || 0, Math.round((Number(fixedR) || 0) * 100))}
          disabled={!dirty || isSavingFees}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
        >
          {isSavingFees ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar taxas
        </button>
      </div>
    </div>
  );
}
