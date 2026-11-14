/**
 * F207 "Your web page": the gym server's calls (supabase 0080 owner_gym_page / owner_save_gym_page, 0082
 * owner_gym_page_photo_slot) and the photo files in the private bucket gym-page-photos. Every call carries the owner or
 * desk key; the server checks it. A refusal the server ANSWERS ({error}) comes back as `{ error }`; a refused key or a
 * paused gym is thrown (plain words: logic.ts thrownWords).
 */
import { supabase } from '../../lib/supabase';
import { call } from '../shop/api';
import { pageAnswerFrom, photoObject, type PageAnswer, type SavedPage } from './logic';

export const PHOTO_BUCKET = 'gym-page-photos';

/** The editor's read. Null when the server has no web page part (a server without 0080). */
export async function getPage(key: string): Promise<PageAnswer | null> {
  return pageAnswerFrom(await call<unknown>('owner_gym_page', { p_key: key }));
}

export type SaveAnswer = { page: SavedPage } | { error: string };

export async function savePage(key: string, payload: Record<string, unknown>): Promise<SaveAnswer> {
  const r = await call<unknown>('owner_save_gym_page', { p_key: key, p_page: payload });
  const row = (Array.isArray(r) ? r[0] : r) as { ok?: unknown; page?: unknown; error?: unknown } | null;
  if (row && typeof row.error === 'string') return { error: row.error };
  const answer = pageAnswerFrom({ canEdit: true, page: row?.page ?? null });
  if (row?.ok === true && answer?.page) return { page: answer.page };
  console.warn('[web page] the save answer was not understood', r);
  return { error: 'TRY_AGAIN' };
}

export interface PhotoSlot {
  path: string;
  url: string;
}

/** A place for one new photo (15 minutes). Throws BUSY / TOO_MANY / OWNER_ONLY. */
export async function photoSlot(key: string): Promise<PhotoSlot> {
  const r = await call<unknown>('owner_gym_page_photo_slot', { p_key: key });
  const row = (Array.isArray(r) ? r[0] : r) as { ok?: unknown; path?: unknown; url?: unknown; error?: unknown } | null;
  if (row && typeof row.error === 'string') throw new Error(row.error);
  if (row?.ok !== true || typeof row.path !== 'string' || typeof row.url !== 'string' || photoObject(row.url) !== row.path) {
    console.warn('[web page] the photo slot answer was not understood', r);
    throw new Error('BAD_SLOT');
  }
  return { path: row.path, url: row.url };
}

/** Put the (already shrunk) WebP photo in its slot. */
export async function putPhoto(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });
  if (error) throw error;
}

/**
 * A saved photo's file, to show in the editor before the page host is open (the visitor's address join.mettleup.fit/p/...
 * is not connected yet). The server's read rule lets it through only while the photo is on the page row.
 */
export async function photoFile(url: string): Promise<Blob> {
  const path = photoObject(url);
  if (!path) throw new Error('not a page photo');
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('no photo');
  return data;
}
