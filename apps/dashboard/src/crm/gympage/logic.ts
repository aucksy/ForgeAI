/**
 * F207 "Your web page" (R-519, R-529): the rules of the owner's editor. PURE (no browser, no network).
 *
 * The gym server is supabase/migrations/0080_gym_page.sql (owner_gym_page, owner_save_gym_page; live since 14 Nov 2026)
 * and 0082_gym_page_photos.sql (the photo slots). It checks every field again; the checks here only say it first, in
 * plain words, next to the field. The facility list, the address rules and the Maps rule are the Worker's own
 * (deploy/panel/gymPage.js), imported, so the editor and the page can never disagree.
 *
 * The page's address (join.mettleup.fit/<slug>) is LOCKED once the page has been published (termsAt is set the first time
 * the owner publishes): a new address would free the old one for another gym and break shared links and printed QR
 * codes. The owner writes to MettleUp to change it (no database change needed: the screen enforces it).
 */
import { HIGHLIGHTS, LIMITS, PAGE_HOST, gymSlug, mapsLinkOk, slugOk } from '../../../../../deploy/panel/gymPage.js';
import type { Enquiry, EnquiryPageAsk } from '../types';

export { HIGHLIGHTS, LIMITS, PAGE_HOST, gymSlug };

export type HighlightKey = keyof typeof HIGHLIGHTS & string;
export const HIGHLIGHT_KEYS = Object.keys(HIGHLIGHTS) as HighlightKey[];

export interface PagePhoto {
  /** https://join.mettleup.fit/p/<gym_id>/<photo_id>.webp */
  url: string;
  alt: string;
}

/** The page row as owner_gym_page answers it. */
export interface SavedPage {
  slug: string;
  published: boolean;
  indexable: boolean;
  hiddenByHq: boolean;
  hqNote: string | null;
  area: string;
  city: string;
  about: string;
  highlights: string[];
  photos: PagePhoto[];
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  showPhone: boolean;
  whatsapp: boolean;
  aiHelper: boolean;
  /** When the owner first ticked the page terms (ms); null = never published. */
  termsAt: number | null;
  updatedAt: number | null;
}

export interface PageAnswer {
  page: SavedPage | null;
  /** The owner may save; a desk key reads only. */
  canEdit: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** One photo address on our own photo host for any gym. PURE. */
export const PHOTO_URL = /^https:\/\/join\.mettleup\.fit\/p\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{8,64})\.webp$/;

function pageOf(x: unknown): SavedPage | null {
  if (!isObj(x) || typeof x.slug !== 'string') return null;
  return {
    slug: x.slug,
    published: x.published === true,
    indexable: x.indexable === true,
    hiddenByHq: x.hiddenByHq === true,
    hqNote: typeof x.hqNote === 'string' && x.hqNote.trim() ? x.hqNote.trim().slice(0, 300) : null,
    area: str(x.area, LIMITS.area),
    city: str(x.city, 40),
    about: str(x.about, LIMITS.about),
    highlights: Array.isArray(x.highlights) ? x.highlights.filter((k): k is string => typeof k === 'string' && k in HIGHLIGHTS) : [],
    photos: Array.isArray(x.photos)
      ? x.photos.filter((p): p is { url: string; alt?: unknown } => isObj(p) && typeof p.url === 'string' && PHOTO_URL.test(p.url)).map((p) => ({ url: p.url, alt: str(p.alt, LIMITS.alt) }))
      : [],
    mapsUrl: str(x.mapsUrl, 300),
    lat: num(x.lat),
    lng: num(x.lng),
    showPhone: x.showPhone === true,
    whatsapp: x.whatsapp === true,
    aiHelper: x.aiHelper !== false,
    termsAt: num(x.termsAt),
    updatedAt: num(x.updatedAt),
  };
}

/**
 * owner_gym_page's answer, or null when it is not one (a server without 0080, the e2e server's empty list, a damaged
 * answer): the editor and its menu row then stay away. PURE.
 */
export function pageAnswerFrom(x: unknown): PageAnswer | null {
  const r = Array.isArray(x) ? x[0] : x;
  if (!isObj(r) || typeof r.canEdit !== 'boolean' || !('page' in r)) return null;
  return { page: r.page === null ? null : pageOf(r.page), canEdit: r.canEdit };
}

/** Has this page ever been published? Then its address is locked. PURE. */
export function addressLocked(saved: SavedPage | null): boolean {
  return Boolean(saved && (saved.published || saved.termsAt !== null));
}

/** Is the page showing (to the extent the host is open): published and not taken down by MettleUp. PURE. */
export function pageLive(saved: SavedPage | null): boolean {
  return Boolean(saved && saved.published && !saved.hiddenByHq);
}

