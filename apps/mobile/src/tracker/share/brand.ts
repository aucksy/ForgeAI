/**
 * MettleUp's mark and wordmark as scene nodes (Phase 3 share pictures). The mark is logo E
 * "Forged" (first MettleUp release, 0.56.0): the same faces as components/brand/MettleUpLogo, from
 * components/brand/mettleUpMark.ts, the M cut out so the picture shows through it.
 *
 * Gym branding (D6): MettleUp's mark is MettleUp's: its faces and "UP" are drawn in MettleUp's own
 * fixed colours, whatever gym look the app wears (the picture's other parts take the gym's colours
 * from the tokens). Only "METTLE" uses the ink, which no gym changes.
 */
import { MARK_BOX, MARK_FACES, METTLEUP_COLOURS } from '@/components/brand/mettleUpMark';
import { color } from '@/theme/tokens';

import { textWidth, type SceneNode } from './scene';

/** MettleUp's own colours (BRAND.md), never the gym's. */
export const FORGE_MARK = METTLEUP_COLOURS;
const EMBER = FORGE_MARK.forge;

/** The Forged hex mark, `size` pixels square, top-left at (x, y); the hex's points touch top and bottom. */
export function logoMark(x: number, y: number, size: number): SceneNode[] {
  const k = size / MARK_BOX.size;
  return MARK_FACES.map((f): SceneNode => ({ t: 'path', d: f.d, fill: f.fill, x: x - MARK_BOX.x * k, y: y - MARK_BOX.y * k, scale: k }));
}

/** The name on share pictures (MettleUp, R-105): "METTLE" in ink, "UP" in Forge orange. */
export const WORD_INK = 'METTLE';
export const WORD_EMBER = 'UP';

/**
 * Mark + "METTLEUP" ("UP" in Forge orange), baseline aligned to the mark's middle. Returns its width too.
 */
export function wordmark(x: number, y: number, size: number): { nodes: SceneNode[]; width: number } {
  const font = size * 0.64;
  const gap = size * 0.32;
  const tx = x + size + gap;
  const baseline = y + size * 0.5 + font * 0.36;
  const ink = textWidth(WORD_INK, 'display', font);
  const nodes: SceneNode[] = [
    ...logoMark(x, y, size),
    { t: 'text', x: tx, y: baseline, text: WORD_INK, font: 'display', size: font, fill: color.ink },
    { t: 'text', x: tx + ink, y: baseline, text: WORD_EMBER, font: 'display', size: font, fill: EMBER },
  ];
  return { nodes, width: size + gap + ink + textWidth(WORD_EMBER, 'display', font) };
}
