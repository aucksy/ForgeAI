/**
 * Dashboard theme = shared primitives from `@forgeai/theme` (palette + scales,
 * single-sourced with the mobile app) + web-specific derivations (CSS font stacks
 * and a CSS gradient string). Mirrors apps/mobile's tokens split.
 *
 * Dark and light (16 Oct 2026; replaced the English | Hinglish switch). Every `color.x` is a CSS
 * variable (`var(--c-x)`), so one switch on <html> repaints every screen without redrawing it.
 * The two palettes below hold the real colours; `applyTheme` writes one of them onto :root.
 */
import { color as baseColor } from '@forgeai/theme';

export { space, radius } from '@forgeai/theme';

export type ColorName = keyof typeof baseColor;

/**
 * The shared muted grey (#6C7383) measures 3.9:1 on a card and 3.6:1 in a sheet —
 * under the 4.5:1 body-text floor, and the panel prints every stat label, table
 * header, timestamp and hint in it. #868D9C is 5.6:1 on a card and 5.2:1 in a
 * sheet while staying visibly quieter than inkSecondary. Overridden here rather
 * than in the shared package so the mobile app's tuned palette is not touched.
 */
export const darkColor: Record<ColorName, string> = { ...baseColor, inkMuted: '#868D9C' };

/**
 * The light palette. Every text colour is at least 4.5:1 on white, on the page and in a sunken
 * field (test/crm/themeContrast.test.ts). The orange and yellow are darker than on dark,
 * because the dark theme's #FFA043 and #FAB219 are about 2:1 on white.
 */
export const lightColor: Record<ColorName, string> = {
  bg: '#F3F4F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#ECEEF2',
  glass: 'rgba(255, 255, 255, 0.88)',

  ink: '#14161C',
  inkSecondary: '#464D5B',
  inkMuted: '#5E6574',
  inkFaint: '#B3B8C2',

  accent: '#D9571A',
  accentBright: '#A84200',
  accentDeep: '#C2410C',
  accentSoft: 'rgba(217, 87, 26, 0.12)',

  // R-85 (owner, 23 Oct 2026): 0.10 / 0.20 were too faint on white cards over the light-grey page;
  // cards and pills now part clearly from the page and from each other.
  border: 'rgba(20, 22, 28, 0.20)',
  borderStrong: 'rgba(20, 22, 28, 0.34)',
  grid: '#E4E7ED',
  axis: '#C8CDD6',

  good: '#15803D',
  warning: '#8A5300',
  serious: '#C2410C',
  critical: '#C62828',
  goodText: '#137333',
  criticalText: '#B42318',
};

const NAMES = Object.keys(baseColor) as ColorName[];

/** What screens use: `color.ink` is `var(--c-ink)`, so it follows the dark | light switch. */
export const color = Object.fromEntries(NAMES.map((n) => [n, `var(--c-${n})`])) as Record<ColorName, string>;

export type ThemeMode = 'dark' | 'light';

export const THEME_KEY = 'forgeai.theme.v1';

/** The saved choice; dark when nothing was saved (the look the panel always had). */
export function savedTheme(): ThemeMode {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // quiet: storage blocked (private window); dark is the default.
    return 'dark';
  }
}

/** Write a palette onto <html>: the CSS variables, the browser's own controls and the phone's top bar. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const palette = mode === 'light' ? lightColor : darkColor;
  for (const n of NAMES) root.style.setProperty(`--c-${n}`, palette[n]);
  root.style.colorScheme = mode;
  root.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', mode);
}

/** Save and show a choice. */
export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // quiet: a private window cannot save it; the choice still lasts until the page closes.
  }
  applyTheme(mode);
}

export const font = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Manrope', system-ui, sans-serif",
  mono: "'Space Grotesk', ui-monospace, monospace",
} as const;

export const gradients = { ember: 'linear-gradient(135deg, #FF8B4A, #F0570F)' } as const;
