/**
 * Audit Phase 8 follow-up — the memory the snapshot text (Drive backup, the safety copy before
 * Replace or a restore) holds, OLD vs NEW, each in a process of its own:
 *
 *   SNAP_MODE=old npx vitest run -c test/perf/vitest.perf.config.ts phase8snapshotMem
 *   SNAP_MODE=new npx vitest run -c test/perf/vitest.perf.config.ts phase8snapshotMem
 *
 * 5 years of synthetic history (1,300 workouts / 31,869 sets). The heap is sampled after a
 * collection (only what is still held) after every read and after the text is made.
 *  - old: every row of every table held as objects, then one JSON.stringify of them all.
 *  - new: a page of rows at a time, each page turned into text at once; the pages are joined
 *    at the end, so for a moment the pages and the joined text are both held: `joinMB` adds
 *    that moment (2 × the text), which no sample can see.
 */
import v8 from 'node:v8';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp } from '../helpers/realDb';
import { generateHistory } from './syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));

v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc') as () => void;
const held = (): number => {
  gc();
  return process.memoryUsage().heapUsed;
};
const mb = (n: number): number => Math.round((n / 1048576) * 10) / 10;

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

const TABLES = ['user_profile', 'exercises', 'exercise_prefs', 'workout_plans', 'plan_days', 'plan_exercises', 'workout_sessions',
  'set_entries', 'personal_records', 'body_weight', 'body_measurements', 'meals', 'chat_messages'];

describe('perf: snapshot text memory', () => {
  it(`5 years (${process.env.SNAP_MODE ?? 'new'})`, async () => {
    const mode = process.env.SNAP_MODE === 'old' ? 'old' : 'new';
    const db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    {
      const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
      const csv = generateHistory({ workouts: 1300 }).csv;
      await runImport(parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64')), { mode: 'merge' });
    }
    const { exportSnapshot } = await import('@/cloud/snapshot');
    const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const origAll = target.getAllAsync;
    const base = held();
    let peak = 0;
    target.getAllAsync = async (...a: unknown[]) => {
      const r = await origAll.apply(db, a);
      peak = Math.max(peak, held() - base);
      return r;
    };
    let text = '';
    try {
      if (mode === 'old') {
        const tables: Record<string, unknown[]> = {};
        for (const name of TABLES) tables[name] = (await target.getAllAsync(`SELECT * FROM ${name}`)) as unknown[];
        peak = Math.max(peak, held() - base);
        text = JSON.stringify({ app: 'forgeai', tables });
        peak = Math.max(peak, held() - base); // the rows and the text, both held
      } else {
        text = await exportSnapshot();
        peak = Math.max(peak, held() - base, text.length * 2); // + the join moment (see header)
      }
    } finally {
      target.getAllAsync = origAll;
    }
    expect(text.length).toBeGreaterThan(1_000_000);
    // eslint-disable-next-line no-console
    console.log(`[snapmem] ${JSON.stringify({ mode, peakHeapMB: mb(peak), textMB: mb(text.length) })}`);
  });
});
