/**
 * The workout summary picture (Phase 3) — 1080 × 1350 (4:5), the shape that works as an
 * Instagram post, an Instagram story and a WhatsApp photo alike. PURE.
 *
 * What it says: the workout's name and day, duration · volume · sets · records, the muscles
 * worked on the body drawing, the records set, and each exercise with its best set. No name,
 * no gym, nothing about the member's body — only the workout.
 */
import { color } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { muscleLevels } from '../engine/bodyMap';
import { fmtSets, type MuscleSetsSlice } from '../engine/volume';
import { wordmark } from './brand';
import { fitSize, fitText, packLines, type Scene, type SceneNode } from './scene';

export const SHARE_W = 1080;
export const SHARE_H = 1350;

export interface WorkoutShareInput {
  /** "Push Day". */
  title: string;
  /** "Tue, 6 Oct 2026". */
  dateText: string;
  /** "1h 04m", or null when the workout has no length. */
  durationText: string | null;
  /** "KG LIFTED" (the default), or "REPS" when only body weight moved. */
  volumeLabel?: string;
  /** "12,480" — never including body weight (see `liftedOnPicture`). */
  volumeText: string;
  sets: number;
  exercises: { name: string; sets: number; best: string | null }[];
  /** The records the picture prints. */
  records: { exerciseName: string; label: string; value: string }[];
  /** Every record the workout set, printed or not (default: `records.length`). */
  recordCount?: number;
  muscles: MuscleSetsSlice[];
}

const M = 72;
const BG = '#0A0C12';
const PANEL = '#12151E';
const LINE = 'rgba(255,255,255,0.08)';

/** A stat box: small label, big number that shrinks (never cuts) to fit the box. */
export function statBox(x: number, y: number, w: number, label: string, value: string): SceneNode[] {
  const pad = 24;
  const size = fitSize(value, 'monoBold', 52, w - pad * 2, 30);
  return [
    { t: 'rect', x, y, w, h: 150, r: 28, fill: PANEL, stroke: LINE, strokeWidth: 2 },
    { t: 'text', x: x + pad, y: y + 52, text: fitText(label, 'bodySemi', 24, w - pad * 2), font: 'bodySemi', size: 24, fill: color.inkMuted },
    { t: 'text', x: x + pad, y: y + 118, text: fitText(value, 'monoBold', size, w - pad * 2), font: 'monoBold', size, fill: color.ink },
  ];
}

/** The soft ember glow in the top corner, like the app's own screens. */
export function cornerGlow(): SceneNode {
  return { t: 'glow', cx: SHARE_W - 60, cy: 40, r: 560, color: '#FF7A3B', opacity: 0.16 };
}

