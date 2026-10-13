/**
 * Gym branding, Level 1 — the palette engine. ONE pure function shared by the member app (which
 * repaints itself in the gym's colours) and the owner panel (which previews them and shows the
 * readability checks before Save), so the preview is exactly what members get.
 *
 * In: one brand colour (hex) and, optionally, a background tone (hex).
 * Out: every colour the phone's theme tokens hold (apps/mobile/src/theme/tokens.ts) — accent and
 * its shades, the text colour on it, chart series slot 0 and the sequential ramp, the focus ring,
 * and, from the tone, the page / card / sheet / well planes and chart lines — plus the WCAG
 * checks on every pair the app draws, and any nudge made to pass them.
 *
 * Rules (docs/DESIGN-LANGUAGE.md, "Colour and contrast"):
 *  - text and icons in the accent: >= 4.5:1 on every plane (page, card, sheet, well, glass);
 *  - text ON the accent (onAccent): >= 4.5:1; the primary button's frozen dark ink (#1F0D05)
 *    on both stops of the button gradient: >= 4.5:1;
 *  - every grey text colour (ink … inkFaint): >= 4.5:1 on every plane;
 *  - text in the accent on its own light tint (accentSoft: selected chips, tinted pills) laid over
 *    the page, a card and a sheet: >= 4.5:1;
 *  - chart marks (series slot 0) and the deep accent: >= 3:1 on a card (non-text UI);
 *  - a switch that is on (bright knob on the deep track): >= 1.5:1, about ForgeAI's own 1.65.
 * A colour that fails is moved in LIGHTNESS only (hue kept, chroma clipped to sRGB) until it
 * passes, and the move is reported in plain words. Every check is made on the colours exactly as
 * they come out (rounded to hex), never on the unrounded lightness the search tried.
 *
 * ForgeAI's own ember with ForgeAI's own page (a gym that only uploads a logo) is ForgeAI's
 * HAND-TUNED palette, not the engine's reading of it.
 *
 * Colour maths: OKLab/OKLCH (perceptual lightness, so "lighten" keeps the hue) and WCAG 2.x
 * relative luminance for the ratios. Deterministic: same input, same output, no randomness.
 */

import { color as sharedColor } from './palette';

// ------------------------------------------------------------------ types

export type HeadingStyle = 'normal' | 'bold-italic';

/** A gym's brand as the server keeps it (supabase/migrations/0005_gym_theme.sql). */
export interface GymBrand {
  /** '#RRGGBB' or null (no brand colour: ForgeAI's ember stays). */
  accent: string | null;
  /** '#RRGGBB' or null (ForgeAI's planes stay). */
  bg: string | null;
  /** Public https URL of the logo (a file in the gym-logos bucket: see `logoUrlOf`), or null. */
  logoUrl: string | null;
  heading: HeadingStyle;
  /** ISO time the owner last saved it, or null. */
  updatedAt: string | null;
}

export interface BrandInput {
  accent: string;
  bg?: string | null;
}

export interface BrandCheck {
  id: string;
  /** Plain words for the panel: what sits on what. */
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  /** 4.5 for text, 3 for marks and controls. */
  min: number;
  pass: boolean;
}

export interface BrandNudge {
  what: 'accent' | 'background' | 'button' | 'chart';
  from: string;
  to: string;
  /** Plain words for the panel. */
  words: string;
}

export interface BrandPalette {
  color: {
    bg: string;
    surface: string;
    surfaceRaised: string;
    surfaceSunken: string;
    glass: string;
    accent: string;
    accentBright: string;
    accentDeep: string;
    accentSoft: string;
    onAccent: string;
    focusRing: string;
    grid: string;
    axis: string;
  };
  gradients: {
    ember: [string, string];
    emberSubtle: [string, string];
    steel: [string, string];
    backdrop: [string, string];
  };
  /** shadow.glow's colour. */
  glow: string;
  chart: {
    series: [string, string, string, string, string];
    ramp: [string, string, string, string, string, string];
    diverging: { neg: string; mid: string; pos: string };
  };
  checks: BrandCheck[];
  nudges: BrandNudge[];
  /** Every check passes (always true after nudging, unless a colour is impossible). */
  ok: boolean;
}

