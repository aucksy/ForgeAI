/**
 * R-491 (owner, 14 Nov 2026, "Yes I pick A"): one look everywhere. The exercise list, the "How to do it" card, the
 * demo sheet and the live workout card showed the old grey line drawings (Everkinetic) for 176 exercises, 120 of
 * them although they have orange-tank pictures. Now the orange-tank picture wins wherever one exists.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXERCISE_MEDIA, mediaFor } from '@/tracker/catalog/media';
import { demoFrames, thumbChoice } from '@/tracker/catalog/pictureChoice';
import { picturesFor } from '@/tracker/catalog/pictures';

const keys = Object.keys(EXERCISE_MEDIA);
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('the orange-tank picture wins over the old line drawing', () => {
  it('every exercise with both: list picture and demo are the orange-tank ones, not credited', () => {
    const both = keys.filter((k) => picturesFor(k));
    expect(both.length).toBeGreaterThan(100);
    for (const k of both) {
      const p = picturesFor(k)!;
      expect(thumbChoice(k), k).toEqual({ source: p.thumb, drawing: false });
      expect(demoFrames(k), k).toEqual({ frames: [p.start, p.end], drawing: false });
    }
  });

  it('a line drawing is used only where there is no orange-tank picture', () => {
    const only = keys.filter((k) => !picturesFor(k));
    expect(only.length).toBeGreaterThan(0);
    for (const k of only) {
      expect(thumbChoice(k), k).toEqual({ source: mediaFor(k)!.thumb, drawing: true });
      expect(demoFrames(k)?.drawing, k).toBe(true);
    }
  });

  it('an orange-tank-only exercise now has a list picture and a demo (it said "No picture yet")', () => {
    expect(mediaFor('tate_press')).not.toBeNull();
    expect(thumbChoice('tate_press')?.drawing).toBe(false);
    const own = ['wall_sit', 'machine_lat_pulldown'].filter((k) => picturesFor(k) && !mediaFor(k));
    for (const k of own) expect(thumbChoice(k)?.drawing, k).toBe(false);
  });

  it('nothing for an unknown or custom exercise', () => {
    expect(thumbChoice(null)).toBeNull();
    expect(thumbChoice('not_an_exercise')).toBeNull();
    expect(demoFrames(undefined)).toBeNull();
  });

  it('every screen goes through the one rule (source checks: the screens are device-only)', () => {
    expect(read('src/tracker/components/ExerciseThumb.tsx')).toMatch(/thumbChoice\(catalogKey\)/);
    expect(read('src/tracker/components/ExerciseThumb.tsx')).not.toMatch(/mediaFor\(/);
    expect(read('src/tracker/services/liveCardImage.ts')).toMatch(/thumbChoice\(ex\.catalogKey\)/);
    const sheet = read('src/tracker/components/ExerciseDemoSheet.tsx');
    expect(sheet).toMatch(/demoFrames\(catalogKey\)/);
    expect(sheet).toMatch(/drawing=\{false\}/);
    const page = read('src/app/exercise/[id].tsx');
    expect(page).toMatch(/thumbChoice\(ex\.catalogKey\)\?\.drawing \? <DrawingCredit/);
    expect(page).not.toMatch(/mediaFor\(/);
  });
});
