/**
 * F55 Body weight from Health Connect, F62 Steps today, and "Stop and remove MettleUp's access"
 * (1 Nov 2026).
 *  - weigh-ins join the body-weight log once each, one per day; a weight the member typed (or
 *    fixed) is never changed; a later reading of a Health Connect day replaces the earlier one;
 *  - the day is the one where the weigh-in was taken (its own offset), also across midnight in India;
 *  - reads run on app open / return at most every 10 minutes, at once after the yes, never while
 *    weight reading is off, never on demo data; a refused or failed read is said, not silent;
 *  - steps come from Health Connect's own total for today;
 *  - removing access takes every permission back and the page shows everything off;
 *  - the new member words are complete sentences without banned words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Rec = { id: string; timeMs: number; offsetSec: number | null; kg: number };

const h = vi.hoisted(() => ({
  status: 'available' as 'available' | 'update' | 'unavailable',
  access: { exercise: true, calories: true, weight: true, steps: true } as Record<string, boolean> | 'throw',
  weights: [] as Rec[] | null | 'throw',
  sinces: [] as number[],
  steps: 0 as number | null | 'throw',
  revokeOk: true as boolean | 'throw',
  revokes: 0,
  asked: [] as string[][],
  demo: false,
  log: new Map<string, { id: string; kg: number }>(),
  nextId: 0,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => h.demo }));
vi.mock('@/lib/uuid', () => ({ uuid: () => `u${++h.nextId}` }));
vi.mock('@/db', () => ({
  FIRST_RUN_KEY: 'first_run_at',
  getMeta: async () => null,
  setMeta: async () => undefined,
  getDb: () => ({
    getAllAsync: async (sql: string, args: string[]) => {
      if (/FROM body_weight WHERE date_iso IN/.test(sql)) {
        return args.filter((d) => h.log.has(d)).map((d) => ({ id: h.log.get(d)!.id, date_iso: d, weight_kg: h.log.get(d)!.kg }));
      }
      return [];
    },
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: async (sql: string, args: (string | number)[]) => {
      if (/^INSERT INTO body_weight/.test(sql)) {
        const [id, day, kg] = args as [string, string, number];
        if (h.log.has(day)) return { changes: 0 };
        h.log.set(day, { id, kg });
        return { changes: 1 };
      }
      if (/^UPDATE body_weight SET weight_kg/.test(sql)) {
        const [kg, id, old] = args as [number, string, number];
        for (const [d, e] of h.log) {
          if (e.id === id && Math.abs(e.kg - old) < 0.005) {
            h.log.set(d, { id, kg });
            return { changes: 1 };
          }
        }
        return { changes: 0 };
      }
      return { changes: 0 };
    },
  }),
}));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthStatus: () => h.status,
    healthGranted: async () => true,
    healthAccess: async () => {
      if (h.access === 'throw') throw new Error('busy');
      return h.access;
    },
    healthRequest: () => true,
    healthRequestRead: (kinds: string[]) => {
      h.asked.push(kinds);
      return true;
    },
    healthReadWeights: async (since: number) => {
      h.sinces.push(since);
      if (h.weights === 'throw') throw new Error('Health Connect busy');
      return h.weights;
    },
    healthStepsToday: async () => {
      if (h.steps === 'throw') throw new Error('Health Connect busy');
      return h.steps;
    },
    healthRevokeAll: async () => {
      h.revokes += 1;
      if (h.revokeOk === 'throw') throw new Error('refused');
      return h.revokeOk;
    },
  }),
}));

import {
  FIRST_READ_DAYS,
  HC_STEPS_ABOUT,
  HC_STEPS_ERROR,
  HC_STEPS_NOT_ALLOWED,
  HC_WEIGHT_ABOUT,
  HC_WEIGHT_NOT_ALLOWED,
  HC_WEIGHT_ON,
  HC_WEIGHT_STOPPED,
  LATE_SYNC_DAYS,
  WEIGHT_FROM_HC,
  WEIGHT_READ_GAP_MS,
  askHealthRead,
  healthReadAccess,
  isHealthWeight,
  planWeightImport,
  readHealthWeights,
  readStepsToday,
  recordDay,
  resetWeightReadForTests,
  shouldReadWeights,
  stepsText,
  weightReadSince,
  weightResultText,
} from '@/tracker/phone/healthRead';
import { HC_REMOVED, HC_REMOVE_ASK, HC_REMOVE_FAILED, healthCheck, removeHealthAccess } from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const DAY = 86_400_000;
const IST = 19_800; // +05:30
/** 2026-10-28 08:00 IST. */
const T0 = Date.UTC(2026, 9, 28, 2, 30);
const ist = (): number => IST;