// ------------------------------------------------------------------ ForgeAI's own look (the reference bands)

/**
 * The phone's planes as tokens.ts has them. The derived planes keep these lightness steps
 * (page → well → card → sheet) relative to the gym's tone. Parity with the app's tokens is
 * asserted in apps/mobile/test/theme/brandParity.test.ts.
 */
export const FORGE_PLANES = {
  bg: sharedColor.bg,
  surface: sharedColor.surface,
  surfaceRaised: sharedColor.surfaceRaised,
  surfaceSunken: sharedColor.surfaceSunken,
  steelTop: '#1C2130',
  backdropTop: '#12101C',
  grid: sharedColor.grid,
  axis: sharedColor.axis,
} as const;

/** The phone's text greys (mobile overrides of the shared two lower greys). */
export const PHONE_INK = {
  ink: '#F4F5F7',
  inkSecondary: '#A9AFBD',
  inkMuted: '#9097A8',
  inkFaint: '#82899B',
} as const;

/** The primary button's text colour — hard-coded in a frozen component, so the fill must suit it. */
export const BUTTON_INK = '#1F0D05';

/** The CVD-validated chart slots (apps/mobile tokens `chart.series`), in their fixed order. */
export const FORGE_SERIES = ['#E8641F', '#3987E5', '#19A97A', '#9085E9', '#C98500'] as const;
const FORGE_RAMP = ['#1A1510', '#4A2C15', '#7C4218', '#B4571B', '#E8641F', '#FF8B4A'] as const;
const DIVERGING_MID = '#383E4E';
const GLASS_ALPHA = 0.72;
/** accentSoft: the accent's see-through tint behind accent text (chips, pills). */
const SOFT_ALPHA = 0.14;
/** A switch that is on: its bright knob against its deep track. */
const SWITCH_MIN = 1.5;

/** ForgeAI's own accent ("forge" ember). */
export const FORGE_ACCENT = sharedColor.accent;

/**
 * ForgeAI's hand-tuned look, exactly as the phone's tokens hold it (apps/mobile/src/theme/
 * tokens.ts; parity asserted in apps/mobile/test/theme/brandParity.test.ts). The engine returns
 * this for ForgeAI's own ember on ForgeAI's own page, so a gym that only uploads a logo keeps
 * ForgeAI's colours to the last shade.
 */
const FORGE_LOOK = {
  color: {
    accentBright: sharedColor.accentBright,
    accentDeep: sharedColor.accentDeep,
    accentSoft: sharedColor.accentSoft,
    focusRing: sharedColor.accentBright,
  },
  ember: ['#FF8B4A', '#F0570F'] as [string, string],
  emberSubtle: ['rgba(255, 122, 59, 0.16)', 'rgba(255, 122, 59, 0.02)'] as [string, string],
  diverging: { neg: FORGE_SERIES[1], mid: DIVERGING_MID, pos: FORGE_SERIES[0] },
};

const NEAR_BLACK = '#0A0A0A';
const WHITE = '#FFFFFF';

// ------------------------------------------------------------------ hex and contrast

export type Rgb = [number, number, number];

const HEX6 = /^#?([0-9a-fA-F]{6})$/;
const HEX3 = /^#?([0-9a-fA-F]{3})$/;

/** '#f7d411', 'F7D411' or '#fd1' → '#F7D411'; null when it is not a colour. PURE. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const m6 = HEX6.exec(s);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = HEX3.exec(s);
  if (m3) return `#${m3[1].split('').map((c) => c + c).join('').toUpperCase()}`;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`not a colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** '#RRGGBB' or 'rgba(r, g, b, a)' → rgb + alpha. */
function parseAny(c: string): { rgb: Rgb; a: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c.trim());
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] == null ? 1 : Number(m[4]) };
  return { rgb: hexToRgb(c), a: 1 };
}

