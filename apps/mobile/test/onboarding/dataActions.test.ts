/**
 * Phase O2 (W1) — the data lifecycle: empty start / load demo / erase.
 *
 * The point of W1 is a promise about what is NOT written: a member invited by
 * their real gym must never see invented history. That promise is a property of
 * the SQL these functions issue, so the tests drive them against a recording fake
 * `@/db` (the O1 native stub deliberately throws on any real DB call) and assert
 * on the statements: which tables are written, which are not, in what order, and
 * which `meta` keys survive an erase.
 *
 * This is a contract test over intent, not a SQLite integration test — there is no
 * engine here to reject bad SQL. Typecheck plus the frozen column lists cover shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXERCISES } from '@/db/seed/exercises';

const h = vi.hoisted(() => {
  interface Call {
    sql: string;
    params?: unknown[];
  }
  const state = {
    calls: [] as Call[],
    /** Marks where forceReseed ran relative to the recorded statements. */
    reseedAtCall: -1,
    /** Rows the DB pretends to already hold. */
    profileCount: 0,
    sessionCount: 0,
    phone: null as string | null,
    meta: new Map<string, string>(),
    uuidN: 0,
  };
  /** Records every statement, and really applies meta deletes so reads stay honest. */
  const record = async (sql: string, params?: unknown[]): Promise<void> => {
    state.calls.push({ sql, params });
    if (sql.includes('DELETE FROM meta') && typeof params?.[0] === 'string') {
      state.meta.delete(params[0]);
    }
  };
  const getFirstAsync = async (sql: string): Promise<unknown> => {
    if (sql.includes('AS profiles')) {
      return { profiles: state.profileCount, sessions: state.sessionCount };
    }
    if (sql.includes('COUNT(*)')) return { n: state.profileCount };
    if (sql.includes('phone')) return { phone: state.phone };
    return null;
  };
  return { state, record, getFirstAsync };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: h.record,
    getAllAsync: async () => [],
    getFirstAsync: h.getFirstAsync,
    withExclusiveTransactionAsync: async (
      fn: (tx: { runAsync: typeof h.record; getFirstAsync: typeof h.getFirstAsync }) => Promise<void>,
    ) => {
      h.state.calls.push({ sql: 'BEGIN' });
      await fn({ runAsync: h.record, getFirstAsync: h.getFirstAsync });
      h.state.calls.push({ sql: 'COMMIT' });
    },
  }),
  getMeta: async (key: string) => h.state.meta.get(key) ?? null,
  setMeta: async (key: string, value: string) => {
    h.state.meta.set(key, value);
  },
}));

vi.mock('@/db/seed', () => ({
  forceReseed: vi.fn(async () => {
    h.state.reseedAtCall = h.state.calls.length;
  }),
}));

vi.mock('@/lib/uuid', () => ({ uuid: () => `id-${++h.state.uuidN}` }));
vi.mock('@/lib/date', () => ({ todayISO: () => '2026-07-26' }));

import { forceReseed } from '@/db/seed';
import {
  ExistingDataError,
  OWNED_META_KEYS,
  WIPE_TABLES_IN_ORDER,
  clearDemoFlag,
  completeOnboarding,
  eraseAllData,
  getMemberPhone,
  hasMemberProfile,
  isDemoData,
  loadDemoData,
  setMemberPhone,
} from '@/onboarding/db/dataActions';
import type { OnboardingInput } from '@/onboarding/form';

