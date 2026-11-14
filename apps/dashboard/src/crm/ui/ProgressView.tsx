/**
 * R-535 / R-537 (owner, 14 Nov 2026): a member's training progress as LINES that say whether they are progressing,
 * over everything their app shares (today 3 months; a newer app with 0084: 12 months). Used by "Training progress"
 * (the list's 12-week line and tag, and each member's full progress) and by the Progress card on a member's page.
 *
 *  - DateLine: a line at the points' real days, drawn like the member app's charts (apps/mobile DateLineChart:
 *    grid lines with values on the left, a soft wash under a smooth line, small dots, the last point marked and
 *    labelled, the first and last day under it). Plain SVG: the panel has no chart library.
 *  - Sparkline: the list's small line, no axes.
 *  - ProgressDetail: range, overall tag and its rule, workouts per week, strength score per main exercise, every
 *    shared workout. The staff-only "offer personal training" line stays (memberProgress.ts).
 *  - useMemberProgress: one member's progress, read once per page and kept, at most 3 reads at a time (the list
 *    reads only the cards that come into view, so a long list stays light on a phone).
 * Maths: logic/progressTrend.ts. Never body weight, photos, notes or food: the phone does not send them.
 */

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';

import { t } from '../lang/lang';
import { formatDay, formatDayShort, type DateISO } from '../logic/dates';
import { bestLifts, daysSince, exerciseLine, upsellLine, type MemberProgress } from '../logic/memberProgress';
import {
  TREND_WORDS,
  exerciseTrends,
  mainExercises,
  monotonePath,
  overallTrend,
  placePoints,
  sharedRange,
  weeklyWorkouts,
  yScale,
  type ExerciseTrend,
  type Trend,
} from '../logic/progressTrend';
import { setText } from '../logic/trainerView';
import * as questionsApi from '../shop/questionsApi';
import { Pill, color, font, radius, space, type Tone } from './kit';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;
const label = { margin: `${space.lg}px 0 ${space.xs}px`, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink } as const;

/** The member app's strength line is its second chart colour (blue); the workouts line is the brand orange. */
const BLUE = { dark: '#3987E5', light: '#2F6FCB' };
const blueStroke = { stroke: `light-dark(${BLUE.light}, ${BLUE.dark})` } as const;

// ---------------------------------------------------------------- reading one member's progress

type Got = MemberProgress | 'missing';
const kept = new Map<string, Got>();
const asking = new Map<string, Promise<Got>>();
const queue: (() => void)[] = [];
let running = 0;
const AT_ONCE = 3;

function next(): void {
  while (running < AT_ONCE && queue.length > 0) {
    running += 1;
    queue.shift()!();
  }
}

/** One member's progress, kept for the life of the page (Refresh forgets it). */
function readProgress(key: string, memberId: string): Promise<Got> {
  const k = `${key}|${memberId}`;
  const have = kept.get(k);
  if (have) return Promise.resolve(have);
  const on = asking.get(k);
  if (on) return on;
  const p = new Promise<Got>((resolve, reject) => {
    queue.push(() => {
      void questionsApi
        .getMemberProgress(key, memberId)
        .then((r) => {
          kept.set(k, r);
          resolve(r);
        }, reject)
        .finally(() => {
          asking.delete(k);
          running -= 1;
          next();
        });
    });
    next();
  });
  asking.set(k, p);
  return p;
}

/** Forget what was read (the page's Refresh). */
export function forgetProgress(): void {
  kept.clear();
}

