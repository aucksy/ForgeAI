/**
 * The set row's layout and hint text — PURE (no React Native), so tests can import it.
 * Phase 2, packet B (LW-17 / SH-22 / LW-04).
 */
import { trimNum } from '@/lib/format';
import { displayUnits } from '@/lib/units';

import { distanceToUnit, fmtDuration, hasDistance, hasReps, hasTime, hasWeight, shownDistUnit, type DistUnit, type LogType } from '../engine/logTypes';
import type { PrevSet, SetFill } from '../store/activeWorkoutStore';
import { showW } from './unitText';

type Units = Parameters<typeof showW>[1];

/**
 * A set's weight as the row shows it (hint and PREVIOUS). Review fix (#4): kilos keep up to 2
 * decimals — a Target of 41.25 or a Counting-halved 21.25 each showed "41.3" / "21.3" while the
 * tick saved 41.25. Pounds read as the unit formatter writes them (0.1 lb). PURE.
 */
export function setW(kg: number, units?: Units): string {
  const u = units ?? displayUnits();
  return showW(kg, u, u === 'imperial' ? 1 : 2);
}

/** Packet B (LW-17 / SH-22): the row's widths on a roomy phone, shared with the card's column header. */
export const SET_ROW = {
  /** SET cell: 44 wide + 4 dp of touch on its left (the row's padding) = 48. */
  set: 44,
  /** ✓, RPE and the timer button: 48 wide, 44 high + 2 dp of touch above and below. */
  button: 48,
  height: 44,
  /** The row's touch height: every box and button is at least 48 dp to the finger. */
  touch: 48,
  /** PREVIOUS at its widest (at the phone's normal text size). */
  prevWide: 70,
} as const;

/**
 * 13 Oct 2026: under this window width the set table is "compact" — narrower SET, RPE and ✓
 * cells (each still 48 dp to the finger through its touch margin) and the table reaching 12 dp
 * into the card's side padding (Hevy's rows run nearly edge to edge). The owner's Pixel at a
 * large display size is about 360 dp wide.
 */
export const COMPACT_DP = 400;
/** Under this width the gap between two tap targets closes from 8 to 6 dp (a 320 dp phone). */
export const TIGHT_DP = 340;

/** What sits outside the row: the screen's 20 dp sides, the card's 16 dp padding, its borders (3 + 1 on a superset). */
const OUTSIDE_ROW = 2 * 20 + 2 * 16 + 3 + 1;
/** A number box's width when there is room, and the least it gets before PREVIOUS gives way. */
const INPUT_PREF = 48;
const INPUT_MIN = 44;
/** PREVIOUS never narrower than this ("@ 9" and a wrapped, shrunk "30 ×" still fit on a 320 dp phone). */
const PREV_MIN = 28;

/** The set row's widths for this phone. PURE. */
export interface RowLayout {
  /** PREVIOUS column width. */
  prevW: number;
  /** The RPE cell shows: "Track RPE" is on — at every width since 13 Oct 2026. */
  rpeCell: boolean;
  /** SET cell width (its touch margin makes it 48). */
  setW: number;
  /** RPE cell width (its touch margin makes it 48). */
  rpeW: number;
  /** ✓ and the timer button width (their touch margin makes them 48). */
  checkW: number;
  /** Gap between two tap targets. */
  gap: number;
  /** Gap either side of PREVIOUS (it is not a tap target, so it can sit closer). */
  prevGap: number;
  /** The row's own side padding. */
  padX: number;
  /** How far the table reaches into the card's side padding (0 = not at all). */
  bleed: number;
  /** About how wide each number box comes out (the boxes share what is left). */
  inputW: number;
}

/** How many number boxes and buttons a row of this type has. PURE. */
function rowCells(lt: LogType): { inputs: number; timer: boolean } {
  const inputs = [hasWeight(lt), hasReps(lt), hasTime(lt), hasDistance(lt)].filter(Boolean).length;
  return { inputs: Math.max(1, inputs), timer: lt === 'time' };
}

/**
 * The row's layout for this phone (13 Oct 2026, rebalanced): SET · PREVIOUS · boxes · (timer) ·
 * (RPE) · ✓. The RPE cell shows whenever "Track RPE" is on, at any width and text size — the owner
 * could not find it when it hid under 380 dp. The number boxes get 48 dp first; PREVIOUS takes
 * what is left, up to its widest (wider at a larger text size); when that is less than PREVIOUS
 * needs at this text size, the boxes give way down to 44 dp, and PREVIOUS wraps onto a second
 * line rather than cutting its numbers off. `fontScale` is the phone's text size (1 = normal).
 * PURE.
 */
export function rowLayout(
  windowWidth: number,
  showRpe: boolean,
  opts: { fontScale?: number; logType?: LogType } = {},
): RowLayout {
  const fs = Math.min(1.6, Math.max(1, opts.fontScale ?? 1));
  const { inputs, timer } = rowCells(opts.logType ?? 'weight_reps');
  const compact = windowWidth < COMPACT_DP;
  const setW = compact ? 40 : SET_ROW.set;
  const rpeW = compact ? 40 : SET_ROW.button;
  const checkW = compact ? 44 : SET_ROW.button;
  const gap = compact && windowWidth < TIGHT_DP ? 6 : 8;
  const prevGap = compact ? 4 : 8;
  const padX = compact ? 2 : 4;
  const bleed = compact ? 12 : 0;
  const inner = windowWidth - OUTSIDE_ROW + 2 * bleed - 2 * padX;
  // Gaps between tap targets: box to box, the timer, RPE and ✓ each after the one before.
  const targetGaps = inputs - 1 + (timer ? 1 : 0) + (showRpe ? 1 : 0) + 1;
  const fixed = setW + checkW * (timer ? 2 : 1) + (showRpe ? rpeW : 0) + 2 * prevGap + gap * targetGaps;
  const avail = inner - fixed;
  // PREVIOUS: what "100 × 10" needs at this text size, and its widest.
  const prevNeed = Math.round(48 * fs);
  const prevMax = Math.round(SET_ROW.prevWide * Math.min(fs, 1.3));
  const rest = avail - inputs * INPUT_PREF;
  let prevW = rest >= prevNeed ? Math.min(rest, prevMax) : Math.min(prevNeed, avail - inputs * INPUT_MIN);
  prevW = Math.max(PREV_MIN, Math.round(prevW));
  const inputW = Math.floor((avail - prevW) / inputs);
  return { prevW, rpeCell: showRpe, setW, rpeW, checkW, gap, prevGap, padX, bleed, inputW };
}

