/**
 * R-573 (owner, 15 Nov 2026): take the plain white or coloured box off a gym's logo, on the owner's own
 * computer (no AI, nothing sent anywhere, free). It reverses R-192 ("a tip instead of a tool"): owners will not
 * remove the box themselves, and a logo on a white box looks bad on the member app's dark screens.
 *
 * PURE: pixels in (RGBA, row by row, as canvas getImageData gives them), pixels out. No browser APIs, so it is
 * unit-tested without a canvas (test/crm/logoBackground.test.ts). The browser half is logoUpload.ts.
 *
 * The steps:
 *  1. Look at the picture's border. Mostly see-through already: nothing to do. Most of it one colour (within
 *     BG_TOLERANCE): that colour is the background. Otherwise (a photo, a pattern): leave the logo alone.
 *  2. Flood-fill from the border over pixels close to that colour and make them see-through. Only pixels joined
 *     to the border go, so white letters inside the logo stay.
 *  3. The edge: pixels right next to the removed part are a blend of the logo and the background (smoothing,
 *     JPEG noise). Each is made partly see-through by how much background is mixed into it, and its colour is
 *     un-mixed from the background, so no white fringe shows on dark (edgeMix).
 *  4. Trim the empty margin and keep a small even padding, so the logo is not tiny in the app.
 */

export type Rgb = readonly [number, number, number];

/**
 * How far (straight-line RGB distance, 0..441) a pixel may be from the background colour and still count as
 * background. Measured on 15 Nov 2026 (JPEG at quality 40-90 of a logo on white, cream and blue): JPEG noise in
 * open background reaches 20; the ringing within 8 px of the logo is 16-29 for 9 pixels in 10. 32 takes all
 * of the open background and most of the ringing; the rest is handled as edge (step 3).
 */
export const BG_TOLERANCE = 32;

/**
 * Share of the border (its not-see-through pixels) that must be one colour. A logo that touches the edge in a
 * few places still leaves 90% or more of the border plain (the unit tests: a bar running edge to edge); a photo
 * or a pattern leaves far less than half. 85% sits between.
 */
export const BORDER_SHARE = 0.85;

/**
 * A round badge cut exactly to its square touches all four sides, and leaves only about 72% of the border plain
 * (the unit test). So a lower share is enough when all four corners are that same colour: a photo almost never
 * has four matching corners (sky at the top, ground at the bottom).
 */
export const CORNER_SHARE = 0.6;

/** More than this share of the border already see-through: the logo has no box to remove. */
export const CLEAR_BORDER_SHARE = 0.5;

/** A pixel this see-through (alpha 0..255) or more counts as see-through already. */
const CLEAR_ALPHA = 128;

/** How many pixel rings past the removed background are treated as blended edge (step 3). */
const EDGE_RINGS = 2;

/** An edge pixel at least this solid (0..1) stops the edge walk: the logo itself starts there. */
const SOLID = 0.98;

/** Less than this share of the picture removed: not worth offering (the box was a thin line, or nothing). */
const MIN_REMOVED = 0.02;

/** More than this share removed: the "logo" was nearly all background; keep the picture as it is. */
const MAX_REMOVED = 0.985;

/** The trimmed logo keeps this much empty space on each side (share of its longer side). */
export const TRIM_PADDING = 0.04;

/** Pixels fainter than this (alpha) do not count as logo when trimming. */
const TRIM_ALPHA = 16;

export type BackgroundVerdict =
  /** The border is see-through already: nothing to remove. */
  | { kind: 'clear' }
  /** The border is not one colour (a photo or a pattern): leave it. */
  | { kind: 'busy'; share: number }
  /** A plain background of this colour. */
  | { kind: 'flat'; colour: Rgb; share: number };

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const distance = (data: Uint8ClampedArray, i: number, c: Rgb) => {
  const dr = data[i] - c[0];
  const dg = data[i + 1] - c[1];
  const db = data[i + 2] - c[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/** Pixel indexes (not byte offsets) of the outer `thick` rows and columns, each once. */
function borderPixels(width: number, height: number, thick: number): number[] {
  const out: number[] = [];
  const t = Math.max(1, Math.min(thick, Math.floor(Math.min(width, height) / 2)));
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < t || y >= height - t;
    for (let x = 0; x < width; x += 1) {
      if (edgeRow || x < t || x >= width - t) out.push(y * width + x);
    }
  }
  return out;
}

/** All four corners (3 x 3 pixels each) are solid and close to `colour`. */
function cornersAre({ data, width, height }: Pixels, colour: Rgb): boolean {
  const k = Math.min(3, Math.floor(Math.min(width, height) / 2));
  for (const [cx, cy] of [[0, 0], [width - k, 0], [0, height - k], [width - k, height - k]]) {
    for (let y = cy; y < cy + k; y += 1) {
      for (let x = cx; x < cx + k; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < CLEAR_ALPHA || distance(data, i, colour) > BG_TOLERANCE) return false;
      }
    }
  }
  return true;
}

