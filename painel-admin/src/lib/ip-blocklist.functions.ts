import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar permissão");
  if (!data) throw new Error("Acesso negado");
}

function getCurrentIp(): string | null {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return String(ip).split(",")[0].trim();
  } catch {}
  try {
    const xf = getRequestHeader("x-forwarded-for");
    if (xf) return xf.split(",")[0].trim();
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf.trim();
  } catch {}
  return null;
}

// Cache em memória do worker: evita 1 query/heartbeat por visitante.
// TTL de 60s — IP recém-bloqueado leva no máximo 60s para ser efetivado.
type BlockCache = { map: Map<string, string | null>; expires: number };
let blockCache: BlockCache | null = null;
const CACHE_TTL_MS = 60_000;

async function getBlockedIpMap(): Promise<Map<string, string | null>> {
  if (blockCache && blockCache.expires > Date.now()) return blockCache.map;
  const { data, error } = await supabaseAdmin
    .from("blocked_ips")
    .select("ip_address, reason");
  if (error) {
    // Em caso de falha, mantém cache antigo se existir; senão retorna vazio (fail-open).
    return blockCache?.map ?? new Map();
  }
  const map = new Map<string, string | null>();
  for (const row of data ?? []) map.set(row.ip_address, row.reason);
  blockCache = { map, expires: Date.now() + CACHE_TTL_MS };
  return map;
}

// Exportado para uso interno (heartbeat / clarex-upload) sem custo de query.
export async function isIpBlockedCached(ip: string | null): Promise<{ blocked: boolean; reason: string | null }> {
  if (!ip) return { blocked: false, reason: null };
  const map = await getBlockedIpMap();
  if (!map.has(ip)) return { blocked: false, reason: null };
  return { blocked: true, reason: map.get(ip) ?? null };
}

// Invalida o cache imediatamente (chamado após block/unblock pelo admin).
function invalidateBlockCache() {
  blockCache = null;
}

// Público: usado por todas as páginas para verificar se o IP atual está bloqueado.
export const checkMyIpBlocked = createServerFn({ method: "GET" }).handler(async () => {
  const ip = getCurrentIp();
  const { blocked, reason } = await isIpBlockedCached(ip);
  return { blocked, ip, reason };
});

// Admin: lista IPs bloqueados.
export const listBlockedIps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("blocked_ips")
      .select("id, ip_address, reason, origin_session_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// Admin: bloqueia um IP arbitrário.
export const blockIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        ip: z.string().min(3).max(64),
        reason: z.string().max(500).optional(),
        sessionId: z.string().max(128).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("blocked_ips")
      .upsert(
        {
          ip_address: data.ip.trim(),
          reason: data.reason ?? null,
          origin_session_id: data.sessionId ?? null,
          blocked_by: context.userId,
        },
        { onConflict: "ip_address", ignoreDuplicates: false },
      );
    if (error) throw new Error(error.message);
    invalidateBlockCache();
    return { ok: true };
  });

// Admin: bloqueia o IP de uma sessão (busca em site_sessions ou clarex_recordings).
export const blockSessionIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        sessionId: z.string().min(4).max(128),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let ip: string | null = null;
    const { data: s } = await supabaseAdmin
      .from("site_sessions")
      .select("ip_address")
      .eq("session_id", data.sessionId)
      .not("ip_address", "is", null)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ip = s?.ip_address ?? null;

    if (!ip) {
      const { data: c } = await supabaseAdmin
        .from("clarex_recordings")
        .select("ip_address")
        .eq("session_id", data.sessionId)
        .not("ip_address", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ip = c?.ip_address ?? null;
    }

    if (!ip) {
      throw new Error(
        "IP ainda não capturado para essa sessão. Aguarde o próximo heartbeat (até 20s) e tente de novo.",
      );
    }

    const { error } = await supabaseAdmin
      .from("blocked_ips")
      .upsert(
        {
          ip_address: ip,
          reason: data.reason ?? null,
          origin_session_id: data.sessionId,
          blocked_by: context.userId,
        },
        { onConflict: "ip_address", ignoreDuplicates: false },
      );
    if (error) throw new Error(error.message);
    invalidateBlockCache();
    return { ok: true, ip };
  });

// Admin: desbloqueia um IP.
export const unblockIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("blocked_ips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    invalidateBlockCache();
    return { ok: true };
  });
