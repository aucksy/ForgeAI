/**
 * WhatsApp "send to next" for a group (Messages & offers step 1, 22 Oct 2026; R-offers-notices §6
 * step 7): "1 of 52: Rahul Sharma [Open WhatsApp] [Skip]". PURE (storage is handed in).
 *
 * The order is the member's name, A to Z, so the owner always knows where they are in the list and
 * can pick up after a break. Members without a full mobile number are left out (and counted), and a
 * number two members share (a family) gets a message for everyone once; a personal message (each
 * member's own name and dates) goes to each of them (review fix).
 *
 * WHO WAS DONE is remembered in this browser, per gym, for each message (the newest 20 lists): a
 * reload or a closed sheet carries on where it stopped, another message's list never wipes this one
 * (review fix: "Plan ending" half done, then a birthday wish, sent the reminder twice), and changed
 * words (another language) start a new list. Losing it (a private window, cleared storage) only means
 * the list starts again.
 * The owner's language choice for member messages is remembered the same way.
 */

import { validateE164 } from './members';
import { phone10 } from './audience';
import { isMessageLang, type MessageLang } from './messageWords';
import type { MemberView } from '../types';

/** The storage surface used (localStorage in the browser, a Map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QueueList {
  /** In sending order. */
  people: MemberView[];
  /** Left out: no full mobile number. */
  noPhone: number;
  /** Left out: the same number as someone earlier in the list. */
  sharedPhone: number;
}

/**
 * The people a WhatsApp queue goes through, in order. `onePerNumber`: the same words for all, so a
 * shared number gets them once; false for personal messages, where each member has their own.
 */
export function queueList(group: readonly MemberView[], onePerNumber = true): QueueList {
  const sorted = [...group].sort(
    (a, b) => a.member.fullName.localeCompare(b.member.fullName, 'en', { sensitivity: 'base' }) || a.member.id.localeCompare(b.member.id),
  );
  const seen = new Set<string>();
  const people: MemberView[] = [];
  let noPhone = 0;
  let sharedPhone = 0;
  for (const v of sorted) {
    const e164 = validateE164(v.member.phone);
    if (!e164) {
      noPhone += 1;
      continue;
    }
    const same = phone10(e164) ?? e164;
    if (onePerNumber && seen.has(same)) {
      sharedPhone += 1;
      continue;
    }
    seen.add(same);
    people.push(v);
  }
  return { people, noPhone, sharedPhone };
}

/**
 * The first person at or after `from` not done yet, or `people.length` when there is nobody left
 * after `from`.
 */
export function nextNotDone(people: readonly { member: { id: string } }[], done: ReadonlySet<string>, from: number): number {
  for (let i = Math.max(0, from); i < people.length; i += 1) if (!done.has(people[i]!.member.id)) return i;
  return people.length;
}

/** A short fingerprint of a message (FNV-1a), so the memory knows when the words changed. */
export function messageSignature(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}.${text.length}`;
}

const queueKey = (gymId: string) => `forgeai.sendQueue.${gymId}`;
const langKey = (gymId: string) => `forgeai.messageLang.${gymId}`;

/** Lists kept per gym: the newest ones (a list is a few ids, so this stays small). */
export const KEPT_LISTS = 20;

type Lists = Record<string, { done: string[]; at: number }>;

/** Every remembered list of this gym, by message (an older single list is read as one of them). */
function readLists(store: KeyValueStore, gymId: string): Lists {
  const raw = store.getItem(queueKey(gymId));
  if (!raw) return {};
  const v = JSON.parse(raw) as { sig?: unknown; done?: unknown; lists?: unknown };
  const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
  if (typeof v.sig === 'string') return { [v.sig]: { done: ids(v.done), at: 0 } };
  const out: Lists = {};
  if (v.lists && typeof v.lists === 'object') {
    for (const [sig, l] of Object.entries(v.lists as Record<string, { done?: unknown; at?: unknown }>)) {
      out[sig] = { done: ids(l?.done), at: typeof l?.at === 'number' ? l.at : 0 };
    }
  }
  return out;
}

function writeLists(store: KeyValueStore, gymId: string, lists: Lists): void {
  const newest = Object.entries(lists)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, KEPT_LISTS);
  store.setItem(queueKey(gymId), JSON.stringify({ lists: Object.fromEntries(newest) }));
}

/** Who was done for THIS message; an empty set when it has no list yet. */
export function readDone(store: KeyValueStore | null, gymId: string, signature: string): Set<string> {
  if (!store) return new Set();
  try {
    return new Set(readLists(store, gymId)[signature]?.done ?? []);
  } catch (e) {
    console.warn('[send queue] remembered list unreadable', e);
    return new Set();
  }
}

/** Remember who was done for this message (other messages' lists are kept). */
export function saveDone(
  store: KeyValueStore | null,
  gymId: string,
  signature: string,
  done: Iterable<string>,
  now: number = Date.now(),
): void {
  if (!store) return;
  try {
    let lists: Lists = {};
    try {
      lists = readLists(store, gymId);
    } catch (e) {
      console.warn('[send queue] remembered lists unreadable, starting them again', e);
    }
    lists[signature] = { done: [...done], at: now };
    writeLists(store, gymId, lists);
  } catch (e) {
    console.warn('[send queue] could not remember the list', e);
  }
}

/** Forget this message's list (the owner starts it again); other messages' lists are kept. */
export function clearDone(store: KeyValueStore | null, gymId: string, signature: string): void {
  if (!store) return;
  try {
    const lists = readLists(store, gymId);
    delete lists[signature];
    writeLists(store, gymId, lists);
  } catch (e) {
    console.warn('[send queue] could not clear the list', e);
  }
}

/** The language the owner last picked for member messages; English until one is picked. */
export function readLang(store: KeyValueStore | null, gymId: string): MessageLang {
  if (!store) return 'en';
  try {
    const v = store.getItem(langKey(gymId));
    return isMessageLang(v) ? v : 'en';
  } catch (e) {
    console.warn('[message language] saved choice unreadable', e);
    return 'en';
  }
}

export function saveLang(store: KeyValueStore | null, gymId: string, lang: MessageLang): void {
  if (!store) return;
  try {
    store.setItem(langKey(gymId), lang);
  } catch (e) {
    console.warn('[message language] could not save', e);
  }
}

/** The browser's own storage, or null where it is blocked. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    console.warn('[send queue] storage blocked', e);
    return null;
  }
}
