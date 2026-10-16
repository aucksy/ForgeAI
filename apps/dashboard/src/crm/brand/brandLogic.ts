/**
 * Gym branding (Level 1) — the panel's pure rules: the form's draft, what Save sends, the logo's
 * storage rules and the owner-facing words. No browser APIs, so they are unit-tested
 * (test/crm/brand.test.ts).
 *
 * The palette itself comes from the ONE shared engine (`buildBrandPalette`, packages/theme) that
 * the member app uses, so the phone preview here is what members see.
 *
 * Contract: supabase/migrations/0005_gym_theme.sql — owner_set_brand(key, accent, bg, logo,
 * heading); logos in the PUBLIC `gym-logos` bucket under `<48-hex ticket>/<name>` (tickets from
 * owner_photo_ticket, as product photos), PNG / JPEG / WebP up to 1 MB.
 */

import { buildBrandPalette, normalizeHex, type BrandPalette, type GymBrand, type HeadingStyle } from '@forgeai/theme';

export const LOGO_BUCKET = 'gym-logos';
/** The bucket's own limit (file_size_limit). */
export const MAX_LOGO_BYTES = 1024 * 1024;
/** Logos are shrunk to at most this on the long side: the app shows them at 260 dp at most. */
export const LOGO_EDGE = 512;
/** ForgeAI's own accent: the picker's starting colour for a gym without one. */
export const FORGE_ACCENT = '#FF7A3B';

const LOGO_PREFIX = 'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/gym-logos/';
const TICKET_RE = /^[0-9a-f]{48}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

// ---------------------------------------------------------------- the form

export interface BrandDraft {
  /** What the owner typed or picked (may be half-typed: checked by `hexError`). */
  accent: string;
  useBg: boolean;
  bg: string;
  logoUrl: string | null;
  heading: HeadingStyle;
}

/** The form as the gym's brand has it now (ForgeAI's ember to start from when it has none). */
export function draftFromBrand(b: GymBrand | null | undefined): BrandDraft {
  return {
    accent: b?.accent ?? FORGE_ACCENT,
    useBg: Boolean(b?.bg),
    bg: b?.bg ?? '#0A0A0C',
    logoUrl: b?.logoUrl ?? null,
    heading: b?.heading ?? 'normal',
  };
}

/** Words under a colour box when it does not hold a colour yet; null when it does. */
export function hexError(raw: string): string | null {
  if (normalizeHex(raw)) return null;
  if (!raw.trim()) return 'Pick a colour, or type its code (like #F7D411).';
  return 'Type a colour code: # and six letters or numbers, like #F7D411.';
}

/** The draft is complete enough to preview and save. */
export function draftValid(d: BrandDraft): boolean {
  return hexError(d.accent) == null && (!d.useBg || hexError(d.bg) == null);
}

/** The palette the phone would get, or null while a colour box is half-typed. PURE. */
export function previewPalette(d: BrandDraft): BrandPalette | null {
  if (!draftValid(d)) return null;
  return buildBrandPalette({ accent: normalizeHex(d.accent)!, bg: d.useBg ? normalizeHex(d.bg) : null });
}

/**
 * The colour to save: none while it is ForgeAI's own ember (the picker's starting colour). A gym
 * that only uploads a logo then keeps ForgeAI's hand-tuned colours on the phone, instead of
 * ForgeAI's orange pushed through the palette engine (D9). PURE.
 */
export function accentToSave(raw: string | null | undefined): string | null {
  const hex = normalizeHex(raw);
  return hex === FORGE_ACCENT ? null : hex;
}

/** owner_set_brand's arguments (minus the key) for this draft. */
export function saveArgs(d: BrandDraft): { p_accent: string | null; p_bg: string | null; p_logo_url: string | null; p_heading: HeadingStyle } {
  return {
    p_accent: accentToSave(d.accent),
    p_bg: d.useBg ? normalizeHex(d.bg) : null,
    p_logo_url: d.logoUrl,
    p_heading: d.heading,
  };
}

/** "Use ForgeAI's look": everything empty. */
export const CLEAR_ARGS = { p_accent: null, p_bg: null, p_logo_url: null, p_heading: 'normal' as HeadingStyle };

/** The draft differs from what is saved (Save is worth pressing). */
export function draftChanged(d: BrandDraft, saved: GymBrand | null): boolean {
  const a = saveArgs(d);
  return (
    a.p_accent !== accentToSave(saved?.accent) ||
    a.p_bg !== (saved?.bg ?? null) ||
    a.p_logo_url !== (saved?.logoUrl ?? null) ||
    a.p_heading !== (saved?.heading ?? 'normal')
  );
}

// ---------------------------------------------------------------- the logo

/** After shrinking: the bucket's own rules, in plain words. */
export function checkEncodedLogo(b: { type: string; size: number }): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(b.type)) return 'That logo couldn’t be converted. Try a PNG or JPEG picture.';
  if (b.size > MAX_LOGO_BYTES) return 'That logo is still over 1 MB after shrinking. Try a simpler picture.';
  return null;
}

/** A fresh file name (the bucket refuses to overwrite). */
export function newLogoName(randomHex: () => string): string {
  const hex = randomHex().toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32);
  const name = `logo-${hex || Date.now().toString(16)}.png`;
  if (!NAME_RE.test(name)) throw new Error('bad logo name');
  return name;
}

export function logoPath(ticket: string, name: string): string {
  if (!TICKET_RE.test(ticket)) throw new Error('bad logo ticket');
  if (!NAME_RE.test(name)) throw new Error('bad logo name');
  return `${ticket}/${name}`;
}

/** A link the server will accept as the gym's logo (mirrors _logo_url_ok in 0005). */
export function isLogoUrl(url: string | null): boolean {
  if (url == null) return true;
  if (!url.startsWith(LOGO_PREFIX)) return false;
  const [ticket, name, ...rest] = url.slice(LOGO_PREFIX.length).split('/');
  return rest.length === 0 && TICKET_RE.test(ticket ?? '') && NAME_RE.test(name ?? '');
}

// ---------------------------------------------------------------- words

function text(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as { message?: unknown; details?: unknown; hint?: unknown };
    return [o.message, o.details, o.hint].filter((x) => typeof x === 'string').join(' ');
  }
  return String(err);
}

/** What to tell the owner when Save (or the logo upload) fails. Never a raw database message. */
export function brandErrorWords(err: unknown): string {
  const msg = text(err);
  if (/\bBAD_KEY\b/.test(msg)) return 'This demo gym is no longer available. Start a new demo gym.';
  if (/\bBAD_COLOUR\b/.test(msg)) return 'One of the colours isn’t a colour code. Pick it again.';
  if (/\bBAD_LOGO\b/.test(msg)) return 'That logo link can’t be used. Upload the logo again from this screen.';
  if (/\bBAD_HEADING\b/.test(msg)) return 'Pick a heading style again.';
  if (/\bBUSY\b/.test(msg)) return 'Too many uploads in the last few minutes. Wait a little and try again.';
  if (/could not find the function|PGRST202/i.test(msg)) return 'Branding isn’t ready for your gym yet. Message ForgeAI on WhatsApp to switch it on.';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(msg)) {
    return 'Can’t reach the internet. Check the connection and try again.';
  }
  if (/too large|payload|exceeded|size/i.test(msg)) return 'That logo is over 1 MB. Pick a smaller one.';
  if (/mime|type/i.test(msg)) return 'That kind of file can’t be used. Pick a PNG or JPEG picture.';
  return 'That didn’t save. Please try again.';
}
