import { checkoutSupabase } from './checkoutSupabase';

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>, options?: { event_id?: string }) => void;
      identify: (params: Record<string, unknown>) => void;
      page: () => void;
      instance: (pixelId: string) => {
        track: (event: string, params?: Record<string, unknown>, options?: { event_id?: string }) => void;
        identify: (params: Record<string, unknown>) => void;
      };
    };
  }
}

// TikTok Pixels do FutCompany — replicados para o ParadaDeOuro
export const TIKTOK_PIXEL_IDS = ['D7VT4C3C77U4TIUQ0720', 'D7SAJB3C77UF98265JTG'];

export interface TikTokContent {
  content_id: string;
  content_type?: 'product' | 'product_group';
  content_name?: string;
  content_category?: string;
  price?: number;
  quantity?: number;
}

export interface TikTokEventParams {
  contents?: TikTokContent[];
  content_ids?: string[];
  content_type?: 'product' | 'product_group';
  value?: number;
  currency?: string;
  description?: string;
  query?: string;
}

export interface TikTokUser {
  email?: string;
  phone?: string;
  external_id?: string;
}

const generateEventId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const createTikTokEventId = generateEventId;

interface TikTokTrackOptions {
  eventId?: string;
  server?: boolean;
}

export function trackTikTokEvent(
  event: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | 'CompletePayment',
  params: TikTokEventParams = {},
  user: TikTokUser = {},
  options: TikTokTrackOptions = {}
) {
  const event_id = options.eventId || generateEventId();
  const properties = {
    ...params,
    content_ids: params.content_ids || params.contents?.map((c) => c.content_id),
    currency: params.currency || 'BRL',
  };

  // 1) Client-side pixel
  try {
    if (typeof window !== 'undefined' && window.ttq) {
      const identifyPayload =
        user.email || user.phone || user.external_id
          ? {
              email: user.email,
              phone_number: user.phone,
              external_id: user.external_id,
            }
          : null;

      for (const pixelId of TIKTOK_PIXEL_IDS) {
        try {
          const inst = window.ttq.instance ? window.ttq.instance(pixelId) : window.ttq;
          if (identifyPayload) inst.identify(identifyPayload);
          inst.track(event, { ...properties, event_id }, { event_id });
        } catch (innerErr) {
          console.warn('[TikTok Pixel] instance track failed', pixelId, innerErr);
        }
      }
    }
  } catch (err) {
    console.warn('[TikTok Pixel] client track failed', err);
  }

  // 2) Server-side Events API (fire & forget)
  try {
    if (options.server === false) return event_id;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    checkoutSupabase.functions
      .invoke('tiktok-events', {
        body: {
          event,
          event_id,
          event_time: Math.floor(Date.now() / 1000),
          url,
          user_agent: userAgent,
          user,
          properties,
        },
      })
      .catch((err) => console.warn('[TikTok Events API] failed', err));
  } catch (err) {
    console.warn('[TikTok Events API] invoke error', err);
  }

  return event_id;
}