export function pageAddress(slug: string): string {
  return `${PAGE_HOST}/${slug}`;
}

// ---------------------------------------------------------------- the editor's draft

export interface PageDraft {
  slug: string;
  area: string;
  city: string;
  about: string;
  highlights: string[];
  photos: PagePhoto[];
  mapsUrl: string;
  showPhone: boolean;
  whatsapp: boolean;
  indexable: boolean;
  published: boolean;
  /** The owner's tick on the page terms (needed once, to publish). */
  termsAgreed: boolean;
}

/** A first draft: the address suggested from the gym's name (and the area once typed). PURE. */
export function draftFrom(saved: SavedPage | null, gym: { name: string; joinCode?: string | null }): PageDraft {
  if (saved) {
    return {
      slug: saved.slug,
      area: saved.area,
      city: saved.city,
      about: saved.about,
      highlights: [...saved.highlights],
      photos: saved.photos.map((p) => ({ ...p })),
      mapsUrl: saved.mapsUrl,
      showPhone: saved.showPhone,
      whatsapp: saved.whatsapp,
      indexable: saved.indexable,
      published: saved.published,
      termsAgreed: false,
    };
  }
  return {
    slug: gymSlug(gym.name, '', gym.joinCode ?? ''),
    area: '',
    city: '',
    about: '',
    highlights: [],
    photos: [],
    mapsUrl: '',
    showPhone: false,
    whatsapp: false,
    indexable: false,
    published: false,
    termsAgreed: false,
  };
}

/** The address as the owner types it: small letters, spaces become dashes, nothing else kept. PURE. */
export function slugTyped(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, LIMITS.slug);
}

/**
 * Does this text carry a web address? The gym server's _gym_page_has_link (0080), the same pattern: "https://",
 * "www.", wa.me, a bare "name.com" / "name.in" / ... PURE.
 */
export function hasLink(s: string): boolean {
  return /(https?:|www\.|wa\.me\/|\b[a-z0-9-]+\.(com|in|net|org|co|io|me|ly|gl|app|xyz|info|site|link|online|store|shop|biz|page|club|fit|gym)\b)/i.test(s);
}

export type Field = 'slug' | 'area' | 'city' | 'about' | 'mapsUrl' | 'photos' | 'highlights' | 'terms';
export type FieldErrors = Partial<Record<Field, string>>;

export const WORDS = {
  slugBad: 'Use 3 to 48 small letters, numbers and dashes, like shakti-gym-sector-12. A few words, like admin or help, are kept by MettleUp.',
  slugTaken: 'Another gym already has this address. Add your area or a number, like {slug}-2.',
  noLinks: 'Take out the web address. Visitors reach you through the buttons on your page.',
  mapsBad: 'Paste the link from Google Maps: open your gym in Maps, tap Share, then Copy link.',
  photosBad: 'One of the photos could not be used. Remove it and add it again.',
  highlightsMax: 'Pick up to 8.',
  terms: 'Tick this box to publish your page.',
  tooLong: 'Too long: at most {max} letters.',
} as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (w, k: string) => (k in v ? String(v[k]) : w));

/**
 * Every problem with the draft, by field, in plain words. `termsAt`: the owner ticked the terms before (no tick needed
 * again). An empty object = ready to save. PURE.
 */
export function draftErrors(d: PageDraft, termsAt: number | null): FieldErrors {
  const e: FieldErrors = {};
  if (!slugOk(d.slug)) e.slug = WORDS.slugBad;
  if (d.area.trim().length > LIMITS.area) e.area = fill(WORDS.tooLong, { max: LIMITS.area });
  else if (hasLink(d.area)) e.area = WORDS.noLinks;
  if (d.city.trim().length > 40) e.city = fill(WORDS.tooLong, { max: 40 });
  else if (hasLink(d.city)) e.city = WORDS.noLinks;
  if (d.about.trim().length > LIMITS.about) e.about = fill(WORDS.tooLong, { max: LIMITS.about });
  else if (hasLink(d.about)) e.about = WORDS.noLinks;
  if (d.mapsUrl.trim() && !mapsLinkOk(d.mapsUrl.trim())) e.mapsUrl = WORDS.mapsBad;
  if (d.photos.length > LIMITS.photos || d.photos.some((p) => !PHOTO_URL.test(p.url) || p.alt.length > LIMITS.alt || hasLink(p.alt))) e.photos = WORDS.photosBad;
  if (d.highlights.length > LIMITS.highlights) e.highlights = WORDS.highlightsMax;
  if (d.published && termsAt === null && !d.termsAgreed) e.terms = WORDS.terms;
  return e;
}

