/**
 * R-573: the logo background remover's pixel maths (src/crm/brand/logoBackground.ts), on pictures drawn here
 * (no canvas). Edges are drawn smoothed (4 x 4 samples per pixel), as a real logo's are, so the "no white
 * fringe on dark" checks mean something.
 */
import { describe, expect, it } from 'vitest';

import {
  BORDER_SHARE,
  CORNER_SHARE,
  backgroundWord,
  cleanLogo,
  findBackground,
  removeBackground,
  unmix,
  type Pixels,
  type Rgb,
} from '../../src/crm/brand/logoBackground';

type Rgba = [number, number, number, number];

function canvas(width: number, height: number, fill: Rgba): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) data.set(fill, p * 4);
  return { data, width, height };
}

/** Paint `colour` where `inside(x, y)` holds, blending each pixel by how much of it is inside (smoothed edges). */
function paint(img: Pixels, colour: Rgba, inside: (x: number, y: number) => boolean) {
  const { data, width, height } = img;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy += 1) for (let sx = 0; sx < 4; sx += 1) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits += 1;
      if (!hits) continue;
      const a = (hits / 16) * (colour[3] / 255);
      const i = (y * width + x) * 4;
      const under = data[i + 3] / 255;
      const outA = a + under * (1 - a);
      for (let c = 0; c < 3; c += 1) data[i + c] = outA ? Math.round((colour[c] * a + data[i + c] * under * (1 - a)) / outA) : 0;
      data[i + 3] = Math.round(outA * 255);
    }
  }
}

const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;

const at = (img: Pixels, x: number, y: number): Rgba => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

/** A small, repeatable random number source. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WHITE: Rgba = [255, 255, 255, 255];
const NAVY: Rgba = [20, 40, 110, 255];
const RED: Rgba = [224, 48, 30, 255];

/** The picture as it looks on a black screen: the brightest channel of each pixel. */
const onBlack = (px: Rgba) => (Math.max(px[0], px[1], px[2]) * px[3]) / 255;

function cleaned(img: Pixels) {
  const r = cleanLogo(img);
  if (r.kind !== 'cleaned') throw new Error(`expected a cleaned logo, got ${JSON.stringify(r)}`);
  return r;
}

describe('a logo on a white background', () => {
  const img = canvas(100, 100, WHITE);
  paint(img, NAVY, disc(50, 50, 30));
  paint(img, RED, rect(42, 42, 58, 58));

  it('finds the white background and takes it off, trimmed with a small even padding', () => {
    const r = cleaned(img);
    expect(r.colour).toEqual([255, 255, 255]);
    expect(backgroundWord(r.colour)).toBe('white');
    // The disc is 60 px wide: trimmed to it, plus 2 px (4% of 60) on each side, plus its smoothed edge.
    expect(r.pixels.width).toBeGreaterThanOrEqual(62);
    expect(r.pixels.width).toBeLessThanOrEqual(66);
    expect(r.pixels.height).toBe(r.pixels.width);
    expect(at(r.pixels, 0, 0)[3]).toBe(0);
    expect(at(r.pixels, r.pixels.width - 1, r.pixels.height - 1)[3]).toBe(0);
    const mid = Math.floor(r.pixels.width / 2);
    expect(at(r.pixels, mid, mid)).toEqual(RED);
    expect(at(r.pixels, mid, 6)).toEqual(NAVY);
  });

  it('leaves no white fringe: on a black screen, no pixel outside the red mark is brighter than the navy', () => {
    const r = cleaned(img);
    const { width, height } = r.pixels;
    const c = width / 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.abs(x + 0.5 - c) < 12 && Math.abs(y + 0.5 - c) < 12) continue; // the red mark
        expect(onBlack(at(r.pixels, x, y)), `pixel ${x},${y}`).toBeLessThanOrEqual(NAVY[2] + 2);
      }
    }
    // Without the un-mixing, the smoothed edge would have shown as a light ring: the test above can fail.
    let light = 0;
    for (let p = 0; p < 100 * 100; p += 1) {
      const v = onBlack(at(img, p % 100, Math.floor(p / 100)));
      if (v > NAVY[2] + 40 && v < 250) light += 1;
    }
    expect(light).toBeGreaterThan(20);
  });

  it('keeps the smoothed edge smooth (partly see-through pixels, not a hard cut-out)', () => {
    const r = cleaned(img);
    const alphas = new Set<number>();
    for (let p = 0; p < r.pixels.width * r.pixels.height; p += 1) alphas.add(r.pixels.data[p * 4 + 3]);
    expect([...alphas].filter((a) => a > 0 && a < 255).length).toBeGreaterThan(5);
  });
});

it('takes off a plain coloured background and keeps a white disc on it', () => {
  const BLUE: Rgba = [30, 90, 200, 255];
  const img = canvas(90, 90, BLUE);
  paint(img, WHITE, disc(45, 45, 28));
  paint(img, [250, 210, 20, 255], rect(30, 40, 60, 50));
  const r = cleaned(img);
  expect(r.colour).toEqual([30, 90, 200]);
  expect(backgroundWord(r.colour)).toBe('coloured');
  const mid = Math.floor(r.pixels.width / 2);
  expect(at(r.pixels, mid, 6)).toEqual(WHITE);
  expect(at(r.pixels, 0, 0)[3]).toBe(0);
});

