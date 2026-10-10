/**
 * Phase 3 — the share pictures (a workout, a month, a year). The scene is drawn here with
 * resvg and the app's own font files, the same fonts the phone draws with, so these tests
 * check what the picture says, that it renders, and that nothing runs off its edge.
 */
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildMonthReport, buildYearReview, type ReportSession } from '@/tracker/engine/reports';
import { monthShareScene, yearShareScene } from '@/tracker/share/reportCard';
import { fitSize, fitText, packLines, pictureFileName, sceneTexts, sceneToSvg, textWidth, WEB_FONT, type FontToken, type Scene } from '@/tracker/share/scene';
import { SHARE_H, SHARE_W, workoutShareScene, type WorkoutShareInput } from '@/tracker/share/workoutCard';
import { bestSetText, shareDate } from '@/tracker/share/workoutInput';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');

function ttfs(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...ttfs(p));
    else if (/_(400Regular|500Medium|600SemiBold|700Bold)\.ttf$/.test(n)) out.push(p);
  }
  return out;
}
const FONTS = join(__dirname, '..', '..', '..', '..', 'node_modules', '@expo-google-fonts');
const fontFiles = ['manrope', 'sora', 'space-grotesk'].flatMap((f) => ttfs(join(FONTS, f)));
const render = (svg: string) => new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Manrope' } });

