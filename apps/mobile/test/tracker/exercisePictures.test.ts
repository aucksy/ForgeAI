/**
 * F20: the start and end pictures from RepDB — every match points at a real exercise and two
 * bundled files, the generated module agrees with the reviewable match list, and an exercise
 * without a match (or with a clip, or with the member's own photo) shows nothing new.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPDB_CREDIT, REPDB_URL, CREDITS } from '@/lib/credits';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { pictureChoice } from '@/tracker/catalog/pictureChoice';
import { EXERCISE_PICTURES, PICTURE_SOURCE_IDS, picturesFor } from '@/tracker/catalog/pictures';
import { CLIP_VERSIONS } from '@/tracker/clips/clipManifest';

const MOBILE = resolve(__dirname, '../..');
const ASSETS = resolve(MOBILE, 'assets/exercise-pictures');
const MATCH = resolve(MOBILE, '../../docs/exercise-library/repdb-match.json');
const PICTURES_TS = resolve(MOBILE, 'src/tracker/catalog/pictures.ts');

const match = JSON.parse(readFileSync(MATCH, 'utf8')) as {
  matches: Record<string, { repdb: string; swap?: boolean; doubt?: string }>;
  dropped: Record<string, string>;
};

describe('the RepDB match list', () => {
  const keys = Object.keys(match.matches);

  it('is not empty and matches the generated module exactly', () => {
    expect(keys.length).toBeGreaterThan(200);
    expect({ ...PICTURE_SOURCE_IDS }).toEqual(Object.fromEntries(keys.map((k) => [k, match.matches[k].repdb])));
    expect(Object.keys(EXERCISE_PICTURES).sort()).toEqual([...keys].sort());
  });

  it('every entry is a real library exercise', () => {
    for (const key of keys) expect(catalogEntry(key)?.key, key).toBe(key);
  });

  it('every entry points to two bundled pictures that exist and are not empty', () => {
    const src = readFileSync(PICTURES_TS, 'utf8');
    for (const key of keys) {
      for (const end of ['start', 'end']) {
        const file = resolve(ASSETS, `${key}__${end}.webp`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeGreaterThan(1000);
        expect(src).toContain(`require('../../../assets/exercise-pictures/${key}__${end}.webp')`);
      }
    }
  });

  it('bundles only matched pictures (nothing else ships from the set)', () => {
    const files = readdirSync(ASSETS).sort();
    expect(files).toEqual(keys.flatMap((k) => [`${k}__end.webp`, `${k}__start.webp`]).sort());
  });

  it('a dropped exercise is not matched', () => {
    for (const key of Object.keys(match.dropped)) expect(picturesFor(key), key).toBeNull();
  });
});

describe('what the exercise page shows', () => {
  it('an exercise with no match gets no pictures: the page is unchanged', () => {
    expect(picturesFor('plank')).toBeNull();
    expect(picturesFor('no_such_exercise')).toBeNull();
    expect(picturesFor(null)).toBeNull();
    expect(picturesFor(undefined)).toBeNull();
    expect(picturesFor('')).toBeNull();
    expect(pictureChoice('plank')).toBeNull();
    expect(pictureChoice(null)).toBeNull();
    // A custom exercise has no library key at all.
    expect(pictureChoice(undefined)).toBeNull();
  });

  it('does not treat object keys as exercises', () => {
    expect(picturesFor('constructor')).toBeNull();
    expect(picturesFor('__proto__')).toBeNull();
  });

  it('a matched exercise gets its start and end pictures', () => {
    const p = pictureChoice('barbell_bench_press');
    expect(p).not.toBeNull();
    expect(p?.start).toBeDefined();
    expect(p?.end).toBeDefined();
    expect(p?.start).not.toBe(p?.end);
  });

  it("the member's own photo wins: no pictures", () => {
    expect(pictureChoice('barbell_bench_press', { hidden: true })).toBeNull();
    expect(pictureChoice('barbell_bench_press', { hidden: true, asFallback: true })).toBeNull();
  });

  it('an exercise with a moving clip shows the clip; the pictures only stand in when it fails', () => {
    const withClip = Object.keys(CLIP_VERSIONS).filter((k) => picturesFor(k));
    expect(withClip.length).toBeGreaterThan(0);
    for (const key of withClip) {
      expect(pictureChoice(key), key).toBeNull();
      expect(pictureChoice(key, { asFallback: true }), key).toBe(picturesFor(key));
    }
  });
});

describe('the exercise page (source check: the screen is device-only)', () => {
  it('shows the pictures on Summary and How to, the clip falls back to them, and the 1-rep max link stays', () => {
    const page = readFileSync(resolve(MOBILE, 'src/app/exercise/[id].tsx'), 'utf8');
    expect(page.match(/<ExercisePictures catalogKey=\{ex\.catalogKey\}[^>]*hidden=\{Boolean\(ex\.mediaUri\)\}/g)).toHaveLength(2);
    expect(page.match(/<ExerciseClip [^>]*fallback=\{clipStandIn\}/g)).toHaveLength(2);
    expect(page).toMatch(/<ExercisePictures [^>]*asFallback/);
    expect(page).toContain('1-rep max and % calculator');
  });
});

describe('the RepDB credit', () => {
  it('uses the licence wording exactly and links to repdb.co', () => {
    expect(REPDB_CREDIT).toBe('Exercise data by RepDB (repdb.co)');
    expect(REPDB_URL).toBe('https://repdb.co');
    expect(CREDITS.find((c) => c.id === 'repdb')?.source).toBe(REPDB_CREDIT);
  });

  it('is on the About screen', () => {
    const about = readFileSync(resolve(MOBILE, 'src/app/settings/about.tsx'), 'utf8');
    expect(about).toContain('REPDB_CREDIT');
    expect(about).toContain('Linking.openURL(REPDB_URL)');
  });
});