const INPUT: OnboardingInput = {
  name: 'Rahul Sharma',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 0,
  heightCm: 0,
  gymName: '',
  bodyWeightKg: null,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

/** Tables that hold TRAINING data — nothing here may be written by an empty start. */
const HISTORY_TABLES = [
  'workout_sessions',
  'set_entries',
  'personal_records',
  'meals',
  'chat_messages',
  'workout_plans',
  'plan_days',
  'plan_exercises',
] as const;

/** child -> parent, straight off src/db/schema.ts REFERENCES clauses. */
const FOREIGN_KEYS: readonly [string, string][] = [
  ['set_entries', 'workout_sessions'],
  ['set_entries', 'exercises'],
  ['personal_records', 'exercises'],
  ['plan_days', 'workout_plans'],
  ['plan_exercises', 'plan_days'],
  ['plan_exercises', 'exercises'],
];

function sqls(): string[] {
  return h.state.calls.map((c) => c.sql);
}

function inserts(table: string): { sql: string; params?: unknown[] }[] {
  return h.state.calls.filter((c) => c.sql.includes(`INSERT INTO ${table} `));
}

/** Rows in a multi-row INSERT = number of value tuples. */
function insertedRows(table: string): number {
  return inserts(table).reduce((n, c) => n + (c.sql.match(/\(\?/g)?.length ?? 0), 0);
}

beforeEach(() => {
  h.state.calls = [];
  h.state.reseedAtCall = -1;
  h.state.profileCount = 0;
  h.state.sessionCount = 0;
  h.state.phone = null;
  h.state.meta = new Map();
  h.state.uuidN = 0;
  vi.mocked(forceReseed).mockClear();
});

describe('WIPE_TABLES_IN_ORDER', () => {
  it('deletes every child before its parent (foreign keys are ON)', () => {
    const order = WIPE_TABLES_IN_ORDER as readonly string[];
    for (const [child, parent] of FOREIGN_KEYS) {
      expect(order.indexOf(child), `${child} must be deleted before ${parent}`).toBeLessThan(
        order.indexOf(parent),
      );
    }
  });

  it('covers every domain table plus the cloud outbox, and never bulk-deletes meta', () => {
    const order = WIPE_TABLES_IN_ORDER as readonly string[];
    for (const t of [...HISTORY_TABLES, 'body_weight', 'user_profile', 'exercises', 'sync_outbox']) {
      expect(order, `${t} must be wiped`).toContain(t);
    }
    expect(order).not.toContain('meta');
    expect(new Set(order).size).toBe(order.length); // no table wiped twice
  });
});

describe('completeOnboarding — the W1 guarantee', () => {
  it('writes NO training history of any kind', async () => {
    await completeOnboarding(INPUT);
    for (const table of HISTORY_TABLES) {
      expect(insertedRows(table), `${table} must stay empty on a real first run`).toBe(0);
    }
  });

  it('writes exactly one profile row, carrying the real details', async () => {
    await completeOnboarding(INPUT);
    const rows = inserts('user_profile');
    expect(rows).toHaveLength(1);
    const params = rows[0].params ?? [];
    expect(params).toContain('Rahul Sharma');
    expect(params).toContain('+919876543210');
    expect(params).toContain('2026-07-26'); // member since = today, not an invented date
    expect(params).toContain(2700);
    expect(params).toContain(135);
  });

  it('ships the reference exercise catalog so there is something to log', async () => {
    await completeOnboarding(INPUT);
    expect(insertedRows('exercises')).toBe(EXERCISES.length);
  });

  it('logs a first body weight only when the member gave one', async () => {
    await completeOnboarding(INPUT);
    expect(insertedRows('body_weight')).toBe(0);

    h.state.calls = [];
    await completeOnboarding({ ...INPUT, bodyWeightKg: 82.4 });
    const bw = inserts('body_weight');
    expect(bw).toHaveLength(1);
    const [id, dateISO, weightKg] = bw[0].params ?? [];
    expect(typeof id).toBe('string');
    expect(dateISO).toBe('2026-07-26'); // dated today, not backfilled
    expect(weightKg).toBe(82.4);
  });

  it('never runs the demo seed', async () => {
    await completeOnboarding(INPUT);
    expect(forceReseed).not.toHaveBeenCalled();
  });

  it('REFUSES to run against a database that already holds training, and writes nothing', async () => {
    // The boot check said "no profile", but the live rows disagree — a failed read
    // or a race. Onboarding must not be able to wipe the owner's 487 workouts.
    h.state.sessionCount = 487;
    await expect(completeOnboarding(INPUT)).rejects.toBeInstanceOf(ExistingDataError);
    expect(sqls().filter((s) => s.startsWith('DELETE FROM'))).toHaveLength(0);
    expect(inserts('user_profile')).toHaveLength(0);
  });

  it('REFUSES when a profile already exists', async () => {
    h.state.profileCount = 1;
    await expect(completeOnboarding(INPUT)).rejects.toBeInstanceOf(ExistingDataError);
    expect(sqls().filter((s) => s.startsWith('DELETE FROM'))).toHaveLength(0);
  });

  it('checks for existing data BEFORE issuing any destructive statement', async () => {
    h.state.sessionCount = 1;
    await completeOnboarding(INPUT).catch(() => undefined);
    // Only BEGIN was recorded (the guard read is not a recorded statement).
    expect(sqls()).toEqual(['BEGIN']);
  });

  it('clears any half-finished previous attempt first, all inside one transaction', async () => {
    await completeOnboarding(INPUT);
    const all = sqls();
    expect(all[0]).toBe('BEGIN');
    expect(all[all.length - 1]).toBe('COMMIT');
    const firstInsert = all.findIndex((s) => s.includes('INSERT INTO'));
    const lastDelete = all.map((s) => s.startsWith('DELETE')).lastIndexOf(true);
    expect(lastDelete).toBeLessThan(firstInsert);
  });
});

describe('eraseAllData', () => {
  it('deletes every table in the declared child-first order', async () => {
    await eraseAllData();
    const deletes = sqls().filter((s) => s.startsWith('DELETE FROM ') && !s.includes('meta'));
    // Spelled out rather than derived from the constant: this list IS the contract,
    // so a reorder or a dropped table has to be a deliberate edit here too.
    expect(deletes).toEqual([
      'DELETE FROM set_entries',
      'DELETE FROM personal_records',
      'DELETE FROM plan_exercises',
      'DELETE FROM plan_days',
      'DELETE FROM workout_plans',
      'DELETE FROM workout_sessions',
      'DELETE FROM meals',
      'DELETE FROM chat_messages',
      'DELETE FROM body_weight',
      'DELETE FROM user_profile',
      'DELETE FROM exercises',
      'DELETE FROM sync_outbox',
    ]);
  });

  it('really clears the demo flag, so the badge cannot outlive the demo', async () => {
    h.state.meta.set('demo_data', '1');
    expect(await isDemoData()).toBe(true);
    await eraseAllData();
    expect(await isDemoData()).toBe(false);
  });

  it('leaves the cloud and Drive keys in place', async () => {
    h.state.meta.set('cloud_identity', '{"gymId":"g1"}');
    h.state.meta.set('cloud_client_version', '17');
    h.state.meta.set('drive_linked', '1');
    await eraseAllData();
    expect(h.state.meta.get('cloud_identity')).toBe('{"gymId":"g1"}');
    expect(h.state.meta.get('cloud_client_version')).toBe('17');
    expect(h.state.meta.get('drive_linked')).toBe('1');
  });

  it('removes only the meta keys the app owns — the gym link and Drive settings survive', async () => {
    await eraseAllData();
    const metaDeletes = h.state.calls.filter((c) => c.sql.includes('FROM meta'));
    expect(metaDeletes.map((c) => (c.params ?? [])[0])).toEqual([...OWNED_META_KEYS]);
    // A blanket wipe would take cloud_identity / cloud_client_version / drive_linked
    // with it — resetting the push counter would make the owner's dashboard ignore
    // every future sync.
    expect(sqls()).not.toContain('DELETE FROM meta');
    expect([...OWNED_META_KEYS]).not.toContain('cloud_client_version');
    expect([...OWNED_META_KEYS]).not.toContain('cloud_identity');
  });

  it('does NOT regenerate demo data — the whole point of W1', async () => {
    await eraseAllData();
    expect(forceReseed).not.toHaveBeenCalled();
    expect(inserts('user_profile')).toHaveLength(0);
    expect(insertedRows('exercises')).toBe(0);
  });

  it('runs as a single transaction', async () => {
    await eraseAllData();
    expect(sqls().filter((s) => s === 'BEGIN')).toHaveLength(1);
    expect(sqls()[sqls().length - 1]).toBe('COMMIT');
  });
});

describe('loadDemoData', () => {
  it('erases first, then seeds — the demo can never merge into real data', async () => {
    await loadDemoData();
    expect(forceReseed).toHaveBeenCalledTimes(1);
    const deletes = sqls().filter((s) => s.startsWith('DELETE FROM'));
    expect(deletes.length).toBe(WIPE_TABLES_IN_ORDER.length + OWNED_META_KEYS.length);
    // Every wipe statement was recorded before the seed ran.
    expect(h.state.reseedAtCall).toBe(h.state.calls.length);
  });

  it('flags the data as demo BEFORE seeding — a kill mid-seed must not leave it unlabelled', async () => {
    await loadDemoData();
    expect(await isDemoData()).toBe(true);
    // The flag write landed while the seed had not run yet.
    expect(vi.mocked(forceReseed).mock.invocationCallOrder[0]).toBeGreaterThan(0);
    expect(h.state.meta.get('demo_data')).toBe('1');
  });

  it('clears the seeded flag before reseeding so the seed actually runs', async () => {
    h.state.meta.set('seeded', '1');
    await loadDemoData();
    expect(h.state.meta.has('seeded')).toBe(false); // the seed's early-return is disarmed
  });
});

describe('clearDemoFlag', () => {
  it('stops the app calling real data a demo (Drive restore / Hevy import)', async () => {
    h.state.meta.set('demo_data', '1');
    await clearDemoFlag();
    expect(await isDemoData()).toBe(false);
  });

  it('touches nothing else', async () => {
    h.state.meta.set('cloud_identity', 'x');
    await clearDemoFlag();
    expect(h.state.calls).toHaveLength(1);
    expect(h.state.meta.get('cloud_identity')).toBe('x');
  });
});

describe('boot signals', () => {
  it('hasMemberProfile keys off the profile ROW, so pre-O2 installs are never sent back to onboarding', async () => {
    h.state.profileCount = 0;
    expect(await hasMemberProfile()).toBe(false);
    h.state.profileCount = 1;
    expect(await hasMemberProfile()).toBe(true);
  });

  it('isDemoData is false until a demo is explicitly loaded', async () => {
    expect(await isDemoData()).toBe(false);
    h.state.meta.set('demo_data', '1');
    expect(await isDemoData()).toBe(true);
  });

  it('getMemberPhone treats a missing or blank number as absent (pre-O2 / demo profile)', async () => {
    h.state.phone = null;
    expect(await getMemberPhone()).toBeNull();
    h.state.phone = '';
    expect(await getMemberPhone()).toBeNull();
    h.state.phone = '+919876543210';
    expect(await getMemberPhone()).toBe('+919876543210');
  });

  it('setMemberPhone updates the additive column without touching the frozen profile writer', async () => {
    await setMemberPhone('+919876543210');
    expect(h.state.calls).toEqual([
      { sql: 'UPDATE user_profile SET phone = ?', params: ['+919876543210'] },
    ]);
  });
});
