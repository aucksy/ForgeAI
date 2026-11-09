/**
 * Gym branding (Level 1) and light/dark (9 Nov 2026): puts the right palette INTO the theme
 * tokens, and takes it out again.
 *
 * Every screen — the frozen shared pieces included — reads `color`, `gradients`, `chart` and
 * `shadow` from theme/tokens.ts while it draws. So a look is applied by changing those objects'
 * VALUES in place (the objects themselves never change) and then re-drawing the app from its root
 * (theme/gymTheme.ts bumps the root's key). The look is two things on top of each other:
 *  - the SCHEME: MettleUp's dark look (the values tokens.ts is written with, copied here when the
 *    app first loads) or its light look (tokens.ts `LIGHT`); theme/appearance.ts picks it;
 *  - the gym's palette, if any: from the one shared engine (`buildBrandPalette`, packages/theme/src/
 *    brand.ts) on the dark look, and from `lightBrandPalette` below on the light look.
 * `darkColor` / `darkChart` / `darkGradients` always get the DARK look with the gym's colours (share
 * pictures and the home-screen widgets stay dark).
 *
 * Pure apart from writing the token objects; tested in test/theme/gymTheme.test.ts and
 * test/theme/lightPalette.test.ts.
 */
import {
  buildBrandPalette,
  contrastRatio,
  deltaE,
  hexToOklch,
  oklchToHex,
  over,
  rgba,
  type BrandPalette,
  type GymBrand,
} from '@forgeai/theme';

import { chart, color, darkChart, darkColor, darkGradients, gradients, LIGHT, shadow } from './tokens';

export type Scheme = 'dark' | 'light';

interface Look {
  color: Record<string, string>;
  gradients: Record<keyof typeof gradients, string[]>;
  series: string[];
  ramp: string[];
  diverging: { neg: string; mid: string; pos: string };
  shadow: { card: Record<string, unknown>; glow: Record<string, unknown> };
}

const copyShadow = (s: typeof shadow | typeof LIGHT.shadow) => ({
  card: { ...s.card, shadowOffset: { ...s.card.shadowOffset } },
  glow: { ...s.glow, shadowOffset: { ...s.glow.shadowOffset } },
});

// MettleUp's own values, copied before any gym's palette (or the light look) can be written in.
const DEFAULT: Look = {
  color: { ...color } as Record<string, string>,
  gradients: Object.fromEntries(Object.entries(gradients).map(([k, v]) => [k, [...v]])) as Look['gradients'],
  series: [...chart.series] as string[],
  ramp: [...chart.ramp] as string[],
  diverging: { ...chart.diverging },
  shadow: copyShadow(shadow),
};

const LIGHT_LOOK: Look = {
  color: { ...LIGHT.color },
  gradients: Object.fromEntries(Object.entries(LIGHT.gradients).map(([k, v]) => [k, [...v]])) as Look['gradients'],
  series: [...LIGHT.chart.series],
  ramp: [...LIGHT.chart.ramp],
  diverging: { ...LIGHT.chart.diverging },
  shadow: copyShadow(LIGHT.shadow),
};

const BASE: Record<Scheme, Look> = { dark: DEFAULT, light: LIGHT_LOOK };

/** ForgeAI's own accent (a gym with only a background tone keeps it). */
export const FORGE_ACCENT = DEFAULT.color.accent;

let scheme: Scheme = 'dark';
let applied: GymBrand | null = null;
let appliedPalette: BrandPalette | null = null;

/** Copy array values into an existing array (frozen code may hold the array itself). */
function fill(target: readonly string[], values: readonly string[]): void {
  const t = target as string[];
  for (let i = 0; i < t.length && i < values.length; i += 1) t[i] = values[i];
}

/** Write a whole look into the live token objects. */
function writeLook(look: Look): void {
  Object.assign(color as unknown as Record<string, string>, look.color);
  for (const k of Object.keys(look.gradients) as (keyof typeof gradients)[]) fill(gradients[k], look.gradients[k]);
  fill(chart.series, look.series);
  fill(chart.ramp, look.ramp);
  Object.assign(chart.diverging as unknown as Record<string, string>, look.diverging);
  for (const k of ['card', 'glow'] as const) {
    const s = shadow[k] as unknown as Record<string, unknown>;
    const v = look.shadow[k];
    const { shadowOffset, ...rest } = v;
    Object.assign(s, rest);
    // The offset object itself stays (a frozen component may hold it); only its numbers change.
    Object.assign(s.shadowOffset as Record<string, number>, shadowOffset as Record<string, number>);
  }
}