export function workoutShareScene(input: WorkoutShareInput): Scene {
  const nodes: SceneNode[] = [];
  nodes.push(cornerGlow());

  // Header: wordmark left, the day right.
  nodes.push(...wordmark(M, 64, 56).nodes);
  nodes.push({ t: 'text', x: SHARE_W - M, y: 103, text: input.dateText, font: 'bodyMedium', size: 30, fill: color.inkSecondary, anchor: 'end' });

  // Title.
  nodes.push({ t: 'text', x: M, y: 236, text: fitText(input.title, 'display', 92, SHARE_W - M * 2), font: 'display', size: 92, fill: color.ink });
  nodes.push({ t: 'text', x: M, y: 292, text: 'Workout complete', font: 'bodySemi', size: 32, fill: color.accent });

  // Stats.
  const recordCount = input.recordCount ?? input.records.length;
  const stats: [string, string][] = [
    ['TIME', input.durationText ?? '—'],
    [input.volumeLabel ?? 'KG LIFTED', input.volumeText],
    ['SETS', String(input.sets)],
    ['RECORDS', String(recordCount)],
  ];
  const gap = 20;
  const w = (SHARE_W - M * 2 - gap * (stats.length - 1)) / stats.length;
  stats.forEach(([label, value], i) => nodes.push(...statBox(M + i * (w + gap), 336, w, label, value)));

  // Body map (front + back) on the left; records or muscles on the right.
  const levels = [...muscleLevels(input.muscles)];
  const fig = 440;
  nodes.push({ t: 'body', x: M - 30, y: 516, height: fig, view: 'front', levels });
  nodes.push({ t: 'body', x: M - 30 + fig / 2 - 6, y: 516, height: fig, view: 'back', levels });

  const rx = 560;
  const rw = SHARE_W - M - rx;
  if (input.records.length > 0) {
    nodes.push({ t: 'text', x: rx, y: 560, text: input.records.length === 1 ? 'NEW RECORD' : 'NEW RECORDS', font: 'bodyBold', size: 26, fill: color.accent });
    // One block per exercise: its name, then its records ("Heaviest weight 85 kg · Best set
    // 85 kg × 8") on up to two lines. Whatever does not fit is counted in "and N more".
    const groups: { name: string; items: string[] }[] = [];
    for (const r of input.records) {
      const g = groups.find((x) => x.name === r.exerciseName);
      const item = `${r.label} ${r.value}`;
      if (g) g.items.push(item);
      else groups.push({ name: r.exerciseName, items: [item] });
    }
    let y = 620;
    let shownItems = 0;
    for (const g of groups) {
      const { lines, used } = packLines(g.items, 'bodyMedium', 28, rw, 2);
      const blockH = 42 + lines.length * 38 + 24;
      if (y + blockH > 960) break;
      nodes.push({ t: 'text', x: rx, y, text: fitText(g.name, 'bodySemi', 32, rw), font: 'bodySemi', size: 32, fill: color.ink });
      lines.forEach((line, i) => nodes.push({ t: 'text', x: rx, y: y + 42 + i * 38, text: line, font: 'bodyMedium', size: 28, fill: color.accentBright }));
      shownItems += used;
      y += blockH;
    }
    const hidden = recordCount - shownItems;
    if (hidden > 0) {
      nodes.push({ t: 'text', x: rx, y: Math.min(y + 4, 964), text: `and ${hidden} more`, font: 'bodyMedium', size: 26, fill: color.inkMuted });
    }
  } else {
    nodes.push({ t: 'text', x: rx, y: 560, text: 'MUSCLES WORKED', font: 'bodyBold', size: 26, fill: color.accent });
    input.muscles
      .filter((m) => m.muscle !== 'cardio')
      .slice(0, 5)
      .forEach((m, i) => {
        const y = 620 + i * 64;
        nodes.push({ t: 'text', x: rx, y, text: fitText(MUSCLE_LABEL[m.muscle], 'bodySemi', 32, rw - 150), font: 'bodySemi', size: 32, fill: color.ink });
        nodes.push({ t: 'text', x: SHARE_W - M, y, text: `${fmtSets(m.sets)} sets`, font: 'mono', size: 30, fill: color.inkSecondary, anchor: 'end' });
      });
  }

  // Exercises.
  const top = 1000;
  nodes.push({ t: 'rect', x: M, y: top - 44, w: SHARE_W - M * 2, h: 2, fill: LINE });
  const shown = input.exercises.slice(0, 4);
  shown.forEach((e, i) => {
    const y = top + 16 + i * 62;
    const best = e.best ?? '';
    const bestW = 300;
    nodes.push({
      t: 'text',
      x: M,
      y,
      text: fitText(`${e.sets} × ${e.name}`, 'bodySemi', 34, SHARE_W - M * 2 - (best ? bestW + 24 : 0)),
      font: 'bodySemi',
      size: 34,
      fill: color.ink,
    });
    if (best) nodes.push({ t: 'text', x: SHARE_W - M, y, text: fitText(best, 'mono', 32, bestW), font: 'mono', size: 32, fill: color.inkSecondary, anchor: 'end' });
  });
  if (input.exercises.length > shown.length) {
    const more = input.exercises.length - shown.length;
    nodes.push({
      t: 'text',
      x: M,
      y: top + 16 + shown.length * 62,
      text: `+ ${more} more ${more === 1 ? 'exercise' : 'exercises'}`,
      font: 'bodyMedium',
      size: 28,
      fill: color.inkMuted,
    });
  }

  // Footer.
  nodes.push({ t: 'text', x: SHARE_W / 2, y: SHARE_H - 44, text: 'Logged with ForgeAI', font: 'bodyMedium', size: 26, fill: color.inkMuted, anchor: 'middle' });

  return { width: SHARE_W, height: SHARE_H, background: BG, nodes };
}
