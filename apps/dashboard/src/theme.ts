/**
 * Dashboard design tokens — mirrored from the mobile app's src/theme/tokens.ts
 * (dark-first, ember accent) so the owner web app reads as the same product.
 * Kept as a local copy for now; the plan's single-sourced `packages/theme` is a
 * later, separate extraction (see docs/PLAN.md Phase 2 notes).
 */
export const color = {
  bg: '#07080C',
  surface: '#10131C',
  surfaceRaised: '#171B27',
  surfaceSunken: '#0B0D14',

  ink: '#F4F5F7',
  inkSecondary: '#A9AFBD',
  inkMuted: '#6C7383',
  inkFaint: '#3D4354',

  accent: '#FF7A3B',
  accentBright: '#FFA043',
  accentDeep: '#E8641F',
  accentSoft: 'rgba(255, 122, 59, 0.14)',

  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  good: '#0CA30C',
  goodText: '#3DCB6C',
  warning: '#FAB219',
  critical: '#D03B3B',
  criticalText: '#F0716F',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const font = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Manrope', system-ui, sans-serif",
  mono: "'Space Grotesk', ui-monospace, monospace",
} as const;

export const gradients = { ember: 'linear-gradient(135deg, #FF8B4A, #F0570F)' } as const;
