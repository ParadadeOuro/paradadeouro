import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

type ClarexRow = Database["public"]["Tables"]["clarex_recordings"]["Row"] & {
  chunk_count?: number;
};

function isVisibleStoreRecording(row: ClarexRow) {
  const sessionId = String(row.session_id ?? "");
  const pageUrl = String(row.page_url ?? "");
  const ua = String(row.user_agent ?? "").toLowerCase();
  const country = String(row.country_code ?? "").toUpperCase();

  if (!sessionId || sessionId.startsWith("diag_")) return false;
  if (pageUrl.startsWith("/__clarex")) return false;
  if (/curl|bot|crawler|spider|headless|playwright|puppeteer|browserbase/.test(ua)) return false;
  if (country && country !== "BR") return false;
  return true;
}

function groupRecordingChunks(rows: ClarexRow[]) {
  const groups = new Map<string, ClarexRow>();

  for (const row of rows.filter(isVisibleStoreRecording)) {
    const key = String(row.session_id);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { ...row, chunk_count: 1 });
      continue;
    }

    const rowCreated = new Date(row.created_at).getTime();
    const currentCreated = new Date(current.created_at).getTime();
    const latest = rowCreated > currentCreated ? row : current;
    const firstChunk = rowCreated < currentCreated ? row : current;
    groups.set(key, {
      ...latest,
      id: firstChunk.id,
      session_id: key,
      started_at: [current.started_at, row.started_at].filter(Boolean).sort()[0],
      ended_at: [current.ended_at, row.ended_at].filter(Boolean).sort().at(-1) ?? latest.ended_at,
      duration_ms: Number(current.duration_ms ?? 0) + Number(row.duration_ms ?? 0),
      event_count: Number(current.event_count ?? 0) + Number(row.event_count ?? 0),
      size_bytes: Number(current.size_bytes ?? 0) + Number(row.size_bytes ?? 0),
      has_attention: Boolean(current.has_attention || row.has_attention),
      attention_reason: current.attention_reason ?? row.attention_reason,
      chunk_count: Number(current.chunk_count ?? 1) + 1,
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export const listClarexRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      input:
        | {
            range?: "today" | "week" | "month" | "all";
            filter?: "all" | "attention" | "short" | "long" | "located";
            search?: string;
          }
        | undefined,
    ) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const range = data.range ?? "all";
    const filter = data.filter ?? "all";
    const search = data.search?.trim() ?? "";

    let q = supabaseAdmin
      .from("clarex_recordings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (range !== "all") {
      const now = new Date();
      let since: Date;
      if (range === "today") since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (range === "week") since = new Date(now.getTime() - 7 * 86400_000);
      else since = new Date(now.getTime() - 30 * 86400_000);
      q = q.gte("created_at", since.toISOString());
    }

    if (filter === "attention") q = q.eq("has_attention", true);
    else if (filter === "short") q = q.lt("duration_ms", 15_000);
    else if (filter === "long") q = q.gte("duration_ms", 60_000);
    else if (filter === "located") q = q.not("country_code", "is", null);

    if (search) q = q.ilike("page_url", `%${search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const groupedRows = groupRecordingChunks(rows ?? []);

    let statsQ = supabaseAdmin.from("clarex_recordings").select("*");
    if (range !== "all") {
      const now = new Date();
      let since: Date;
      if (range === "today") since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (range === "week") since = new Date(now.getTime() - 7 * 86400_000);
      else since = new Date(now.getTime() - 30 * 86400_000);
      statsQ = statsQ.gte("created_at", since.toISOString());
    }
    const { data: allRows } = await statsQ;
    const visibleStatsRows = (allRows ?? []).filter(isVisibleStoreRecording);
    const total = new Set(visibleStatsRows.map((r) => r.session_id)).size;
    const attention = groupRecordingChunks(visibleStatsRows).filter((r) => r.has_attention).length;
    const located = groupRecordingChunks(visibleStatsRows).filter((r) => r.country_code).length;

    return {
      rows: groupedRows,
      stats: {
        total,
        listed: groupedRows.length,
        attention,
        located,
      },
    };
  });

export const getClarexRecordingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("clarex_recordings")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Gravação não encontrada");
    if (!isVisibleStoreRecording(row)) throw new Error("Gravação fora dos filtros da loja");

    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from("clarex_recordings")
      .select("storage_path")
      .eq("session_id", row.session_id)
      .order("created_at", { ascending: true });
    if (chunksError) throw new Error(chunksError.message);

    const paths = (chunks ?? []).map((chunk) => chunk.storage_path).filter(Boolean);
    if (!paths.length) throw new Error("Arquivo da gravação não encontrado");

    const signedUrls = await Promise.all(
      paths.map(async (path) => {
        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("clarex-recordings")
          .createSignedUrl(path, 60 * 60);
        if (sErr || !signed) throw new Error(sErr?.message ?? "Erro ao gerar URL");
        return signed.signedUrl;
      }),
    );
    return { recording: row, url: signedUrls[0], urls: signedUrls };
  });

export const deleteClarexRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("clarex_recordings")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await supabaseAdmin.storage.from("clarex-recordings").remove([row.storage_path]);
    }
    const { error } = await supabaseAdmin.from("clarex_recordings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cleanupOldClarexRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("clarex_recordings")
      .select("id, storage_path")
      .lt("created_at", cutoff);
    if (rows?.length) {
      await supabaseAdmin.storage
        .from("clarex-recordings")
        .remove(rows.map((r) => r.storage_path).filter(Boolean));
      await supabaseAdmin
        .from("clarex_recordings")
        .delete()
        .in(
          "id",
          rows.map((r) => r.id),
        );
    }
    return { removed: rows?.length ?? 0 };
  });
