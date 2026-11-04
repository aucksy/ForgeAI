/**
 * F146 (from #58): the before/after picture — two progress photos side by side, older on the left,
 * each with its day, in the same 1080 × 1350 frame as the workout picture (so Post / Story and
 * Dark / See-through work the same, share/frame.ts, and the gym goes on top, share/gymBrand.ts).
 * PURE.
 *
 * What it says, and nothing else: "Before" and "After", the two days, how far apart they are, and
 * the frame's own words. NEVER body weight, a measurement or any other number about the body —
 * the input has no field for one, and the tests read every word of the picture.
 *
 * Layout: the header (MettleUp, or the gym), the gap as the title ("12 weeks apart"), then the two
 * photos in boxes of the same size (a portrait 0.69 : 1, a phone photo's 3 : 4 trimmed by about 4 %
 * at each side, evenly, so nothing important is cut), each with a "Before" / "After" tag on it and
 * its day under it. The photos stay on the phone: the picture is made here and leaves only when
 * the member taps Share.
 */
import { color } from '@/theme/tokens';

import { apartText } from '../lib/months';
import { fitText, textWidth, type Scene, type SceneNode } from './scene';
import { cornerGlow, footerLine, headerBrand, headerKicker, SHARE_H, SHARE_W } from './workoutCard';

export interface BeforeAfterPhoto {
  /** The photo's file on this phone (a share-sized copy). */
  uri: string;
  /** 'YYYY-MM-DD'. */
  dateISO: string;
}

export interface BeforeAfterInput {
  before: BeforeAfterPhoto;
  after: BeforeAfterPhoto;
}

const M = 72;
const BG = '#0A0C12';
const GAP = 24;
export const PHOTO_W = (SHARE_W - M * 2 - GAP) / 2;
export const PHOTO_H = 660;
const PHOTO_Y = 392;
const TAG_INK = '#FFFFFF';
const TAG_BG = 'rgba(10,12,18,0.72)';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Aug 2026": always with the year (a shared picture outlives this year). PURE. */
export function photoDayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m > 12) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The two photos in time order: the older first (same day: the one added first). PURE. */
export function inOrder<T extends { dateISO: string; createdAt?: number }>(a: T, b: T): [T, T] {
  const older = a.dateISO < b.dateISO || (a.dateISO === b.dateISO && (a.createdAt ?? 0) <= (b.createdAt ?? 0)) ? a : b;
  return older === a ? [a, b] : [b, a];
}

/** The default pair: the first photo ever and the latest. Null with fewer than two. PURE. */
export function defaultPair<T extends { id: string; dateISO: string; createdAt: number }>(photos: readonly T[]): [T, T] | null {
  if (photos.length < 2) return null;
  const sorted = [...photos].sort((x, y) => (x.dateISO < y.dateISO ? -1 : x.dateISO > y.dateISO ? 1 : x.createdAt - y.createdAt));
  return [sorted[0], sorted[sorted.length - 1]];
}

/** "Before" / "After" in a dark tag on the photo's top-left corner. */
function tag(x: number, y: number, label: string): SceneNode[] {
  const size = 26;
  const padX = 20;
  const w = Math.round(textWidth(label, 'bodyBold', size) + padX * 2);
  return [
    { t: 'rect', x: x + 20, y: y + 20, w, h: 52, r: 26, fill: TAG_BG, role: 'photo' },
    { t: 'text', x: x + 20 + w / 2, y: y + 20 + 35, text: label, font: 'bodyBold', size, fill: TAG_INK, anchor: 'middle', role: 'photo' },
  ];
}

export function beforeAfterScene(input: BeforeAfterInput): Scene {
  const nodes: SceneNode[] = [cornerGlow(), ...headerBrand(), headerKicker('Progress photos')];
  nodes.push({
    t: 'text',
    x: M,
    y: 262,
    text: fitText(apartText(input.before.dateISO, input.after.dateISO), 'display', 84, SHARE_W - M * 2),
    font: 'display',
    size: 84,
    fill: color.ink,
  });
  nodes.push({ t: 'text', x: M, y: 320, text: 'Before and after', font: 'bodySemi', size: 32, fill: color.accent });

  const shots: [string, BeforeAfterPhoto][] = [
    ['Before', input.before],
    ['After', input.after],
  ];
  shots.forEach(([label, p], i) => {
    const x = M + i * (PHOTO_W + GAP);
    nodes.push({ t: 'rect', x, y: PHOTO_Y, w: PHOTO_W, h: PHOTO_H, r: 28, fill: '#000000', role: 'photo' });
    nodes.push({ t: 'image', x, y: PHOTO_Y, w: PHOTO_W, h: PHOTO_H, href: p.uri, fit: 'cover', r: 28, role: 'photo' });
    nodes.push(...tag(x, PHOTO_Y, label));
    nodes.push({ t: 'text', x, y: PHOTO_Y + PHOTO_H + 62, text: fitText(photoDayText(p.dateISO), 'bodySemi', 34, PHOTO_W), font: 'bodySemi', size: 34, fill: color.ink });
  });

  nodes.push(footerLine());
  return { width: SHARE_W, height: SHARE_H, background: BG, nodes };
}
