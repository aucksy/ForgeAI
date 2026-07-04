/**
 * ForgeAI design tokens — premium dark-first theme.
 *
 * Chart series palette is CVD-validated (dataviz six-checks) against
 * `color.surface` (#10131C): lightness band, chroma floor, adjacent-pair
 * CVD ΔE >= 12, contrast >= 3:1. Do not reorder series slots — the order
 * IS the colorblind-safety mechanism. Identity in multi-series charts must
 * never be color-alone (legend + direct labels).
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

export const chart = {
  /** Categorical slots, fixed order (validated): ember, blue, aqua, violet, yellow. */
  series: ['#E8641F', '#3987E5', '#19A97A', '#9085E9', '#C98500'] as const,
  /**
   * Sequential ember ramp (magnitude: consistency heatmap, muscle-volume fills).
   * Near-zero recedes toward surface; max is bright. Single hue, monotone lightness.
   */
  ramp: ['#1A1510', '#4A2C15', '#7C4218', '#B4571B', '#E8641F', '#FF8B4A'] as const,
  /** Diverging pair for +/- deltas (surplus/deficit): blue <- gray -> ember. */
  diverging: { neg: '#3987E5', mid: '#383E4E', pos: '#E8641F' } as const,
  gridWidth: 1,
  lineWidth: 2,
  markerRadius: 4,
  barRadius: 4,
  barGap: 2, // px surface gap between adjacent/stacked fills
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

export const type = {
  // Families are registered in theme/fonts.ts
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  heading: 'Sora_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  /** Numerals / stats — tabular feel for aligned figures. */
  mono: 'SpaceGrotesk_500Medium',
  monoBold: 'SpaceGrotesk_700Bold',

  size: {
    hero: 40,
    h1: 28,
    h2: 22,
    h3: 17,
    body: 15,
    sub: 13,
    caption: 11,
  },
} as const;

export const gradients = {
  /** Brand ember sweep — hero cards, primary buttons, rings. */
  ember: ['#FF8B4A', '#F0570F'] as const,
  emberSubtle: ['rgba(255, 122, 59, 0.16)', 'rgba(255, 122, 59, 0.02)'] as const,
  /** Cool sheen for secondary hero surfaces. */
  steel: ['#1C2130', '#10131C'] as const,
  /** Screen backdrop wash (top glow). */
  backdrop: ['#12101C', '#07080C'] as const,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glow: {
    shadowColor: '#FF7A3B',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
} as const;

export const motion = {
  fast: 160,
  base: 240,
  slow: 380,
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
} as const;