/** Real advance width of a text in one font, from resvg (ink of "H<text>H" minus "HH"). */
function realWidth(text: string, font: FontToken, size: number): number {
  const f = WEB_FONT[font];
  const one = (t: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="300"><text x="10" y="200" font-family="${f.family}" font-weight="${f.weight}" font-size="${size}" xml:space="preserve">${t}</text></svg>`;
    return render(svg).getBBox()?.width ?? 0;
  };
  return one(`H${text}H`) - one('HH');
}

const input: WorkoutShareInput = {
  title: 'Push Day',
  dateText: 'Tue, 6 Oct 2026',
  durationText: '1h 04m',
  volumeText: '12,480',
  sets: 18,
  exercises: [
    { name: 'Barbell Bench Press', sets: 4, best: '85 kg × 8' },
    { name: 'Incline Dumbbell Press With A Very Long Custom Name Indeed', sets: 3, best: '30 kg each × 10' },
    { name: 'Overhead Press', sets: 3, best: '50 kg × 6' },
    { name: 'Lateral Raise', sets: 4, best: '12 kg × 15' },
    { name: 'Triceps Pushdown', sets: 3, best: '35 kg × 12' },
    { name: 'Plank', sets: 2, best: '1:30' },
  ],
  records: [
    { exerciseName: 'Barbell Bench Press', label: 'Heaviest weight', value: '85 kg' },
    { exerciseName: 'Barbell Bench Press', label: 'Best set', value: '85 kg × 8' },
    { exerciseName: 'Plank', label: 'Longest time', value: '1:30' },
  ],
  muscles: [
    { muscle: 'chest', sets: 7 },
    { muscle: 'triceps', sets: 6.5 },
  ],
};

/** Every text's left and right edge stays inside the picture. */
function textsInside(scene: Scene): string[] {
  const bad: string[] = [];
  for (const n of scene.nodes) {
    if (n.t !== 'text') continue;
    const w = textWidth(n.text, n.font, n.size);
    const left = n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x;
    if (left < 40 || left + w > scene.width - 40) bad.push(n.text);
  }
  return bad;
}

describe('text fits before the phone draws it', () => {
  it('the width table matches the real fonts within 3%', () => {
    const samples: [string, FontToken, number][] = [
      ['Barbell Bench Press', 'bodySemi', 34],
      ['12,480', 'monoBold', 52],
      ['Push Day', 'display', 92],
      ['Heaviest weight · 85 kg', 'bodyMedium', 28],
    ];
    for (const [t, f, s] of samples) {
      const est = textWidth(t, f, s);
      const real = realWidth(t, f, s);
      expect(Math.abs(est - real) / real, `${t} (${f}): est ${est.toFixed(1)} vs ${real.toFixed(1)}`).toBeLessThan(0.03);
    }
  });

  it('cuts with "…" only when it must, and never past the width', () => {
    expect(fitText('Squat', 'bodySemi', 34, 400)).toBe('Squat');
    const cut = fitText('Incline Dumbbell Press With A Very Long Custom Name', 'bodySemi', 34, 300);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 'bodySemi', 34)).toBeLessThanOrEqual(300);
    expect(fitText('बेंच प्रेस बहुत लंबा नाम जो कटेगा', 'bodySemi', 34, 120).endsWith('…')).toBe(true);
  });

  it('records wrap between items onto two lines, and say how many fitted', () => {
    const items = ['Heaviest weight 85 kg', 'Estimated 1-rep max 107.7 kg', 'Best set 85 kg × 8', 'Best workout 2,140 kg'];
    const { lines, used } = packLines(items, 'bodyMedium', 28, 448, 2);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => textWidth(l, 'bodyMedium', 28) <= 448)).toBe(true);
    expect(lines.join(' · ').split(' · ')).toEqual(items.slice(0, used));
    expect(used).toBeLessThan(items.length);
  });

  it('a big number shrinks to fit its box instead of being cut', () => {
    expect(fitSize('1h 04m', 'monoBold', 52, 171, 30)).toBeLessThan(52);
    expect(textWidth('1h 04m', 'monoBold', fitSize('1h 04m', 'monoBold', 52, 171, 30))).toBeLessThanOrEqual(171);
    expect(fitSize('18', 'monoBold', 52, 171)).toBe(52);
  });
});

describe('the workout picture', () => {
  const scene = workoutShareScene(input);

  it('is 1080 × 1350 and renders', () => {
    expect([scene.width, scene.height]).toEqual([SHARE_W, SHARE_H]);
    const png = render(sceneToSvg(scene)).render();
    expect([png.width, png.height]).toEqual([1080, 1350]);
    expect(png.asPng().length).toBeGreaterThan(20_000);
  });

  it('says what the workout was: day, date, time, volume, sets, records', () => {
    const texts = sceneTexts(scene);
    for (const t of ['Push Day', 'Tue, 6 Oct 2026', '1h 04m', '12,480', '18', '3', 'Workout complete', 'Logged with ForgeAI']) {
      expect(texts, t).toContain(t);
    }
  });

  it('groups records per exercise (wrapping, never cut) and lists four exercises, then "+ N more"', () => {
    const texts = sceneTexts(scene);
    expect(texts).toContain('Heaviest weight 85 kg');
    expect(texts).toContain('Best set 85 kg × 8');
    expect(texts).toContain('Longest time 1:30');
    expect(texts.some((t) => t.startsWith('and '))).toBe(false);
    expect(texts.filter((t) => / × /.test(t) && /^\d+ × /.test(t))).toHaveLength(4);
    expect(texts).toContain('+ 2 more exercises');
  });

  it('nothing runs off the edge', () => {
    expect(textsInside(scene)).toEqual([]);
  });

  it('without records it lists the muscles worked instead', () => {
    const texts = sceneTexts(workoutShareScene({ ...input, records: [] }));
    expect(texts).toContain('MUSCLES WORKED');
    expect(texts).toContain('Chest');
    expect(texts).toContain('7 sets');
  });
});

describe('the report pictures', () => {
  const s = (d: string): ReportSession => ({ sessionId: d, dateISO: d, durationSec: 3600, volumeKg: 9000, sets: 18, exercises: [{ exerciseId: 'b', name: 'Bench Press', sets: 4 }] });
  const month = buildMonthReport({
    month: '2026-09',
    complete: true,
    sessions: ['2026-09-01', '2026-09-03', '2026-09-30'].map(s),
    previous: [],
    records: [],
    muscles: [{ muscle: 'chest', sets: 12 }],
    bodyweight: [],
    from: '2026-09-01',
    to: '2026-09-30',
  });
  const year = buildYearReview({
    year: 2026,
    complete: false,
    lastMonth: '2026-10',
    sessions: ['2026-01-05', '2026-03-02', '2026-10-01'].map(s),
    recordCount: 12,
    strength: [],
    muscles: [],
    bodyweight: [],
  });

  it('the month: title, the days trained on its calendar, most trained', () => {
    const scene = monthShareScene(month, 2);
    const texts = sceneTexts(scene);
    expect(texts).toContain('September 2026');
    expect(texts).toContain('3 workouts · 3 days trained');
    expect(texts).toContain('Bench Press');
    // Three trained days filled in ember (the logo has a dot of its own).
    expect(scene.nodes.filter((n) => n.t === 'circle' && n.fill === '#FF7A3B')).toHaveLength(3);
    expect(textsInside(scene)).toEqual([]);
    expect(render(sceneToSvg(scene)).render().width).toBe(1080);
  });

  it('the year: so far, the bars, the highlights', () => {
    const scene = yearShareScene(year);
    const texts = sceneTexts(scene);
    expect(texts).toContain('2026 so far');
    expect(texts).toContain('12');
    expect(texts).toContain('HIGHLIGHTS');
    expect(textsInside(scene)).toEqual([]);
    expect(render(sceneToSvg(scene)).render().height).toBe(1350);
  });
});

describe('what a picture names', () => {
  it('each exercise\'s best set, by how it is logged', () => {
    const set = (id: string, weightKg: number, reps: number, isWarmup = false) => ({ id, weightKg, reps, isWarmup });
    const w = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km' } as const;
    expect(bestSetText([set('a', 100, 1, true), set('b', 80, 8), set('c', 85, 5)], w, {})).toBe('85 kg × 5');
    expect(bestSetText([set('b', 30, 10)], { ...w, loadMode: 'both' }, {})).toBe('30 kg each × 10');
    expect(bestSetText([set('b', 0, 12), set('c', 0, 15)], { ...w, logType: 'reps' }, {})).toBe('15 reps');
    expect(bestSetText([set('b', -20, 8), set('c', -10, 6)], { ...w, logType: 'assisted' }, {})).toBe('10 kg help × 6');
    expect(bestSetText([set('b', 0, 0)], { ...w, logType: 'time' }, { b: { rpe: null, setType: 'normal', note: null, supersetGroup: null, durationSec: 90 } })).toBe('1:30');
    expect(
      bestSetText([set('b', 0, 0)], { ...w, logType: 'time_distance' }, { b: { rpe: null, setType: 'normal', note: null, supersetGroup: null, durationSec: 720, distanceM: 2400 } }),
    ).toBe('2.4 km · 12:00');
    expect(bestSetText([set('a', 60, 8, true)], w, {})).toBeNull();
  });

  it('a date with its year, and a safe file name', () => {
    expect(shareDate('2026-10-06')).toBe('Tue, 6 Oct 2026');
    expect(pictureFileName('forgeai-workout-2026-10-06')).toBe('forgeai-workout-2026-10-06.png');
    expect(pictureFileName('../My Workout!')).toBe('my-workout.png');
  });
});
