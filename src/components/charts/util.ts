/** Shared chart geometry + label helpers (internal to the charts kit). */

import { tinyDate } from '@/lib/date';
import { type } from '@/theme/tokens';

/** SVG axis-label text props per chart discipline: 11px SpaceGrotesk, muted ink. */
export const AXIS_FONT = { fontFamily: type.mono, fontSize: 11 } as const;

export const r2 = (n: number): number => Math.round(n * 100) / 100;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Human x label: dateISO -> "12 Jun", anything else passes through. */
export function xLabel(x: string): string {
  return ISO_RE.test(x) ? tinyDate(x) : x;
}

function niceNum(range: number, round: boolean): number {
  const safe = range <= 0 || !Number.isFinite(range) ? 1 : range;
  const exp = Math.floor(Math.log10(safe));
  const f = safe / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** 3-4 clean tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  let lo = min;
  let hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) hi = lo + 1;
  const step = niceNum((hi - lo) / Math.max(1, count - 1), true);
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-6 && ticks.length < 5; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

/** Pad a value domain by `pct` each side; `floorZero` pins the lower bound to 0. */
export function padDomain(
  min: number,
  max: number,
  pct = 0.08,
  floorZero = false,
): [number, number] {
  if (min === max) {
    const bump = Math.abs(min) * 0.05 || 1;
    return [floorZero ? 0 : min - bump, max + bump];
  }
  const span = max - min;
  return [floorZero ? 0 : min - span * pct, max + span * pct];
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Smooth monotone cubic path (Fritsch-Carlson): never overshoots the data,
 * so a weight trend cannot dip below its own minima.
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r2(pts[0].x)} ${r2(pts[0].y)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    dx.push(h);
    slope.push((pts[i + 1].y - pts[i].y) / (h || 1e-9));
  }
  const t: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      t.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  t.push(slope[n - 2]);
  let d = `M${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C${r2(pts[i].x + h)} ${r2(pts[i].y + h * t[i])}` +
      ` ${r2(pts[i + 1].x - h)} ${r2(pts[i + 1].y - h * t[i + 1])}` +
      ` ${r2(pts[i + 1].x)} ${r2(pts[i + 1].y)}`;
  }
  return d;
}

/** Close a line path down to `baseY` for an area fill. */
export function areaPath(pts: Pt[], baseY: number): string {
  if (pts.length === 0) return '';
  const line = monotonePath(pts);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${line} L${r2(last.x)} ${r2(baseY)} L${r2(first.x)} ${r2(baseY)} Z`;
}

/** Vertical bar with 4px-rounded data-end and a square baseline. */
export function barTopPath(x: number, yTop: number, w: number, h: number, rMax = 4): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(rMax, w / 2, h);
  const bottom = yTop + h;
  return (
    `M${r2(x)} ${r2(bottom)}` +
    ` V${r2(yTop + r)}` +
    ` Q${r2(x)} ${r2(yTop)} ${r2(x + r)} ${r2(yTop)}` +
    ` H${r2(x + w - r)}` +
    ` Q${r2(x + w)} ${r2(yTop)} ${r2(x + w)} ${r2(yTop + r)}` +
    ` V${r2(bottom)} Z`
  );
}
