/**
 * Share pictures for the monthly report and the year in review (Phase 3). Same frame and
 * size as the workout picture: wordmark, the period, four numbers, then the month's
 * calendar (or the year's month-by-month bars) and the highlights. PURE.
 */
import { fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import { countWord } from '@/lib/words';
import { color } from '@/theme/tokens';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { fmtTotalDistance } from '../engine/logTypes';
import { bigNumber, durationText, type MonthReport, type PeriodTotals, type PictureTotals, type YearReview } from '../engine/reports';
import { setsText } from '../engine/volume';
import { daysInMonth, firstWeekday, monthName, monthTitle } from '../lib/months';
import { wordmark } from './brand';
import { fitText, type Scene, type SceneNode } from './scene';
import { cornerGlow, SHARE_H, SHARE_W, statBox } from './workoutCard';

const M = 72;
const BG = '#0A0C12';
const LINE = 'rgba(255,255,255,0.08)';

function frame(kicker: string, title: string, sub: string): SceneNode[] {
  return [
    cornerGlow(),
    ...wordmark(M, 64, 56).nodes,
    { t: 'text', x: SHARE_W - M, y: 103, text: kicker, font: 'bodyMedium', size: 30, fill: color.inkSecondary, anchor: 'end' },
    { t: 'text', x: M, y: 236, text: fitText(title, 'display', 84, SHARE_W - M * 2), font: 'display', size: 84, fill: color.ink },
    { t: 'text', x: M, y: 292, text: sub, font: 'bodySemi', size: 32, fill: color.accent },
  ];
}

function stats(items: [string, string][]): SceneNode[] {
  const gap = 20;
  const w = (SHARE_W - M * 2 - gap * (items.length - 1)) / items.length;
  return items.flatMap(([label, value], i) => statBox(M + i * (w + gap), 336, w, label, value));
}

function footer(): SceneNode {
  return { t: 'text', x: SHARE_W / 2, y: SHARE_H - 44, text: 'Logged with ForgeAI', font: 'bodyMedium', size: 26, fill: color.inkMuted, anchor: 'middle' };
}

/**
 * The line under the title: "43 workouts · 22 days trained". v0.25.1: never "1 days", and
 * when only some workouts have a length (one logged by chat has none) it says how many did —
 * "43 workouts, 40 timed" — so the picture's time never reads as the whole period's, as the
 * report screen already says "in 40 timed workouts". PURE.
 */
export function periodLine(t: Pick<PeriodTotals, 'workouts' | 'days' | 'timed'>): string {
  const partial = t.timed > 0 && t.timed < t.workouts;
  return `${fmtInt(t.workouts)} ${t.workouts === 1 ? 'workout' : 'workouts'}${partial ? `, ${fmtInt(t.timed)} timed` : ''} · ${fmtInt(t.days)} ${t.days === 1 ? 'day' : 'days'} trained`;
}

/**
 * The second box of a month or year picture (v0.25.1 review), by the workout picture's rule:
 * kilos on the bar, dumbbells, machine or belt — never body weight — else the reps (a month
 * of pull-ups), else the distance (a month of runs), else the workouts. Never "KG LIFTED 0".
 * Without the picture's own count (older callers) it keeps the report's volume. PURE.
 */
export function liftedStat(t: Pick<PeriodTotals, 'volumeKg' | 'workouts'>, p: PictureTotals | undefined): [string, string] {
  // "KG LIFTED" / "LB LIFTED", by the member's choice.
  const lifted = `${weightUnitOf().toUpperCase()} LIFTED`;
  if (!p) return [lifted, bigNumber(kgToShown(t.volumeKg))];
  if (p.kg > 0) return [lifted, bigNumber(kgToShown(p.kg))];
  if (p.reps > 0) return ['REPS', bigNumber(p.reps)];
  if (p.distanceM > 0) return ['DISTANCE', fmtTotalDistance(p.distanceM)];
  return ['WORKOUTS', fmtInt(t.workouts)];
}

/**
 * The year's time box: whole hours once there is at least one ("HOURS 91"), the minutes
 * under that ("TIME 45 min") — v0.25.1: a short year read "HOURS 0". PURE.
 */
export function yearTimeStat(durationSec: number): [string, string] {
  if (!(durationSec > 0)) return ['HOURS', '—'];
  if (durationSec >= 3600) return ['HOURS', fmtInt(Math.round(durationSec / 3600))];
  return ['TIME', durationText(durationSec)];
}

/** Rows "label ........ value", up to `max`. */
function list(top: number, title: string, rows: [string, string][]): SceneNode[] {
  const nodes: SceneNode[] = [
    { t: 'rect', x: M, y: top - 44, w: SHARE_W - M * 2, h: 2, fill: LINE },
    { t: 'text', x: M, y: top + 10, text: title, font: 'bodyBold', size: 26, fill: color.accent },
  ];
  rows.forEach(([label, value], i) => {
    const y = top + 70 + i * 60;
    nodes.push({ t: 'text', x: M, y, text: fitText(label, 'bodySemi', 34, SHARE_W - M * 2 - 320), font: 'bodySemi', size: 34, fill: color.ink });
    nodes.push({ t: 'text', x: SHARE_W - M, y, text: fitText(value, 'mono', 32, 300), font: 'mono', size: 32, fill: color.inkSecondary, anchor: 'end' });
  });
  return nodes;
}

export function monthShareScene(r: MonthReport, recordCount: number): Scene {
  const t = r.totals;
  const nodes: SceneNode[] = frame(
    'Monthly report',
    r.complete ? monthTitle(r.month) : `${monthName(r.month)} so far`,
    periodLine({ workouts: t.workouts, days: r.trainedDays.length, timed: t.timed }),
  );
  nodes.push(
    ...stats([
      ['TIME', durationText(t.durationSec)],
      liftedStat(t, r.picture),
      ['SETS', fmtInt(t.sets)],
      ['RECORDS', String(recordCount)],
    ]),
  );

  // The month as a calendar, trained days filled in ember.
  const trained = new Set(r.trainedDays);
  const cols = 7;
  const cell = (SHARE_W - M * 2) / cols;
  const lead = firstWeekday(r.month);
  const days = daysInMonth(r.month);
  const gridTop = 530;
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((h, i) =>
    nodes.push({ t: 'text', x: M + cell * i + cell / 2, y: gridTop, text: h, font: 'bodySemi', size: 24, fill: color.inkMuted, anchor: 'middle' }),
  );
  const rowH = 66;
  for (let d = 1; d <= days; d++) {
    const idx = lead + d - 1;
    const cx = M + cell * (idx % cols) + cell / 2;
    const cy = gridTop + 50 + Math.floor(idx / cols) * rowH;
    const iso = `${r.month}-${String(d).padStart(2, '0')}`;
    const on = trained.has(iso);
    if (on) nodes.push({ t: 'circle', cx, cy, r: 27, fill: color.accent });
    nodes.push({ t: 'text', x: cx, y: cy + 9, text: String(d), font: on ? 'monoBold' : 'mono', size: 25, fill: on ? '#1F0D05' : color.inkSecondary, anchor: 'middle' });
  }

  const muscles = r.muscles.filter((m) => m.muscle !== 'cardio').slice(0, 3);
  if (r.topExercises.length > 0) {
    nodes.push(...list(1000, 'MOST TRAINED', r.topExercises.slice(0, 3).map((e) => [e.name, setsText(e.sets)])));
  } else if (muscles.length > 0) {
    nodes.push(...list(1000, 'MUSCLES WORKED', muscles.map((m) => [MUSCLE_LABEL[m.muscle], setsText(m.sets)])));
  }
  nodes.push(footer());
  return { width: SHARE_W, height: SHARE_H, background: BG, nodes };
}

export function yearShareScene(y: YearReview): Scene {
  const t = y.totals;
  const nodes: SceneNode[] = frame(
    'Year in review',
    y.complete ? `${y.year} in review` : `${y.year} so far`,
    periodLine(t),
  );
  nodes.push(
    ...stats([
      yearTimeStat(t.durationSec),
      liftedStat(t, y.picture),
      ['SETS', fmtInt(t.sets)],
      ['RECORDS', fmtInt(y.recordCount)],
    ]),
  );

  // Workouts each month as bars, January to December.
  const top = 540;
  const h = 300;
  const n = 12;
  const slot = (SHARE_W - M * 2) / n;
  const max = Math.max(1, ...y.byMonth.map((m) => m.workouts));
  for (let i = 0; i < n; i++) {
    const m = y.byMonth[i];
    const x = M + slot * i + slot * 0.18;
    const w = slot * 0.64;
    nodes.push({ t: 'rect', x, y: top, w, h, r: 10, fill: '#151925' });
    if (m && m.workouts > 0) {
      const bh = Math.max(12, (m.workouts / max) * h);
      nodes.push({ t: 'rect', x, y: top + h - bh, w, h: bh, r: 10, fill: m === y.busiest ? color.accentBright : color.accent });
    }
    nodes.push({ t: 'text', x: x + w / 2, y: top + h + 44, text: 'JFMAMJJASOND'[i], font: 'bodySemi', size: 24, fill: color.inkMuted, anchor: 'middle' });
  }

  const rows: [string, string][] = [];
  const fav = y.topExercises[0];
  if (fav) rows.push([`Favourite: ${fav.name}`, setsText(fav.sets)]);
  // v0.25.1 review: "October · 1" said 1 of what — the count now says it.
  if (y.busiest) rows.push([`Busiest month · ${countWord(y.busiest.workouts, 'workout', fmtInt)}`, monthName(y.busiest.month)]);
  if (y.longestStreakWeeks > 0) rows.push(['Longest streak', `${y.longestStreakWeeks} ${y.longestStreakWeeks === 1 ? 'week' : 'weeks'}`]);
  if (y.gain) rows.push([`Biggest gain: ${y.gain.name}`, `+${y.gain.pct}%`]);
  if (rows.length > 0) nodes.push(...list(980, 'HIGHLIGHTS', rows.slice(0, 4)));
  nodes.push(footer());
  return { width: SHARE_W, height: SHARE_H, background: BG, nodes };
}
