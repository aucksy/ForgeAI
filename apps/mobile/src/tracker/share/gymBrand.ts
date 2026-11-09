/**
 * F146 (from #58): every share picture carries the member's gym — its logo and its name at the top
 * left, where MettleUp's wordmark sits on a picture without a gym. MettleUp moves to the foot:
 * "Logged with" + MettleUp's mark and name, small. PURE.
 *
 * Fallbacks, in order: the logo and the name; the name alone (no logo, a logo that will not load,
 * or a Starter gym, whose look has no logo); no gym (not in one, or the member chose "Hide") —
 * today's picture, untouched.
 *
 * Designer's rules:
 *  - The logo is never stretched or squeezed: its box takes the logo's own shape (1:1 up to 4:1,
 *    like the app's header mark, components/GymBrandMark.tsx) and the picture is drawn whole in it.
 *  - The logo, the name and the words on the right share one middle line (the wordmark's, y 92).
 *  - The name shrinks before it is cut, and leaves a clear gap before the words on the right.
 *  - Only words are added: the gym's name. No number, so nothing new can be divided back into a
 *    private one (D:/Brain/Lessons/public-numbers-can-divide-back-to-private-data.md).
 */
// Share pictures are posted images: always the dark look (with the gym's colours), whatever the app shows.
import { darkColor as color } from '@/theme/tokens';

import { MIN_CAP, wordmark } from './brand';
import { fitSize, fitText, textWidth, type Scene, type SceneNode } from './scene';

/** The gym on a share picture. `logo` only once its size is known (so its box keeps its shape). */
export interface ShareGym {
  name: string;
  logo: { href: string; width: number; height: number } | null;
}

/** The header's middle line and its left edge (the wordmark's: 56 high at y 64, x 72). */
const MID_Y = 92;
const LEFT = 72;
/** The logo's height on the 1080-wide picture. */
export const LOGO_H = 80;
const LOGO_GAP = 22;
/** The gap kept between the gym's name and the words on the right. */
const KICKER_GAP = 40;
const NAME_MAX = 40;
const NAME_MIN = 28;

/** The logo's box for a picture of `w` × `h`: LOGO_H high, its own shape from 1:1 to 4:1. PURE. */
export function logoBox(w: number, h: number): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: LOGO_H, h: LOGO_H };
  return { w: Math.round(LOGO_H * Math.min(4, Math.max(1, w / h))), h: LOGO_H };
}

/** A gym name fit for a picture: one line, trimmed; null when there is nothing to show. PURE. */
export function cleanGymName(name: string | null | undefined): string | null {
  const s = (name ?? '').replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
}

/** Where the words on the right start (the picture's right edge less a margin when there are none). */
function kickerLeft(scene: Scene): number {
  const k = scene.nodes.find((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text' && n.role === 'kicker');
  if (!k) return scene.width - LEFT;
  const w = textWidth(k.text, k.font, k.size);
  const anchor = k.anchor ?? 'start';
  return anchor === 'end' ? k.x - w : anchor === 'middle' ? k.x - w / 2 : k.x;
}

/** The gym's logo (if any) and name, on the header's middle line. PURE. */
export function gymHeader(gym: ShareGym, rightEdge: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  let x = LEFT;
  if (gym.logo) {
    const box = logoBox(gym.logo.width, gym.logo.height);
    nodes.push({ t: 'image', x, y: MID_Y - box.h / 2, w: box.w, h: box.h, href: gym.logo.href, fit: 'contain', align: 'start', role: 'brand' });
    x += box.w + LOGO_GAP;
  }
  const room = Math.max(120, rightEdge - KICKER_GAP - x);
  const size = fitSize(gym.name, 'display', NAME_MAX, room, NAME_MIN);
  nodes.push({
    t: 'text',
    x,
    y: Math.round(MID_Y + size * 0.36),
    text: fitText(gym.name, 'display', size, room),
    font: 'display',
    size,
    fill: color.ink,
    role: 'brand',
  });
  return nodes;
}

/** "Logged with" + MettleUp's mark and name, centred where the old footer line was. PURE. */
export function madeWithFooter(cx: number, baseline: number): SceneNode[] {
  const label = 'Logged with';
  const size = 26;
  const markSize = 34;
  const gap = 14;
  const labelW = textWidth(label, 'bodyMedium', size);
  // The steel name at its smallest lockup size (BRAND.md: 20 px cap height), standing on the
  // label's baseline; wordmark() centres the name's cap box on the mark's middle.
  const top = baseline - MIN_CAP / 2 - markSize / 2;
  const probe = wordmark(0, top, markSize, MIN_CAP);
  const x0 = Math.round(cx - (labelW + gap + probe.width) / 2);
  return [
    { t: 'text', x: x0, y: baseline, text: label, font: 'bodyMedium', size, fill: color.inkMuted, role: 'footer' },
    ...wordmark(x0 + labelW + gap, top, markSize, MIN_CAP).nodes.map((n) => ({ ...n, role: 'footer' as const })),
  ];
}

/**
 * The picture with the gym on it: MettleUp's header wordmark gives way to the gym's logo and name,
 * and the footer becomes "Logged with" + MettleUp's mark. With no gym, the picture as it was. PURE.
 */
export function withGym(scene: Scene, gym: ShareGym | null): Scene {
  const name = cleanGymName(gym?.name);
  if (!gym || !name) return scene;
  const header = gymHeader({ ...gym, name }, kickerLeft(scene));
  const nodes: SceneNode[] = [];
  let placed = false;
  for (const n of scene.nodes) {
    if (n.role === 'brand') {
      if (!placed) nodes.push(...header);
      placed = true;
      continue;
    }
    if (n.role === 'footer' && n.t === 'text') {
      nodes.push(...madeWithFooter(n.x, n.y));
      continue;
    }
    if (n.role === 'footer') continue;
    nodes.push(n);
  }
  if (!placed) nodes.push(...header);
  return { ...scene, nodes };
}

/** The share sheet's "Your gym" choice (F146), shown only to a member in a gym. */
export const SHARE_GYM_OPTIONS: readonly { id: 'show' | 'hide'; label: string }[] = [
  { id: 'show', label: 'Show' },
  { id: 'hide', label: 'Hide' },
];

/** The line under the share button: what the picture shows, and what it never shows. PURE. */
export function shareSheetNote(o: { clear: boolean; gymShown: boolean; photos: boolean }): string {
  const parts: string[] = [];
  if (o.clear) parts.push('It has no background, so you can place it on a photo or an Instagram story.');
  if (o.photos) parts.push('Your photos stay on this phone until you tap Share picture.');
  parts.push(o.gymShown ? 'The picture shows your gym. It never shows your name or body weight.' : 'The picture never shows your name, your gym or your body weight.');
  return parts.join(' ');
}
