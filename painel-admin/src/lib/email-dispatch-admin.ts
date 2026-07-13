// Server-only helper que enfileira um e-mail transacional usando a fila pgmq
// existente (queue "transactional_emails"). Retorna o message_id usado para
// rastrear no email_send_log.
import { supabaseAdmin as _supabaseAdmin } from "@/integrations/supabase/client-admin";
import { nowBR } from "./datetime";

// Tabelas e RPC de e-mail ainda não estão tipadas em supabase/types.ts
const supabaseAdmin: any = _supabaseAdmin;

const DEFAULT_FROM = "Gol Raiz <no-reply@notify.usegolraiz.com.br>";
const DEFAULT_SENDER_DOMAIN = "notify.usegolraiz.com.br";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string) {
  const safe = escapeHtml(text);
  // Auto-link
  const linked = safe.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#caa300;text-decoration:underline">$1</a>',
  );
  const paragraphs = linked.split(/\n{2,}/).map(
    (p) => `<p style="margin:0 0 16px;line-height:1.55;color:#333">${p.replace(/\n/g, "<br/>")}</p>`,
  );
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #eee;border-radius:8px">
      <tr><td style="padding:24px 28px">${paragraphs.join("")}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function ensureUnsubscribeToken(email: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", email)
    .is("used_at", null)
    .maybeSingle();
  if (data?.token) return data.token;
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await supabaseAdmin.from("email_unsubscribe_tokens").insert({ email, token });
  return token;
}

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  text: string;
  templateName: string; // ex: "email_cart_recovery_message"
  label?: string;
  idempotencyKey?: string;
};

export type EnqueueEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

export async function enqueueAppEmail(input: EnqueueEmailInput): Promise<EnqueueEmailResult> {
  const to = (input.to ?? "").trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, reason: "invalid_email" };
  }

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", to)
    .maybeSingle();
  if (suppressed) return { ok: false, reason: "suppressed" };

  const messageId = (input.idempotencyKey ?? crypto.randomUUID()) + "@" + DEFAULT_SENDER_DOMAIN;
  const unsubToken = await ensureUnsubscribeToken(to);
  const html = textToHtml(input.text);

  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const payload = {
    message_id: messageId,
    to,
    from: DEFAULT_FROM,
    sender_domain: DEFAULT_SENDER_DOMAIN,
    subject: input.subject,
    html,
    text: input.text,
    purpose: "transactional",
    label: input.label ?? input.templateName,
    idempotency_key: idempotencyKey,
    unsubscribe_token: unsubToken,
    queued_at: nowBR().toISOString(),
  };

  // Log pending
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: input.templateName,
    recipient_email: to,
    status: "pending",
    metadata: { label: input.label ?? input.templateName },
  });

  const { error } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload,
  });

  if (error) {
    console.error("[enqueueAppEmail] rpc error", error);
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: input.templateName,
      recipient_email: to,
      status: "failed",
      error_message: error.message,
    });
    return { ok: false, reason: "enqueue_error" };
  }

  // Dispara o processador imediatamente (fire-and-forget) para evitar
  // esperar pela próxima janela do cron. Erros são silenciosos: o cron
  // continuará tentando a cada ciclo.
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const baseUrl = process.env.LOVABLE_APP_URL || "https://usegolraiz.com.br";
    if (serviceKey) {
      // Não aguarda a resposta.
      fetch(`${baseUrl}/lovable/email/queue/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}` },
      }).catch(() => {});
    }
  } catch {
    // ignore
  }

  return { ok: true, messageId };
}

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
