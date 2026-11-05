/**
 * The gym's home-screen shortcut icon (T74, owner report R-356, 5 Nov 2026): how the logo is laid
 * on the icon so it looks clean under ANY launcher mask (circle, squircle, rounded square,
 * teardrop). The member app draws it (modules/forge-phone ShortcutArt.kt, a line-for-line twin of
 * this file, tested on the same cases) and the owner panel previews it (Branding, under the logo).
 *
 * The bug it fixes: a square logo (a round black badge on a white square) was drawn at 60 % of the
 * icon on the gym's background tone, so a round launcher mask showed the logo's white square
 * poking out of the circle.
 *
 * The icon is an Android ADAPTIVE icon: a 108 dp canvas; launchers show the middle 72 dp through
 * their mask, and anything inside the middle 66 dp circle is never cut off by any mask.
 *
 * Rules:
 *  1. Read the logo's EDGE (its outer 3 %):
 *     - "clear": more than 10 % of the edge is see-through (a logo with its background removed);
 *     - "solid": the edge is one colour (90 % of it within a small step of the middle colour),
 *       for example a badge on a white square: that colour becomes the icon's background, so the
 *       logo's square melts into it and the mask shows a clean shape;
 *     - "busy": anything else (a photo): the whole picture must fit inside the safe circle.
 *  2. Background: "solid" and "busy" use the edge colour. "clear" uses the first of the gym's
 *     colours (brand colour, then background tone), then a neutral dark, then white, that most of
 *     the logo stands out on (3 : 1); if none does, the one it stands out on best.
 *  3. Size: the logo's CONTENT (what is not background) is measured from the picture's centre; the
 *     logo is scaled (never stretched) so its farthest content point sits on a 32 dp circle, just
 *     inside the 33 dp safe circle. A "busy" logo's content is the whole picture.
 *
 * PURE and deterministic. Pixels are RGBA bytes, as a canvas's getImageData gives them; read the
 * logo small first (ANALYSIS_EDGE px on its long side).
 */

/** The adaptive icon canvas, in dp. */
export const ICON_CANVAS = 108;
/** What a launcher shows through its mask, in dp (the middle of the canvas). */
export const ICON_VIEWPORT = 72;
/** The farthest any part of the logo may reach from the centre, in dp (the safe circle is 33). */
export const ICON_CONTENT_RADIUS = 32;
/** The logo is read at this size (long side, px) to decide; plenty, and instant. */
export const ANALYSIS_EDGE = 128;
/** Behind a see-through logo when the gym has no colour it stands out on. */
export const ICON_NEUTRAL_DARK = '#16181D';
export const ICON_WHITE = '#FFFFFF';

/** The edge band read, as a share of the short side (at least 1 px). */
const EDGE_SHARE = 0.03;
/** More see-through edge than this: the logo has no background of its own. */
const CLEAR_EDGE = 0.1;
/** One edge colour: this share of the edge within SAME_STEP of the middle colour. */
const SOLID_SHARE = 0.9;
/** Largest channel difference (0-255) still "the same colour" (JPEG noise, anti-aliasing). */
const SAME_STEP = 32;
/** A pixel this different from the background colour (largest channel step) is logo, not paper. */
const CONTENT_STEP = 48;
/** Alpha at or above this is drawn. */
const OPAQUE = 128;
/** Contrast a see-through logo needs on its background (WCAG ratio, as for shapes). */
const STANDS_OUT = 3;
/** Share of the logo that must stand out for a background to be taken. */
const STANDS_OUT_SHARE = 0.6;

export type IconEdge = 'clear' | 'solid' | 'busy';

export interface ShortcutIconPlan {
  edge: IconEdge;
  /** The icon's background, '#RRGGBB'. */
  bg: string;
  /**
   * Where the whole logo picture goes on the 108 dp canvas (dp; may reach past the canvas when
   * only background-coloured paper is there). Aspect ratio is the picture's own.
   */
  left: number;
  top: number;
  width: number;
  height: number;
}

type Rgb = [number, number, number];

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

function toHex([r, g, b]: Rgb): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
}

function fromHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function step(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** What the logo's edge is, and its colour (null for "clear"). PURE. */
export function readIconEdge(rgba: ArrayLike<number>, w: number, h: number): { edge: IconEdge; colour: Rgb | null } {
  const band = Math.max(1, Math.round(Math.min(w, h) * EDGE_SHARE));
  let total = 0;
  let clear = 0;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue;
      const i = (y * w + x) * 4;
      total += 1;
      if (rgba[i + 3] < OPAQUE) {
        clear += 1;
        continue;
      }
      rs.push(rgba[i]);
      gs.push(rgba[i + 1]);
      bs.push(rgba[i + 2]);
    }
  }
  if (total === 0 || rs.length === 0 || clear > total * CLEAR_EDGE) return { edge: 'clear', colour: null };
  const mid: Rgb = [median(rs), median(gs), median(bs)];
  let same = 0;
  for (let k = 0; k < rs.length; k += 1) if (step([rs[k], gs[k], bs[k]], mid) <= SAME_STEP) same += 1;
  return { edge: same >= rs.length * SOLID_SHARE ? 'solid' : 'busy', colour: mid };
}

/**
 * How far the logo's content reaches from the picture's centre, in the picture's px (to the far
 * corner of the farthest content pixel). Null when nothing is content (a blank picture). PURE.
 */
export function contentRadius(rgba: ArrayLike<number>, w: number, h: number, paper: Rgb | null): number | null {
  const cx = w / 2;
  const cy = h / 2;
  let far = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < OPAQUE) continue;
      if (paper && step([rgba[i], rgba[i + 1], rgba[i + 2]], paper) <= CONTENT_STEP) continue;
      const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx));
      const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
      const d = dx * dx + dy * dy;
      if (d > far) far = d;
    }
  }
  return far < 0 ? null : Math.sqrt(far);
}

/** The background a see-through logo stands out on best, from the gym's colours first. PURE. */
export function pickClearBackground(rgba: ArrayLike<number>, w: number, h: number, gymColours: readonly (string | null | undefined)[]): string {
  const candidates: Rgb[] = [];
  for (const c of [...gymColours, ICON_NEUTRAL_DARK, ICON_WHITE]) {
    const rgb = c ? fromHex(c) : null;
    if (rgb && !candidates.some((k) => step(k, rgb) === 0)) candidates.push(rgb);
  }
  // Every 4th pixel is plenty for "most of the logo".
  const ink: Rgb[] = [];
  for (let p = 0; p < w * h; p += 4) {
    const i = p * 4;
    if (rgba[i + 3] >= OPAQUE) ink.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  if (ink.length === 0) return toHex(candidates[0]);
  let best = candidates[0];
  let bestShare = -1;
  for (const c of candidates) {
    const share = ink.filter((p) => ratio(p, c) >= STANDS_OUT).length / ink.length;
    if (share >= STANDS_OUT_SHARE) return toHex(c);
    if (share > bestShare) {
      best = c;
      bestShare = share;
    }
  }
  return toHex(best);
}

/**
 * The icon for a logo read at w x h px (RGBA bytes). `gymColours`: the gym's brand colour, then its
 * background tone (either may be null), used only behind a see-through logo. PURE.
 */
export function planShortcutIcon(rgba: ArrayLike<number>, w: number, h: number, gymColours: readonly (string | null | undefined)[] = []): ShortcutIconPlan {
  const { edge, colour } = readIconEdge(rgba, w, h);
  const halfDiagonal = Math.sqrt(w * w + h * h) / 2;
  let reach: number;
  let bg: string;
  if (edge === 'clear') {
    reach = contentRadius(rgba, w, h, null) ?? halfDiagonal;
    bg = pickClearBackground(rgba, w, h, gymColours);
  } else if (edge === 'solid') {
    reach = contentRadius(rgba, w, h, colour) ?? halfDiagonal;
    bg = toHex(colour as Rgb);
  } else {
    reach = halfDiagonal;
    bg = toHex(colour as Rgb);
  }
  const scale = ICON_CONTENT_RADIUS / Math.max(reach, 0.5);
  const width = w * scale;
  const height = h * scale;
  return { edge, bg, left: (ICON_CANVAS - width) / 2, top: (ICON_CANVAS - height) / 2, width, height };
}
