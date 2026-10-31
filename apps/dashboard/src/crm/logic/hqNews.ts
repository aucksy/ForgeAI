/**
 * R-243 (owner 31 Oct 2026: "yes, build HQ messages"): messages MettleUp HQ sends to every gym, shown
 * in the admin app's notification bell (ui/WhatsNew.tsx NewsBell) next to the app's own updates.
 * They come from the same site's GET /api/hq-news (deploy/panel/hqNews.js); HQ writes them on its
 * Messages page. The same words go to every gym, so no sign-in is needed to read them.
 * "Seen" is the newest message id this browser has shown in the bell (localStorage). A browser that
 * never looked remembers what is there and counts nothing: only messages sent after count as new.
 */
import type { NewsStore } from './whatsNew';

export interface HqMessage {
  id: number;
  at: string;
  title: string;
  body: string;
  /** '' | an admin app page ('/plans') | an https address. */
  link: string;
  label: string;
}

export const HQ_SEEN_KEY = 'forgeai.hqNews.seen.v1';

/** How often an open admin app asks again (a desk stays open all day). */
export const HQ_POLL_MS = 15 * 60 * 1000;

/** Only well-formed messages, newest first. PURE. */
export function cleanMessages(raw: unknown): HqMessage[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { messages?: unknown }).messages) ? (raw as { messages: unknown[] }).messages : [];
  const out: HqMessage[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const id = Number(r.id);
    if (!Number.isInteger(id) || id < 1 || typeof r.title !== 'string' || typeof r.body !== 'string') continue;
    const link = typeof r.link === 'string' && (/^\/[a-z0-9/-]{0,60}$/.test(r.link) || r.link.startsWith('https://')) ? r.link : '';
    out.push({ id, at: typeof r.at === 'string' ? r.at : '', title: r.title, body: r.body, link, label: link && typeof r.label === 'string' ? r.label : '' });
  }
  return out.sort((a, b) => b.id - a.id);
}

/** The messages in the list newer than the seen id. PURE. */
export function unreadHq(messages: readonly HqMessage[], seen: number): HqMessage[] {
  return messages.filter((m) => m.id > seen);
}

/**
 * The messages this browser has not seen. A first look remembers the newest id (or 0) and counts
 * nothing. Never throws (no storage = nothing new).
 */
export function readHqUnread(messages: readonly HqMessage[], store: NewsStore | null): HqMessage[] {
  if (!store) return [];
  try {
    const raw = store.getItem(HQ_SEEN_KEY);
    if (raw == null) {
      store.setItem(HQ_SEEN_KEY, String(messages[0]?.id ?? 0));
      return [];
    }
    const seen = Number(raw);
    return unreadHq(messages, Number.isFinite(seen) ? seen : 0);
  } catch (e) {
    console.warn('[hq news] could not read', e);
    return [];
  }
}

/** The bell was opened: every message shown is seen. Never throws. */
export function markHqSeen(messages: readonly HqMessage[], store: NewsStore | null): void {
  if (!store || messages.length === 0) return;
  try {
    const seen = Number(store.getItem(HQ_SEEN_KEY) ?? 0);
    store.setItem(HQ_SEEN_KEY, String(Math.max(Number.isFinite(seen) ? seen : 0, messages[0].id)));
  } catch (e) {
    console.warn('[hq news] could not save', e);
  }
}

/** GET /api/hq-news; an empty list (and a log line) when it cannot be read. */
export async function fetchHqNews(fetcher: typeof fetch = fetch): Promise<HqMessage[]> {
  try {
    const res = await fetcher('/api/hq-news', { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn('[hq news] answer', res.status);
      return [];
    }
    return cleanMessages(await res.json());
  } catch (e) {
    console.warn('[hq news] not reachable', e);
    return [];
  }
}
