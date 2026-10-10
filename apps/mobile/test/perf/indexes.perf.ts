/**
 * Audit Phase 8 — does an index fix it? The same 5-year synthetic history is imported twice:
 * once on today's schema, once with four candidate indexes added (in the test only — the app is
 * not changed). The slow reads found by phase8.perf.ts are then timed on both, and their query
 * plans printed.
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts indexes
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from './syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

const MEMBER: OnboardingInput = {
  name: 'Perf Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 32,
  heightCm: 178,
  gymName: 'Test Gym',
  bodyWeightKg: 82,
  targets: { calorieTarget: 2800, proteinTargetG: 160, carbsTargetG: 330, fatTargetG: 80 },
};

export const CANDIDATE_INDEXES = [
  // PR detection's "best before this workout" and every "newest N workouts of this lift" read.
  'CREATE INDEX IF NOT EXISTS perf_sessions_started ON workout_sessions(started_at)',
  'CREATE INDEX IF NOT EXISTS perf_sets_ex_work ON set_entries(exercise_id, is_warmup, session_id, weight_kg, reps)',
  // getSetModes: "sets with their own counting" — few rows; today it walks every set of the lifts.
  'CREATE INDEX IF NOT EXISTS perf_sets_load_mode ON set_entries(exercise_id) WHERE load_mode IS NOT NULL',
  // deleteSession / finish's easy-week delete: DELETE FROM personal_records WHERE session_id = ?
  'CREATE INDEX IF NOT EXISTS perf_pr_session ON personal_records(session_id)',
];

type Row = Record<string, number | string>;

async function run(db: RealDb, label: string, out: Row[]): Promise<void> {
  const t = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
    const s = performance.now();
    const r = await fn();
    out.push({ variant: label, action: name, ms: Math.round((performance.now() - s) * 10) / 10 });
    return r;
  };
  const hist = generateHistory({ workouts: 1300 });
  const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
  const parsed = parseHevyBase64(Buffer.from(hist.csv, 'utf8').toString('base64'));
  await t('import 5y (runImport)', () => runImport(parsed, { mode: 'merge' }));
  expect(db.count('workout_sessions')).toBe(1300);

  // Routines to follow (for the Workout tab's stalled-lift count).
  const { exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const { todayISO } = await import('@/lib/date');
  const names = ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'];
  const ids = await exerciseIdsForTitles([...new Set(names.flatMap((n) => hist.routines[n] ?? []))]);
  await createFolderWithRoutines(
    'PPL',
    names.map((n) => ({
      name: n,
      dayType: (n.startsWith('Push') ? 'push' : n.startsWith('Pull') ? 'pull' : 'legs') as never,
      exercises: (hist.routines[n] ?? []).map((x) => ids.get(x)).filter((x): x is string => x != null).map((exerciseId) => ({ exerciseId, sets: 3, repMin: 6, repMax: 10 })),
    })),
    { follow: true, todayISO: todayISO() },
  );

  const { stalledLiftsInPlan } = await import('@/tracker/services/coachTargets');
  await t('Workout tab: stalledLiftsInPlan', () => stalledLiftsInPlan());
  const hf = await import('@/tracker/services/historyFeed');
  const first = await t('History first page', () => hf.getHistoryUpTo({ query: '', keep: 30 }));
  await t('History next page', () => hf.getHistoryPage({ query: '', after: first.next }));
  const { getDashboardDataPhase2 } = await import('@/tracker/services/dashboardPhase2');
  await t('Home dashboard (cold records)', () => getDashboardDataPhase2());
  await t('Home dashboard (warm)', () => getDashboardDataPhase2());
  const { readHistoryRows } = await import('@/tracker/services/historyExport');
  await t('Export read (readHistoryRows)', () => readHistoryRows());
  const { loadProgress } = await import('@/components/analytics/useAnalyticsData');
  await t('Progress loadProgress(90)', () => loadProgress(90));

  if (label === 'baseline') {
    const plan = (sql: string, p: unknown[] = []) =>
      db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, p as never).map((r) => r.detail).join(' | ');
    const ex = db.all<{ id: string }>('SELECT exercise_id AS id FROM set_entries GROUP BY exercise_id ORDER BY COUNT(*) DESC LIMIT 1')[0].id;
    // eslint-disable-next-line no-console
    console.log(
      '[plan] PR prior best:',
      plan(
        `SELECT MAX(se.weight_kg) FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.exercise_id = ? AND se.is_warmup = 0 AND ws.started_at < ? AND ws.id <> ?`,
        [ex, Date.now(), 'x'],
      ),
    );
    // eslint-disable-next-line no-console
    console.log('[plan] getSetModes:', plan('SELECT id, load_mode FROM set_entries WHERE load_mode IS NOT NULL AND exercise_id IN (?, ?)', [ex, ex]));
    // eslint-disable-next-line no-console
    console.log(
      '[plan] export:',
      plan(`SELECT s.id FROM workout_sessions s JOIN set_entries se ON se.session_id = s.id JOIN exercises e ON e.id = se.exercise_id
             ORDER BY s.started_at, s.id, se.set_number, se.rowid`),
    );
    // eslint-disable-next-line no-console
    console.log('[plan] delete PRs of a workout:', plan('DELETE FROM personal_records WHERE session_id = ?', ['x']));
  }
}

describe('Phase 8 — candidate indexes', () => {
  it('times the slow reads with and without them', async () => {
    const out: Row[] = [];
    for (const variant of ['baseline', 'with 4 indexes']) {
      const db = await bootRealApp();
      const { completeOnboarding } = await import('@/onboarding/db/dataActions');
      await completeOnboarding(MEMBER);
      if (variant !== 'baseline') for (const sql of CANDIDATE_INDEXES) db.raw.exec(sql);
      await run(db, variant, out);
    }
    const actions = [...new Set(out.map((r) => r.action))];
    const lines = ['| Action | today (ms) | with the 4 indexes (ms) |', '|---|---:|---:|'];
    for (const a of actions) {
      const b = out.find((r) => r.action === a && r.variant === 'baseline')?.ms;
      const w = out.find((r) => r.action === a && r.variant !== 'baseline')?.ms;
      lines.push(`| ${a} | ${b} | ${w} |`);
    }
    // eslint-disable-next-line no-console
    console.log(`\n${lines.join('\n')}\n`);
  });
});
