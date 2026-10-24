/**
 * MettleUp's new address (R-105, 24 Oct 2026): the admin app moves from forgeai.aakashpahuja.in to
 * https://app.mettleup.fit. The old address keeps working for good (old phones, printed posters),
 * but its admin app sends each desk over, ONLY when that is safe:
 *  - a browser keeps saved things per address, so a device with payments, check-ins or new members
 *    still waiting to be sent (data/outbox.ts) stays until they are all sent;
 *  - a gym whose records live only in this browser (never put online) stays: moving would leave
 *    its records behind;
 *  - the server must say "move" (/api/moved; wrangler var MOVE "off" stops it), the device must be
 *    online, and the new address must answer.
 * The sign-in goes along (deploy/panel/hosts.js handleMove + public/move.js), so nobody types a
 * code again; if that hand-over fails, they sign in at the new address as usual.
 * PURE except the browser helpers at the bottom.
 */
import { BRANCH_KEYS } from '../branches/logic';
import { DEMO_GYM_ID } from '../data/demo';
import { CLOUD_GYM_KEY } from '../shop/cloudGym';
import { THEME_KEY } from '../../theme';

export const OLD_HOST = 'forgeai.aakashpahuja.in';
export const NEW_ORIGIN = 'https://app.mettleup.fit';
export const NEW_ADDRESS = 'app.mettleup.fit';
/** The browser keys that go along (the server and public/move.js take only these). */
export const MOVE_KEYS = [CLOUD_GYM_KEY, BRANCH_KEYS, THEME_KEY] as const;
/** Set by public/move.js for this tab, so the new address says once where the desk is now. */
export const MOVED_FLAG = 'mettleup.moved';

export interface MoveFacts {
  /** This page is on the old address. */
  onOldHost: boolean;
  /** The server said to move (/api/moved). */
  serverSaysMove: boolean;
  online: boolean;
  /** Things on this device not on the server yet (all gyms), and how many of them were refused. */
  waiting: number;
  held: number;
  /** Someone is signed in on this device (they can send what waits). */
  signedIn: boolean;
  /** A gym's records kept only in this browser (not the demo gym). */
  browserOnlyGym: boolean;
  /** The new address answered. */
  newAddressUp: boolean;
}

export type MoveState =
  | { kind: 'stay' }
  | { kind: 'waiting'; n: number }
  | { kind: 'held'; n: number }
  | { kind: 'signIn'; n: number }
  | { kind: 'browserOnly' }
  | { kind: 'go' };

/** What the old address does now. PURE. */
export function moveState(f: MoveFacts): MoveState {
  if (!f.onOldHost || !f.serverSaysMove) return { kind: 'stay' };
  if (f.browserOnlyGym) return { kind: 'browserOnly' };
  if (f.held > 0) return { kind: 'held', n: f.held };
  if (f.waiting > 0) return f.signedIn ? { kind: 'waiting', n: f.waiting } : { kind: 'signIn', n: f.waiting };
  if (!f.online || !f.newAddressUp) return { kind: 'stay' };
  return { kind: 'go' };
}

/** "1 item" / "3 items". PURE. */
function items(n: number): string {
  return n === 1 ? '1 item' : `${n} items`;
}

/**
 * The banner's words on the old address. member-words pass with Gemini, 24 Oct 2026 ("items", "first
 * fix", "or they stay behind here" came from it; its "so your data is not lost" was dropped: nothing
 * is lost by closing the page, the items wait on the device). null = no banner. PURE.
 */
export function moveWords(s: MoveState): string | null {
  const head = `MettleUp is moving to ${NEW_ADDRESS}.`;
  switch (s.kind) {
    case 'waiting':
      return `${head} This device is sending ${items(s.n)} saved on it first. Keep this page open: it moves by itself once they are sent.`;
    case 'held':
      return `${head} First fix the ${items(s.n)} shown in yellow at the top. Then this page moves by itself.`;
    case 'signIn':
      return `${head} Sign in here first, so the ${items(s.n)} saved on this device can be sent. Then this page moves by itself.`;
    case 'browserOnly':
      return `${head} Your gym's records are only in this browser. Go to Settings → “Put your gym online” first, or they stay behind here. Then this page moves by itself.`;
    case 'go':
      return `Opening MettleUp at its new address, ${NEW_ADDRESS}…`;
    default:
      return null;
  }
}