/** A see-through colour laid over an opaque one, as the screen shows it. */
export function over(top: string, base: string): string {
  const t = parseAny(top);
  const b = parseAny(base).rgb;
  return rgbToHex(t.rgb.map((v, i) => v * t.a + b[i] * (1 - t.a)) as Rgb);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG 2.x relative luminance. */
export function luminance(c: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseAny(c).rgb;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ------------------------------------------------------------------ OKLab / OKLCH

interface Lch {
  L: number;
  C: number;
  h: number;
}

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Lch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = C < 1e-9 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

/** Linear sRGB (may be out of 0–1) for an OKLCH colour. */
function oklchToLinear({ L, C, h }: Lch): [number, number, number] {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: [number, number, number]) => c.every((v) => v >= -1e-5 && v <= 1 + 1e-5);

/** OKLCH → hex, keeping L and h and lowering chroma until the colour fits sRGB. */
export function oklchToHex(lch: Lch): string {
  const L = Math.max(0, Math.min(1, lch.L));
  let C = Math.max(0, lch.C);
  if (!inGamut(oklchToLinear({ L, C, h: lch.h }))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ L, C: mid, h: lch.h }))) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  const lin = oklchToLinear({ L, C, h: lch.h });
  return rgbToHex(lin.map((v) => fromLinear(Math.max(0, Math.min(1, v))) * 255) as Rgb);
}

/** Perceptual distance (OKLab, x100 — about the scale of CIE ΔE). */
export function deltaE(a: string, b: string): number {
  const p = hexToOklch(a);
  const q = hexToOklch(b);
  const pa = p.C * Math.cos((p.h * Math.PI) / 180);
  const pb = p.C * Math.sin((p.h * Math.PI) / 180);
  const qa = q.C * Math.cos((q.h * Math.PI) / 180);
  const qb = q.C * Math.sin((q.h * Math.PI) / 180);
  return 100 * Math.hypot(p.L - q.L, pa - qa, pb - qb);
}

const withL = (c: Lch, L: number): string => oklchToHex({ ...c, L });

// ------------------------------------------------------------------ planes from the background tone

type PlaneKey = keyof typeof FORGE_PLANES;
const PLANE_KEYS = Object.keys(FORGE_PLANES) as PlaneKey[];
/** The lightest the page plane may start from (a dark app stays dark), and the darkest. */
const TONE_MAX_L = 0.3;
const TONE_MIN_L = 0.1;

/**
 * Every plane from the page tone. `step` scales ForgeAI's lightness steps above the page (1 = the
 * same steps; less = the cards and sheets sit closer to the page, which keeps grey text readable
 * on a lighter page without moving the page colour the owner picked).
 */
function planesFromTone(tone: Lch, step = 1): Record<PlaneKey, string> {
  const base = hexToOklch(FORGE_PLANES.bg);
  const out = {} as Record<PlaneKey, string>;
  for (const k of PLANE_KEYS) {
    const d = hexToOklch(FORGE_PLANES[k]);
    // Same lightness step above the page as ForgeAI's own planes; chroma grows with the step in
    // proportion to the tone's own (a neutral tone stays neutral); hue keeps ForgeAI's offset.
    const ratio = base.C > 1e-4 ? d.C / base.C : 1;
    out[k] = oklchToHex({
      L: tone.L + (d.L - base.L) * step,
      C: Math.min(0.08, tone.C * ratio),
      h: tone.C < 0.002 ? d.h : (tone.h + (d.h - base.h) + 360) % 360,
    });
  }
  return out;
}

/** The planes text sits on, as the screen shows them (glass composited over the page). */
function textPlanes(p: Record<PlaneKey, string>): Record<string, string> {
  return {
    page: p.bg,
    card: p.surface,
    sheet: p.surfaceRaised,
    well: p.surfaceSunken,
    glass: over(rgba(p.surfaceRaised, GLASS_ALPHA), p.bg),
    'hero card': p.steelTop,
  };
}