/** Step 1: does the picture have a plain background, and of which colour? PURE. */
export function findBackground({ data, width, height }: Pixels): BackgroundVerdict {
  if (width < 3 || height < 3) return { kind: 'busy', share: 0 };
  const border = borderPixels(width, height, 2);
  const solid = border.filter((p) => data[p * 4 + 3] >= CLEAR_ALPHA);
  if (solid.length <= border.length * (1 - CLEAR_BORDER_SHARE)) return { kind: 'clear' };

  // The most common colour, by 16 steps per channel, then the average of the pixels close to it (twice, so a
  // colour on a bucket's edge, like JPEG white at 239..255, settles on its true middle).
  const buckets = new Map<number, number>();
  for (const p of solid) {
    const i = p * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestKey = 0;
  for (const [key, n] of buckets) {
    if (n > best) {
      best = n;
      bestKey = key;
    }
  }
  let colour: Rgb = [((bestKey >> 8) & 15) * 16 + 8, ((bestKey >> 4) & 15) * 16 + 8, (bestKey & 15) * 16 + 8];
  let share = 0;
  for (let round = 0; round < 3; round += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const p of solid) {
      const i = p * 4;
      if (distance(data, i, colour) <= BG_TOLERANCE) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
    }
    share = n / solid.length;
    if (!n) break;
    colour = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }
  // The share for the settled colour.
  share = solid.filter((p) => distance(data, p * 4, colour) <= BG_TOLERANCE).length / solid.length;
  const flat = share >= BORDER_SHARE || (share >= CORNER_SHARE && cornersAre({ data, width, height }, colour));
  return flat ? { kind: 'flat', colour, share } : { kind: 'busy', share };
}

/**
 * Colour to alpha: the smallest see-through amount (0..1 solid) for which `pixel = a * logo + (1 - a) * bg`
 * with a real logo colour, and that logo colour. PURE.
 */
export function unmix(r: number, g: number, b: number, bg: Rgb): { alpha: number; rgb: Rgb } {
  const px = [r, g, b];
  let alpha = 0;
  for (let c = 0; c < 3; c += 1) {
    const d = px[c] - bg[c];
    const room = d > 0 ? 255 - bg[c] : bg[c];
    if (d !== 0 && room > 0) alpha = Math.max(alpha, Math.abs(d) / room);
  }
  alpha = Math.min(1, alpha);
  if (alpha <= 0) return { alpha: 0, rgb: [bg[0], bg[1], bg[2]] };
  const out = px.map((v, c) => Math.max(0, Math.min(255, Math.round(bg[c] + (v - bg[c]) / alpha))));
  return { alpha, rgb: [out[0], out[1], out[2]] };
}

/** Edge pixels look this far (pixels) for the solid logo colour they were blended from. */
const EDGE_REACH = 2;

/** An edge pixel with no more solid colour near it, and at most this far from the background, is a speck. */
const SPECK = BG_TOLERANCE * 3;

/** A speck fainter than this (0..1 solid) is removed outright. */
const FAINT = 0.35;

/**
 * Step 3 for one edge pixel: how solid it is (0..1) and its colour without the background mixed in. The logo
 * colour it was blended from is the most solid pixel within EDGE_REACH; the pixel's see-through amount is how far
 * it sits from the background on the way to that colour. A pixel as solid as everything near it is logo itself
 * (solid, unchanged), unless it is still close to the background: then it is a speck of JPEG noise, and it gets
 * the plain colour-to-alpha (`unmix`), which makes it nearly see-through. PURE.
 */
