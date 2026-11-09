/**
 * F146: the gym's logo and name on every share picture, and the before/after picture. What goes on
 * each picture, the gym / no-gym fallbacks, the logo kept in its own shape, and — the rule that
 * matters most (D:/Brain/Lessons/public-numbers-can-divide-back-to-private-data.md) — no body weight
 * and no new number anyone could divide back into one.
 */
import { describe, expect, it } from 'vitest';

import { WORDMARK_METTLE_D, WORDMARK_UP_D } from '@/components/brand/mettleUpMark';
import { beforeAfterScene, defaultPair, inOrder, PHOTO_H, PHOTO_W, photoDayText } from '@/tracker/share/beforeAfterCard';
import { framedScene } from '@/tracker/share/frame';
import { cleanGymName, LOGO_H, logoBox, shareSheetNote, withGym, type ShareGym } from '@/tracker/share/gymBrand';
import { notInMemory, waitForPictures } from '@/tracker/share/pictureReady';
import { sceneImages, sceneTexts, sceneToSvg, textWidth, type Scene, type SceneNode } from '@/tracker/share/scene';
import { SHARE_W, workoutShareScene, type WorkoutShareInput } from '@/tracker/share/workoutCard';

const WORKOUT: WorkoutShareInput = {
  title: 'Push Day',
  dateText: 'Tue, 6 Oct 2026',
  durationText: '1h 04m',
  volumeText: '12,480',
  sets: 18,
  exercises: [{ name: 'Bench Press', sets: 4, best: '80 kg × 8' }],
  records: [],
  muscles: [{ muscle: 'chest', sets: 8 }],
};

const LOGO = 'https://example.supabase.co/storage/v1/object/public/gym-logos/aa/logo-1.png';
const IRON: ShareGym = { name: 'Iron Temple Gym', logo: { href: LOGO, width: 512, height: 256 } };

type Text = Extract<SceneNode, { t: 'text' }>;
type Img = Extract<SceneNode, { t: 'image' }>;
const texts = (s: Scene): Text[] => s.nodes.filter((n): n is Text => n.t === 'text');
const images = (s: Scene): Img[] => s.nodes.filter((n): n is Img => n.t === 'image');
/** Every run of digits a picture prints. */
const numbers = (s: Scene): string[] => sceneTexts(s).flatMap((t) => t.match(/\d[\d,.]*/g) ?? []);

