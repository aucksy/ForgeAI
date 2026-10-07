/**
 * Pictures for a person to look at (v0.25.1). Skipped in normal runs; set FORGEAI_PREVIEW_DIR
 * to a folder and they are drawn there with resvg and the app's own fonts:
 *
 *   FORGEAI_PREVIEW_DIR=<folder> npx vitest run test/tracker/previews.test.ts
 *
 * The share pictures are the exact scenes the phone draws; the body maps use the same
 * drawing and colours as the Progress screen. Sample data, so every picture says so.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BodyFigure } from '@/tracker/catalog/bodyMapPaths';
import type { Muscle } from '@/tracker/catalog/muscles';
import { muscleLevels } from '@/tracker/engine/bodyMap';
import { buildMonthReport, buildYearReview, type ReportSession } from '@/tracker/engine/reports';
import { monthShareScene, yearShareScene } from '@/tracker/share/reportCard';
import { sceneToSvg, type Scene, type SceneNode } from '@/tracker/share/scene';
import { workoutShareScene, type WorkoutShareInput } from '@/tracker/share/workoutCard';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');

const OUT = process.env.FORGEAI_PREVIEW_DIR;

function ttfs(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...ttfs(p));
    else if (/_(400Regular|500Medium|600SemiBold|700Bold)\.ttf$/.test(n)) out.push(p);
  }
  return out;
}

function save(name: string, scene: Scene): void {
  const fonts = join(__dirname, '..', '..', '..', '..', 'node_modules', '@expo-google-fonts');
  const fontFiles = ['manrope', 'sora', 'space-grotesk'].flatMap((f) => ttfs(join(fonts, f)));
  const png = new Resvg(sceneToSvg(scene), { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Manrope' } }).render().asPng();
  mkdirSync(OUT!, { recursive: true });
  writeFileSync(join(OUT!, `${name}.png`), png);
  expect(png.length).toBeGreaterThan(5000);
}

const SAMPLE = 'Sample data';
const sampleNote = (scene: Scene): Scene => ({
  ...scene,
  nodes: [...scene.nodes, { t: 'text', x: scene.width - 24, y: scene.height - 16, text: SAMPLE, font: 'bodyMedium', size: 20, fill: '#FFB020', anchor: 'end' }],
});

/** Front and back on the app's dark card, like Progress → "Last 7 days". */
function bodyMapScene(figure: BodyFigure, sets: [Muscle, number][]): Scene {
  const levels = [...muscleLevels(sets.map(([muscle, n]) => ({ muscle, sets: n })))];
  const h = 500;
  const nodes: SceneNode[] = [
    { t: 'rect', x: 20, y: 20, w: 560, h: 600, r: 28, fill: '#12151E', stroke: 'rgba(255,255,255,0.08)', strokeWidth: 2 },
    { t: 'body', x: 300 - 12 - h / 2, y: 50, height: h, view: 'front', levels, figure },
    { t: 'body', x: 300 + 12, y: 50, height: h, view: 'back', levels, figure },
    { t: 'text', x: 300 - 12 - h / 4, y: 590, text: 'Front', font: 'bodyMedium', size: 22, fill: '#8A93A6', anchor: 'middle' },
    { t: 'text', x: 300 + 12 + h / 4, y: 590, text: 'Back', font: 'bodyMedium', size: 22, fill: '#8A93A6', anchor: 'middle' },
  ];
  return { width: 600, height: 640, background: '#0A0C12', nodes };
}

const WEEK: [Muscle, number][] = [
  ['chest', 10],
  ['front_delts', 4],
  ['side_delts', 6],
  ['triceps', 7],
  ['lats', 8],
  ['upper_back', 5],
  ['biceps', 3],
  ['quads', 12],
  ['glutes', 9],
  ['hamstrings', 2],
  ['abs', 4],
  ['calves', 1],
];

