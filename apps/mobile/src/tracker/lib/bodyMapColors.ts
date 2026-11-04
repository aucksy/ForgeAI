/**
 * Colours of the body map (Phase 3), shared by the screen and the share picture so both
 * shade a muscle the same. Untrained muscles stay a quiet grey; trained ones climb the
 * ember ramp (the chart palette's sequential scale), brighter for more sets.
 */
import { chart, color } from '@/theme/tokens';

import type { MapLevel } from '../engine/bodyMap';
import { regionLevel } from '../engine/bodyMap';
import type { BodyRegion } from '../catalog/bodyMapPaths';
import type { Muscle } from '../catalog/muscles';

export const MAP_BODY = '#1B1F2B';
export const MAP_IDLE = '#2A3040';
/** Read when drawn: gym branding repaints the tokens. */
export function mapOutline(): string {
  return color.borderStrong;
}

/** Fill for levels 0..4 (read when drawn: gym branding repaints the chart ramp). */
export function mapLevels(): readonly [string, string, string, string, string] {
  return [MAP_IDLE, chart.ramp[2], chart.ramp[3], chart.ramp[4], chart.ramp[5]];
}

export function regionFill(region: BodyRegion, levels: ReadonlyMap<Muscle, MapLevel>, palette?: readonly string[]): string {
  if (region === 'body') return MAP_BODY;
  return (palette ?? mapLevels())[regionLevel(region, levels)] ?? MAP_IDLE;
}

/**
 * F59 "ready today": level 1 ready (green), 2 almost ready (amber), 3 still resting (red). The
 * screen always names each muscle in words too, so the colours are never the only telling.
 * Read when drawn.
 */
export function readyPalette(): readonly string[] {
  return [MAP_IDLE, color.good, color.warning, color.critical, color.critical];
}
