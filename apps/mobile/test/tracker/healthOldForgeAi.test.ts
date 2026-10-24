/**
 * MettleUp 0.56.0 (review SHOULD): workouts the old ForgeAI app wrote to Health Connect belong to
 * com.forgeai.app and MettleUp can neither read nor replace them. "Send past workouts" therefore
 * sends, by default, only workouts started after MettleUp first ran on this phone; "Send older
 * workouts too" sends the rest after a yes that says they may show twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { sql: string; args: unknown[] }[] = [];
const meta = new Map<string, string>();
const writes: string[] = [];
const SINCE = 1_700_000_000_000;
const rows = [
  { id: 'old1', date_iso: '2023-11-01', started_at: SINCE - 86_400_000, ended_at: SINCE - 86_400_000 + 3_600_000, day_type: 'push', sets: 10, cardio: 0 },
  { id: 'new1', date_iso: '2023-11-16', started_at: SINCE + 60_000, ended_at: SINCE + 3_660_000, day_type: 'pull', sets: 12, cardio: 0 },
];

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/db', () => ({
  FIRST_RUN_KEY: 'first_run_at',
  getMeta: async (k: string) => meta.get(k) ?? null,
  setMeta: async () => undefined,
  getDb: () => ({
    getAllAsync: async (sql: string, args: unknown[] = []) => {
      calls.push({ sql, args });
      if (/started_at >= \?/.test(sql)) return rows.filter((r) => r.started_at >= (args[0] as number));
      if (/FROM body_weight/.test(sql)) return [];
      return rows;
    },
    getFirstAsync: async (sql: string, args: unknown[] = []) => {
      calls.push({ sql, args });
      if (/started_at < \?/.test(sql)) return { n: rows.filter((r) => r.started_at < (args[0] as number)).length };
      const list = /started_at >= \?/.test(sql) ? rows.filter((r) => r.started_at >= (args[0] as number)) : rows;
      const days = list.map((r) => r.date_iso).sort();
      return { n: list.length, first: days[0] ?? null, last: days[days.length - 1] ?? null };
    },
  }),
}));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthWrite: async (json: string) => {
      writes.push(json);
      return (JSON.parse(json) as unknown[]).length;
    },
  }),
}));

import {
  firstRunFrom,
  HC_OLDER_LEFT_OUT,
  HC_SEND_OLDER,
  olderSendAsk,
  pastSince,
  pastWhere,
  pastWorkoutsSummary,
  sendAllWorkoutsToHealth,
} from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

beforeEach(() => {
  calls.length = 0;
  writes.length = 0;
  meta.clear();
});

describe('the date filter: only workouts logged in MettleUp by default', () => {
  it('reads the first-run time; anything missing or broken means "every workout", as before', () => {
    expect(firstRunFrom(String(SINCE))).toBe(SINCE);
    expect(firstRunFrom(null)).toBeNull();
    expect(firstRunFrom('')).toBeNull();
    expect(firstRunFrom('soon')).toBeNull();
    expect(firstRunFrom('0')).toBeNull();
  });

  it('since = workouts started at or after it; null = every one', () => {
    expect(pastWhere(SINCE)).toEqual({ where: 's.started_at >= ?', args: [SINCE] });
    expect(pastWhere(null)).toEqual({ where: '1 = 1', args: [] });
    expect(pastWhere(Number.NaN)).toEqual({ where: '1 = 1', args: [] });
  });

  it('counts what goes and how many older ones are left out', async () => {
    meta.set('first_run_at', String(SINCE));
    const since = await pastSince();
    expect(since).toBe(SINCE);
    expect(await pastWorkoutsSummary(since)).toEqual({ count: 1, firstISO: '2023-11-16', lastISO: '2023-11-16', demo: false, older: 1 });
    expect(await pastWorkoutsSummary(null)).toEqual({ count: 2, firstISO: '2023-11-01', lastISO: '2023-11-16', demo: false, older: 0 });
  });

  it('sends only the newer workout by default, and both with "Send older workouts too"', async () => {
    usePhonePrefs.getState().setHealthUnsent(['old1', 'new1']);
    expect(await sendAllWorkoutsToHealth(undefined, SINCE)).toEqual({ kind: 'sent', sent: 1, total: 1 });
    expect((JSON.parse(writes[0]) as { id: string }[]).map((w) => w.id)).toEqual(['new1']);
    // The older one was not sent, so it is still owed; the sent one is not.
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['old1']);

    expect(await sendAllWorkoutsToHealth(undefined, null)).toEqual({ kind: 'sent', sent: 2, total: 2 });
    expect((JSON.parse(writes[1]) as { id: string }[]).map((w) => w.id)).toEqual(['old1', 'new1']);
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
  });
});

describe('the words', () => {
  it('say why older ones are left out, and warn before sending them', () => {
    expect(HC_OLDER_LEFT_OUT).toMatch(/ForgeAI/);
    expect(HC_OLDER_LEFT_OUT).toMatch(/MettleUp/);
    expect(HC_SEND_OLDER).toBe('Send older workouts too');
    const ask = olderSendAsk({ count: 480, firstISO: '2024-03-02', lastISO: '2026-10-21', demo: false }, '2026-10-24');
    expect('body' in ask && ask.body).toMatch(/twice/);
    expect('body' in ask && ask.body).not.toMatch(/nothing is counted twice/);
    expect(olderSendAsk({ count: 0, firstISO: null, lastISO: null, demo: false })).toEqual({ notice: 'No workouts to send yet.' });
    for (const w of [HC_OLDER_LEFT_OUT, HC_SEND_OLDER, JSON.stringify(ask)]) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