const WORKOUT: WorkoutShareInput = {
  title: 'Leg Day',
  dateText: 'Wed, 7 Oct 2026',
  durationText: '52m 10s',
  volumeText: '8,450',
  sets: 15,
  exercises: [
    { name: 'Barbell Back Squat', sets: 4, best: '100 kg × 5' },
    { name: 'Romanian Deadlift', sets: 3, best: '90 kg × 8' },
    { name: 'Hip Thrust', sets: 4, best: '120 kg × 10' },
    { name: 'Standing Calf Raise', sets: 4, best: '60 kg × 12' },
  ],
  records: [],
  muscles: [
    { muscle: 'quads', sets: 4 },
    { muscle: 'glutes', sets: 8 },
    { muscle: 'hamstrings', sets: 5 },
    { muscle: 'calves', sets: 4 },
    { muscle: 'lower_back', sets: 1.5 },
  ],
};

describe.runIf(OUT)('preview pictures (v0.25.1)', () => {
  it('body map, male and female', () => {
    save('body-map-male', sampleNote(bodyMapScene('male', WEEK)));
    save('body-map-female', sampleNote(bodyMapScene('female', WEEK)));
  });

  it('workout picture, female figure', () => {
    save('share-workout-female', sampleNote(workoutShareScene({ ...WORKOUT, figure: 'female' })));
    save('share-workout-male', sampleNote(workoutShareScene({ ...WORKOUT, figure: 'male' })));
  });

  it('a run: best pace and distance on the picture', () => {
    save(
      'share-run-best-pace',
      sampleNote(
        workoutShareScene({
          title: 'Workout',
          dateText: 'Wed, 7 Oct 2026',
          durationText: '31m 05s',
          volumeLabel: 'DISTANCE',
          volumeText: '5.4 km',
          sets: 2,
          exercises: [{ name: 'Treadmill Run', sets: 2, best: '5 km · 25:00' }],
          records: [{ exerciseName: 'Treadmill Run', label: 'Best pace', value: '5:00 /km' }],
          muscles: [{ muscle: 'cardio', sets: 2 }],
          figure: 'female',
        }),
      ),
    );
  });

  it('a cardio-only workout with no records', () => {
    save(
      'share-cardio-only',
      sampleNote(
        workoutShareScene({
          title: 'Workout',
          dateText: 'Wed, 7 Oct 2026',
          durationText: '20m 00s',
          volumeLabel: 'EXERCISES',
          volumeText: '1',
          sets: 1,
          exercises: [{ name: 'Zumba', sets: 1, best: '20:00' }],
          records: [],
          muscles: [{ muscle: 'cardio', sets: 1 }],
        }),
      ),
    );
  });

  it('a short year and a month with untimed workouts', () => {
    const s = (dateISO: string, durationSec: number): ReportSession => ({ sessionId: dateISO, dateISO, durationSec, volumeKg: 2400, sets: 12, exercises: [{ exerciseId: 'sq', name: 'Barbell Back Squat', sets: 4 }] });
    const year = buildYearReview({ year: 2026, complete: false, lastMonth: '2026-10', sessions: [s('2026-10-06', 1500)], recordCount: 0, strength: [], muscles: [], bodyweight: [] });
    save('share-year-short', sampleNote(yearShareScene(year)));
    const month = buildMonthReport({
      month: '2026-09',
      complete: true,
      sessions: [s('2026-09-02', 3600), s('2026-09-04', 0), s('2026-09-09', 4200), s('2026-09-11', 3300), s('2026-09-16', 0), s('2026-09-23', 3900)],
      previous: [],
      records: [],
      muscles: [],
      bodyweight: [],
      from: '2026-09-01',
      to: '2026-09-30',
    });
    save('share-month-partly-timed', sampleNote(monthShareScene(month, 3)));
  });
});

it('previews are opt-in', () => {
  expect(typeof OUT === 'string' || OUT === undefined).toBe(true);
});