beforeEach(() => {
  h.status = 'available';
  h.access = { exercise: true, calories: true, weight: true, steps: true };
  h.weights = [];
  h.sinces.length = 0;
  h.steps = 0;
  h.revokeOk = true;
  h.revokes = 0;
  h.asked.length = 0;
  h.demo = false;
  h.log.clear();
  h.nextId = 0;
  resetWeightReadForTests();
  usePhonePrefs.setState({
    healthConnect: true,
    healthUnsent: [],
    healthLast: null,
    healthWeightOn: true,
    healthWeightRead: null,
    healthWeightDays: {},
    healthWeightSeen: {},
    healthStepsOn: true,
    healthRevoked: false,
  });
});

describe('the day a weigh-in belongs to', () => {
  it('uses the weigh-in\'s own offset: 00:30 IST on 1 Nov is 1 Nov, though UTC says 31 Oct', () => {
    const t = Date.UTC(2026, 9, 31, 19, 0); // 1 Nov 00:30 IST
    expect(recordDay(t, IST, 0)).toBe('2026-11-01');
    expect(recordDay(t, 0, IST)).toBe('2026-10-31');
  });
  it('without an offset, the phone\'s time zone decides', () => {
    expect(recordDay(Date.UTC(2026, 9, 31, 19, 0), null, IST)).toBe('2026-11-01');
  });
});

describe('where a read starts', () => {
  it('30 days back the first time, then a week before the last read', () => {
    expect(weightReadSince(T0, null)).toBe(T0 - FIRST_READ_DAYS * DAY);
    expect(weightReadSince(T0, T0 - DAY)).toBe(T0 - DAY - LATE_SYNC_DAYS * DAY);
    // A clock moved back: start over from 30 days.
    expect(weightReadSince(T0, T0 + DAY)).toBe(T0 - FIRST_READ_DAYS * DAY);
  });
});