/** Everything went while the desk was working: the page waits for a quiet minute, never mid-form. */
export const READY_WORDS = `Everything is sent. This page opens ${NEW_ADDRESS} after you stop typing for a minute, or tap “Open it now”.`;
export const OPEN_NOW = 'Open it now';

/** Said once on the new address, right after a desk moved. */
export const MOVED_WORDS = `MettleUp is now at ${NEW_ADDRESS}. Save this address. If you had the admin app on your home screen, add it again from here to replace the old one.`;

/** Does this browser hold a real gym's records only here (not the demo gym)? PURE. */
export function isBrowserOnlyGym(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const s = (JSON.parse(raw) as { snapshot?: Record<string, unknown> }).snapshot ?? {};
    const gym = s.gym as { gymId?: unknown } | undefined;
    if (gym && gym.gymId === DEMO_GYM_ID) return false;
    return ['members', 'plans', 'payments', 'visits'].some((k) => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0);
  } catch {
    return true; // unreadable: never move away from records someone may need
  }
}

/** The keys that go along, as base64url JSON (UTF-8 safe). Only the allowed keys, only if set. PURE. */
export function movePayload(read: (key: string) => string | null): string {
  const keys: Record<string, string> = {};
  for (const k of MOVE_KEYS) {
    const v = read(k);
    if (typeof v === 'string') keys[k] = v;
  }
  if (!keys[CLOUD_GYM_KEY]) return '';
  const bytes = new TextEncoder().encode(JSON.stringify(keys));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The path to open on the new address: this page's own, never another site. PURE. */
export function movePath(pathname: string, search: string): string {
  const p = `${pathname}${search}`;
  return /^\/(?![/\\])/.test(p) && p.length <= 300 ? p : '/';
}

// ------------------------------------------------------------------ browser helpers

/** Things waiting on this device for any gym, and how many were refused. Never throws. */
export async function countWaiting(): Promise<{ waiting: number; held: number }> {
  if (typeof indexedDB === 'undefined') return { waiting: 0, held: 0 };
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('forgeai-outbox', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('gyms');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const docs = await new Promise<unknown[]>((resolve, reject) => {
      const t = db.transaction('gyms', 'readonly');
      const r = t.objectStore('gyms').getAll();
      r.onsuccess = () => resolve(r.result as unknown[]);
      r.onerror = () => reject(r.error);
    }).finally(() => db.close());
    let waiting = 0;
    let held = 0;
    for (const d of docs) {
      const items = d && typeof d === 'object' && Array.isArray((d as { items?: unknown }).items) ? ((d as { items: unknown[] }).items) : [];
      waiting += items.length;
      held += items.filter((i) => i && typeof i === 'object' && (i as { held?: unknown }).held).length;
    }
    return { waiting, held };
  } catch (e) {
    console.warn('[move] could not read what waits on this device', e);
    // Unknown: count it as waiting, so nobody is moved away from something unsent.
    return { waiting: 1, held: 0 };
  }
}

/** Did the server say to move? A missing answer (an older Worker) means no. */
export async function serverSaysMove(): Promise<boolean> {
  try {
    const r = await fetch('/api/moved', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = (await r.json()) as { move?: unknown };
    return j.move === true;
  } catch {
    return false;
  }
}

/** Does the new address answer? (An opaque answer is enough: it is up.) */
export async function newAddressUp(): Promise<boolean> {
  try {
    await fetch(`${NEW_ORIGIN}/manifest.webmanifest`, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/** Open the new address: with the sign-in (a POST form, never in the address bar), or plainly. */
export function goToNewAddress(read: (key: string) => string | null, loc: Location = window.location): void {
  const to = movePath(loc.pathname, loc.search);
  const m = movePayload(read);
  if (!m) {
    loc.replace(`${NEW_ORIGIN}${to}`);
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${NEW_ORIGIN}/api/move`;
  form.style.display = 'none';
  for (const [name, value] of [['m', m], ['to', to]] as const) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** localStorage read that never throws. */
export function safeRead(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

