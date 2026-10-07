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
export const MAP_OUTLINE = color.borderStrong;

/** Fill for levels 0..4. */
export const MAP_LEVELS: readonly [string, string, string, string, string] = [MAP_IDLE, chart.ramp[2], chart.ramp[3], chart.ramp[4], chart.ramp[5]];

export function regionFill(region: BodyRegion, levels: ReadonlyMap<Muscle, MapLevel>): string {
  if (region === 'body') return MAP_BODY;
  return MAP_LEVELS[regionLevel(region, levels)];
}
