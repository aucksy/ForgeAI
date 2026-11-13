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
import { OWN_PICTURES } from '@/tracker/catalog/ownPictures';
import { EXERCISE_PICTURES, PICTURE_SOURCE_IDS, picturesFor } from '@/tracker/catalog/pictures';
import { CLIP_VERSIONS } from '@/tracker/clips/clipManifest';

const MOBILE = resolve(__dirname, '../..');
const ASSETS = resolve(MOBILE, 'assets/exercise-pictures');
const MATCH = resolve(MOBILE, '../../docs/exercise-library/repdb-match.json');
const PICTURES_TS = resolve(MOBILE, 'src/tracker/catalog/pictures.ts');

const match = JSON.parse(readFileSync(MATCH, 'utf8')) as {
  matches: Record<string, { repdb: string; swap?: boolean; doubt?: string; single?: boolean }>;
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

  // The files of one exercise: start, the list close-up and end (a hold has no end picture).
  const filesOf = (k: string): string[] => (match.matches[k].single ? ['start', 'thumb'] : ['start', 'thumb', 'end']);

  it('every entry points to its bundled pictures that exist and are not empty', () => {
    const src = readFileSync(PICTURES_TS, 'utf8');
    for (const key of keys) {
      for (const end of filesOf(key)) {
        const file = resolve(ASSETS, `${key}__${end}.webp`);
        expect(existsSync(file), file).toBe(true);
        // The 144 px list close-up is small (about 0.9 KB and up); a blank WebP is under 100 bytes.
        expect(statSync(file).size, file).toBeGreaterThan(end === 'thumb' ? 400 : 1000);
        expect(src).toContain(`require('../../../assets/exercise-pictures/${key}__${end}.webp')`);
      }
    }
  });

  it('bundles only matched pictures (nothing else ships from the set)', () => {
    const files = readdirSync(ASSETS).sort();
    expect(files).toEqual(keys.flatMap((k) => filesOf(k).map((f) => `${k}__${f}.webp`)).sort());
  });

  it('a dropped exercise is not matched (our own picture may fill the gap; a RepDB one never does)', () => {
    for (const key of Object.keys(match.dropped)) expect(picturesFor(key), key).toBe(OWN_PICTURES[key] ?? null);
  });
});

