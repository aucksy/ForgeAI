/**
 * Colours of the body map (Phase 3), shared by the screen and the share picture so both
 * shade a muscle the same. Untrained muscles stay a quiet grey; trained ones climb the
 * ember ramp (the chart palette's sequential scale), brighter for more sets.
 *
 * Light mode (9 Nov 2026): the screen follows the app's look (a pale figure on the light look);
 * the share picture always asks for the DARK look (`dark = true`), as share pictures stay dark.
 */
import { isLightLook } from '@/theme/brandTokens';
import { chart, color, darkChart, darkColor } from '@/theme/tokens';

import type { MapLevel } from '../engine/bodyMap';
import { regionLevel } from '../engine/bodyMap';
import type { BodyRegion } from '../catalog/bodyMapPaths';
import type { Muscle } from '../catalog/muscles';

/** The figure and an untrained muscle on the dark look. */
export const MAP_BODY = '#1B1F2B';
export const MAP_IDLE = '#2A3040';
/** The same on the light look: a pale warm figure, untrained muscles a step darker. */
export const MAP_BODY_LIGHT = '#E7E3DC';
export const MAP_IDLE_LIGHT = '#CFCAC2';

const light = (dark?: boolean) => !dark && isLightLook();
const body = (dark?: boolean) => (light(dark) ? MAP_BODY_LIGHT : MAP_BODY);
const idle = (dark?: boolean) => (light(dark) ? MAP_IDLE_LIGHT : MAP_IDLE);

/** Read when drawn: gym branding repaints the tokens. `dark`: the share picture's dark look. */
export function mapOutline(dark?: boolean): string {
  return dark ? darkColor.borderStrong : color.borderStrong;
}

/** Fill for levels 0..4 (read when drawn: gym branding repaints the chart ramp). */
export function mapLevels(dark?: boolean): readonly [string, string, string, string, string] {
  const r = dark ? darkChart.ramp : chart.ramp;
  return [idle(dark), r[2], r[3], r[4], r[5]];
}

export function regionFill(region: BodyRegion, levels: ReadonlyMap<Muscle, MapLevel>, palette?: readonly string[], dark?: boolean): string {
  if (region === 'body') return body(dark);
  return (palette ?? mapLevels(dark))[regionLevel(region, levels)] ?? idle(dark);
}

/**
 * F59 "ready today": level 1 ready (green), 2 almost ready (amber), 3 still resting (red). The
 * screen always names each muscle in words too, so the colours are never the only telling.
 * Read when drawn.
 */
export function readyPalette(): readonly string[] {
  return [idle(), color.good, color.warning, color.critical, color.critical];
}