/** One member's progress; null while unknown, when not allowed to read it, or without 0053. */
export function useMemberProgress(key: string | null, memberId: string | null, enabled = true): { p: MemberProgress | null; failed: boolean } {
  const [state, setState] = useState<{ p: MemberProgress | null; failed: boolean }>({ p: null, failed: false });
  useEffect(() => {
    if (!key || !memberId || !enabled || questionsApi.questionsMissing()) return;
    let live = true;
    // Another member (the same card reused): never show the last one's lines while this one is read.
    const have = kept.get(`${key}|${memberId}`);
    setState({ p: have && have !== 'missing' ? have : null, failed: false });
    readProgress(key, memberId)
      .then((r) => {
        if (live) setState({ p: r === 'missing' ? null : r, failed: false });
      })
      .catch((e: unknown) => {
        console.warn('[progress] reading', e);
        if (live) setState({ p: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [key, memberId, enabled]);
  return state;
}

/** True once the element has come near the screen (a browser without IntersectionObserver: at once). */
export function useSeen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

// ---------------------------------------------------------------- the tag

const TONE: Record<Trend, Tone> = { up: 'good', steady: 'muted', down: 'warn', unknown: 'muted' };

export function TrendPill({ trend }: { trend: Trend }) {
  return <Pill tone={TONE[trend]}>{t(TREND_WORDS[trend])}</Pill>;
}

// ---------------------------------------------------------------- the line

const W = 340;
const PAD = { left: 38, right: 14, top: 16, bottom: 22 };
const num = (n: number): string => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toFixed(1));

/** A line at the points' real days, from `from` to `to`, drawn like the member app's charts. */
export function DateLine({
  data,
  from,
  to,
  height = 150,
  blue,
  zero,
  ariaLabel,
  pointTitle,
  endLabel,
}: {
  data: { x: DateISO; y: number }[];
  from: DateISO;
  to: DateISO;
  height?: number;
  /** The strength colour (the app's second chart colour); otherwise the brand orange. */
  blue?: boolean;
  /** Keep 0 at the bottom (counts). */
  zero?: boolean;
  ariaLabel: string;
  pointTitle: (p: { x: DateISO; y: number }) => string;
  /** Under the right end; default the last day. */
  endLabel?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const { lo, hi, ticks } = yScale(data.map((d) => d.y), zero === true);
  const box = { left: PAD.left, right: W - PAD.right, top: PAD.top, bottom: height - PAD.bottom };
  const pts = placePoints(data, box, from, to, lo, hi);
  const yFor = (v: number) => box.bottom - ((v - lo) / (hi - lo || 1)) * (box.bottom - box.top);
  const stroke = blue ? BLUE.dark : 'var(--c-accent)';
  const strokeStyle = blue ? blueStroke : undefined;
  const last = pts[pts.length - 1];
  const lastV = data[data.length - 1];
  const area = pts.length > 1 ? `${monotonePath(pts)} L${last!.x} ${box.bottom} L${pts[0]!.x} ${box.bottom} Z` : '';
  const axis = { fontFamily: font.body, fontSize: 10, fill: 'var(--c-inkMuted)' } as const;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ maxWidth: 560, display: 'block' }} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity={0.2} style={blue ? { stopColor: blueStroke.stroke } : undefined} />
          <stop offset="1" stopColor={stroke} stopOpacity={0} style={blue ? { stopColor: blueStroke.stroke } : undefined} />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={box.left} x2={box.right} y1={yFor(v)} y2={yFor(v)} stroke="var(--c-grid)" strokeWidth={1} />
          <text x={box.left - 6} y={yFor(v) + 3.5} textAnchor="end" style={axis}>
            {num(v)}
          </text>
        </g>
      ))}
      {area ? <path d={area} fill={`url(#g${gid})`} /> : null}
      {pts.length > 1 ? <path d={monotonePath(pts)} fill="none" stroke={stroke} style={strokeStyle} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {pts.slice(0, -1).map((p, i) => (
        <circle key={`${data[i]!.x}-${i}`} cx={p.x} cy={p.y} r={2.4} fill={stroke} style={blue ? { fill: blueStroke.stroke } : undefined} opacity={0.75}>
          <title>{pointTitle(data[i]!)}</title>
        </circle>
      ))}
      {last && lastV ? (
        <>
          <circle cx={last.x} cy={last.y} r={4.5} fill={stroke} style={blue ? { fill: blueStroke.stroke } : undefined} stroke="var(--c-surface)" strokeWidth={2}>
            <title>{pointTitle(lastV)}</title>
          </circle>
          <text x={Math.min(last.x, box.right)} y={Math.max(box.top - 4, last.y - 9)} textAnchor="end" style={{ ...axis, fontSize: 11, fontWeight: 700, fill: 'var(--c-ink)' }}>
            {num(lastV.y)}
          </text>
        </>
      ) : null}
      <text x={box.left} y={height - 6} textAnchor="start" style={axis}>
        {formatDayShort(from)}
      </text>
      <text x={box.right} y={height - 6} textAnchor="end" style={axis}>
        {endLabel ?? formatDayShort(to)}
      </text>
    </svg>
  );
}

/** The list's small line (no axes): oldest on the left, the last point marked. */
export function Sparkline({ values, ariaLabel }: { values: readonly number[]; ariaLabel: string }) {
  const w = 132;
  const h = 32;
  const top = Math.max(1, ...values);
  const pts = values.map((v, i) => ({ x: 3 + (values.length > 1 ? (i / (values.length - 1)) * (w - 6) : 0), y: 3 + (1 - v / top) * (h - 6) }));
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel} style={{ display: 'block', flex: 'none' }}>
      <line x1={3} x2={w - 3} y1={h - 3} y2={h - 3} stroke="var(--c-grid)" strokeWidth={1} />
      {pts.length > 1 ? <path d={monotonePath(pts)} fill="none" stroke="var(--c-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {last ? <circle cx={last.x} cy={last.y} r={3} fill="var(--c-accent)" /> : null}
    </svg>
  );
}

