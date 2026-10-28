/**
 * The gym's brand colour, read from its logo — no AI (owner R-160, 28 Oct 2026).
 *
 * In: the logo's pixels (RGBA bytes, as a canvas's getImageData gives them; the panel draws the
 * logo at about 64 px first, so this is a few thousand pixels).
 * Out: the logo's main colours, strongest first, and ONE suggestion the owner can take or change.
 *
 * How:
 *  1. Quantise: every opaque pixel (alpha >= 128) falls into a 5-bit-per-channel box (32,768 boxes).
 *  2. Throw away what is not a brand colour: near white (OKLCH L > 0.93), near black (L < 0.17)
 *     and greys (chroma < 0.04) — the logo's paper, outline and shadow.
 *  3. Merge boxes that look alike (OKLab distance < 12, about a "same colour" step), biggest
 *     first, so the anti-aliased edge of a red letter joins the red, not a colour of its own.
 *  4. Score each colour by its share of the logo, with a vivid colour counted up to 1.5x a dull
 *     one (a small red mark beats a large brownish area). Colours under 2 % of the logo are noise.
 *  5. The suggestion is the top colour, moved in LIGHTNESS only (hue kept) exactly as the shared
 *     palette engine moves it for the member app's dark screens, so text and buttons in it pass
 *     WCAG AA (4.5 : 1) there. It is also measured on white (the printed member card and light
 *     screens: a coloured bar, 3 : 1 for a shape, WCAG 1.4.11) and the words drawn ON it.
 *
 * PURE and deterministic: the same pixels give the same answer.
 */

import { buildBrandPalette, contrastRatio, deltaE, hexToOklch, rgbToHex, type Rgb } from './brand';

export interface LogoColour {
  /** The colour as the logo has it ('#RRGGBB', the average of the pixels it stands for). */
  hex: string;
  /** Its share of the logo's coloured (non white / black / grey) pixels, 0–1. */
  share: number;
}

export interface LogoSuggestion {
  /** The logo's own colour. */
  fromLogo: string;
  /** What we suggest: the logo's colour, made lighter only if text in it would be hard to read. */
  suggested: string;
  /** `suggested` differs from `fromLogo`. */
  adjusted: boolean;
  /** Text in the colour on the member app's darkest-to-lightest backgrounds (needs 4.5). */
  darkRatio: number;
  darkOk: boolean;
  /** The colour as a shape on white: the printed member card's bar, light screens (needs 3). */
  lightRatio: number;
  lightOk: boolean;
  /** The words drawn on the colour (black or white, whichever reads better; needs 4.5). */
  onColour: '#0A0A0A' | '#FFFFFF';
  onColourRatio: number;
}

/** Pixels lighter than this (OKLCH L) are the logo's white paper. */
const WHITE_L = 0.93;
/** Pixels darker than this are its black outline or shadow. */
const BLACK_L = 0.17;
/** Pixels with less chroma than this are grey. */
const GREY_C = 0.04;
/** Two colours closer than this (OKLab x100) are the same colour. */
const SAME = 12;
/** A colour smaller than this share of the logo is noise (anti-aliasing, a stray dot). */
const MIN_SHARE = 0.02;

interface Box {
  n: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The logo's main colours, strongest first (at most `max`). Empty when the logo is only white,
 * black and grey (or see-through). PURE.
 */
export function logoColours(rgba: ArrayLike<number>, max = 4): LogoColour[] {
  const boxes = new Map<number, Box>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const box = boxes.get(key);
    if (box) {
      box.n += 1;
      box.r += r;
      box.g += g;
      box.b += b;
    } else boxes.set(key, { n: 1, r, g, b });
  }

  // Keep the coloured boxes, biggest first (ties: by key, so the order never depends on the Map).
  const coloured: { box: Box; hex: string; key: number }[] = [];
  for (const [key, box] of boxes) {
    const hex = rgbToHex([box.r / box.n, box.g / box.n, box.b / box.n] as Rgb);
    const { L, C } = hexToOklch(hex);
    if (L > WHITE_L || L < BLACK_L || C < GREY_C) continue;
    coloured.push({ box, hex, key });
  }
  coloured.sort((a, b) => b.box.n - a.box.n || a.key - b.key);
  const total = coloured.reduce((s, c) => s + c.box.n, 0);
  if (total === 0) return [];

  // Merge look-alikes into the biggest colour near them.
  const groups: { seed: string; sum: Box }[] = [];
  for (const c of coloured) {
    const home = groups.find((g) => deltaE(g.seed, c.hex) < SAME);
    if (home) {
      home.sum.n += c.box.n;
      home.sum.r += c.box.r;
      home.sum.g += c.box.g;
      home.sum.b += c.box.b;
    } else groups.push({ seed: c.hex, sum: { ...c.box } });
  }

  return groups
    .map((g) => {
      const hex = rgbToHex([g.sum.r / g.sum.n, g.sum.g / g.sum.n, g.sum.b / g.sum.n] as Rgb);
      const share = g.sum.n / total;
      const vivid = Math.min(1, hexToOklch(hex).C / 0.2);
      return { hex, share, score: share * (1 + 0.5 * vivid) };
    })
    .filter((g) => g.share >= MIN_SHARE)
    .sort((a, b) => b.score - a.score || (a.hex < b.hex ? -1 : 1))
    .slice(0, Math.max(0, max))
    .map(({ hex, share }) => ({ hex, share: Math.round(share * 1000) / 1000 }));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The colour we suggest for a logo colour, with how it reads in the dark member app and on white.
 * PURE.
 */
export function suggestBrandColour(fromLogo: string): LogoSuggestion {
  const palette = buildBrandPalette({ accent: fromLogo });
  const suggested = palette.color.accent;
  const textChecks = palette.checks.filter((c) => c.id.startsWith('accent-on-'));
  const darkRatio = Math.min(...textChecks.map((c) => c.ratio));
  const lightRatio = contrastRatio(suggested, '#FFFFFF');
  const onColour = palette.color.onAccent === '#FFFFFF' ? '#FFFFFF' : '#0A0A0A';
  const onColourRatio = contrastRatio(onColour, suggested);
  return {
    fromLogo: fromLogo.toUpperCase(),
    suggested,
    adjusted: suggested !== fromLogo.toUpperCase(),
    darkRatio: r2(darkRatio),
    darkOk: palette.ok,
    lightRatio: r2(lightRatio),
    lightOk: lightRatio >= 3,
    onColour,
    onColourRatio: r2(onColourRatio),
  };
}

/** The logo's suggestion in one step: null when the logo has no colour (black, white, grey). PURE. */
export function suggestFromLogo(rgba: ArrayLike<number>): { colours: LogoColour[]; suggestion: LogoSuggestion | null } {
  const colours = logoColours(rgba);
  return { colours, suggestion: colours.length > 0 ? suggestBrandColour(colours[0].hex) : null };
}
