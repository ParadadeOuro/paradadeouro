// Mantém um ID persistente do visitante, mas controla o início real da sessão atual por aba.
const KEY = "gr_session_id";
const SESSION_STARTED_KEY = "gr_session_started_at";
const SESSION_LAST_ACTIVITY_KEY = "gr_session_last_activity_at";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const TIKTOK_ATTR_KEY = "gr_tiktok_attribution";

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr-unknown";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        (crypto?.randomUUID?.() as string | undefined) ??
        `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSessionStartedAt(): string {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  if (typeof window === "undefined") return nowIso;

  try {
    const storedStartedAt = sessionStorage.getItem(SESSION_STARTED_KEY);
    const lastActivity = Number(sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY) ?? 0);
    const shouldStartFresh = !storedStartedAt || !lastActivity || now - lastActivity > SESSION_IDLE_MS;
    const startedAt = shouldStartFresh ? nowIso : storedStartedAt;

    sessionStorage.setItem(SESSION_STARTED_KEY, startedAt);
    sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
    return startedAt;
  } catch {
    return nowIso;
  }
}

export function getUtmFromUrl(): { source?: string | null; medium?: string | null; campaign?: string | null } {
  if (typeof window === "undefined") return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const KEY_UTM = "gr_utm";
    const fromUrl = {
      source: sp.get("utm_source"),
      medium: sp.get("utm_medium"),
      campaign: sp.get("utm_campaign"),
    };
    if (fromUrl.source || fromUrl.medium || fromUrl.campaign) {
      try { localStorage.setItem(KEY_UTM, JSON.stringify(fromUrl)); } catch {}
      return fromUrl;
    }
    const stored = localStorage.getItem(KEY_UTM);
    if (stored) return JSON.parse(stored);
    return {};
  } catch {
    return {};
  }
}

export function getTikTokAttribution(): {
  ttclid?: string;
  ttp?: string;
  url?: string;
  userAgent?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get("ttclid") || undefined;
    let stored: { ttclid?: string } = {};
    try {
      const raw = localStorage.getItem(TIKTOK_ATTR_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    const ttclid = fromUrl ?? stored.ttclid;
    if (fromUrl) {
      try { localStorage.setItem(TIKTOK_ATTR_KEY, JSON.stringify({ ttclid: fromUrl })); } catch {}
    }

    const ttp = document.cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("_ttp="))
      ?.split("=")[1];

    return {
      ttclid,
      ttp,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
  } catch {
    return {};
  }
}
