/**
 * Share pictures — Phase 3. PURE.
 *
 * A picture is described once as a SCENE (boxes, text, the body drawing) and drawn twice:
 * on the phone by `SceneSvg` (react-native-svg, which can save itself as a PNG — no extra
 * native add-on), and on a computer by `sceneToSvg` + resvg for tests and previews. Both use
 * the app's own fonts, so a name cut to fit here fits there too.
 */
import { BODY_VIEWS, type BodyFigure, type BodyView } from '../catalog/bodyMapPaths';
import type { Muscle } from '../catalog/muscles';
import type { MapLevel } from '../engine/bodyMap';
import { MAP_OUTLINE, regionFill } from '../lib/bodyMapColors';
import { ASCII_WIDTHS, EXTRA_WIDTHS } from './fontMetrics';

export type FontToken = 'display' | 'displaySemi' | 'body' | 'bodyMedium' | 'bodySemi' | 'bodyBold' | 'mono' | 'monoBold';

/** The fonts the app registers (expo-font names), by token — what the phone draws with. */
export const NATIVE_FONT: Record<FontToken, string> = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: 'SpaceGrotesk_500Medium',
  monoBold: 'SpaceGrotesk_700Bold',
};

/** The same fonts by family and weight — what an SVG renderer on a computer draws with. */
export const WEB_FONT: Record<FontToken, { family: string; weight: number }> = {
  display: { family: 'Sora', weight: 700 },
  displaySemi: { family: 'Sora', weight: 600 },
  body: { family: 'Manrope', weight: 400 },
  bodyMedium: { family: 'Manrope', weight: 500 },
  bodySemi: { family: 'Manrope', weight: 600 },
  bodyBold: { family: 'Manrope', weight: 700 },
  mono: { family: 'Space Grotesk', weight: 500 },
  monoBold: { family: 'Space Grotesk', weight: 700 },
};

export type SceneNode =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { t: 'gradient'; x: number; y: number; w: number; h: number; r?: number; from: string; to: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  /** A soft round glow: `color` at `opacity` in the middle, fading to nothing at `r`. */
  | { t: 'glow'; cx: number; cy: number; r: number; color: string; opacity: number }
  | { t: 'text'; x: number; y: number; text: string; font: FontToken; size: number; fill: string; anchor?: 'start' | 'middle' | 'end'; opacity?: number }
  | { t: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; x?: number; y?: number; scale?: number }
  /** v0.25.1: `figure` is the member's choice in Profile (absent = male). */
  | { t: 'body'; x: number; y: number; height: number; view: 'front' | 'back'; levels: readonly (readonly [Muscle, MapLevel])[]; figure?: BodyFigure };

export interface Scene {
  width: number;
  height: number;
  background: string;
  nodes: SceneNode[];
}

// ---------------------------------------------------------------- text

const AVERAGE: Record<FontToken, number> = Object.fromEntries(
  (Object.keys(ASCII_WIDTHS) as FontToken[]).map((k) => {
    const w = ASCII_WIDTHS[k];
    // Letters only, for characters outside ASCII (accents, Devanagari): a wide-ish guess.
    const letters = w.slice(65 - 32, 91 - 32).concat(w.slice(97 - 32, 123 - 32));
    return [k, (letters.reduce((a, b) => a + b, 0) / letters.length) * 1.15];
  }),
) as Record<FontToken, number>;

/** Width of a line of text in pixels. */
export function textWidth(text: string, font: FontToken, size: number): number {
  const table = ASCII_WIDTHS[font];
  const extra = EXTRA_WIDTHS[font];
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    em += c >= 32 && c <= 126 ? table[c - 32] : extra[ch] ?? AVERAGE[font];
  }
  return em * size;
}

/**
 * Items joined with " · " over at most `maxLines` lines, a line breaking only between items.
 * An item too long for a line on its own is cut with "…"; items that do not fit are left
 * out (the caller says "and N more"). Returns the lines and how many items made it.
 */