it('keeps white letters and shapes inside the logo that do not touch the outside', () => {
  const img = canvas(100, 100, WHITE);
  // A ring: a black disc with a white middle (the hole of an "O"), and a white bar inside a black square.
  paint(img, [0, 0, 0, 255], disc(30, 50, 20));
  paint(img, WHITE, disc(30, 50, 12));
  paint(img, [0, 0, 0, 255], rect(60, 30, 90, 70));
  paint(img, WHITE, rect(66, 45, 84, 55));
  const { data } = removeBackground(img, [255, 255, 255]);
  const out = { data, width: 100, height: 100 };
  expect(at(out, 30, 50)).toEqual(WHITE); // the middle of the "O"
  expect(at(out, 75, 50)).toEqual(WHITE); // the white bar
  expect(at(out, 2, 2)[3]).toBe(0); // the outside
  expect(at(out, 50, 50)[3]).toBe(0); // between the two shapes, joined to the outside
});

it('leaves a picture that is already see-through at the border as it is', () => {
  const img = canvas(80, 80, [0, 0, 0, 0]);
  paint(img, NAVY, disc(40, 40, 30));
  expect(findBackground(img)).toEqual({ kind: 'clear' });
  expect(cleanLogo(img)).toEqual({ kind: 'kept', why: 'clear' });
});

describe('a photo or a pattern behind the logo', () => {
  it('leaves a noisy background alone', () => {
    const rnd = seeded(7);
    const img = canvas(80, 80, WHITE);
    for (let p = 0; p < 80 * 80; p += 1) img.data.set([rnd() * 255, rnd() * 255, rnd() * 255, 255], p * 4);
    paint(img, NAVY, disc(40, 40, 20));
    const v = findBackground(img);
    expect(v.kind).toBe('busy');
    expect(cleanLogo(img)).toEqual({ kind: 'kept', why: 'busy' });
  });

  it('leaves a sky-to-ground photo alone (a smooth change of colour)', () => {
    const img = canvas(80, 80, WHITE);
    for (let y = 0; y < 80; y += 1) {
      for (let x = 0; x < 80; x += 1) {
        const t = y / 79;
        img.data.set([90 + 80 * t, 160 - 60 * t, 235 - 180 * t, 255], (y * 80 + x) * 4);
      }
    }
    paint(img, WHITE, disc(40, 40, 18));
    const v = findBackground(img);
    expect(v.kind).toBe('busy');
    if (v.kind === 'busy') expect(v.share).toBeLessThan(0.5);
  });
});

it('handles JPEG-style noise in a near-white background: no specks are left behind', () => {
  const rnd = seeded(42);
  const img = canvas(100, 100, WHITE);
  // Open background up to 20 away from white, as measured on real JPEG files.
  for (let p = 0; p < 100 * 100; p += 1) {
    const n = () => 255 - Math.round(rnd() * 11);
    img.data.set([n(), n(), n(), 255], p * 4);
  }
  paint(img, RED, disc(50, 50, 25));
  const r = cleaned(img);
  expect(backgroundWord(r.colour)).toBe('white');
  const { width, height } = r.pixels;
  const c = width / 2;
  let specks = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const far = Math.hypot(x + 0.5 - c, y + 0.5 - c) > 25 + 2;
      if (far && at(r.pixels, x, y)[3] > 0) specks += 1;
    }
  }
  expect(specks).toBe(0);
  expect(at(r.pixels, Math.floor(c), Math.floor(c))).toEqual(RED);
});

describe('a thin logo that touches the border', () => {
  const img = canvas(120, 60, WHITE);
  paint(img, NAVY, rect(0, 28, 120, 32));

  it('still finds the white background (the border is still nearly all white)', () => {
    const v = findBackground(img);
    expect(v.kind).toBe('flat');
    if (v.kind === 'flat') expect(v.share).toBeGreaterThan(0.9);
  });

  it('takes off the white above and below the bar, keeps the bar, and pads it evenly', () => {
    const r = cleaned(img);
    const { width, height } = r.pixels;
    const pad = (height - 4) / 2;
    expect(pad).toBeGreaterThanOrEqual(2);
    expect(width).toBe(120 + pad * 2);
    expect(at(r.pixels, pad + 60, pad + 1)).toEqual(NAVY);
    expect(at(r.pixels, pad + 60, 0)[3]).toBe(0);
    expect(at(r.pixels, pad + 60, height - 1)[3]).toBe(0);
  });
});

it('a round badge cut exactly to its square (white corners only) still counts as a plain background', () => {
  const img = canvas(100, 100, WHITE);
  paint(img, NAVY, disc(50, 50, 50));
  const v = findBackground(img);
  expect(v.kind).toBe('flat');
  if (v.kind === 'flat') {
    // Below BORDER_SHARE: the four matching corners decide it (CORNER_SHARE).
    expect(v.share).toBeLessThan(BORDER_SHARE);
    expect(v.share).toBeGreaterThanOrEqual(CORNER_SHARE);
  }
  const r = cleaned(img);
  expect(at(r.pixels, 0, 0)[3]).toBe(0);
  const mid = Math.floor(r.pixels.width / 2);
  expect(at(r.pixels, mid, mid)).toEqual(NAVY);
});


describe('un-mixing an edge pixel from the background', () => {
  it('half red over white is red at half strength', () => {
    const r = unmix(255, 128, 128, [255, 255, 255] as Rgb);
    expect(r.alpha).toBeCloseTo(127 / 255, 3);
    expect(r.rgb).toEqual([255, 0, 0]);
  });

  it('the background colour itself is fully see-through, and a far colour stays solid', () => {
    expect(unmix(30, 90, 200, [30, 90, 200]).alpha).toBe(0);
    expect(unmix(0, 0, 0, [255, 255, 255]).alpha).toBe(1);
  });
});