/** A brand palette over a base look (only the keys the palette owns; ink greys and status stay). */
function withPalette(base: Look, p: BrandPalette | null): Look {
  if (!p) return base;
  return {
    color: { ...base.color, ...p.color },
    gradients: {
      ember: [...p.gradients.ember],
      emberSubtle: [...p.gradients.emberSubtle],
      steel: [...p.gradients.steel],
      backdrop: [...p.gradients.backdrop],
    },
    series: [...p.chart.series],
    ramp: [...p.chart.ramp],
    diverging: { ...p.chart.diverging },
    shadow: { card: base.shadow.card, glow: { ...base.shadow.glow, shadowColor: p.glow } },
  };
}

// ------------------------------------------------------------------ the gym's colours on the light look

/** The planes text sits on in the light look (glass laid over the page). */
function lightPlanes(): Record<string, string> {
  const c = LIGHT.color;
  return {
    page: c.bg,
    card: c.surface,
    sheet: c.surfaceRaised,
    well: c.surfaceSunken,
    glass: over(c.glass, c.bg),
    'hero card': LIGHT.gradients.steel[0],
  };
}

const LIGHT_SOFT_ALPHA = 0.1;
const minOn = (fg: string, planes: Record<string, string>) => Math.min(...Object.values(planes).map((b) => contrastRatio(fg, b)));

/**
 * The gym's palette for the LIGHT look. PURE and deterministic. The light planes stay MettleUp's
 * (a gym's background tone is a dark-look choice); the gym's colour is DARKENED (hue kept) until text
 * in it reads at 4.5:1 on every light plane and on its own tint; the words on it are black or white,
 * whichever reads better; the big button keeps the dark look's gradient (its frozen dark ink reads
 * on it). Chart slot 0 is the colour at >= 3:1 on a white card; the other slots are the light ones.
 */
export function lightBrandPalette(brand: { accent: string; bg?: string | null }): BrandPalette {
  const dark = buildBrandPalette(brand);
  const planes = lightPlanes();
  const soft = { page: planes.page, card: planes.card, sheet: planes.sheet };
  const b = hexToOklch(dark.color.accent);
  const textOk = (hex: string) =>
    minOn(hex, planes) >= 4.5 && minOn(hex, Object.fromEntries(Object.entries(soft).map(([k, p]) => [k, over(rgba(hex, LIGHT_SOFT_ALPHA), p)]))) >= 4.5;
  let L = Math.min(b.L, 0.62);
  let accent = oklchToHex({ ...b, L });
  for (let i = 0; i < 80 && !textOk(accent) && L > 0.05; i += 1) {
    L -= 0.01;
    accent = oklchToHex({ ...b, L });
  }
  const accentBright = textOk(oklchToHex({ ...b, L: L - 0.01 })) ? oklchToHex({ ...b, L: L - 0.01 }) : accent;
  const accentDeep = oklchToHex({ ...b, L: Math.max(0.05, L - 0.08) });
  const onAccent = contrastRatio('#0A0A0A', accent) >= contrastRatio('#FFFFFF', accent) ? '#0A0A0A' : '#FFFFFF';
  // Chart slot 0: the gym's hue at the light slots' lightness, darkened until it marks a white card.
  let sL = Math.min(b.L, hexToOklch(LIGHT.chart.series[0]).L);
  while (contrastRatio(oklchToHex({ ...b, L: sL }), LIGHT.color.surface) < 3 && sL > 0.05) sL -= 0.01;
  const series0 = oklchToHex({ ...b, L: sL });
  const series = [...LIGHT.chart.series] as BrandPalette['chart']['series'];
  series[0] = series0;
  for (let i = 1; i < series.length; i += 1) {
    if (deltaE(series0, series[i]) < 15 && deltaE(series0, LIGHT.chart.series[0]) >= 15) {
      series[i] = LIGHT.chart.series[0];
      break;
    }
  }
  // The ramp: the light ramp's lightness steps in the gym's hue (near-zero still recedes to white).
  const peak = hexToOklch(LIGHT.chart.ramp[4]);
  const ramp = LIGHT.chart.ramp.map((stop, i) => {
    const d = hexToOklch(stop);
    return oklchToHex({ L: i === 4 ? sL : d.L, C: b.C * (d.C / Math.max(peak.C, 1e-4)), h: b.h });
  }) as BrandPalette['chart']['ramp'];
  const palette: BrandPalette = {
    color: {
      bg: LIGHT.color.bg,
      surface: LIGHT.color.surface,
      surfaceRaised: LIGHT.color.surfaceRaised,
      surfaceSunken: LIGHT.color.surfaceSunken,
      glass: LIGHT.color.glass,
      accent,
      accentBright,
      accentDeep,
      accentSoft: rgba(accent, LIGHT_SOFT_ALPHA),
      onAccent,
      focusRing: accent,
      grid: LIGHT.color.grid,
      axis: LIGHT.color.axis,
    },
    gradients: {
      ember: [...dark.gradients.ember],
      emberSubtle: [rgba(accent, 0.08), rgba(accent, 0)],
      steel: [...LIGHT.gradients.steel],
      backdrop: [...LIGHT.gradients.backdrop],
    },
    glow: dark.glow,
    chart: { series, ramp, diverging: { neg: series[1], mid: LIGHT.chart.diverging.mid, pos: series0 } },
    checks: [],
    nudges: [],
    ok: true,
  };
  return palette;
}

