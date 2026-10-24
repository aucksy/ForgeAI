/**
 * Invite link: a gym's link (https://app.mettleup.fit/j/RAMS01, or the old forgeai.aakashpahuja.in) tapped on a phone that has
 * not been set up yet. The first start shows the welcome flow INSTEAD of the app's screens
 * (app/_layout.tsx), so the link's own screen cannot open yet: the code is kept here and the
 * "Join <gym>" screen opens once the welcome flow is done.
 *
 * Audit C6-7: also saved on the phone (only the 6-character code and the time), so a member who
 * closes the app during setup — or whose phone closes it — still gets "Join <gym>" when setup ends.
 * Kept for 7 days; cleared the moment a screen takes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where gym links live, newest first (MettleUp, R-105). The first is the address the app writes;
 * every one of them is read, for good: the old address stays on printed posters and in old messages.
 * The panel builds the same links (apps/dashboard src/crm/shop/invite.ts).
 */
export const INVITE_HOSTS = ['app.mettleup.fit', 'forgeai.aakashpahuja.in'] as const;
export const INVITE_HOST: string = INVITE_HOSTS[0];

const CODE = /^[A-Za-z0-9]{6}$/;

/**
 * Is this a link's host one of the gym links' own? Its www. form and an explicit :443/:80 port
 * count (review of wave 4a); anything else — another site, a look-alike — does not. PURE.
 */
export function isInviteHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:(443|80)$/, '').replace(/^www\./, '');
  return (INVITE_HOSTS as readonly string[]).includes(h);
}

/** The gym code in an invite URL (https://<a gym-link host>/j/CODE, mettleup://j/CODE or forgeai://j/CODE), else null. PURE. */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/([^/?#]+)|(?:mettleup|forgeai):\/)\/j\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  if (m[1] !== undefined && !isInviteHost(m[1])) return null;
  let raw = m[2];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return CODE.test(raw) ? raw.toUpperCase() : null;
}

let pending: string | null = null;

/** Where the waiting codes are saved, and for how long they wait. */
export const PENDING_LINK_STORAGE_KEY = 'forgeai-pending-link';
export const PENDING_LINK_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Saves what is waiting now (both kinds), in order: a later save never lands under an earlier one. */
let saving: Promise<void> = Promise.resolve();
function saveWaiting(): void {
  const invite = pending;
  const checkIn = pendingCheckIn;
  saving = saving.then(async () => {
    try {
      if (!invite && !checkIn) await AsyncStorage.removeItem(PENDING_LINK_STORAGE_KEY);
      else await AsyncStorage.setItem(PENDING_LINK_STORAGE_KEY, JSON.stringify({ invite, checkIn, at: Date.now() }));
    } catch (e) {
      console.warn('[ForgeErr] pending gym link: could not save', e);
    }
  });
}

/**
 * After a restart: put a saved, still-fresh code back in memory (what is already there wins), so
 * the screens open once setup is done. Never throws.
 */
export async function restorePendingLinks(nowMs: number = Date.now()): Promise<void> {
  await saving;
  try {
    const raw = await AsyncStorage.getItem(PENDING_LINK_STORAGE_KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { invite?: unknown; checkIn?: unknown; at?: unknown } | null;
    const at = typeof v?.at === 'number' ? v.at : NaN;
    if (!(nowMs - at >= 0 && nowMs - at < PENDING_LINK_KEEP_MS)) {
      await AsyncStorage.removeItem(PENDING_LINK_STORAGE_KEY);
      return;
    }
    const ok = (c: unknown) => (typeof c === 'string' && CODE.test(c) ? c.toUpperCase() : null);
    pending = pending ?? ok(v?.invite);
    pendingCheckIn = pendingCheckIn ?? ok(v?.checkIn);
  } catch (e) {
    console.warn('[ForgeErr] pending gym link: could not read', e);
  }
}

export function setPendingInvite(code: string | null): void {
  pending = code;
  saveWaiting();
}

/** The waiting code, left waiting (the welcome screen shows a code kept from a link or typed there). */
export function peekPendingInvite(): string | null {
  return pending;
}

/** The waiting code, once: whoever takes it opens the screen. */
export function takePendingInvite(): string | null {
  const c = pending;
  pending = null;
  if (c) saveWaiting();
  return c;
}

// QR self check-in (15 Oct 2026): a check-in poster (/c/CODE) scanned on a phone not set up yet is
// kept the same way, and its "Check in at <gym>" screen opens once the welcome flow is done.
let pendingCheckIn: string | null = null;

export function setPendingCheckIn(code: string | null): void {
  pendingCheckIn = code;
  saveWaiting();
}

/** The waiting check-in code, once. */
export function takePendingCheckIn(): string | null {
  const c = pendingCheckIn;
  pendingCheckIn = null;
  if (c) saveWaiting();
  return c;
}