describe('what the exercise page shows', () => {
  it('an exercise with no match gets no pictures: the page is unchanged', () => {
    // iso_lateral_chest_press: a machine move with no RepDB match and none of our own pictures yet.
    expect(picturesFor('iso_lateral_chest_press')).toBeNull();
    expect(picturesFor('no_such_exercise')).toBeNull();
    expect(picturesFor(null)).toBeNull();
    expect(picturesFor(undefined)).toBeNull();
    expect(picturesFor('')).toBeNull();
    expect(pictureChoice('iso_lateral_chest_press')).toBeNull();
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

  it('a hold (plank) has one picture: no end picture', () => {
    const p = pictureChoice('plank');
    expect(p?.start).toBeDefined();
    expect(p?.thumb).toBeDefined();
    expect(p?.end).toBeNull();
    for (const [k, m] of Object.entries(match.matches)) expect(picturesFor(k)?.end === null, k).toBe(Boolean(m.single));
  });

  it('the pictures are recoloured to the app theme in the build (R-280)', () => {
    const script = readFileSync(resolve(MOBILE, 'scripts/build-exercise-pictures.py'), 'utf8');
    expect(script).toContain('im = recolour(Image.open(src)');
    expect(script).toContain('SURFACE = np.array([0x10, 0x13, 0x1C])');
    const action = readFileSync(resolve(MOBILE, '../../.github/actions/exercise-pictures/action.yml'), 'utf8');
    expect(action).toContain('install --quiet pillow numpy scipy');
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

describe('our own pictures (the drawn man of the main set, for exercises RepDB has no picture of)', () => {
  const OWN = resolve(MOBILE, 'assets/exercise-pictures-own');
  // Every exercise that passed the picture review (tools/exercise-anim/qa.json), look D (13 Nov 2026, R-490: the
  // grey 3D look A was retired and every picture re-made as the drawn man in the orange tank top). Add keys here
  // when a run adds them.
  const EXPECTED = [
    'alternating_dumbbell_curl', 'alternating_hammer_curl', 'barbell_step_up', 'behind_the_back_cable_curl',
    'behind_the_back_wrist_curl', 'bent_over_cable_rear_delt_raise', 'bodyweight_triceps_extension',
    'cable_concentration_curl', 'cable_front_raise', 'cable_hip_abduction', 'cable_pullover', 'cable_reverse_curl',
    'cable_y_raise', 'cross_body_cable_extension', 'decline_ez_bar_skull_crusher', 'decline_leg_raise',
    'decline_sit_up', 'dumbbell_step_up', 'farmers_walk', 'flat_bench_cable_fly', 'hanging_leg_raise', 'hollow_hold',
    'incline_barbell_skull_crusher', 'incline_cable_fly', 'incline_cable_triceps_extension',
    'incline_dumbbell_skull_crusher', 'incline_machine_fly', 'incline_neutral_grip_dumbbell_press',
    'incline_treadmill_walk', 'iso_lateral_low_row', 'iso_lateral_row', 'kettlebell_clean_and_press', 'knee_plank',
    'l_sit', 'landmine_squat', 'low_to_high_cable_fly', 'lying_rope_triceps_extension', 'machine_lat_pulldown',
    'overhead_cable_curl', 'plate_curl', 'plate_front_raise', 'plate_reverse_curl', 'reverse_barbell_wrist_curl',
    'reverse_grip_triceps_pushdown', 'reverse_hyperextension', 'rope_cable_curl', 'rope_triceps_pushdown',
    'seated_barbell_calf_raise', 'seated_cable_rear_delt_fly', 'seated_hammer_curl', 'seated_rear_delt_fly',
    'side_plank', 'single_arm_cable_curl', 'single_arm_cable_fly', 'single_arm_cable_hammer_curl',
    'single_arm_cable_reverse_fly', 'single_arm_dumbbell_curl', 'single_arm_dumbbell_lateral_raise',
    'single_arm_dumbbell_upright_row', 'single_arm_dumbbell_wrist_curl', 'single_arm_high_cable_curl',
    'single_arm_lying_dumbbell_extension', 'single_arm_reverse_grip_pushdown', 'single_leg_calf_raise', 'sissy_squat',
    'sled_push', 'stability_ball_back_extension', 'stability_ball_crunch', 'stair_climber', 'stationary_bike',
    'suitcase_carry', 'tate_press', 'toe_touch_crunch', 'two_arm_dumbbell_kickback', 'wall_sit', 'weighted_chin_up',
    'weighted_crunch', 'weighted_decline_crunch', 'weighted_sissy_squat', 'wide_grip_barbell_curl',
    'wide_grip_ez_bar_curl',
  ];
  // Holds: one picture, no end picture.
  const HOLDS = ['hollow_hold', 'knee_plank', 'l_sit', 'side_plank', 'wall_sit'];
  const filesOf = (k: string): string[] => (HOLDS.includes(k) ? ['start', 'thumb'] : ['start', 'thumb', 'end']);

  it('lists exactly the reviewed exercises, each a real library exercise without a RepDB picture', () => {
    expect(Object.keys(OWN_PICTURES).sort()).toEqual([...EXPECTED].sort());
    for (const key of EXPECTED) {
      expect(catalogEntry(key)?.key, key).toBe(key);
      expect(PICTURE_SOURCE_IDS[key], key).toBeUndefined();
    }
  });

  it('the folder holds exactly their files, none empty', () => {
    expect(readdirSync(OWN).sort()).toEqual(EXPECTED.flatMap((k) => filesOf(k).map((f) => `${k}__${f}.webp`)).sort());
    for (const key of EXPECTED) {
      for (const f of filesOf(key)) {
        expect(statSync(resolve(OWN, `${key}__${f}.webp`)).size, `${key} ${f}`).toBeGreaterThan(f === 'thumb' ? 400 : 1000);
      }
    }
  });

  it('the exercise page shows them: start and end, a hold has one picture, a clip still wins', () => {
    for (const key of EXPECTED) {
      const p = pictureChoice(key);
      expect(p, key).toBe(OWN_PICTURES[key]);
      expect(p?.start, key).toBeDefined();
      expect(p?.thumb, key).toBeDefined();
      expect(p?.end === null, key).toBe(HOLDS.includes(key));
    }
  });

  it('a RepDB picture is never replaced by ours', () => {
    for (const key of Object.keys(EXERCISE_PICTURES)) expect(picturesFor(key), key).toBe(EXERCISE_PICTURES[key]);
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
