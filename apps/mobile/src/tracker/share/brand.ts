/**
 * The ForgeAI mark and wordmark as scene nodes (Phase 3 share pictures). Same geometry as
 * the frozen `components/ui/Logo` (authored in a 512 box, shown through a 384 window), in a
 * flat ember instead of its gradient.
 */
import { color } from '@/theme/tokens';

import { textWidth, type SceneNode } from './scene';

const EMBER = '#FF7A3B';

/** The barbell-"F" mark, `size` pixels square, top-left at (x, y). */
export function logoMark(x: number, y: number, size: number): SceneNode[] {
  const k = size / 384;
  // Logo.tsx: viewBox "64 64 384 384", shapes inside translate(-40 22).
  const X = (v: number) => x + (v - 64 - 40) * k;
  const Y = (v: number) => y + (v - 64 + 22) * k;
  const rect = (rx: number, ry: number, w: number, h: number, r: number): SceneNode => ({
    t: 'rect',
    x: X(rx),
    y: Y(ry),
    w: w * k,
    h: h * k,
    r: r * k,
    fill: EMBER,
  });
  const spark = 'M386 262 Q392 300 430 306 Q392 312 386 350 Q380 312 342 306 Q380 300 386 262 Z';
  return [
    rect(120, 96, 352, 72, 30),
    rect(330, 52, 48, 160, 22),
    rect(398, 72, 40, 120, 20),
    rect(120, 96, 72, 320, 30),
    rect(120, 252, 168, 64, 28),
    { t: 'path', d: spark, fill: '#FF8B4A', x: X(0), y: Y(0), scale: k },
    { t: 'circle', cx: X(448), cy: Y(240), r: 13 * k, fill: color.accentBright },
  ];
}

/** Mark + "FORGEAI" ("AI" in ember), baseline aligned to the mark's middle. Returns its width too. */
export function wordmark(x: number, y: number, size: number): { nodes: SceneNode[]; width: number } {
  const font = size * 0.64;
  const gap = size * 0.32;
  const tx = x + size + gap;
  const baseline = y + size * 0.5 + font * 0.36;
  const forge = textWidth('FORGE', 'display', font);
  const nodes: SceneNode[] = [
    ...logoMark(x, y, size),
    { t: 'text', x: tx, y: baseline, text: 'FORGE', font: 'display', size: font, fill: color.ink },
    { t: 'text', x: tx + forge, y: baseline, text: 'AI', font: 'display', size: font, fill: color.accent },
  ];
  return { nodes, width: size + gap + forge + textWidth('AI', 'display', font) };
}
