/**
 * R-319 items 1 and 11: the small pieces outside the Questions page.
 *  - useQuestionCount(): the waiting questions for the menu badge (null: no Questions for this key; hidden).
 *    Asked when the page opens, when the tab comes back into view, and every 3 minutes while it is open.
 *  - MemberProgressCard: the live "Progress" on a member's page, for the owner and the member's own ticked
 *    trainer, while the member shares from the app: kg lifted per week (line), workouts per week, best lifts
 *    with days, new bests, recent workouts, and a gentle staff-only line. The member never sees this card.
 * Both hidden until the gym's server has 0053, for the desk without the Trainer tick, and in the demo gym.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { formatDayShort, type DateISO } from '../logic/dates';
import {
  bestLifts,
  daysSince,
  exerciseLine,
  kgShort,
  linePath,
  niceMax,
  upsellLine,
  weekPoints,
  type MemberProgress,
} from '../logic/memberProgress';
import { setText } from '../logic/trainerView';
import * as questionsApi from '../shop/questionsApi';
import { useCrm } from '../store';
import { Card, SectionTitle, color, font, radius, space } from './kit';
import { useTrainerAccess } from './TrainerParts';

/** The signed-in key, when the gym is online. */
function useOnlineKey(): string | null {
  const { session } = useAuth();
  return session?.online ? (session.ownerKey ?? null) : null;
}

// ---------------------------------------------------------------- the menu badge

let count: number | null = null;
let countKey: string | null = null;
const countListeners = new Set<() => void>();
const emit = (): void => {
  for (const fn of [...countListeners]) fn();
};
// Every mounted user of the count (the app menu, the More page) leaves its asker here. One shared slot broke the
// badge: leaving More cleared it while the menu still showed the count (found by the Member messages e2e,
// 12 Nov 2026).
const askers = new Set<() => void>();
function subscribeCount(fn: () => void): () => void {
  countListeners.add(fn);
  return () => {
    countListeners.delete(fn);
  };
}

async function readCount(key: string): Promise<void> {
  try {
    const n = await questionsApi.getQuestionCount(key);
    const next = typeof n === 'number' ? n : null;
    if (countKey !== key || count !== next) {
      countKey = key;
      count = next;
      emit();
    }
  } catch (e) {
    // Offline or a hiccup: keep what was shown; the next tick asks again.
    console.warn('[questions] reading the count', e);
  }
}

/** Fresh eyes (14 Nov 2026): one count with Needs you on Today (see MemberMessageParts.tsx). */
export function publishQuestionCount(key: string, n: number | null): void {
  if (countKey === key && count === n) return;
  countKey = key;
  count = n;
  emit();
}

export function subscribeQuestionCountChange(fn: () => void): () => void {
  return subscribeCount(fn);
}

/** The shared count for this key; null when not known (or no Questions for this person). */
export function questionCountFor(key: string | null): number | null {
  return key !== null && countKey === key ? count : null;
}

/** Ask again now (after a reply, or Refresh on the page). */
export function refreshQuestionCount(): void {
  const ask = askers.values().next().value;
  ask?.();
}

/** Waiting questions for the signed-in person; null when Questions is not there for them (hide the menu item). */
export function useQuestionCount(enabled: boolean): number | null {
  const key = useOnlineKey();
  const n = useSyncExternalStore(subscribeCount, () => (countKey === key ? count : null));
  useEffect(() => {
    if (!enabled || !key || questionsApi.questionsMissing()) return;
    const run = (): void => void readCount(key);
    askers.add(run);
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 3 * 60 * 1000);
    const onShow = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      askers.delete(run);
    };
  }, [enabled, key]);
  return enabled ? n : null;
}

// ---------------------------------------------------------------- Progress on a member's page

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;
const label = { margin: `${space.lg}px 0 ${space.sm}px`, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.ink } as const;

/** A member's page: the live Progress. Hidden for anyone who may not see it and without 0053. */
export function MemberProgressCard({ memberId }: { memberId: string }) {
  const key = useOnlineKey();
  const { today } = useCrm();
  const access = useTrainerAccess();
  const mayRead = access === 'owner' || access === 'trainer';
  const [p, setP] = useState<MemberProgress | null>(null);
  useEffect(() => {
    if (!key || !mayRead || questionsApi.questionsMissing()) return;
    let live = true;
    setP(null);
    questionsApi
      .getMemberProgress(key, memberId)
      .then((r) => {
        if (live) setP(r === 'missing' ? null : r);
      })
      .catch((e: unknown) => console.warn('[progress] reading', e));
    return () => {
      live = false;
    };
  }, [key, memberId, mayRead]);
  if (!mayRead || !p || !p.allowed) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Progress</SectionTitle>
      {!p.shared ? (
        <p style={quiet}>
          This member is not sharing workouts from the MettleUp app. They can switch on “Share my workouts with my trainers” in the app’s
          settings.
        </p>
      ) : (
        <ProgressBody p={p} today={today} />
      )}
    </Card>
  );
}