const minOver = (fg: string, planes: Record<string, string>) =>
  Math.min(...Object.values(planes).map((b) => contrastRatio(fg, b)));

/** Each plane with the accent's own tint (accentSoft) laid over it, as a selected chip shows it. */
function onSoft(accent: string, planes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(planes).map(([k, p]) => [k, over(rgba(accent, SOFT_ALPHA), p)]));
}

function greysPass(p: Record<PlaneKey, string>): boolean {
  const planes = textPlanes(p);
  return Object.values(PHONE_INK).every((ink) => minOver(ink, planes) >= 4.5);
}

// ------------------------------------------------------------------ the engine

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The gym's full palette from one brand colour (+ optional background tone). PURE and
 * deterministic. Throws only when `accent` (or a given `bg`) is not a hex colour — callers
 * validate with normalizeHex first.
 */
export function buildBrandPalette(input: BrandInput): BrandPalette {
  const brandHex = normalizeHex(input.accent);
  if (!brandHex) throw new Error(`not a colour: ${input.accent}`);
  const toneHex = input.bg == null || input.bg === '' ? null : normalizeHex(input.bg);
  if (input.bg != null && input.bg !== '' && !toneHex) throw new Error(`not a colour: ${input.bg}`);
  // ForgeAI's own ember on ForgeAI's own page: ForgeAI's hand-tuned look, not a derivation of it
  // (a gym that only uploads a logo would otherwise get #FF9C72 shades ForgeAI never had).
  if (brandHex === FORGE_ACCENT && (toneHex == null || toneHex === FORGE_PLANES.bg)) return forgePalette();
  const nudges: BrandNudge[] = [];

  // 1. Planes: ForgeAI's own, or stepped up from the gym's tone (darkened until grey text reads).
  let planes: Record<PlaneKey, string> = { ...FORGE_PLANES };
  if (toneHex) {
    const tone = hexToOklch(toneHex);
    // A dark app stays dark (a light tone is brought down), and a pure black page is lifted just
    // enough that cards still stand apart from it.
    let L = Math.max(TONE_MIN_L, Math.min(tone.L, TONE_MAX_L));
    // First bring the cards and sheets closer to the page (down to 60 % of ForgeAI's steps);
    // only if that is not enough is the page itself darkened.
    let step = 1;
    planes = planesFromTone({ ...tone, L }, step);
    while (!greysPass(planes) && step > 0.6) {
      step = Math.round((step - 0.05) * 100) / 100;
      planes = planesFromTone({ ...tone, L }, step);
    }
    for (let i = 0; i < 60 && !greysPass(planes) && L > 0; i += 1) {
      L = Math.max(0, L - 0.01);
      planes = planesFromTone({ ...tone, L }, step);
    }
    // The page plane IS the tone the owner picked whenever it already passes.
    if (L === tone.L) planes.bg = toneHex;
    if (planes.bg !== toneHex) {
      nudges.push({
        what: 'background',
        from: toneHex,
        to: planes.bg,
        words:
          luminance(planes.bg) < luminance(toneHex)
            ? `Your background ${toneHex} was darkened to ${planes.bg} so grey text on it stays readable.`
            : `Your background ${toneHex} was lifted to ${planes.bg} so cards still stand out from the page.`,
      });
    }
  }
  const planeSet = textPlanes(planes);

  // 2. Accent: lightened (hue kept) until text in it reads on every plane and on its own tint,
  //    and the primary button's dark ink reads on both stops of its gradient.
  const brand = hexToOklch(brandHex);
  // The button gradient: a little lighter and a little darker than the accent. Near white the
  // light end runs out of room (it stops at 0.97), so the dark end keeps the 0.08 step below it
  // — a white accent still gets a visible sweep, not a flat fill.
  const emberFor = (L: number): [string, string] => {
    const top = Math.min(0.97, L + 0.05);
    return [withL(brand, top), withL(brand, Math.min(L - 0.03, top - 0.08))];
  };
  const softPlanes = { page: planes.bg, card: planes.surface, sheet: planes.surfaceRaised };
  const accentAt = (L: number) => (L === brand.L ? brandHex : withL(brand, L));
  const accentOk = (L: number) => {
    const a = accentAt(L);
    if (minOver(a, planeSet) < 4.5) return false;
    if (minOver(a, onSoft(a, softPlanes)) < 4.5) return false;
    // D10: the gradient exactly as it will be drawn — from the ROUNDED accent's own lightness
    // (checking the unrounded `L` let a stop land at 4.44:1 once rounded).
    return emberFor(hexToOklch(a).L).every((stop) => contrastRatio(BUTTON_INK, stop) >= 4.5);
  };
  let aL = brand.L;
  for (let i = 0; i < 100 && !accentOk(aL) && aL < 0.98; i += 1) aL = Math.min(0.98, aL + 0.01);
  const accent = accentAt(aL);
  if (accent !== brandHex) {
    nudges.push({
      what: 'accent',
      from: brandHex,
      to: accent,
      words: `Your colour ${brandHex} was lightened to ${accent} so text and buttons in it stay readable on the dark background.`,
    });
  }
  const acc = hexToOklch(accent);
  // "Bright" is never darker than the accent itself (a white accent: white, not a grey).
  const accentBright = withL(acc, Math.max(acc.L, Math.min(0.96, acc.L + 0.06)));
  // "Deep": a step below, dark enough that a switch's bright knob shows on it (near white the
  // usual step is not), yet still a mark on a card.
  let deepL = acc.L - 0.07;
  while (contrastRatio(accentBright, withL(acc, deepL)) < SWITCH_MIN && deepL > 0) deepL -= 0.01;
  while (contrastRatio(withL(acc, deepL), planes.surface) < 3 && deepL < acc.L) deepL += 0.01;
  const accentDeep = withL(acc, Math.min(acc.L, deepL));
  const ember = emberFor(acc.L);
  const onAccent = contrastRatio(NEAR_BLACK, accent) >= contrastRatio(WHITE, accent) ? NEAR_BLACK : WHITE;

  // 3. Chart: slot 0 is the brand (a mid lightness that reads as a mark on a card); a later slot
  //    the brand would be confused with takes ForgeAI's ember instead (order otherwise kept).
  let sL = Math.max(0.6, Math.min(0.8, acc.L));
  while (contrastRatio(withL(acc, sL), planes.surface) < 3 && sL < 0.98) sL += 0.01;
  const series0 = withL(acc, sL);
  const series = [...FORGE_SERIES] as [string, string, string, string, string];
  series[0] = series0;
  let swapped: string | null = null;
  for (let i = 1; i < series.length; i += 1) {
    if (deltaE(series0, series[i]) < 15 && deltaE(series0, FORGE_SERIES[0]) >= 15) {
      swapped = series[i];
      series[i] = FORGE_SERIES[0];
      break;
    }
  }
  if (swapped) {
    nudges.push({
      what: 'chart',
      from: swapped,
      to: FORGE_SERIES[0],
      words: "In charts with several lines, the line that looked too much like your colour is drawn in orange instead.",
    });
  }
  const ramp = FORGE_RAMP.map((stop, i) => {
    const d = hexToOklch(stop);
    const peak = hexToOklch(FORGE_RAMP[4]);
    const L = i <= 3 ? d.L : i === 4 ? sL : Math.min(0.95, Math.max(d.L, sL + 0.08));
    return oklchToHex({ L, C: acc.C * (d.C / peak.C), h: acc.h });
  }) as [string, string, string, string, string, string];

  const palette: BrandPalette = {
    color: {
      bg: planes.bg,
      surface: planes.surface,
      surfaceRaised: planes.surfaceRaised,
      surfaceSunken: planes.surfaceSunken,
      glass: rgba(planes.surfaceRaised, GLASS_ALPHA),
      accent,
      accentBright,
      accentDeep,
      accentSoft: rgba(accent, SOFT_ALPHA),
      onAccent,
      focusRing: accentBright,
      grid: planes.grid,
      axis: planes.axis,
    },
    gradients: {
      ember,
      emberSubtle: [rgba(accent, 0.16), rgba(accent, 0.02)],
      steel: [planes.steelTop, planes.surface],
      backdrop: [planes.backdropTop, planes.bg],
    },
    glow: accent,
    chart: {
      series,
      ramp,
      diverging: { neg: series[1], mid: DIVERGING_MID, pos: series0 },
    },
    checks: [],
    nudges,
    ok: true,
  };
  palette.checks = brandChecks(palette);
  palette.ok = palette.checks.every((c) => c.pass);
  return palette;
}

