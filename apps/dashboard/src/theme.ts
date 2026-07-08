/**
 * Dashboard theme = shared primitives from `@forgeai/theme` (palette + scales,
 * single-sourced with the mobile app) + web-specific derivations (CSS font stacks
 * and a CSS gradient string). Mirrors apps/mobile's tokens split.
 */
export { color, space, radius } from '@forgeai/theme';

export const font = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Manrope', system-ui, sans-serif",
  mono: "'Space Grotesk', ui-monospace, monospace",
} as const;

export const gradients = { ember: 'linear-gradient(135deg, #FF8B4A, #F0570F)' } as const;
