/**
 * A member's photo, taken at the desk (F107, 29 Oct 2026). The PURE rules: how a camera frame or a
 * picked picture is cut to a square and shrunk, which sizes and JPEG qualities are tried to stay
 * small, what the camera's refusals mean in plain words, and how the server's answers are read.
 * No browser APIs, so they are unit-tested (test/crm/memberPhoto.test.ts). The camera itself is
 * ui/DeskCameraSheet.tsx; the server calls and the photo cache are shop/memberPhotoApi.ts.
 *
 * Server side: supabase/migrations/0043_member_photos.sql. The photo is kept PRIVATE to the gym's
 * own people: it is read and written only through key-checked functions, never by a link.
 */

/** The square side we aim for, in pixels: sharp on the card and the check-in row, small to send. */
export const PHOTO_SIDE = 400;

/** What we aim to stay under. The server refuses anything over 100,000 bytes (0043). */
export const PHOTO_TARGET_BYTES = 60_000;
export const PHOTO_SERVER_MAX_BYTES = 100_000;

/** A picked picture bigger than this is refused before it is even opened (a 40 MB RAW, say). */
export const PICKED_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** The tries, in order: full size at falling quality, then smaller. The first one under target wins. */
export const SHRINK_STEPS: ReadonlyArray<{ side: number; quality: number }> = [
  { side: 400, quality: 0.85 },
  { side: 400, quality: 0.75 },
  { side: 400, quality: 0.65 },
  { side: 360, quality: 0.6 },
  { side: 320, quality: 0.55 },
  { side: 280, quality: 0.5 },
];

/** The centre square of a w x h picture: where to cut it from. PURE. */
export function centreSquare(w: number, h: number): { sx: number; sy: number; side: number } {
  const W = Math.max(0, Math.floor(w));
  const H = Math.max(0, Math.floor(h));
  const side = Math.min(W, H);
  return { sx: Math.floor((W - side) / 2), sy: Math.floor((H - side) / 2), side };
}

/** The square we draw: never bigger than the source (a small webcam is not blown up), at most `max`. PURE. */
export function outputSide(sourceSide: number, max: number = PHOTO_SIDE): number {
  return Math.max(0, Math.min(Math.floor(sourceSide), Math.floor(max)));
}

/**
 * The next try after one that came out `bytes` big at step `step` (an index into SHRINK_STEPS):
 * null when it is small enough, or there is nothing smaller left to try. PURE.
 */
export function nextShrinkStep(step: number, bytes: number): number | null {
  if (bytes <= PHOTO_TARGET_BYTES) return null;
  return step + 1 < SHRINK_STEPS.length ? step + 1 : null;
}

/** Whether the final picture may be sent (the server's hard limit, not the softer target). PURE. */
export function photoFits(bytes: number): boolean {
  return bytes > 0 && bytes <= PHOTO_SERVER_MAX_BYTES;
}

/** A picked file we will not even open: plain words, or null when it may be tried. PURE. */
export function checkPickedFile(file: { size: number; type: string; name?: string }): string | null {
  if (!file.size) return 'That file has no picture in it. Pick another photo.'; // member-words
  if (file.size > PICKED_FILE_MAX_BYTES) return 'That file is too big. Pick a photo under 25 MB.'; // member-words
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const looksLikeImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/.test(name);
  if (!looksLikeImage) return 'That file is not a photo. Pick a JPG or PNG picture.'; // member-words
  return null;
}

/** Why the camera did not open, from the browser's error name. */
export type CameraTrouble = 'refused' | 'none' | 'busy' | 'unsupported' | 'other';

/** A getUserMedia failure (its DOMException name), sorted. PURE. */
export function cameraTrouble(errorName: string | null | undefined): CameraTrouble {
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // old Chrome
    case 'SecurityError':
      return 'refused';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'none';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'TypeError':
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'other';
  }
}

/** What the desk is told when the camera does not open. Every case points at "Upload a photo". PURE. */
export function cameraTroubleWords(t: CameraTrouble): string {
  switch (t) {
    case 'refused':
      return 'The camera is blocked. Tap the camera or lock icon next to the web address, choose Allow, then reload the page. Or tap Upload a photo.'; // member-words
    case 'none':
      return 'No camera was found on this computer. Tap Upload a photo to pick a picture instead.'; // member-words
    case 'busy':
      return 'The camera is in use by another app. Close that app and tap Try again, or tap Upload a photo.'; // member-words
    case 'unsupported':
      return 'This browser can’t use the camera. Tap Upload a photo to pick a picture instead.'; // member-words
    default:
      return 'The camera didn’t start. Tap Try again, or tap Upload a photo.'; // member-words
  }
}

/** The server's refusals (0043) in plain words; null for anything else (the caller's own words then). PURE. */
export function photoServerWords(err: unknown): string | null {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && typeof (err as { message?: unknown }).message === 'string'
        ? String((err as { message: string }).message)
        : String(err ?? '');
  if (/\bTOO_BIG\b/.test(msg)) return 'That photo is too big. Take it again, or pick a smaller one.'; // member-words
  if (/\bBAD_PHOTO\b/.test(msg)) return 'That photo couldn’t be saved. Take it again, or pick a JPG or PNG picture.'; // member-words
  if (/\bNO_MEMBER\b/.test(msg)) return 'This member is not saved yet. Check the internet, wait a minute, then add the photo on their page.'; // member-words
  return null;
}

/** One saved photo as the server answers it (0043 _member_photo_json). */
export interface MemberPhotoRow {
  memberId: string;
  /** A ready-to-show picture: `data:image/jpeg;base64,...`. */
  dataUrl: string;
  updatedAt: number;
}

/** The server's base64 (no prefix) as a picture the page can show. PURE. */
export function jpegDataUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64.replace(/\s+/g, '')}`;
}

/** The server's list answer -> rows; anything malformed is skipped, never thrown. PURE. */
export function photoRowsFromAnswer(answer: unknown): MemberPhotoRow[] {
  if (!Array.isArray(answer)) return [];
  const out: MemberPhotoRow[] = [];
  for (const r of answer) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.memberId !== 'string' || typeof o.jpeg !== 'string' || !o.jpeg) continue;
    out.push({ memberId: o.memberId, dataUrl: jpegDataUrl(o.jpeg), updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0 });
  }
  return out;
}

/** Bytes -> base64 without a data: prefix (in slices, so a big array never overflows the stack). PURE. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const SLICE = 0x8000;
  for (let i = 0; i < bytes.length; i += SLICE) {
    bin += String.fromCharCode(...bytes.subarray(i, i + SLICE));
  }
  return btoa(bin);
}

/** True when the bytes start like a JPEG (FF D8 FF), which is all the server accepts. PURE. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Most member ids per read (the server refuses more than 50). */
export const PHOTO_READ_BATCH = 40;

/** Ids split into reads of at most `size`, duplicates dropped, order kept. PURE. */
export function photoReadBatches(ids: readonly string[], size: number = PHOTO_READ_BATCH): string[][] {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}