function ProgressBody({ p, today }: { p: MemberProgress; today: DateISO }) {
  const points = useMemo(() => weekPoints(p.summary, today), [p, today]);
  const bests = useMemo(() => bestLifts(p), [p]);
  const upsell = upsellLine(p, today);
  const ago = daysSince(p.updatedAt, today);
  const records = p.summary.records;
  return (
    <>
      {upsell ? (
        <p
          style={{
            margin: `0 0 ${space.md}px`,
            padding: `${space.sm}px ${space.md}px`,
            borderRadius: radius.md,
            background: color.accentSoft,
            fontFamily: font.body,
            fontSize: 14,
            color: color.ink,
          }}
        >
          {upsell} <span style={{ color: color.inkMuted }}>(Only staff see this line.)</span>
        </p>
      ) : null}
      <p style={label}>Kg lifted per week (last 12 weeks)</p>
      <KgChart points={points} />
      <p style={label}>Workouts per week</p>
      <WorkoutStrip points={points} />
      {bests.length > 0 ? (
        <>
          <p style={label}>Best lifts</p>
          <ul style={{ margin: 0, paddingLeft: space.lg, display: 'grid', gap: space.xs }}>
            {bests.map((b) => (
              <li key={b.n} style={quiet}>
                {setText(b)}
                {b.d ? <span style={{ color: color.inkMuted }}>{` · ${formatDayShort(b.d)}`}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p style={label}>New bests (last 30 days)</p>
      {records.length === 0 ? (
        <p style={small}>None in the last 30 days.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: space.lg, display: 'grid', gap: space.xs }}>
          {records.map((r) => (
            <li key={`${r.n}-${r.d}`} style={quiet}>
              {setText(r)}
              <span style={{ color: color.inkMuted }}>{` · ${formatDayShort(r.d)}`}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={label}>Recent workouts</p>
      {!p.hasRecent ? (
        <p style={small}>The member’s app is an older version. Recent workouts show here after they update the MettleUp app.</p>
      ) : p.recent.length === 0 ? (
        <p style={small}>No workouts in the last 3 months.</p>
      ) : (
        <RecentList p={p} />
      )}
      <p style={{ ...small, marginTop: space.lg }}>
        {ago == null ? '' : ago === 0 ? 'Updated today from the member’s app. ' : ago === 1 ? 'Updated yesterday from the member’s app. ' : `Updated ${ago} days ago from the member’s app. `}
        Body weight, photos and notes are never shared. For every workout, use “Full workout history” below.
      </p>
    </>
  );
}

function RecentList({ p }: { p: MemberProgress }) {
  const [all, setAll] = useState(false);
  const shown = all ? p.recent : p.recent.slice(0, 5);
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      {shown.map((w, i) => (
        <details key={`${w.d}-${i}`} style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space.sm}px ${space.md}px` }}>
          <summary style={{ cursor: 'pointer', fontFamily: font.body, fontSize: 14, color: color.ink }}>
            <strong>{formatDayShort(w.d)}</strong> · {w.n} <span style={{ color: color.inkMuted }}>({w.x.length === 1 ? '1 exercise' : `${w.x.length} exercises`})</span>
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
      {p.recent.length > 5 ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          style={{ justifySelf: 'start', background: 'none', border: 'none', padding: `${space.xs}px 0`, cursor: 'pointer', fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.accentBright }}
        >
          {all ? 'Show fewer' : `Show all ${p.recent.length} workouts`}
        </button>
      ) : null}
    </div>
  );
}

const CHART_W = 320;
const CHART_H = 120;

/** kg lifted per week as a line, oldest week on the left; the top value and the first/last week under it. */
function KgChart({ points }: { points: ReturnType<typeof weekPoints> }) {
  const values = points.map((p) => p.kg);
  const top = niceMax(Math.max(0, ...values));
  const { d, pts } = linePath(values, CHART_W, CHART_H, top);
  const first = points[0];
  const last = points[points.length - 1];
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`-8 -8 ${CHART_W + 16} ${CHART_H + 16}`}
        width="100%"
        style={{ maxWidth: 520, display: 'block' }}
        role="img"
        aria-label={`Kg lifted per week for 12 weeks: ${values.map((v) => kgShort(v)).join(', ')}`}
      >
        <line x1={0} y1={CHART_H} x2={CHART_W} y2={CHART_H} stroke="var(--c-border)" strokeWidth={1} />
        <line x1={0} y1={0} x2={CHART_W} y2={0} stroke="var(--c-border)" strokeWidth={1} strokeDasharray="3 4" />
        {total > 0 ? <path d={d} fill="none" stroke="var(--c-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {pts.map((pt, i) => (
          <circle key={points[i]!.w} cx={pt.x} cy={pt.y} r={3} fill="var(--c-accent)">
            <title>{`Week of ${formatDayShort(points[i]!.w)}: ${Math.round(points[i]!.kg).toLocaleString('en-IN')} kg`}</title>
          </circle>
        ))}
      </svg>
      <figcaption style={{ ...small, display: 'flex', justifyContent: 'space-between', maxWidth: 520, marginTop: space.xs }}>
        <span>{first ? `Week of ${formatDayShort(first.w)}` : ''}</span>
        <span>{`Top line: ${kgShort(top)} kg`}</span>
        <span>{last ? 'This week' : ''}</span>
      </figcaption>
    </figure>
  );
}

/** Workouts per week as 12 small numbered boxes, oldest first (this week last). */
function WorkoutStrip({ points }: { points: ReturnType<typeof weekPoints> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3, maxWidth: 520 }} aria-label={`Workouts per week: ${points.map((p) => p.n).join(', ')}`}>
      {points.map((p) => (
        <span
          key={p.w}
          title={`Week of ${formatDayShort(p.w)}: ${p.n === 1 ? '1 workout' : `${p.n} workouts`}`}
          style={{
            display: 'grid',
            placeItems: 'center',
            height: 26,
            borderRadius: 4,
            background: p.n > 0 ? color.accentSoft : color.surfaceSunken,
            fontFamily: font.body,
            fontSize: 12,
            fontWeight: 700,
            color: p.n > 0 ? color.ink : color.inkMuted,
          }}
        >
          {p.n}
        </span>
      ))}
    </div>
  );
}
