/**
 * The share picture's Size (Post / Story) and Background (Dark / See-through) — 15 Oct 2026,
 * copied from Hevy's light / dark / transparent share backgrounds. The pure layout in
 * `tracker/share/frame.ts`, drawn with resvg to prove the See-through PNG really is see-through.
 */
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { color } from '@/theme/tokens';
import { buildMonthReport, buildYearReview, type ReportSession } from '@/tracker/engine/reports';
import { FORGE_MARK } from '@/tracker/share/brand';
import {
  frameLayout,
  framedFileName,
  framedScene,
  isShareLook,
  isShareSize,
  SHARE_LOOK_OPTIONS,
  SHARE_SIZE_OPTIONS,
  STORY_H,
  STORY_W,
  type ShareLook,
  type ShareSize,
} from '@/tracker/share/frame';
import { monthShareScene, yearShareScene } from '@/tracker/share/reportCard';
import { CLEAR_BACKGROUND, sceneTexts, sceneToSvg, textShadows, type Scene, type SceneNode } from '@/tracker/share/scene';
import { SHARE_H, SHARE_W, workoutShareScene } from '@/tracker/share/workoutCard';

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
/** The picture as resvg draws it: width, height and RGBA pixels. */
function pixels(scene: Scene): { w: number; h: number; px: Uint8Array } {
  const img = new Resvg(sceneToSvg(scene), { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Manrope' } }).render();
  return { w: img.width, h: img.height, px: img.pixels };
}
const alphaAt = (p: { w: number; px: Uint8Array }, x: number, y: number) => p.px[(y * p.w + x) * 4 + 3];

const workout = workoutShareScene({
  title: 'Pull Day',
  dateText: 'Tue, 6 Oct 2026',
  durationText: '52m',
  volumeLabel: 'REPS',
  volumeText: '40',
  sets: 8,
  exercises: [
    { name: 'Pull-up', sets: 4, best: '12 reps' },
    { name: 'Dip', sets: 4, best: '10 reps' },
  ],
  records: [{ exerciseName: 'Pull-up', label: 'Most reps', value: '12' }],
  muscles: [
    { muscle: 'lats', sets: 4 },
    { muscle: 'chest', sets: 4 },
  ],
});
const s = (d: string): ReportSession => ({ sessionId: d, dateISO: d, durationSec: 3600, volumeKg: 9000, sets: 18, exercises: [{ exerciseId: 'b', name: 'Bench Press', sets: 4 }] });
const month = monthShareScene(
  buildMonthReport({
    month: '2026-09',
    complete: true,
    sessions: ['2026-09-01', '2026-09-03', '2026-09-30'].map(s),
    previous: [],
    records: [],
    muscles: [{ muscle: 'chest', sets: 12 }],
    bodyweight: [],
    from: '2026-09-01',
    to: '2026-09-30',
  }),
  2,
);
const year = yearShareScene(
  buildYearReview({
    year: 2026,
    complete: false,
    lastMonth: '2026-10',
    sessions: ['2026-01-05', '2026-03-02', '2026-10-01'].map(s),
    recordCount: 12,
    strength: [],
    muscles: [],
    bodyweight: [],
  }),
);
const CARDS: [string, Scene][] = [
  ['workout', workout],
  ['month', month],
  ['year', year],
];
const SIZES: ShareSize[] = ['post', 'story'];
const LOOKS: ShareLook[] = ['dark', 'clear'];
const texts = (scene: Scene) => scene.nodes.filter((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text');

describe('the size', () => {
  it('Post is today\'s 1080 × 1350; Story is 1080 × 1920 with the card in the middle', () => {
    expect(frameLayout({ width: SHARE_W, height: SHARE_H }, 'post')).toEqual({ width: 1080, height: 1350, dy: 0 });
    expect(frameLayout({ width: SHARE_W, height: SHARE_H }, 'story')).toEqual({ width: STORY_W, height: STORY_H, dy: 285 });
    expect(STORY_H / STORY_W).toBeCloseTo(16 / 9, 5);
    // A card already as tall as a story is never moved off the frame.
    expect(frameLayout({ width: 1080, height: 2000 }, 'story').dy).toBe(0);
  });

  it('Post + Dark is the picture every install shared before, untouched', () => {
    for (const [, card] of CARDS) expect(framedScene(card, 'post', 'dark')).toBe(card);
  });

  it('Story moves the card down, never stretches it — every word keeps its size and place across', () => {
    for (const [name, card] of CARDS) {
      const story = framedScene(card, 'story', 'dark');
      expect([story.width, story.height], name).toEqual([1080, 1920]);
      const before = texts(card);
      const after = texts(story);
      expect(after).toHaveLength(before.length);
      after.forEach((t, i) => {
        expect(t.size).toBe(before[i].size);
        expect(t.x).toBe(before[i].x);
        expect(t.y).toBe(before[i].y + 285);
      });
    }
  });

  it("Story keeps every word out of Instagram's top and bottom 250 px (its name bar and reply box)", () => {
    for (const [name, card] of CARDS) {
      for (const look of LOOKS) {
        for (const t of texts(framedScene(card, 'story', look))) {
          expect(t.y - t.size, `${name} ${look}: ${t.text}`).toBeGreaterThan(250);
          expect(t.y, `${name} ${look}: ${t.text}`).toBeLessThan(STORY_H - 250);
        }
      }
    }
  });

  it('the dark Story fills the whole frame (no see-through corner)', () => {
    const p = pixels(framedScene(workout, 'story', 'dark'));
    expect([p.w, p.h]).toEqual([1080, 1920]);
    for (const [x, y] of [[0, 0], [1079, 0], [0, 1919], [1079, 1919], [540, 100], [540, 1800]]) expect(alphaAt(p, x, y)).toBe(255);
  });
});

describe('the background', () => {
  it('See-through has no background: the PNG is clear where nothing is drawn, solid where the words are', () => {
    for (const size of SIZES) {
      const scene = framedScene(workout, size, 'clear');
      expect(scene.background).toBe(CLEAR_BACKGROUND);
      expect(sceneToSvg(scene)).not.toContain(`<rect width="${scene.width}" height="${scene.height}"`);
      const p = pixels(scene);
      for (const [x, y] of [[0, 0], [p.w - 1, 0], [0, p.h - 1], [p.w - 1, p.h - 1], [p.w - 10, p.h / 2]]) expect(alphaAt(p, x, y), `${size} ${x},${y}`).toBe(0);
      let opaque = 0;
      let clear = 0;
      for (let i = 3; i < p.px.length; i += 4) {
        if (p.px[i] === 255) opaque += 1;
        else if (p.px[i] === 0) clear += 1;
      }
      expect(opaque).toBeGreaterThan(5000);
      expect(clear / (p.w * p.h)).toBeGreaterThan(0.5);
    }
  });

  it('See-through: white words (ember headings too) with a shadow; no dark boxes or glows; the mark keeps its ember', () => {
    const brand = new Set(Object.values(FORGE_MARK));
    for (const [name, card] of CARDS) {
      const scene = framedScene(card, 'post', 'clear');
      expect(scene.nodes.some((n) => n.t === 'glow' || n.t === 'gradient'), name).toBe(false);
      expect(scene.nodes.some((n) => n.t === 'rect' && n.stroke), name).toBe(false);
      for (const t of texts(scene)) {
        if (t.fill === color.onAccent) continue; // a day number on its ember dot
        expect(t.shadow, `${name}: ${t.text}`).toBe(true);
        if (t.text === 'AI') expect(brand.has(t.fill as never), `${name}: the wordmark's AI`).toBe(true);
        else expect(t.fill, `${name}: ${t.text}`).toBe('#FFFFFF');
      }
      // The ember mark is still there.
      expect(scene.nodes.some((n) => n.t === 'rect' && n.fill === FORGE_MARK.ember)).toBe(true);
      // Its SVG draws the shadow copies under the words.
      expect(sceneToSvg(scene)).toContain('fill="#000000"');
    }
  });

  it('the shadow is soft: two dark copies just below, the nearer one darker, bigger for bigger words', () => {
    const small = textShadows(26);
    const big = textShadows(92);
    expect(small).toHaveLength(2);
    expect(small[0].dy).toBeGreaterThanOrEqual(2);
    expect(small[1].dy).toBeGreaterThan(small[0].dy);
    expect(small[0].opacity).toBeGreaterThan(small[1].opacity);
    expect(big[0].dy).toBeGreaterThan(small[0].dy);
  });
});

describe('privacy: no choice adds a number', () => {
  it('all four pictures of each card say exactly the same words (lesson: two public numbers once divided back to body weight)', () => {
    for (const [name, card] of CARDS) {
      const words = sceneTexts(card);
      for (const size of SIZES) for (const look of LOOKS) expect(sceneTexts(framedScene(card, size, look)), `${name} ${size} ${look}`).toEqual(words);
    }
  });
});

describe('the choices', () => {
  it('reads Post · Story and Dark · See-through on screen', () => {
    expect(SHARE_SIZE_OPTIONS.map((o) => o.label)).toEqual(['Post', 'Story']);
    expect(SHARE_LOOK_OPTIONS.map((o) => o.label)).toEqual(['Dark', 'See-through']);
  });

  it('a stored choice this version does not know falls back', () => {
    expect(isShareSize('story')).toBe(true);
    expect(isShareSize('square')).toBe(false);
    expect(isShareLook('clear')).toBe(true);
    expect(isShareLook('light')).toBe(false);
    expect(isShareLook(undefined)).toBe(false);
  });

  it('each variant saves under its own file name; Post + Dark keeps the old one', () => {
    expect(framedFileName('forgeai-workout-2026-10-06', 'post', 'dark')).toBe('forgeai-workout-2026-10-06');
    expect(framedFileName('forgeai-workout-2026-10-06', 'story', 'clear')).toBe('forgeai-workout-2026-10-06-story-clear');
    expect(framedFileName('forgeai-month-2026-09', 'post', 'clear')).toBe('forgeai-month-2026-09-clear');
  });
});