describe('F146 gym on the workout picture', () => {
  const plain = workoutShareScene(WORKOUT);

  it('no gym: the picture is exactly today\'s', () => {
    expect(withGym(plain, null)).toBe(plain);
    expect(withGym(plain, { name: '   ', logo: null })).toBe(plain);
    expect(sceneTexts(plain)).toContain('Logged with MettleUp');
  });

  it('with a logo: the logo and the name top left, MettleUp at the foot', () => {
    const s = withGym(plain, IRON);
    const [logo] = images(s);
    expect(logo).toMatchObject({ x: 72, h: LOGO_H, w: 160, fit: 'contain', align: 'start', href: LOGO });
    // The logo sits on the header's middle line (the date's line).
    expect(logo.y + logo.h / 2).toBe(92);
    const name = texts(s).find((t) => t.text === 'Iron Temple Gym');
    expect(name?.x).toBe(72 + 160 + 22);
    // MettleUp's header wordmark is gone; the foot says "Logged with" + the mark and the steel name.
    const header = texts(s).filter((t) => t.y < 140).map((t) => t.text);
    expect(header).toEqual(['Iron Temple Gym', 'Tue, 6 Oct 2026']);
    expect(s.nodes.some((n) => n.t === 'path' && n.d === WORDMARK_METTLE_D && n.role === 'brand')).toBe(false);
    expect(sceneTexts(s)).not.toContain('Logged with MettleUp');
    const foot = texts(s).filter((t) => t.y > 1250);
    expect(foot.map((t) => t.text)).toEqual(['Logged with']);
    const steel = s.nodes.filter((n): n is Extract<SceneNode, { t: 'path' }> => n.t === 'path' && n.role === 'footer' && (n.d === WORDMARK_METTLE_D || n.d === WORDMARK_UP_D));
    expect(steel).toHaveLength(2);
    // R-259: the steel name at its smallest lockup size (20 px cap), standing on the label's baseline.
    for (const p of steel) {
      expect(100 * p.scale!).toBeCloseTo(20);
      expect(p.y! + 100 * p.scale!).toBeCloseTo(foot[0].y);
      expect(p.x!).toBeGreaterThan(foot[0].x + textWidth('Logged with', 'bodyMedium', 26));
    }
    // The rest of the picture is untouched.
    const middle = (x: Scene) => texts(x).filter((t) => t.y > 140 && t.y < 1250).map((t) => t.text);
    expect(middle(s)).toEqual(middle(plain));
  });

  it('no logo (unbranded or Starter gym, or a logo that did not load): the name alone', () => {
    const s = withGym(plain, { name: 'Iron Temple Gym', logo: null });
    expect(images(s)).toEqual([]);
    expect(texts(s).find((t) => t.text === 'Iron Temple Gym')?.x).toBe(72);
  });

  it('a long name shrinks, then is cut, and never runs into the date', () => {
    const long = 'The Very Long Name Strength And Conditioning Fitness Club Andheri West';
    const s = withGym(plain, { ...IRON, name: long });
    const name = texts(s).find((t) => t.font === 'display' && t.y < 140)!;
    expect(name.size).toBeLessThan(40);
    expect(name.text.endsWith('…')).toBe(true);
    const date = texts(s).find((t) => t.text === 'Tue, 6 Oct 2026')!;
    expect(name.x + textWidth(name.text, name.font, name.size)).toBeLessThanOrEqual(date.x - textWidth(date.text, date.font, date.size) - 40);
  });

  it('the logo keeps its own shape: square to 4:1, never stretched', () => {
    expect(logoBox(512, 512)).toEqual({ w: 80, h: 80 });
    expect(logoBox(512, 256)).toEqual({ w: 160, h: 80 });
    expect(logoBox(2000, 100)).toEqual({ w: 320, h: 80 }); // wider than 4:1: drawn whole inside (contain)
    expect(logoBox(100, 300)).toEqual({ w: 80, h: 80 }); // a tall logo: whole, in a square box
    expect(logoBox(0, 0)).toEqual({ w: 80, h: 80 });
    expect(sceneToSvg(withGym(plain, IRON))).toContain('preserveAspectRatio="xMinYMid meet"');
  });

  it('adds only the gym name: no new number on the picture', () => {
    expect(numbers(withGym(plain, IRON))).toEqual(numbers(plain));
    expect(cleanGymName('  Iron \n Temple ')).toBe('Iron Temple');
    expect(cleanGymName(null)).toBeNull();
  });

  it('the month picture gets the gym the same way', async () => {
    const { buildMonthReport } = await import('@/tracker/engine/reports');
    const { monthShareScene } = await import('@/tracker/share/reportCard');
    const month = monthShareScene(
      buildMonthReport({ month: '2026-09', complete: true, sessions: [], previous: [], records: [], muscles: [], bodyweight: [], from: '2026-09-01', to: '2026-09-30' }),
      0,
    );
    const s = withGym(month, IRON);
    expect(images(s)).toHaveLength(1);
    expect(sceneTexts(s)).toContain('Iron Temple Gym');
    expect(sceneTexts(s)).toContain('Logged with');
  });

  it('See-through and Story keep the logo and the name', () => {
    for (const size of ['post', 'story'] as const) {
      const s = framedScene(withGym(plain, IRON), size, 'clear');
      expect(images(s)).toHaveLength(1);
      expect(sceneTexts(s)).toContain('Iron Temple Gym');
    }
  });
});