export function packLines(items: readonly string[], font: FontToken, size: number, maxWidth: number, maxLines: number): { lines: string[]; used: number } {
  const lines: string[] = [];
  let cur = '';
  let used = 0;
  for (const item of items) {
    const next = cur ? `${cur} · ${item}` : item;
    if (textWidth(next, font, size) <= maxWidth) {
      cur = next;
      used += 1;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = '';
      if (lines.length === maxLines) break;
    }
    cur = fitText(item, font, size, maxWidth);
    used += 1;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return { lines, used: Math.min(used, items.length) };
}

/** The largest size (down to `minSize`) at which the text fits the width. */
export function fitSize(text: string, font: FontToken, maxSize: number, maxWidth: number, minSize = Math.round(maxSize * 0.6)): number {
  const w = textWidth(text, font, maxSize);
  if (w <= maxWidth) return maxSize;
  return Math.max(minSize, Math.floor((maxSize * maxWidth) / w));
}

/** The text, cut with "…" to fit the width (never cut mid-way through a surrogate pair). */
export function fitText(text: string, font: FontToken, size: number, maxWidth: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (textWidth(clean, font, size) <= maxWidth) return clean;
  const chars = [...clean];
  const ell = textWidth('…', font, size);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(chars.slice(0, mid).join(''), font, size) + ell <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

// ---------------------------------------------------------------- body figure

/** The drawing a body node stands for, scaled to `height` (each view is 1 wide : 2 high). */
export function bodyPaths(node: Extract<SceneNode, { t: 'body' }>): { d: string; fill: string }[] {
  const view = bodyView(node);
  const levels = new Map(node.levels);
  return view.parts.map((p) => ({ d: p.d, fill: regionFill(p.region, levels) }));
}

export function bodyView(node: Extract<SceneNode, { t: 'body' }>): BodyView {
  return BODY_VIEWS[node.figure ?? 'male'][node.view];
}

export { MAP_OUTLINE };

// ---------------------------------------------------------------- SVG text (computer side)

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The scene as an SVG document, for resvg on a computer (tests and previews). */
export function sceneToSvg(scene: Scene): string {
  const parts: string[] = [];
  let gid = 0;
  for (const n of scene.nodes) {
    switch (n.t) {
      case 'rect':
        parts.push(
          `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.r ?? 0}" fill="${n.fill}"${n.stroke ? ` stroke="${n.stroke}" stroke-width="${n.strokeWidth ?? 1}"` : ''}${n.opacity != null ? ` opacity="${n.opacity}"` : ''}/>`,
        );
        break;
      case 'gradient': {
        const id = `g${gid++}`;
        parts.push(
          `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${n.from}"/><stop offset="1" stop-color="${n.to}"/></linearGradient></defs>`,
          `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.r ?? 0}" fill="url(#${id})"/>`,
        );
        break;
      }
      case 'circle':
        parts.push(`<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${n.fill}"/>`);
        break;
      case 'glow': {
        const id = `g${gid++}`;
        parts.push(
          `<defs><radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${n.color}" stop-opacity="${n.opacity}"/><stop offset="1" stop-color="${n.color}" stop-opacity="0"/></radialGradient></defs>`,
          `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="url(#${id})"/>`,
        );
        break;
      }
      case 'text': {
        const f = WEB_FONT[n.font];
        parts.push(
          `<text x="${n.x}" y="${n.y}" font-family="${f.family}" font-weight="${f.weight}" font-size="${n.size}" fill="${n.fill}" text-anchor="${n.anchor ?? 'start'}"${n.opacity != null ? ` opacity="${n.opacity}"` : ''} xml:space="preserve">${esc(n.text)}</text>`,
        );
        break;
      }
      case 'path': {
        const tr = n.x != null || n.y != null || n.scale != null ? ` transform="translate(${n.x ?? 0} ${n.y ?? 0}) scale(${n.scale ?? 1})"` : '';
        parts.push(
          `<path d="${n.d}" fill="${n.fill ?? 'none'}"${n.stroke ? ` stroke="${n.stroke}" stroke-width="${n.strokeWidth ?? 1}" stroke-linecap="round" stroke-linejoin="round"` : ''}${tr}/>`,
        );
        break;
      }
      case 'body': {
        const view = bodyView(n);
        const s = n.height / view.viewBox.height;
        const inner = bodyPaths(n)
          .map((p) => `<path d="${p.d}" fill="${p.fill}"/>`)
          .join('');
        parts.push(
          `<g transform="translate(${n.x} ${n.y}) scale(${s}) translate(${-view.viewBox.x} ${-view.viewBox.y})">${inner}<path d="${view.outline}" fill="none" stroke="${MAP_OUTLINE}" stroke-width="${(1.5 / s).toFixed(2)}"/></g>`,
        );
        break;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"><rect width="${scene.width}" height="${scene.height}" fill="${scene.background}"/>${parts.join('')}</svg>`;
}

/** A safe file name for the saved picture: letters, digits and dashes only. */
export function pictureFileName(base: string): string {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${clean || 'forgeai'}.png`;
}

/** Every text node of a scene (tests check what the picture says). */
export function sceneTexts(scene: Scene): string[] {
  return scene.nodes.filter((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text').map((n) => n.text);
}
