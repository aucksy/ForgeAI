/**
 * Gym branding (Level 1): puts a gym's palette INTO the theme tokens, and takes it out again.
 *
 * Every screen — the frozen shared pieces included — reads `color`, `gradients`, `chart` and
 * `shadow` from theme/tokens.ts while it draws. So the gym's look is applied by changing those
 * objects' VALUES in place (the objects themselves never change) and then re-drawing the app from
 * its root (theme/gymTheme.ts bumps the root's key). Leave gym puts ForgeAI's own values back
 * from the copy taken here when the app first loaded.
 *
 * The palette comes from the one shared engine (`buildBrandPalette`, packages/theme/src/brand.ts),
 * the same the owner's panel previews. Pure apart from writing the token objects; tested in
 * test/theme/brandTokens.test.ts.
 */
import { buildBrandPalette, type BrandPalette, type GymBrand } from '@forgeai/theme';

import { chart, color, gradients, shadow } from './tokens';

// ForgeAI's own values, copied before any gym's palette can be written in.
const DEFAULT = {
  color: { ...color } as Record<string, string>,
  gradients: Object.fromEntries(Object.entries(gradients).map(([k, v]) => [k, [...v]])) as Record<keyof typeof gradients, string[]>,
  series: [...chart.series] as string[],
  ramp: [...chart.ramp] as string[],
  diverging: { ...chart.diverging },
  glow: shadow.glow.shadowColor as string,
};

/** ForgeAI's own accent (a gym with only a background tone keeps it). */
export const FORGE_ACCENT = DEFAULT.color.accent;

let applied: GymBrand | null = null;
let appliedPalette: BrandPalette | null = null;

/** Copy array values into an existing array (frozen code may hold the array itself). */
function fill(target: readonly string[], values: readonly string[]): void {
  const t = target as string[];
  for (let i = 0; i < t.length && i < values.length; i += 1) t[i] = values[i];
}

function restore(): void {
  Object.assign(color as unknown as Record<string, string>, DEFAULT.color);
  for (const k of Object.keys(DEFAULT.gradients) as (keyof typeof gradients)[]) fill(gradients[k], DEFAULT.gradients[k]);
  fill(chart.series, DEFAULT.series);
  fill(chart.ramp, DEFAULT.ramp);
  Object.assign(chart.diverging as unknown as Record<string, string>, DEFAULT.diverging);
  (shadow.glow as unknown as Record<string, string>).shadowColor = DEFAULT.glow;
}

/**
 * The palette a brand draws, or null when it has no colours (no brand, or a logo only: ForgeAI's
 * colours stay). A background tone alone keeps ForgeAI's accent on the gym's planes. PURE.
 */
export function paletteForBrand(brand: GymBrand | null | undefined): BrandPalette | null {
  if (!brand || (!brand.accent && !brand.bg)) return null;
  try {
    return buildBrandPalette({ accent: brand.accent ?? FORGE_ACCENT, bg: brand.bg });
  } catch {
    // A damaged colour never breaks the app: ForgeAI's look stays.
    return null;
  }
}

/**
 * Write `brand`'s palette into the tokens (or ForgeAI's own values for null). The caller re-draws
 * the app afterwards. Returns the palette written, or null for ForgeAI's look.
 */
export function applyBrandToTokens(brand: GymBrand | null | undefined): BrandPalette | null {
  restore();
  const p = paletteForBrand(brand);
  applied = brand ?? null;
  appliedPalette = p;
  if (!p) return null;
  // Only the keys the palette owns; ink greys and status colours stay ForgeAI's.
  Object.assign(color as unknown as Record<string, string>, p.color);
  fill(gradients.ember, p.gradients.ember);
  fill(gradients.emberSubtle, p.gradients.emberSubtle);
  fill(gradients.steel, p.gradients.steel);
  fill(gradients.backdrop, p.gradients.backdrop);
  fill(chart.series, p.chart.series);
  fill(chart.ramp, p.chart.ramp);
  Object.assign(chart.diverging as unknown as Record<string, string>, p.chart.diverging);
  (shadow.glow as unknown as Record<string, string>).shadowColor = p.glow;
  return p;
}

/** The brand the tokens hold now (null = ForgeAI's look). */
export function appliedBrand(): GymBrand | null {
  return applied;
}

/** The palette the tokens hold now (null = ForgeAI's look). */
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

/** ForgeAI's own value of a colour token (for tests and the parity check). */
export function defaultColor(key: keyof typeof color): string {
  return DEFAULT.color[key];
}