describe('planWeightImport (pure)', () => {
  const rec = (id: string, dayOffset: number, kg: number, hour = 0): Rec => ({ id, timeMs: T0 + dayOffset * DAY + hour * 3_600_000, offsetSec: IST, kg });

  it('an empty day gets the weigh-in, and it is marked as from Health Connect', () => {
    const p = planWeightImport([rec('a', 0, 80.456)], {}, {}, {}, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([{ kind: 'insert', dateISO: '2026-10-28', kg: 80.46 }]);
    expect(isHealthWeight('2026-10-28', 80.46, p.days)).toBe(true);
    expect(p.seen).toEqual({ a: T0 });
  });

  it('a weigh-in dated after the phone\'s today waits, and is added once that day comes (release review)', () => {
    const early = planWeightImport([rec('f', 5, 78)], {}, {}, {}, '2026-11-01', 0, ist);
    expect(early.writes).toEqual([]);
    expect(early.seen).toEqual({});
    const later = planWeightImport([rec('f', 5, 78)], {}, early.days, early.seen, '2026-11-02', 0, ist);
    expect(later.writes).toEqual([{ kind: 'insert', dateISO: '2026-11-02', kg: 78 }]);
  });

  it('a weight the member typed that day is never changed', () => {
    const p = planWeightImport([rec('a', 0, 79)], { '2026-10-28': { id: 'typed', kg: 81 } }, {}, {}, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([]);
    expect(isHealthWeight('2026-10-28', 81, p.days)).toBe(false);
  });

  it('a Health Connect day the member fixed since counts as typed', () => {
    const days = { '2026-10-28': { kg: 80, at: T0 } };
    const p = planWeightImport([rec('b', 0, 79, 3)], { '2026-10-28': { id: 'x', kg: 80.5 } }, days, {}, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([]);
  });

  it('a later reading of a Health Connect day replaces the earlier one; an older one does not', () => {
    const days = { '2026-10-28': { kg: 80, at: T0 } };
    const later = planWeightImport([rec('b', 0, 79.5, 2)], { '2026-10-28': { id: 'x', kg: 80 } }, days, {}, '2026-11-01', 0, ist);
    expect(later.writes).toEqual([{ kind: 'update', id: 'x', dateISO: '2026-10-28', kg: 79.5, oldKg: 80 }]);
    const older = planWeightImport([{ id: 'c', timeMs: T0 - 3_600_000, offsetSec: IST, kg: 81 }], { '2026-10-28': { id: 'x', kg: 80 } }, days, {}, '2026-11-01', 0, ist);
    expect(older.writes).toEqual([]);
  });

  it('two readings of one new day: one entry, the later value', () => {
    const p = planWeightImport([rec('b', 0, 79.4, 1), rec('a', 0, 80)], {}, {}, {}, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([{ kind: 'insert', dateISO: '2026-10-28', kg: 79.4 }]);
  });

  it('a record looked at before is never added again (a weigh-in deleted here stays deleted)', () => {
    const p = planWeightImport([rec('a', 0, 80)], {}, {}, { a: T0 }, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([]);
  });

  it('the same record twice in one read counts once', () => {
    const p = planWeightImport([rec('a', 0, 80), rec('a', 0, 80)], {}, {}, {}, '2026-11-01', 0, ist);
    expect(p.writes).toHaveLength(1);
  });

  it('impossible weights and future days are left out', () => {
    const p = planWeightImport([rec('a', 0, 5), rec('b', 1, 900), rec('c', 10, 80)], {}, {}, {}, '2026-11-01', 0, ist);
    expect(p.writes).toEqual([]);
  });

  it('ids older than the next read\'s start are forgotten', () => {
    const p = planWeightImport([], {}, {}, { old: T0 - 40 * DAY, recent: T0 }, '2026-11-01', T0 - DAY, ist);
    expect(p.seen).toEqual({ recent: T0 });
  });
});

describe('readHealthWeights (into the body-weight log)', () => {
  it('adds the weigh-ins, marks them, and remembers the read', async () => {
    h.weights = [
      { id: 'a', timeMs: T0, offsetSec: IST, kg: 80 },
      { id: 'b', timeMs: T0 + DAY, offsetSec: IST, kg: 79.8 },
    ];
    h.log.set('2026-10-29', { id: 'typed', kg: 81 });
    const r = await readHealthWeights({ force: true, now: T0 + 2 * DAY });
    expect(r).toEqual({ kind: 'added', added: 1 });
    expect(h.log.get('2026-10-28')?.kg).toBe(80);
    expect(h.log.get('2026-10-29')).toEqual({ id: 'typed', kg: 81 });
    const p = usePhonePrefs.getState();
    expect(p.healthWeightRead).toBe(T0 + 2 * DAY);
    expect(Object.keys(p.healthWeightSeen).sort()).toEqual(['a', 'b']);
    expect(isHealthWeight('2026-10-28', 80, p.healthWeightDays)).toBe(true);
    expect(isHealthWeight('2026-10-29', 81, p.healthWeightDays)).toBe(false);
  });

  it('the next read finds nothing new (no duplicates)', async () => {
    h.weights = [{ id: 'a', timeMs: T0, offsetSec: IST, kg: 80 }];
    await readHealthWeights({ force: true, now: T0 + DAY });
    h.log.delete('2026-10-28'); // the member deleted it here
    expect(await readHealthWeights({ force: true, now: T0 + 2 * DAY })).toEqual({ kind: 'added', added: 0 });
    expect(h.log.has('2026-10-28')).toBe(false);
    expect(h.sinces[1]).toBe(T0 + DAY - LATE_SYNC_DAYS * DAY);
  });

  it('a later reading replaces an earlier Health Connect one in the log', async () => {
    usePhonePrefs.setState({ healthWeightDays: { '2026-10-28': { kg: 80, at: T0 } } });
    h.log.set('2026-10-28', { id: 'x', kg: 80 });
    h.weights = [{ id: 'b', timeMs: T0 + 3_600_000, offsetSec: IST, kg: 79 }];
    expect(await readHealthWeights({ force: true, now: T0 + DAY })).toEqual({ kind: 'added', added: 1 });
    expect(h.log.get('2026-10-28')?.kg).toBe(79);
  });

  it('off, demo data, or a removed access: nothing is read', async () => {
    usePhonePrefs.setState({ healthWeightOn: false });
    expect(await readHealthWeights({ force: true })).toEqual({ kind: 'off' });
    usePhonePrefs.setState({ healthWeightOn: true, healthRevoked: true });
    expect(await readHealthWeights({ force: true })).toEqual({ kind: 'off' });
    usePhonePrefs.setState({ healthRevoked: false });
    h.demo = true;
    expect(await readHealthWeights({ force: true })).toEqual({ kind: 'off' });
    expect(h.sinces).toEqual([]);
  });

  it('not allowed in Health Connect, or a failure: said, never silent', async () => {
    h.weights = null;
    expect(await readHealthWeights({ force: true })).toEqual({ kind: 'not-allowed' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.weights = 'throw';
    const r = await readHealthWeights({ force: true });
    expect(r).toEqual({ kind: 'error' });
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[ForgeErr]'))).toBe(true);
    expect(weightResultText(r)).toMatch(/try again/);
    warn.mockRestore();
  });

  it('on app open / return: at most every 10 minutes', async () => {
    expect(shouldReadWeights(1000, null, true)).toBe(true);
    expect(shouldReadWeights(1000, null, false)).toBe(false);
    await readHealthWeights({ now: 1_000_000 });
    await readHealthWeights({ now: 1_000_000 + 60_000 });
    await readHealthWeights({ now: 1_000_000 + WEIGHT_READ_GAP_MS });
    expect(h.sinces).toHaveLength(2);
  });
});

describe('steps today (F62)', () => {
  it('reads Health Connect\'s total for today', async () => {
    h.steps = 6240;
    expect(await readStepsToday()).toEqual({ kind: 'steps', steps: 6240 });
    expect(stepsText(6240)).toBe('6,240 steps so far today.');
    expect(stepsText(1)).toBe('1 step so far today.');
    expect(stepsText(0)).toBe('No steps recorded today yet.');
  });
  it('not allowed, failed, or off', async () => {
    h.steps = null;
    expect(await readStepsToday()).toEqual({ kind: 'not-allowed' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.steps = 'throw';
    expect(await readStepsToday()).toEqual({ kind: 'error' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    usePhonePrefs.setState({ healthStepsOn: false });
    expect(await readStepsToday()).toEqual({ kind: 'off' });
  });
});

describe('read permissions are asked on their own', () => {
  it('only the read asked for, never the write switches', () => {
    askHealthRead(['weight']);
    askHealthRead(['steps']);
    expect(h.asked).toEqual([['weight'], ['steps']]);
  });
  it('reports each read permission', async () => {
    h.access = { exercise: false, calories: false, weight: true, steps: false };
    expect(await healthReadAccess()).toEqual({ weight: true, steps: false });
  });
});

describe('Stop and remove MettleUp\'s access', () => {
  it('takes every permission back; everything shows off, also while Android still reports them', async () => {
    usePhonePrefs.setState({ healthUnsent: ['s1'] });
    expect(await removeHealthAccess()).toBe(true);
    expect(h.revokes).toBe(1);
    const p = usePhonePrefs.getState();
    expect([p.healthConnect, p.healthWeightOn, p.healthStepsOn, p.healthRevoked]).toEqual([false, false, false, true]);
    expect(p.healthUnsent).toEqual([]);
    // Android 14+: still granted until a restart. The page shows Off anyway.
    expect((await healthCheck()).state).toBe('off');
    expect(await healthReadAccess()).toEqual({ weight: false, steps: false });
    // Saying yes again clears the mark.
    askHealthRead(['weight']);
    expect(usePhonePrefs.getState().healthRevoked).toBe(false);
  });
  it('a refusal changes nothing here and is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.revokeOk = 'throw';
    expect(await removeHealthAccess()).toBe(false);
    expect(usePhonePrefs.getState().healthConnect).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[ForgeErr]'))).toBe(true);
    warn.mockRestore();
  });
});

describe('member words', () => {
  const words = [
    HC_WEIGHT_ABOUT,
    HC_WEIGHT_ON,
    HC_WEIGHT_NOT_ALLOWED,
    HC_WEIGHT_STOPPED,
    HC_STEPS_ABOUT,
    HC_STEPS_NOT_ALLOWED,
    HC_STEPS_ERROR,
    HC_REMOVED,
    HC_REMOVE_FAILED,
    HC_REMOVE_ASK.body,
    weightResultText({ kind: 'added', added: 2 })!,
    weightResultText({ kind: 'added', added: 0 })!,
  ];
  it('complete sentences, without banned words', () => {
    for (const w of words) {
      expect(w).toMatch(/^[A-Z].*\.$/);
      expect(w).not.toMatch(/\b(volume|PR|session)s?\b/i);
    }
    expect(WEIGHT_FROM_HC).toBe('Weight from Health Connect');
    expect(HC_REMOVE_ASK.title).toMatch(/\?$/);
  });
});
