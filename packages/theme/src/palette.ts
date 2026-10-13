/**
 * Shared design primitives — the raw palette + spacing/radius scales used by BOTH
 * apps/mobile (React Native) and apps/dashboard (web). Platform-neutral (plain values
 * only): platform-specific derivations (RN gradients/shadows/motion/font keys, CSS
 * gradients/fonts) stay in each app's own theme module.
 *
 * The CVD-validated chart series palette is mobile-only (charts are mobile-only) and
 * stays in apps/mobile's tokens — do not move it here or reorder it.
 */

export const color = {
  // Planes
  bg: '#07080C', // page plane
  surface: '#10131C', // card / chart surface
  surfaceRaised: '#171B27', // elevated cards, sheets
  surfaceSunken: '#0B0D14', // wells, input fields
  glass: 'rgba(23, 27, 39, 0.72)', // glassmorphism overlays (pair with hairline border)

  // Ink
  ink: '#F4F5F7', // primary text
  inkSecondary: '#A9AFBD', // secondary text
  inkMuted: '#6C7383', // axis labels, captions, placeholders
  inkFaint: '#3D4354', // disabled, decorative glyphs

  // Brand — "forge" ember. Bright pair is for UI chrome/gradients only;
  // charts use chart.series[0] (validated variant).
  accent: '#FF7A3B',
  accentBright: '#FFA043',
  accentDeep: '#E8641F',
  accentSoft: 'rgba(255, 122, 59, 0.14)', // tinted chips/pills behind accent text

  // Hairlines & chrome
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  grid: '#232838', // chart gridline (hairline)
  axis: '#343B4E', // chart baseline / axis

  // Status (reserved — never used as chart series)
  good: '#0CA30C',
  warning: '#FAB219',
  serious: '#EC835A',
  critical: '#D03B3B',
  goodText: '#3DCB6C', // delta-up text on dark
  criticalText: '#F0716F',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
  screenX: 20, // horizontal screen padding
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;