function edgeMix(data: Uint8ClampedArray, width: number, height: number, mark: Uint8Array, x: number, y: number, bg: Rgb): { alpha: number; rgb: Rgb } {
  const i = (y * width + x) * 4;
  const own = distance(data, i, bg);
  let best = -1;
  let bestD = own;
  for (let qy = Math.max(0, y - EDGE_REACH); qy <= Math.min(height - 1, y + EDGE_REACH); qy += 1) {
    for (let qx = Math.max(0, x - EDGE_REACH); qx <= Math.min(width - 1, x + EDGE_REACH); qx += 1) {
      const q = qy * width + qx;
      if (mark[q] === 1 || data[q * 4 + 3] < CLEAR_ALPHA) continue;
      const d = distance(data, q * 4, bg);
      if (d > bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  // No logo colour near (only other noise, or nothing more solid than this pixel).
  if (best < 0 || bestD < own + 8 || bestD <= SPECK) {
    if (own > SPECK) return { alpha: 1, rgb: [data[i], data[i + 1], data[i + 2]] };
    // A faint speck on its own is JPEG noise: gone (it showed as coloured dots on dark).
    const speck = unmix(data[i], data[i + 1], data[i + 2], bg);
    return speck.alpha < FAINT ? { alpha: 0, rgb: speck.rgb } : speck;
  }
  const f = best * 4;
  let dot = 0;
  let len = 0;
  for (let c = 0; c < 3; c += 1) {
    const fc = data[f + c] - bg[c];
    dot += (data[i + c] - bg[c]) * fc;
    len += fc * fc;
  }
  const alpha = Math.max(0, Math.min(1, dot / len));
  if (alpha <= 0) return { alpha: 0, rgb: [bg[0], bg[1], bg[2]] };
  const rgb = [0, 1, 2].map((c) => Math.max(0, Math.min(255, Math.round(bg[c] + (data[i + c] - bg[c]) / alpha))));
  return { alpha, rgb: [rgb[0], rgb[1], rgb[2]] };
}

/**
 * Steps 2 and 3: a copy of the picture with the background of colour `bg` taken off. `removed` is the share of
 * the picture that became fully see-through. PURE (the input is not changed).
 */
export function removeBackground({ data, width, height }: Pixels, bg: Rgb): { data: Uint8ClampedArray; removed: number } {
  const n = width * height;
  const out = new Uint8ClampedArray(data);
  // 0: logo, 1: background (removed), 2: edge pixel already handled.
  const mark = new Uint8Array(n);
  const near = (p: number) => out[p * 4 + 3] < CLEAR_ALPHA || distance(data, p * 4, bg) <= BG_TOLERANCE;

  // Step 2: flood-fill (4 neighbours, so it cannot slip through a diagonal gap in a letter) from every border pixel.
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const visit = (p: number) => {
    if (!mark[p] && near(p)) {
      mark[p] = 1;
      queue[tail] = p;
      tail += 1;
    }
  };
  for (const p of borderPixels(width, height, 1)) visit(p);
  while (head < tail) {
    const p = queue[head];
    head += 1;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (y > 0) visit(p - width);
    if (y < height - 1) visit(p + width);
  }
  let removed = 0;
  for (let p = 0; p < n; p += 1) {
    if (mark[p] === 1) {
      out[p * 4 + 3] = 0;
      removed += 1;
    }
  }

  // Step 3: up to EDGE_RINGS rings of blended edge. A ring pixel touches (8 neighbours) the removed part or a
  // ring pixel that is still partly see-through; a pixel close to the background colour that the fill did not
  // reach (inside a letter) is never touched, and the walk stops at the first solid logo pixel (see edgeMix).
  let frontier: number[] = [];
  for (let p = 0; p < n; p += 1) if (mark[p] === 1) frontier.push(p);
  for (let ring = 0; ring < EDGE_RINGS && frontier.length; ring += 1) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const qx = x + dx;
          const qy = y + dy;
          if ((!dx && !dy) || qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
          const q = qy * width + qx;
          if (mark[q]) continue;
          mark[q] = 2;
          const i = q * 4;
          if (distance(data, i, bg) <= BG_TOLERANCE) continue; // inside a letter: keep, and do not walk on
          const { alpha, rgb } = edgeMix(data, width, height, mark, qx, qy, bg);
          if (alpha >= SOLID) continue;
          out[i] = rgb[0];
          out[i + 1] = rgb[1];
          out[i + 2] = rgb[2];
          out[i + 3] = Math.round(data[i + 3] * alpha);
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return { data: out, removed: removed / n };
}

/** Step 4: crop to the logo and keep TRIM_PADDING of empty space on every side. PURE. */
export function trimToLogo({ data, width, height }: Pixels): Pixels {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] >= TRIM_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { data, width, height };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const pad = Math.max(2, Math.round(Math.max(w, h) * TRIM_PADDING));
  const ow = w + pad * 2;
  const oh = h + pad * 2;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < h; y += 1) {
    const from = ((minY + y) * width + minX) * 4;
    out.set(data.subarray(from, from + w * 4), ((y + pad) * ow + pad) * 4);
  }
  return { data: out, width: ow, height: oh };
}

export type LogoCleanup =
  /** Nothing to change: the border is clear already, or it is not one colour, or too little would go. */
  | { kind: 'kept'; why: 'clear' | 'busy' | 'nothing' }
  /** The logo without its background, trimmed. `colour` is the background that was removed. */
  | { kind: 'cleaned'; colour: Rgb; pixels: Pixels };

/** All four steps. PURE. */
export function cleanLogo(pixels: Pixels): LogoCleanup {
  const verdict = findBackground(pixels);
  if (verdict.kind !== 'flat') return { kind: 'kept', why: verdict.kind };
  const { data, removed } = removeBackground(pixels, verdict.colour);
  if (removed < MIN_REMOVED || removed > MAX_REMOVED) return { kind: 'kept', why: 'nothing' };
  return { kind: 'cleaned', colour: verdict.colour, pixels: trimToLogo({ data, width: pixels.width, height: pixels.height }) };
}

/** The removed background's colour in the owner's words: "white", "black" or "coloured". PURE. */
export function backgroundWord(c: Rgb): 'white' | 'black' | 'coloured' {
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (min >= 225 && max - min <= 30) return 'white';
  if (max <= 40) return 'black';
  return 'coloured';
}