describe('F146 before/after picture', () => {
  const s = beforeAfterScene({
    before: { uri: 'file:///cache/share/before-after/a.jpg', dateISO: '2026-08-06' },
    after: { uri: 'file:///cache/share/before-after/b.jpg', dateISO: '2026-10-29' },
  });

  it('says only Before, After, the two days and how far apart', () => {
    expect(sceneTexts(s)).toEqual(['Progress photos', '12 weeks apart', 'Before and after', 'Before', '6 Aug 2026', 'After', '29 Oct 2026', 'Logged with MettleUp']);
  });

  it('never body weight: no kg, lb or measurement, and the only numbers are the days and the gap', () => {
    const all = sceneTexts(s).join(' ');
    expect(all).not.toMatch(/\b(kg|kgs|lb|lbs|cm|in|%|weight|BMI)\b/i);
    expect(numbers(s)).toEqual(['12', '6', '2026', '29', '2026']);
  });

  it('two photos in boxes of the same size, filling them, older on the left', () => {
    const [a, b] = images(s);
    expect(a).toMatchObject({ w: PHOTO_W, h: PHOTO_H, fit: 'cover', href: 'file:///cache/share/before-after/a.jpg', role: 'photo' });
    expect(b).toMatchObject({ w: PHOTO_W, h: PHOTO_H, fit: 'cover', y: a.y });
    expect(a.x).toBe(72);
    expect(b.x + b.w).toBe(SHARE_W - 72);
    expect(sceneImages(s)).toHaveLength(2);
    expect(sceneToSvg(s)).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it('with the gym: logo + name on top; See-through leaves the photos and their tags as they are', () => {
    const g = withGym(s, IRON);
    expect(sceneTexts(g)).toContain('Iron Temple Gym');
    expect(sceneImages(g)).toEqual([LOGO, 'file:///cache/share/before-after/a.jpg', 'file:///cache/share/before-after/b.jpg']);
    const clear = framedScene(g, 'story', 'clear');
    const photoNodes = (x: Scene) => x.nodes.filter((n) => n.role === 'photo').map((n) => ({ ...n, y: 0 }));
    expect(photoNodes(clear)).toEqual(photoNodes(g));
  });

  it('first and latest by default; any two put in time order', () => {
    const p = (id: string, dateISO: string, createdAt = 0) => ({ id, dateISO, createdAt, uri: id });
    const list = [p('c', '2026-09-01'), p('a', '2026-06-01'), p('d', '2026-10-01', 2), p('e', '2026-10-01', 1)];
    expect(defaultPair(list)?.map((x) => x.id)).toEqual(['a', 'd']);
    expect(defaultPair([p('a', '2026-06-01')])).toBeNull();
    expect(inOrder(p('x', '2026-10-01'), p('y', '2026-01-01')).map((x) => x.id)).toEqual(['y', 'x']);
    expect(photoDayText('2026-01-09')).toBe('9 Jan 2026');
  });
});

describe('F146 share sheet words and picture memory', () => {
  it('the note says what is shown and that body weight never is', () => {
    expect(shareSheetNote({ clear: false, gymShown: true, photos: false })).toBe('The picture shows your gym. It never shows your name or body weight.');
    expect(shareSheetNote({ clear: false, gymShown: false, photos: false })).toBe('The picture never shows your name, your gym or your body weight.');
    expect(shareSheetNote({ clear: true, gymShown: false, photos: true })).toBe(
      'It has no background, so you can place it on a photo or an Instagram story. Your photos stay on this phone until you tap Share picture. The picture never shows your name, your gym or your body weight.',
    );
  });

  it('waits until every picture is in memory, loading what is missing', async () => {
    expect(notInMemory(['a', 'b', 'c'], { a: 'memory', b: 'disk/memory', c: 'disk' })).toEqual(['c']);
    const inMem = new Set<string>(['a']);
    const loads: string[] = [];
    const missing = await waitForPictures(['a', 'b'], {
      query: async (h) => Object.fromEntries(h.filter((x) => inMem.has(x)).map((x) => [x, 'memory'])),
      load: async (h) => {
        loads.push(h);
        inMem.add(h);
      },
      wait: async () => undefined,
    });
    expect(missing).toEqual([]);
    expect(loads).toEqual(['b']);
  });

  it('gives up after its tries and names what never loaded', async () => {
    const missing = await waitForPictures(['logo'], { query: async () => ({}), load: async () => Promise.reject(new Error('404')), wait: async () => undefined }, 3);
    expect(missing).toEqual(['logo']);
    expect(await waitForPictures([], { query: async () => ({}), load: async () => undefined, wait: async () => undefined })).toEqual([]);
  });
});