// ------------------------------------------------------------------ applying

/**
 * The palette a brand draws on `on` (the current scheme by default), or null when it has no colours
 * (no brand, or a logo only: MettleUp's colours stay). A background tone alone keeps MettleUp's
 * accent on the gym's planes (dark look). PURE.
 */
export function paletteForBrand(brand: GymBrand | null | undefined, on: Scheme = scheme): BrandPalette | null {
  if (!brand || (!brand.accent && !brand.bg)) return null;
  try {
    if (on === 'light') {
      // A background tone alone: the light look has no gym planes, so MettleUp's light look stays.
      // MettleUp's own ember keeps the hand-tuned light look to the last shade.
      if (!brand.accent || brand.accent.toUpperCase() === FORGE_ACCENT.toUpperCase()) return null;
      return lightBrandPalette({ accent: brand.accent, bg: brand.bg });
    }
    return buildBrandPalette({ accent: brand.accent ?? FORGE_ACCENT, bg: brand.bg });
  } catch {
    // A damaged colour never breaks the app: MettleUp's look stays.
    return null;
  }
}

/** Keep the always-dark copies (share pictures, widgets) in step with the gym's dark palette. */
function writeDarkCopies(brand: GymBrand | null): void {
  const look = withPalette(DEFAULT, paletteForBrand(brand, 'dark'));
  Object.assign(darkColor, look.color);
  for (const k of Object.keys(look.gradients) as (keyof typeof gradients)[]) fill(darkGradients[k], look.gradients[k]);
  fill(darkChart.series, look.series);
  fill(darkChart.ramp, look.ramp);
  Object.assign(darkChart.diverging, look.diverging);
}

/**
 * Write `brand`'s palette into the tokens (or MettleUp's own values for null), on the current
 * scheme. The caller re-draws the app afterwards. Returns the palette written, or null for
 * MettleUp's look.
 */
export function applyBrandToTokens(brand: GymBrand | null | undefined): BrandPalette | null {
  const p = paletteForBrand(brand);
  applied = brand ?? null;
  appliedPalette = p;
  writeLook(withPalette(BASE[scheme], p));
  writeDarkCopies(applied);
  return p;
}

/**
 * Light or dark (theme/appearance.ts): write that look into the tokens, with the gym's colours
 * still on top. The caller re-draws the app afterwards. Returns whether anything changed.
 */
export function setTokenScheme(next: Scheme): boolean {
  if (next === scheme) return false;
  scheme = next;
  applyBrandToTokens(applied);
  return true;
}

/** The scheme the tokens hold now. */
export function tokenScheme(): Scheme {
  return scheme;
}

/** The tokens hold the light look now (read when drawn). */
export function isLightLook(): boolean {
  return scheme === 'light';
}

/** The brand the tokens hold now (null = MettleUp's look). */
export function appliedBrand(): GymBrand | null {
  return applied;
}

/** The palette the tokens hold now (null = MettleUp's look). */
export function appliedBrandPalette(): BrandPalette | null {
  return appliedPalette;
}

/**
 * Extra text style for headings in the gym's style (RAM's: bold italic). No italic font file
 * ships with the app, so Android slants the heading font itself. Read when drawn.
 */
export function brandHeadingStyle(): { fontStyle?: 'italic' } {
  return applied?.heading === 'bold-italic' ? { fontStyle: 'italic' } : {};
}

/** MettleUp's own DARK value of a colour token (for tests and the parity check). */
export function defaultColor(key: keyof typeof color): string {
  return DEFAULT.color[key];
}
