/**
 * Member photos taken at the desk (F107): the calls to the gym server and a small in-page cache.
 * Thin wrappers over supabase/migrations/0043_member_photos.sql. Every call carries the owner or desk
 * key; the server keeps each gym to its own members. There is NO link to a photo, public or signed:
 * the picture comes back inside the answer and is shown as a data: picture (the page's security
 * policy already allows those).
 *
 * Until 0043 is on the server, the first call answers PGRST202 ("no such function"): the panel then
 * remembers "no photos here" for the life of the page and every photo button stays hidden, with no
 * error shown and one quiet note in the console. Rules and words: logic/memberPhoto.ts.
 */

import { isDemoLocked } from '../../lib/demoLock';
import {
  bytesToBase64,
  looksLikeJpeg,
  photoFits,
  photoReadBatches,
  photoRowsFromAnswer,
} from '../logic/memberPhoto';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

/** Whether this gym server keeps member photos: unknown until the first answer. */
export type PhotoServer = 'unknown' | 'yes' | 'no';

/** A failure whose message is already plain words for the desk. */
export class MemberPhotoError extends Error {}

/** After a read fails (no internet), those members are not asked for again for this long. */
const RETRY_AFTER_MS = 30_000;

let server: PhotoServer = 'unknown';
let probing: Promise<PhotoServer> | null = null;
/** The key the cache belongs to: a different key (another branch, another person) starts afresh. */
let cacheKey: string | null = null;
/** memberId -> picture, or null for "has no photo". Missing = not asked yet. */
const cache = new Map<string, string | null>();
const failedAt = new Map<string, number>();
const queued = new Set<string>();
const inFlight = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const l of listeners) l();
}

/** For useSyncExternalStore: re-render when any photo or the server answer changes. */
export function subscribePhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function photosVersion(): number {
  return version;
}

export function photoServer(): PhotoServer {
  return isDemoLocked() ? 'no' : server;
}

function adoptKey(key: string): void {
  if (cacheKey === key) return;
  cacheKey = key;
  cache.clear();
  failedAt.clear();
  queued.clear();
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[member photos] this gym server has no member photos yet (0043 not applied); photo buttons stay hidden');
  changed();
}

/**
 * Ask once whether the server keeps photos (an empty read). 'unknown' again when the answer could
 * not be had (no internet), so the next screen asks again; nothing is shown to the desk either way.
 */
export function probePhotoServer(key: string): Promise<PhotoServer> {
  if (isDemoLocked()) return Promise.resolve('no');
  if (server !== 'unknown') return Promise.resolve(server);
  probing ??= call<unknown>('owner_member_photos', { p_key: key, p_members: [] })
    .then(() => {
      server = 'yes';
      changed();
      return server;
    })
    .catch((e: unknown) => {
      if (isNoSuchFunction(e)) {
        markNoServer();
        return server;
      }
      console.warn('[ForgeErr] member photos: could not ask the server whether photos are on', e);
      return 'unknown' as PhotoServer;
    })
    .finally(() => {
      probing = null;
    });
  return probing;
}

/** The member's picture: a string, null for "no photo", undefined while not known yet. */
export function photoOf(memberId: string): string | null | undefined {
  return cache.get(memberId);
}

/** Load these members' photos (batched, each member once). Safe to call on every render. */
export function requestPhotos(key: string, memberIds: readonly string[]): void {
  if (photoServer() !== 'yes') return;
  adoptKey(key);
  const now = Date.now();
  let added = false;
  for (const id of memberIds) {
    if (!id || cache.has(id) || queued.has(id) || inFlight.has(id)) continue;
    const failed = failedAt.get(id);
    if (failed !== undefined && now - failed < RETRY_AFTER_MS) continue;
    queued.add(id);
    added = true;
  }
  if (added && flushTimer === undefined) flushTimer = setTimeout(() => void flush(key), 25);
}

async function flush(key: string): Promise<void> {
  flushTimer = undefined;
  if (key !== cacheKey) return; // quiet: the key changed while waiting; the new key asks for its own
  const ids = [...queued];
  queued.clear();
  for (const batch of photoReadBatches(ids)) {
    for (const id of batch) inFlight.add(id);
    try {
      const rows = photoRowsFromAnswer(await call<unknown>('owner_member_photos', { p_key: key, p_members: batch }));
      if (key !== cacheKey) return; // quiet: answer for an old key; dropped
      const found = new Map(rows.map((r) => [r.memberId, r.dataUrl]));
      for (const id of batch) cache.set(id, found.get(id) ?? null);
      changed();
    } catch (e) {
      if (isNoSuchFunction(e)) {
        markNoServer();
        return;
      }
      console.warn('[ForgeErr] member photos: reading photos failed; members show initials for now', e);
      const at = Date.now();
      for (const id of batch) failedAt.set(id, at);
    } finally {
      for (const id of batch) inFlight.delete(id);
    }
  }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

/** Save (or replace) a member's photo. Returns the picture to show. Throws the server's refusal as-is. */
export async function saveMemberPhoto(key: string, memberId: string, jpeg: Blob): Promise<string> {
  const bytes = await blobBytes(jpeg);
  if (!looksLikeJpeg(bytes) || !photoFits(bytes.length)) {
    throw new MemberPhotoError('That photo couldn’t be saved. Take it again.'); // member-words
  }
  const rows = photoRowsFromAnswer([
    await call<unknown>('owner_save_member_photo', { p_key: key, p_member: memberId, p_jpeg: bytesToBase64(bytes) }),
  ]);
  const url = rows[0]?.dataUrl;
  if (!url) throw new Error('UNKNOWN');
  adoptKey(key);
  cache.set(memberId, url);
  failedAt.delete(memberId);
  changed();
  return url;
}

/** Take a member's photo away. */
export async function removeMemberPhoto(key: string, memberId: string): Promise<void> {
  await call<boolean>('owner_remove_member_photo', { p_key: key, p_member: memberId });
  adoptKey(key);
  cache.set(memberId, null);
  changed();
}

/** Tests only: back to a fresh page. */
export function resetMemberPhotosForTest(): void {
  server = 'unknown';
  probing = null;
  cacheKey = null;
  cache.clear();
  failedAt.clear();
  queued.clear();
  inFlight.clear();
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  version = 0;
  listeners.clear();
}
