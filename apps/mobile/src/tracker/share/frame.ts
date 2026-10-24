/**
 * The share picture's two choices (15 Oct 2026): its SIZE (Post, today's 1080 × 1350, or Story,
 * 1080 × 1920) and its BACKGROUND (the app's dark one, or See-through). PURE.
 *
 * Copied from Hevy. Its help centre ("Hevy App Social Guide", help.hevyapp.com article
 * 35688036014231) has you tap the Background icon to pick a light, dark or transparent background,
 * save the image, then add it in Instagram as an overlay on a story or post and resize it; its
 * shareables page (hevyapp.com/features/shareable) offers each shareable "light, dark, or
 * transparent" and shares straight to Instagram Stories. We keep dark (our only look) and add the
 * see-through one; the size choice is ours, so a story fills the phone's 9:16 frame.
 *
 * Both choices only MOVE or RECOLOUR what the picture already says — no new number is ever added
 * (D:/Brain/Lessons/public-numbers-can-divide-back-to-private-data.md: two public numbers once
 * divided back to a member's body weight). The tests check every variant prints the same words.
 *
 * Story: the 4:5 card is not stretched or enlarged. It sits in the middle of the taller frame,
 * which puts its top and bottom ~285 px in from the edges — inside Instagram's story safe zone
 * (the ~250 px bands at the top and bottom that its own name, bar and reply box cover). On the dark
 * background a second faint glow fills the bottom so the frame does not look half-empty.
 *
 * See-through: no background at all (the PNG keeps its alpha — react-native-svg's Android
 * `toDataURL` draws into a transparent ARGB_8888 bitmap and saves a PNG), white words with a soft
 * shadow so they read on any photo, the dark boxes and glows dropped, lines and bar tracks faint
 * white. ForgeAI's own mark (and the "AI" of its name) keeps its ember, and a number sitting on an ember dot keeps its ink.
 */
import { color } from '@/theme/tokens';

import { FORGE_MARK, WORD_EMBER } from './brand';
import { CLEAR_BACKGROUND, type Scene, type SceneNode } from './scene';

export type ShareSize = 'post' | 'story';
export type ShareLook = 'dark' | 'clear';

export const STORY_W = 1080;
export const STORY_H = 1920;

/** The on-screen words of the two choices (the phone-test steps read these). */
export const SHARE_SIZE_OPTIONS: readonly { id: ShareSize; label: string }[] = [
  { id: 'post', label: 'Post' },
  { id: 'story', label: 'Story' },
];
export const SHARE_LOOK_OPTIONS: readonly { id: ShareLook; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'clear', label: 'See-through' },
];

/** A size this version knows. PURE. */
export function isShareSize(v: unknown): v is ShareSize {
  return v === 'post' || v === 'story';
}

/** A background this version knows. PURE. */
export function isShareLook(v: unknown): v is ShareLook {
  return v === 'dark' || v === 'clear';
}

/**
 * Where the card sits in the frame: the frame's size and how far down the card is moved. A card
 * already as tall as (or taller than) the story frame is left where it is. PURE.
 */
export function frameLayout(card: { width: number; height: number }, size: ShareSize): { width: number; height: number; dy: number } {
  if (size === 'post') return { width: card.width, height: card.height, dy: 0 };
  const height = Math.max(STORY_H, Math.round((card.width * STORY_H) / STORY_W));
  return { width: card.width, height, dy: Math.max(0, Math.round((height - card.height) / 2)) };
}

function moved(n: SceneNode, dy: number): SceneNode {
  if (dy === 0) return n;
  switch (n.t) {
    case 'circle':
    case 'glow':
      return { ...n, cy: n.cy + dy };
    case 'path':
      // A path without an offset is drawn in picture pixels; give it one.
      return { ...n, y: (n.y ?? 0) + dy, x: n.x ?? 0 };
    default:
      return { ...n, y: n.y + dy };
  }
}

/** `#RRGGBB` / `#RGB` → 0..1 lightness; anything else (rgba, names) → null. */
function lightness(fill: string): number | null {
  let h = fill.trim();
  if (!h.startsWith('#')) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (h.length !== 6) return null;
  const v = parseInt(h, 16);
  if (Number.isNaN(v)) return null;
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const BRAND = new Set<string>(Object.values(FORGE_MARK).map((c) => c.toUpperCase()));
const WHITE = '#FFFFFF';

function seeThrough(n: SceneNode): SceneNode | null {
  switch (n.t) {
    case 'glow':
    case 'gradient':
      return null;
    case 'rect': {
      if (BRAND.has(n.fill.toUpperCase())) return n;
      // A card behind the numbers: gone — the photo is the card now.
      if (n.stroke) return null;
      const l = lightness(n.fill);
      // A line or an empty bar track (dark or see-through grey): faint white.
      if (l == null || l < 0.35) return { ...n, fill: WHITE, opacity: 0.3 };
      return n;
    }
    case 'text': {
      // A day number on its ember dot keeps the dot's ink, with no shadow.
      if (n.fill === color.onAccent) return n;
      // The wordmark's ember half ("UP" of METTLEUP, brand.ts) stays the brand's ember; every other
      // word turns white — even ember headings, whose colour is the same hex by default.
      const fill = n.text === WORD_EMBER && BRAND.has(n.fill.toUpperCase()) ? n.fill : WHITE;
      return { ...n, fill, shadow: true };
    }
    default:
      return n;
  }
}

/** The picture in the chosen size and background. Post + Dark returns the card itself. PURE. */
export function framedScene(card: Scene, size: ShareSize, look: ShareLook): Scene {
  if (size === 'post' && look === 'dark') return card;
  const { width, height, dy } = frameLayout(card, size);
  let nodes = card.nodes.map((n) => moved(n, dy));
  if (look === 'clear') {
    nodes = nodes.map(seeThrough).filter((n): n is SceneNode => n != null);
  } else if (dy > 0) {
    // Dark story: a faint ember glow in the bottom corner balances the top one.
    nodes = [{ t: 'glow', cx: 60, cy: height - 40, r: 520, color: color.accent, opacity: 0.08 }, ...nodes];
  }
  return { width, height, background: look === 'clear' ? CLEAR_BACKGROUND : card.background, nodes };
}

/** "mettleup-workout-2026-10-06" → "mettleup-workout-2026-10-06-story-clear" (Post + Dark: unchanged). PURE. */
export function framedFileName(base: string, size: ShareSize, look: ShareLook): string {
  const parts = [base];
  if (size === 'story') parts.push('story');
  if (look === 'clear') parts.push('clear');
  return parts.join('-');
}