/** Every pair the app draws in the gym's colours, measured. PURE. */
export function brandChecks(p: BrandPalette): BrandCheck[] {
  const planes: Record<string, string> = {
    page: p.color.bg,
    card: p.color.surface,
    sheet: p.color.surfaceRaised,
    well: p.color.surfaceSunken,
    glass: over(p.color.glass, p.color.bg),
    'hero card': p.gradients.steel[0],
  };
  const checks: BrandCheck[] = [];
  const add = (id: string, label: string, fg: string, bg: string, min: number) => {
    const ratio = contrastRatio(fg, bg);
    checks.push({ id, label, fg, bg, ratio: r2(ratio), min, pass: ratio >= min });
  };
  for (const [name, plane] of Object.entries(planes)) {
    add(`accent-on-${name}`, `Text in your colour on the ${name}`, p.color.accent, plane, 4.5);
  }
  // Selected chips and tinted pills: text in the colour on its own light tint.
  for (const [name, plane] of Object.entries({ page: planes.page, card: planes.card, sheet: planes.sheet })) {
    add(`accent-on-soft-${name}`, `Text in your colour on its own tint (on the ${name})`, p.color.accent, over(p.color.accentSoft, plane), 4.5);
  }
  add('on-accent', 'Text on your colour', p.color.onAccent, p.color.accent, 4.5);
  add('button-top', 'Button words on the button (light end)', BUTTON_INK, p.gradients.ember[0], 4.5);
  add('button-bottom', 'Button words on the button (dark end)', BUTTON_INK, p.gradients.ember[1], 4.5);
  for (const [inkName, ink] of Object.entries(PHONE_INK)) {
    for (const [name, plane] of Object.entries(planes)) {
      add(`${inkName}-on-${name}`, `Grey text (${inkName}) on the ${name}`, ink, plane, 4.5);
    }
  }
  add('chart-on-card', 'Chart line on a card', p.chart.series[0], p.color.surface, 3);
  add('deep-on-card', 'Dark shade of your colour on a card', p.color.accentDeep, p.color.surface, 3);
  add('focus-on-page', 'Focus ring on the page', p.color.focusRing, p.color.bg, 3);
  add('switch-on', 'A switch that is on (knob on its track)', p.color.accentBright, p.color.accentDeep, SWITCH_MIN);
  return checks;
}

