import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Mail, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/painel-gr/login")({
  head: () => ({
    meta: [
      { title: "Acesso restrito — Gol Raiz" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel-gr" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/painel-gr" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/painel-gr` },
        });
        if (error) throw error;
        setMsg("Conta criada. Faça login para continuar.");
        setMode("login");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="w-5 h-5 text-[#FFCC00]" />
          <h1 className="text-lg font-bold text-gray-900">Acesso restrito</h1>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Área administrativa. Apenas usuários autorizados.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">E-mail</span>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Senha</span>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFCC00]"
              />
            </div>
          </label>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
          {msg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">{msg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-black text-white font-semibold text-sm hover:bg-black/90 disabled:opacity-60"
          >
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); setMsg(null); }}
          className="mt-4 w-full text-xs text-gray-500 hover:text-gray-700"
        >
          {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta. Fazer login"}
        </button>
      </div>
    </div>
  );
}
