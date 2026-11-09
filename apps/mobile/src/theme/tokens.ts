/**
 * ForgeAI design tokens — dark and light (light mode, 9 Nov 2026).
 *
 * `color`, `chart`, `gradients` and `shadow` are the LIVE look: their values are rewritten in place
 * (never the objects themselves) when the member's light/dark choice or the phone's setting changes,
 * and when a gym's colours come in (theme/brandTokens.ts), then the app re-draws from its root
 * (theme/appearance.ts, theme/gymTheme.ts). The values written here are the DARK look; the LIGHT
 * look is `LIGHT` below. `darkColor` / `darkChart` / `darkGradients` always hold the dark look (with
 * the gym's colours): share pictures and home-screen widgets stay dark whatever the app shows.
 *
 * Chart series palette is CVD-validated (dataviz six-checks) against
 * `color.surface` (#10131C): lightness band, chroma floor, adjacent-pair
 * CVD ΔE >= 12, contrast >= 3:1. Do not reorder series slots — the order
 * IS the colorblind-safety mechanism. Identity in multi-series charts must
 * never be color-alone (legend + direct labels).
 */

// Palette + spacing/radius scales are shared — sourced from @forgeai/theme and
// re-exported so `@/theme/tokens` keeps its full surface. Mobile-only derivations
// (chart palette, RN gradients/shadows/motion, font keys) follow below.
import { color as sharedColor } from '@forgeai/theme';

export { space, radius } from '@forgeai/theme';

/**
 * The shared palette, with the two lower greys raised for the phone (SH-19 / LW-14).
 * The shared values (#6C7383, #3D4354) measured 1.6–4.2:1 on our dark planes — the grey
 * hint numbers in a set row were near invisible under gym lights. Every text grey now
 * reaches 4.5:1 on bg, surface, surfaceRaised, surfaceSunken, glass and the hero-card top
 * (test/theme/contrast.test.ts). Mobile-only override: the web dashboard keeps its own look.
 */
export const color = {
  ...sharedColor,
  /** Captions, axis labels, column heads — 5.5:1 or better on every plane. */
  inkMuted: '#9097A8',
  /** Placeholders and hints (e.g. what a set tick will save) — 4.5:1 or better on every plane. */
  inkFaint: '#82899B',
  /** Inactive controls ONLY (WCAG-exempt). Never for information. ≥ 3:1 on bg/surface. */
  inkDisabled: '#5E6577',
  /**
   * Text and marks drawn ON the accent (a selected calendar day, a count on an accent dot). The
   * same near-black as the primary button's ink; a gym's palette sets the colour its accent needs
   * (black on RAM's yellow). Gym branding: see theme/gymTheme.ts.
   */
  onAccent: '#1F0D05',
  /** Keyboard / switch-access focus outline. */
  focusRing: '#FFA043',
  /**
   * Text and icons ON the ember gradient (the big finish card, the report's headline card, the
   * welcome button). The primary button's frozen ink (#1F0D05): the ember stays bright in both
   * looks, so this dark ink reads on it in both, while `onAccent` follows the accent (white on the
   * light look's deeper orange).
   */
  onEmber: '#1F0D05',
} as const;

/** Every colour key of the look (the light look must name each one). */
export type ColorKey = keyof typeof color;

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

/**
 * The LIGHT look (9 Nov 2026, owner: "it should be system default"). Designed, not inverted: a warm
 * off-white page, white cards with crisp hairlines and a soft shadow, light warm-grey fills for
 * controls and wells, near-black ink. The forge orange stays the brand: the big ember gradient
 * (buttons, the finish card) keeps its bright colours, and where orange is TEXT it is a deeper
 * burnt orange that reads at 4.5:1 on every light plane (test/theme/contrast.test.ts measures both
 * looks). Chart series are the dark slots darkened in lightness only (same hues, same order), each
 * >= 3:1 on a white card with the colour-blind pair distances kept (test/theme/lightPalette.test.ts).
 */
export const LIGHT = {
  color: {
    // Planes: page, card (white), filled controls and sheets, wells (inputs), frosted bars.
    bg: '#F6F4F0',
    surface: '#FFFFFF',
    surfaceRaised: '#F1EFEB',
    surfaceSunken: '#EEEBE6',
    glass: 'rgba(255, 255, 255, 0.88)',
    // Ink: near-black down to a placeholder grey; every one >= 4.5:1 on every plane.
    ink: '#17181C',
    inkSecondary: '#474C57',
    inkMuted: '#555B69',
    inkFaint: '#5E6472',
    inkDisabled: '#7F8591',
    // Brand: burnt orange for text and fills (white reads on it), the bright ember kept for the button.
    accent: '#AD420D',
    accentBright: '#A8400B',
    accentDeep: '#933A0B',
    accentSoft: 'rgba(232, 100, 31, 0.10)',
    onAccent: '#FFFFFF',
    onEmber: '#1F0D05',
    focusRing: '#AD420D',
    // Hairlines and chart chrome.
    border: 'rgba(28, 25, 20, 0.10)',
    borderStrong: 'rgba(28, 25, 20, 0.17)',
    grid: '#ECE9E4',
    axis: '#D3CFC8',
    // Status: fills keep their hue; the text ones are deep enough to read on white.
    good: '#11A23A',
    warning: '#875A00',
    serious: '#C2410C',
    critical: '#C9302C',
    goodText: '#0D7232',
    criticalText: '#B42318',
  } satisfies Record<ColorKey, string>,
  chart: {
    /** Same hues and order as the dark slots (ember, blue, aqua, violet, yellow), darker for white. */
    series: ['#D4561A', '#2F6FCB', '#11875F', '#7366D6', '#A86E00'],
    /** Near-zero recedes toward the white card; the top is the deepest ember. */
    ramp: ['#F4ECE5', '#F7D0B4', '#F2A672', '#E77C3F', '#D4561A', '#A8410F'],
    diverging: { neg: '#2F6FCB', mid: '#D5D1CA', pos: '#D4561A' },
  },
  gradients: {
    ember: ['#FF8B4A', '#F0570F'],
    emberSubtle: ['rgba(232, 100, 31, 0.08)', 'rgba(232, 100, 31, 0)'],
    steel: ['#FFFFFF', '#FBF9F6'],
    backdrop: ['#FBF9F6', '#F6F4F0'],
  },
  shadow: {
    card: {
      shadowColor: '#2B2118',
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    glow: {
      shadowColor: '#E8641F',
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
  },
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

/**
 * The DARK look with the gym's colours, whatever the app shows (theme/brandTokens.ts keeps these in
 * step). Share pictures are posted images and stay dark; the home-screen widgets and reminders
 * keep the dark look's accent.
 */
export const darkColor: Record<ColorKey, string> = { ...color };
export const darkChart = {
  series: [...chart.series] as string[],
  ramp: [...chart.ramp] as string[],
  diverging: { ...chart.diverging } as { neg: string; mid: string; pos: string },
};
export const darkGradients = Object.fromEntries(Object.entries(gradients).map(([k, v]) => [k, [...v]])) as Record<keyof typeof gradients, string[]>;

export const motion = {
  fast: 160,
  base: 240,
  slow: 380,
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
} as const;