/** ForgeAI's hand-tuned palette (see FORGE_LOOK), measured like any other. PURE. */
function forgePalette(): BrandPalette {
  const palette: BrandPalette = {
    color: {
      bg: FORGE_PLANES.bg,
      surface: FORGE_PLANES.surface,
      surfaceRaised: FORGE_PLANES.surfaceRaised,
      surfaceSunken: FORGE_PLANES.surfaceSunken,
      glass: sharedColor.glass,
      accent: FORGE_ACCENT,
      ...FORGE_LOOK.color,
      onAccent: BUTTON_INK,
      grid: FORGE_PLANES.grid,
      axis: FORGE_PLANES.axis,
    },
    gradients: {
      ember: [...FORGE_LOOK.ember],
      emberSubtle: [...FORGE_LOOK.emberSubtle],
      steel: [FORGE_PLANES.steelTop, FORGE_PLANES.surface],
      backdrop: [FORGE_PLANES.backdropTop, FORGE_PLANES.bg],
    },
    glow: FORGE_ACCENT,
    chart: {
      series: [...FORGE_SERIES] as BrandPalette['chart']['series'],
      ramp: [...FORGE_RAMP] as BrandPalette['chart']['ramp'],
      diverging: { ...FORGE_LOOK.diverging },
    },
    checks: [],
    nudges: [],
    ok: true,
  };
  palette.checks = brandChecks(palette);
  palette.ok = palette.checks.every((c) => c.pass);
  return palette;
}

