/**
 * Dashboard theme = shared primitives from `@forgeai/theme` (palette + scales,
 * single-sourced with the mobile app) + web-specific derivations (CSS font stacks
 * and a CSS gradient string). Mirrors apps/mobile's tokens split.
 */
import { color as baseColor } from '@forgeai/theme';

export { space, radius } from '@forgeai/theme';

/**
 * The shared muted grey (#6C7383) measures 3.9:1 on a card and 3.6:1 in a sheet —
 * under the 4.5:1 body-text floor, and the panel prints every stat label, table
 * header, timestamp and hint in it. #868D9C is 5.6:1 on a card and 5.2:1 in a
 * sheet while staying visibly quieter than inkSecondary. Overridden here rather
 * than in the shared package so the mobile app's tuned palette is not touched.
 */
export const color = { ...baseColor, inkMuted: '#868D9C' } as const;

export const font = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Manrope', system-ui, sans-serif",
  mono: "'Space Grotesk', ui-monospace, monospace",
} as const;

export const gradients = { ember: 'linear-gradient(135deg, #FF8B4A, #F0570F)' } as const;