/**
 * 13 Oct 2026 audit (A1): the number font's widths (Space Grotesk Bold, `type.monoBold`), in ems,
 * measured from the app's .ttf. A character not listed counts as the widest digit.
 */
const NUM_EM: Readonly<Record<string, number>> = {
  '0': 0.648, '1': 0.452, '2': 0.594, '3': 0.608, '4': 0.636, '5': 0.6, '6': 0.618, '7': 0.554, '8': 0.6, '9': 0.618,
  '.': 0.298, ':': 0.298, ',': 0.294, '-': 0.432, ' ': 0.254,
};

/** How wide `text` is in the number font, in ems. PURE. */
export function numberEm(text: string): number {
  let em = 0;
  for (const ch of text) em += NUM_EM[ch] ?? 0.65;
  return em;
}

/** A number box's border + side padding + room for Android's cursor: what of its width the text cannot use. */
export const BOX_TEXT_INSET = 11;
/** The smallest a typed number gets to fit its box (still readable at arm's length). */
export const BOX_FONT_MIN = 10;

/**
 * 13 Oct 2026 audit (A1): the size a typed number is drawn at in its box — the phone's own size
 * (`base` × its text scale), smaller only when the number would not fit. On the owner's ~360 dp
 * phone at a large text size with "Track RPE" on, a box is ~44 dp, and "22.5" / "102.5" / "1:30"
 * at 15 × 1.3 were cut off ("22.", "102"); the grey hint already shrank to fit, the ticked value
 * did not. A TextInput cannot shrink its own text, so the size is worked out here. PURE.
 */
export function boxFontSize(text: string, boxWidth: number, fontScale = 1, base = 15): number {
  const want = base * (fontScale > 0 ? fontScale : 1);
  const em = numberEm(text);
  if (em <= 0 || boxWidth <= 0) return want;
  const fits = Math.floor(((boxWidth - BOX_TEXT_INSET) / em) * 10) / 10;
  return Math.max(BOX_FONT_MIN, Math.min(want, fits));
}

/** The touch margin that makes a cell `width` wide 48 dp to the finger, split left and right. PURE. */
export function touchSlop(width: number): number {
  return Math.max(0, Math.ceil((SET_ROW.touch - width) / 2));
}

/** The grey hint each box shows (and a tick saves). PURE (exported for tests). */
export function hintTexts(
  fill: SetFill | null,
  lt: LogType,
  unit: DistUnit,
  units: Parameters<typeof showW>[1],
): { weight: string; reps: string; time: string; distance: string } {
  return {
    weight: fill && (lt === 'weight_reps' || fill.weightKg) ? setW(fill.weightKg, units) : '—',
    reps: fill && fill.reps > 0 ? String(fill.reps) : '—',
    time: fill?.durationSec ? fmtDuration(fill.durationSec) : '0:00',
    distance: fill?.distanceM ? trimNum(distanceToUnit(fill.distanceM, unit), 3) : '—',
  };
}


/**
 * What the PREVIOUS cell says for last time's set. PURE (exported for tests).
 * 13 Oct 2026: with `withRpe` ("Track RPE" on) and an RPE logged last time, a second line
 * "@ 9" follows the numbers (Hevy's "30 kg × 15 @ 9 rpe"): "30 × 15\n@ 9". Off, or no RPE: as before.
 */
export function prevLabel(p: PrevSet | null, lt: LogType, unit: DistUnit, units?: Units, withRpe = false): string {
  const main = prevNumbers(p, lt, unit, units);
  return withRpe && p?.rpe != null && main !== '—' ? `${main}\n@ ${trimNum(p.rpe)}` : main;
}

/** The numbers line of PREVIOUS. PURE. */
function prevNumbers(p: PrevSet | null, lt: LogType, unit: DistUnit, units?: Units): string {
  if (!p) return '—';
  switch (lt) {
    case 'reps':
      return p.weightKg ? `+${setW(p.weightKg, units)} × ${p.reps}` : `${p.reps} ${p.reps === 1 ? 'rep' : 'reps'}`;
    case 'weighted':
      return p.weightKg > 0 ? `+${setW(p.weightKg, units)} × ${p.reps}` : `${p.reps} ${p.reps === 1 ? 'rep' : 'reps'}`;
    case 'assisted':
      return `${setW(p.weightKg, units)} × ${p.reps}`;
    case 'time':
      return p.durationSec ? fmtDuration(p.durationSec) : '—';
    case 'distance':
      return p.distanceM ? `${trimNum(distanceToUnit(p.distanceM, unit))} ${shownDistUnit(unit)}` : '—';
    case 'time_distance': {
      const d = p.distanceM ? trimNum(distanceToUnit(p.distanceM, unit)) : '';
      const t = p.durationSec ? fmtDuration(p.durationSec) : '';
      return d && t ? `${d} · ${t}` : d || t || '—';
    }
    default:
      return `${setW(p.weightKg, units)} × ${p.reps}`;
  }
}