// ---------------------------------------------------------------- the whole progress

/** Everything the member shares, as lines. `onMemberPage`: the card on the member's page (it adds a pointer below). */
export function ProgressDetail({ p, today, onMemberPage }: { p: MemberProgress; today: DateISO; onMemberPage?: boolean }) {
  const weeks = useMemo(() => weeklyWorkouts(p.summary, p.recent, today), [p, today]);
  const trends = useMemo(() => exerciseTrends(p.recent, today), [p, today]);
  const main = useMemo(() => mainExercises(trends), [trends]);
  const overall = overallTrend(main);
  const range = sharedRange(p.recent, today);
  const upsell = upsellLine(p, today);
  const ago = daysSince(p.updatedAt, today);
  const total = weeks.reduce((a, w) => a + w.n, 0);
  return (
    <div style={{ display: 'grid', gap: space.xs, minWidth: 0 }}>
      {range ? (
        <p style={small} data-testid="progress-range">
          {t('Shared from the member’s app: {n} workouts, {from} to {to}.', { n: range.n, from: formatDay(range.from), to: formatDay(range.to) })}
          {range.capped ? ` ${t('An older MettleUp app shares at most 30 workouts, so older ones may not be here.')}` : ''}
        </p>
      ) : null}
      {upsell ? (
        <p style={{ margin: `${space.xs}px 0`, padding: `${space.sm}px ${space.md}px`, borderRadius: radius.md, background: color.accentSoft, fontFamily: font.body, fontSize: 14, color: color.ink }}>
          {upsell} <span style={{ color: color.inkMuted }}>(Only staff see this line.)</span>
        </p>
      ) : null}

      {p.hasRecent && p.recent.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm }} data-testid="progress-overall">
          <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>{t('Overall')}</strong>
          <TrendPill trend={overall} />
        </div>
      ) : null}

      <p style={label}>{t('Workouts per week')}</p>
      {total === 0 ? (
        <p style={small}>{t('No workouts in this time.')}</p>
      ) : (
        <DateLine
          data={weeks.map((w) => ({ x: w.w, y: w.n }))}
          from={weeks[0]!.w}
          to={weeks[weeks.length - 1]!.w}
          zero
          endLabel={t('This week')}
          ariaLabel={`${t('Workouts per week')}: ${weeks.map((w) => w.n).join(', ')}`}
          pointTitle={(pt) => `${t('Week of {day}', { day: formatDayShort(pt.x) })}: ${pt.y}`}
        />
      )}

      <p style={label}>{t('Strength score, main exercises')}</p>
      <HowWorkedOut />
      {!p.hasRecent ? (
        <>
          <p style={{ ...small, marginTop: space.sm }}>{t('The member’s app is an older version. The lines show here after they update the MettleUp app.')}</p>
          {bestLifts(p).length > 0 ? (
            <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg, display: 'grid', gap: space.xs }}>
              {bestLifts(p).map((b) => (
                <li key={b.n} style={quiet}>
                  {setText(b)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : main.length === 0 ? (
        <p style={{ ...small, marginTop: space.sm }}>{t('No workouts in this time.')}</p>
      ) : (
        <div style={{ display: 'grid', gap: space.md, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', marginTop: space.sm }}>
          {main.map((e) => (
            <ExerciseLine key={e.n} e={e} from={range?.from ?? today} today={today} />
          ))}
        </div>
      )}

      <p style={label}>{t('All workouts')}</p>
      {!p.hasRecent ? (
        <p style={small}>{t('The member’s app is an older version. The lines show here after they update the MettleUp app.')}</p>
      ) : p.recent.length === 0 ? (
        <p style={small}>{t('No workouts in this time.')}</p>
      ) : (
        <AllWorkouts p={p} />
      )}

      <p style={{ ...small, marginTop: space.lg }}>
        {ago == null ? '' : ago === 0 ? 'Updated today from the member’s app. ' : ago === 1 ? 'Updated yesterday from the member’s app. ' : `Updated ${ago} days ago from the member’s app. `}
        {onMemberPage ? 'Body weight, photos and notes are never shared. For every workout, use “Full workout history” below.' : 'Body weight, photos and notes are never shared.'}
      </p>
    </div>
  );
}

/**
 * R-551 (owner, 14 Nov 2026: the rule text before the charts felt crammed): how the score and the tags are worked
 * out, folded behind one line, closed until tapped.
 */
function HowWorkedOut() {
  return (
    <details data-testid="progress-how" style={{ minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', fontFamily: font.body, fontSize: 14, color: color.ink, textDecoration: 'underline', textUnderlineOffset: 3, padding: `${space.xs}px 0` }}>
        {t('How is this worked out?')}
      </summary>
      <div style={{ display: 'grid', gap: space.xs, marginTop: space.xs }}>
        <p style={small}>
          {t('Strength score is the estimated 1-rep max of the day’s heaviest set, in kg. It uses the same maths as the member’s app. So you can fairly compare a heavy set of 5 reps with a lighter set of 10 reps.')}
        </p>
        <p style={small} data-testid="progress-rule">
          {t('Each tag compares the member’s best strength score from the last 6 weeks with the 6 weeks before. It says “Getting stronger” when it is 3% or more higher. It says “Dropping” when it is 3% or more lower. It says “Steady” for anything in between. It says “Not enough data yet” when there are fewer than 3 workouts in those 12 weeks, or none in one half.')}
        </p>
        <p style={small}>
          {t('Overall is “Getting stronger” when more of their main exercises go up than down, and “Dropping” when more go down.')}
        </p>
      </div>
    </details>
  );
}

/** One main exercise: its tag, its line, and its best set. */
function ExerciseLine({ e, from, today }: { e: ExerciseTrend; from: DateISO; today: DateISO }) {
  const kg = e.kind === 'kg';
  return (
    <section style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space.md, minWidth: 0 }} aria-label={e.n} data-testid="exercise-line">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <strong style={{ fontFamily: font.body, fontSize: 15, color: color.ink }}>{e.n}</strong>
        <TrendPill trend={e.trend} />
      </div>
      <p style={{ ...small, margin: `${space.xs}px 0 ${space.sm}px` }}>
        {kg ? t('Strength score (kg)') : t('Most reps in one set (no weight)')}
        {e.before != null && e.now != null ? ` · ${t('{before} before, {now} in the last 6 weeks', { before: num(e.before), now: num(e.now) })}` : ''}
      </p>
      {e.points.length > 1 ? (
        <DateLine
          data={e.points.map((p) => ({ x: p.d, y: p.v }))}
          from={from < e.points[0]!.d ? from : e.points[0]!.d}
          to={today}
          height={130}
          blue={kg}
          zero={!kg}
          ariaLabel={`${e.n}: ${e.points.map((p) => num(p.v)).join(', ')}`}
          pointTitle={(pt) => {
            const s = e.points.find((p) => p.d === pt.x);
            return `${formatDayShort(pt.x)}: ${s ? setText({ n: e.n, w: s.w, r: s.r }) : num(pt.y)}`;
          }}
          endLabel={t('Today')}
        />
      ) : (
        <p style={small}>{t('Only 1 workout with it so far.')}</p>
      )}
      <p style={{ ...quiet, marginTop: space.sm }}>
        {t('Best: {set} on {day}', { set: kg ? `${num(e.best.w)} kg × ${e.best.r}` : t('{n} reps', { n: e.best.r }), day: formatDayShort(e.best.d) })}
        <span style={{ color: color.inkMuted }}>{` · ${e.times === 1 ? t('1 workout') : t('{n} workouts', { n: e.times })}`}</span>
      </p>
    </section>
  );
}

/** Every shared workout, newest first: the first 10, then all. */
function AllWorkouts({ p }: { p: MemberProgress }) {
  const [all, setAll] = useState(false);
  const shown = all ? p.recent : p.recent.slice(0, 10);
  return (
    <div style={{ display: 'grid', gap: space.sm }} data-testid="all-workouts">
      {shown.map((w, i) => (
        <details key={`${w.d}-${i}`} style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space.sm}px ${space.md}px` }}>
          <summary style={{ cursor: 'pointer', fontFamily: font.body, fontSize: 14, color: color.ink }}>
            <strong>{formatDay(w.d)}</strong> · {w.n}{' '}
            <span style={{ color: color.inkMuted }}>({w.x.length === 1 ? t('1 exercise') : t('{n} exercises', { n: w.x.length })})</span>
          </summary>
          <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg, display: 'grid', gap: 2 }}>
            {w.x.map((x) => (
              <li key={x.n} style={quiet}>
                {exerciseLine(x)}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {p.recent.length > 10 ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          style={{ justifySelf: 'start', minHeight: 44, background: 'none', border: 'none', padding: `${space.xs}px 0`, cursor: 'pointer', fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.accentBright }}
        >
          {all ? t('Show fewer') : t('Show all {n} workouts', { n: p.recent.length })}
        </button>
      ) : null}
    </div>
  );
}