/** What owner_save_gym_page gets: the whole page (it saves the whole row). The map pin and AI switch stay as saved. PURE. */
export function savePayload(d: PageDraft, saved: SavedPage | null): Record<string, unknown> {
  return {
    slug: d.slug,
    area: d.area.replace(/\s+/g, ' ').trim(),
    city: d.city.replace(/\s+/g, ' ').trim(),
    about: d.about.trim(),
    highlights: d.highlights,
    photos: d.photos.map((p) => ({ url: p.url, alt: p.alt.replace(/\s+/g, ' ').trim() })),
    mapsUrl: d.mapsUrl.trim(),
    lat: saved?.lat ?? null,
    lng: saved?.lng ?? null,
    showPhone: d.showPhone,
    whatsapp: d.showPhone && d.whatsapp,
    indexable: d.indexable,
    published: d.published,
    aiHelper: saved?.aiHelper ?? true,
    // The tick counts only when publishing (it is the agreement to show the page).
    termsAgreed: d.published && d.termsAgreed,
  };
}

/** Has the owner changed anything since the save? PURE. */
export function draftChanged(d: PageDraft, saved: SavedPage | null, gym: { name: string; joinCode?: string | null }): boolean {
  const base = draftFrom(saved, gym);
  const strip = (x: PageDraft) => JSON.stringify({ ...x, termsAgreed: false });
  return saved === null || strip(d) !== strip(base);
}

/** The gym server's refusal codes, in plain words (and the field they belong to). PURE. */
export function saveErrorOf(code: string, slug: string): { field: Field | null; words: string } {
  switch (code) {
    case 'BAD_SLUG':
      return { field: 'slug', words: WORDS.slugBad };
    case 'SLUG_TAKEN':
      return { field: 'slug', words: fill(WORDS.slugTaken, { slug }) };
    case 'BAD_MAPS':
      return { field: 'mapsUrl', words: WORDS.mapsBad };
    case 'BAD_TEXT':
      return { field: 'about', words: 'Take out any web address from About, area and city. Visitors reach you through the buttons on your page.' };
    case 'BAD_PHOTOS':
      return { field: 'photos', words: WORDS.photosBad };
    case 'BAD_HIGHLIGHTS':
      return { field: 'highlights', words: 'One of the ticks could not be saved. Untick it and tick it again.' };
    case 'BAD_PLACE':
      return { field: null, words: 'The map pin could not be saved. Write to MettleUp from Help and feedback.' };
    case 'NEEDS_TERMS':
      return { field: 'terms', words: WORDS.terms };
    default:
      return { field: null, words: 'Your page could not be saved. Check your internet and try again.' };
  }
}

/** Plain words for an error the call threw (a refused key, a paused gym), or null for an unknown one. PURE. */
export function thrownWords(e: unknown): string | null {
  const t = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can change the web page.';
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused by MettleUp, so the web page cannot be changed. Write to MettleUp from Help and feedback.';
  if (/\bBUSY\b|\bTOO_MANY\b/.test(t)) return 'Too many photos at once. Wait a few minutes, then add the rest.';
  if (/timed out|Failed to fetch|NetworkError|network/i.test(t)) return 'No answer from the internet. Check it and try again.';
  return null;
}

/** "<gym_id>/<photo_id>.webp" in the photo bucket for a photo address; null for any other. PURE. */
export function photoObject(url: string): string | null {
  const m = PHOTO_URL.exec(url);
  return m ? `${m[1]}/${m[2]}.webp` : null;
}

/** "120 of 500 letters". PURE. */
export function letterCount(s: string, max: number): string {
  return `${s.trim().length} of ${max} letters`;
}

/** Move one photo up or down (to the front = the page's first, biggest photo). PURE. */
export function movePhoto(list: readonly PagePhoto[], i: number, by: -1 | 1): PagePhoto[] {
  const j = i + by;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

// ---------------------------------------------------------------- Enquiries

/** The enquiry's web page question, or null (typed by the desk, or a damaged one). PURE. */
export function pageAskOf(e: Pick<Enquiry, 'pageAsk'> | null | undefined): EnquiryPageAsk | null {
  const x = e?.pageAsk as unknown;
  if (!isObj(x) || typeof x.question !== 'string' || !x.question.trim()) return null;
  return {
    v: 1,
    name: typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    question: x.question.trim().slice(0, 500),
    at: typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : 0,
  };
}

/** The gym server's copy of the question on the enquiry's interest line (for older admin apps). PURE. */
export const PAGE_ASK_PREFIX = 'Asked on your web page: ';
