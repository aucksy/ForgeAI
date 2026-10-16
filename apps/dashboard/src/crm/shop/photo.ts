/**
 * Product photos — the pure rules (no browser APIs, so they are unit-tested).
 *
 * Contract: supabase/migrations/0004_product_photos.sql. Photos live in the PUBLIC
 * `product-photos` bucket under `<ticket>/<name>`, where the ticket is a 48-hex
 * upload ticket from `owner_photo_ticket` (15 minutes). The bucket takes JPEG, PNG
 * or WebP up to 3 MB and refuses overwrites, so every upload gets a NEW name. A
 * product may only point at a URL inside that bucket (else BAD_PHOTO).
 *
 * Every photo is shrunk in the browser before it leaves (1000 px on the long side,
 * JPEG 0.82): a phone photo is 4–12 MB and 4000 px, which is slow on gym Wi-Fi and
 * pointless on a product tile.
 */


export const PHOTO_BUCKET = 'product-photos';
/** The bucket's own limit (file_size_limit). */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
/** What we accept from the file picker before shrinking — beyond this a browser struggles. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
export const MAX_EDGE = 1000;
export const JPEG_QUALITY = 0.82;

const PUBLIC_PREFIX =
  'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/product-photos/';
const TICKET_RE = /^[0-9a-f]{48}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

/** Is this a picture we can try to read, and not absurdly large? Plain words if not. */
export function checkSourceFile(f: { type: string; size: number; name?: string }): string | null {
  const type = (f.type || '').toLowerCase();
  const byName = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name ?? '');
  if (!type.startsWith('image/') && !byName) return 'That file isn’t a photo. Pick a JPEG or PNG picture.';
  if (f.size <= 0) return 'That file is empty. Pick another photo.';
  if (f.size > MAX_SOURCE_BYTES) return 'That photo is too big to use (over 40 MB). Pick a smaller one.';
  return null;
}

/** After shrinking: the bucket's own rules. */
export function checkEncodedPhoto(b: { type: string; size: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(b.type)) {
    return 'That photo couldn’t be converted. Try a JPEG or PNG picture.';
  }
  if (b.size > MAX_PHOTO_BYTES) return 'That photo is still over 3 MB after shrinking. Pick a simpler one.';
  return null;
}

/** Size to draw at: fits inside `max` on the long side, never enlarged, at least 1 px. */
export function fitWithin(width: number, height: number, max: number = MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A fresh file name — the bucket refuses to overwrite, so never reuse one. */
export function newPhotoName(randomHex: () => string): string {
  const hex = randomHex().toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32);
  const name = `${hex || Date.now().toString(16)}.jpg`;
  if (!NAME_RE.test(name)) throw new Error('bad photo name');
  return name;
}

export function photoPath(ticket: string, name: string): string {
  if (!TICKET_RE.test(ticket)) throw new Error('bad photo ticket');
  if (!NAME_RE.test(name)) throw new Error('bad photo name');
  return `${ticket}/${name}`;
}

/** Mirrors the server's check (`_photo_url_ok`): only files inside our bucket. */
export function isPhotoUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return false;
  const [ticket, name, ...rest] = url.slice(PUBLIC_PREFIX.length).split('/');
  return rest.length === 0 && TICKET_RE.test(ticket ?? '') && NAME_RE.test(name ?? '');
}

/** What to say when an upload fails, from the storage or RPC error. Never raw text. */
export function uploadErrorWords(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '');
  if (/failed to fetch|network|load failed|timed? ?out/i.test(msg)) {
    return 'Can’t reach the internet, so the photo didn’t upload. Check the connection and try again.';
  }
  if (/too large|payload|exceeded|size/i.test(msg)) return 'That photo is over 3 MB. Pick a smaller one.';
  if (/mime|type/i.test(msg)) return 'That kind of file can’t be used. Pick a JPEG or PNG picture.';
  if (/\bBUSY\b/.test(msg)) return 'Too many photo uploads in the last few minutes. Wait a little and try again.';
  if (/\bBAD_KEY\b/.test(msg)) return 'This demo gym is no longer available. Start a new demo gym.';
  return 'The photo didn’t upload. Please try again.';
}