/**
 * The short readability report the panel shows under the colour picker: one line per thing the
 * owner can act on. PURE.
 */
export function brandReport(p: BrandPalette): string[] {
  const lines: string[] = p.nudges.map((n) => n.words);
  const worstText = Math.min(...p.checks.filter((c) => c.id.startsWith('accent-on-')).map((c) => c.ratio));
  lines.push(`Text in your colour: ${worstText.toFixed(1)} : 1 on the darkest-to-lightest backgrounds (4.5 needed).`);
  const on = p.checks.find((c) => c.id === 'on-accent');
  if (on) {
    lines.push(`Words on your colour are ${p.color.onAccent === WHITE ? 'white' : 'black'}: ${on.ratio.toFixed(1)} : 1.`);
  }
  const failing = p.checks.filter((c) => !c.pass);
  if (failing.length > 0) lines.push(`${failing.length} pair${failing.length === 1 ? '' : 's'} still hard to read: ${failing.map((c) => c.label.toLowerCase()).join('; ')}.`);
  else lines.push('Every text and button passes the readability check.');
  return lines;
}

// ------------------------------------------------------------------ the brand record

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A gym logo is a file in the public `gym-logos` bucket, in an upload-ticket folder:
 * https://<host>/storage/v1/object/public/gym-logos/<48 hex>/<name>. The server holds every row to
 * the same shape (supabase/migrations/0006_brand_logo_check.sql, which also pins the host), so
 * a link to anywhere else — a tracking pixel every member's phone would fetch — is never loaded.
 */
const LOGO_URL_RE = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/storage\/v1\/object\/public\/gym-logos\/[0-9a-f]{48}\/[A-Za-z0-9._-]{1,80}$/;

/** A logo link the app will load (see LOGO_URL_RE), at most 400 characters; else null. */
export function logoUrlOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const url = v.trim();
  if (url.length > 400 || !LOGO_URL_RE.test(url)) return null;
  return url;
}

/**
 * The `brand` object from member_join / member_me / owner_gym (camelCase, any field may be null)
 * as a GymBrand; null when nothing usable is there. PURE — the app and the panel both read it.
 */
export function parseGymBrand(raw: unknown): GymBrand | null {
  if (!isObj(raw)) return null;
  const accent = normalizeHex(raw.accent);
  const bg = normalizeHex(raw.bg);
  const logoUrl = logoUrlOf(raw.logoUrl);
  const heading: HeadingStyle = raw.heading === 'bold-italic' ? 'bold-italic' : 'normal';
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt.length > 0 ? raw.updatedAt : null;
  if (!accent && !bg && !logoUrl && heading === 'normal') return null;
  return { accent, bg, logoUrl, heading, updatedAt };
}

/**
 * The gym has a look of its own: a colour, a background tone or a logo (any may be absent: a
 * logo only; a tone only, which keeps ForgeAI's ember — the panel saves no colour while the owner
 * keeps ForgeAI's).
 */
export function isBranded(b: GymBrand | null | undefined): b is GymBrand {
  return !!b && (b.accent != null || b.bg != null || b.logoUrl != null);
}

/** Two brands that would draw the same app. */
export function sameBrand(a: GymBrand | null, b: GymBrand | null): boolean {
  if (!a || !b) return a === b;
  return a.accent === b.accent && a.bg === b.bg && a.logoUrl === b.logoUrl && a.heading === b.heading;
}
