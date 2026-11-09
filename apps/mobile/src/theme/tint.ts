/**
 * See-through shades of the theme colours, read when drawn — never a hand-typed rgba copy of the
 * accent, which a gym's colour could not replace (gym branding repaints the tokens in place; see
 * theme/gymTheme.ts). PURE: reads the live tokens.
 */
import { color } from './tokens';

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The accent at `alpha` (0–1), e.g. a selected card's border at 0.45. */
export function accentTint(alpha: number): string {
  return withAlpha(color.accent, alpha);
}

/** The ink drawn ON the ember gradient at `alpha` — a quieter line on the big ember card. */
export function onEmberTint(alpha: number): string {
  return withAlpha(color.onEmber, alpha);
}

/**
 * The main text colour at `alpha`: a faint wash that shows on BOTH looks (near-white on the dark
 * look, near-black on the light one) — a pressed row, a quiet fill. Never a hand-typed white.
 */
export function inkTint(alpha: number): string {
  return withAlpha(color.ink, alpha);
}

/** Any '#RRGGBB' colour at `alpha` (e.g. a status colour's soft background). */
export function tint(hex: string, alpha: number): string {
  return withAlpha(hex, alpha);
}

/** The ink drawn ON the accent at `alpha` — a quieter line on an accent card. */
export function onAccentTint(alpha: number): string {
  return withAlpha(color.onAccent, alpha);
}
