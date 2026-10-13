/**
 * Gym branding: runs FIRST, before any screen file loads (apps/mobile/index.js imports it ahead of
 * expo-router). It reads the gym's look this phone last showed (theme/themeMirror.ts, a
 * synchronous read) and writes it into the theme tokens, so:
 *  - the first frame after the splash is already in the gym's colours, and
 *  - a colour a file copies when it loads (frozen components such as the record badge's tint and
 *    the consistency heatmap's ramp, which may not be edited) is the gym's too.
 * Within one run, a join or a Leave repaints by re-drawing the app (theme/gymTheme.ts); those
 * load-time copies catch up on the next launch.
 */
import { applyBrandToTokens } from './brandTokens';
import { readMirrorSync, type ThemeMirror } from './themeMirror';

let boot: ThemeMirror | null = null;
try {
  boot = readMirrorSync();
  if (boot) applyBrandToTokens(boot.brand);
} catch {
  boot = null;
}

/** The gym look the app started in (null = ForgeAI's). */
export function bootMirror(): ThemeMirror | null {
  return boot;
}
