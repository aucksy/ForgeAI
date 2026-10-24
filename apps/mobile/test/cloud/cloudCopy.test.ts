/**
 * The cloud copy end to end on a REAL database (tracker #50): the queue (offline, retries, a newer
 * edit while one is on its way, one bad item never blocks the rest) and bringing the copy back to a
 * new phone (no duplicate workouts, the newest edit wins, nothing sent back twice). The server is a
 * stand-in with 0032's own rule: an older edit never replaces a newer one. Made-up data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CopyApi } from '@/cloud/copySync';
import type { QueueOp, SendFailure, ServerItem } from '@/cloud/copyPlan';
import type { ItemKind } from '@/cloud/pack';
import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async () => ({ exists: false, size: 0 }),
  deleteAsync: async () => undefined,
  readDirectoryAsync: async () => [],
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
// A build WITH the member account (so the account's own rules run), but no real server: the Supabase
// client and Google are stand-ins that sign in as `h.userId`.
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { supabaseUrl: 'https://test.supabase.co', supabasePublishableKey: 'k', googleWebClientId: '123.apps.googleusercontent.com' } } },
}));
const h = vi.hoisted(() => ({ userId: 'user-1' }));
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: () => undefined,
    hasPlayServices: async () => true,
    signIn: async () => ({ type: 'success', data: { idToken: 'test-id-token', user: { email: 'member@example.com', name: 'Copy Owner' } } }),
    signOut: async () => undefined,
  },
  isErrorWithCode: () => false,
  statusCodes: {},
}));
vi.mock('@/cloud/client', () => ({
  getSupabase: () => ({
    auth: {
      signInWithIdToken: async () => ({ data: { user: { id: h.userId, email: 'member@example.com' } }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }),
  hasSupabase: () => false,
}));

const MEMBER: OnboardingInput = {
  name: 'Copy Owner',
  phoneE164: '+919876500000',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: '',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

/** A stand-in for 0032: newest edit wins, deletes kept as empty rows, pages in (kind, id) order. */
class FakeServer {
  rows = new Map<string, ServerItem>();
  fail: SendFailure | null = null;
  getFail: SendFailure | null = null;
  refuseId: string | null = null;
  puts = 0;
  api: CopyApi = {
    put: async (ops: readonly QueueOp[]) => {
      this.puts++;
      if (this.fail) return { ok: false, failure: this.fail };
      if (this.refuseId && ops.some((o) => o.id === this.refuseId)) return { ok: false, failure: 'refused' };
      let saved = 0;
      const olderIds: { kind: ItemKind; id: string }[] = [];
      for (const o of ops) {
        const k = `${o.kind}:${o.id}`;
        const was = this.rows.get(k);
        if (!was || was.editedAt <= o.editedAt) {
          this.rows.set(k, { kind: o.kind, id: o.id, v: 1, data: o.data, editedAt: o.editedAt });
          saved++;
        } else olderIds.push({ kind: o.kind, id: o.id });
      }
      return { ok: true, data: { saved, older: olderIds.length, olderIds } };
    },
    get: async (afterKind: string, afterId: string, limit: number) => {
      if (this.getFail) return { ok: false, failure: this.getFail };
      const all = [...this.rows.values()].sort((a, b) => (a.kind + '\u0000' + a.id < b.kind + '\u0000' + b.id ? -1 : 1));
      const after = afterKind + '\u0000' + afterId;
      const items = all.filter((r) => r.kind + '\u0000' + r.id > after).slice(0, limit);
      const last = items[items.length - 1];
      return { ok: true, data: { items, rows: items.length, last: last ? { kind: last.kind, id: last.id } : null } };
    },
  };
  live(kind: string): ServerItem[] {
    return [...this.rows.values()].filter((r) => r.kind === kind && r.data != null);
  }
}

const ACCOUNT = { userId: '11111111-2222-3333-4444-555555555555', email: 'member@example.com', name: 'Copy Owner', since: 1 };

let db: RealDb;

async function phone(opts: { db?: RealDb; member?: OnboardingInput | null } = {}): Promise<RealDb> {
  db = await bootRealApp(opts.db ? { db: opts.db } : {});
  if (!opts.db && opts.member !== null) await (await import('@/onboarding/db/dataActions')).completeOnboarding(opts.member ?? MEMBER);
  return db;
}

async function signIn(server: FakeServer): Promise<typeof import('@/cloud/copySync')> {
  const { setStoredAccount } = await import('@/cloud/accountMeta');
  await setStoredAccount(ACCOUNT);
  const sync = await import('@/cloud/copySync');
  sync.setCopyApi(server.api);
  return sync;
}

const exerciseId = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

async function workout(startedAt: number, sets: [string, number, number][], id?: string): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const day = new Date(startedAt).toISOString().slice(0, 10);
  const s = await createSession({ dateISO: day, dayType: 'push', source: 'manual', startedAt, endedAt: startedAt + 3600_000 });
  await addSetsWithMeta(s.id, sets.map(([name, kg, reps]) => ({ exerciseId: exerciseId(name), weightKg: kg, reps, isWarmup: false })));
  if (id) {
    db.raw.run('PRAGMA foreign_keys = OFF');
    db.raw.run('UPDATE workout_sessions SET id = ? WHERE id = ?', [id, s.id]);
    db.raw.run('UPDATE set_entries SET session_id = ? WHERE session_id = ?', [id, s.id]);
    db.raw.run('PRAGMA foreign_keys = ON');
    return id;
  }
  return s.id;
}

const workouts = (): { id: string; started_at: number; notes: string | null; sets: number }[] =>
  db.all('SELECT w.id, w.started_at, w.notes, (SELECT COUNT(*) FROM set_entries s WHERE s.session_id = w.id) AS sets FROM workout_sessions w ORDER BY w.started_at');
const queued = (): { kind: string; item_id: string; attempts: number; next_try_at: number }[] =>
  db.all('SELECT kind, item_id, attempts, next_try_at FROM cloud_copy_queue ORDER BY kind, item_id');

const T = Date.UTC(2026, 9, 1, 6);
const DAY = 86_400_000;

beforeEach(() => {
  vi.resetModules();
});

describe('nobody signed in: nothing at all', () => {
  it('a scan without an account queues nothing and calls nobody', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    const sync = await import('@/cloud/copySync');
    sync.setCopyApi(server.api);
    expect(await sync.scanCopy()).toBeNull();
    expect((await sync.drainCopy()).sent).toBe(0);
    expect(server.puts).toBe(0);
  });

  it('demo data is never copied, even signed in', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    db.raw.run("INSERT INTO meta(key, value) VALUES('demo_data', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    const sync = await signIn(new FakeServer());
    expect(await sync.scanCopy()).toBeNull();
  });
});

describe('the queue', () => {
  it('works offline: the copy waits, tries again later, and goes when the internet is back', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5], ['Barbell Bench Press', 80, 5]]);
    await workout(T + DAY, [['Barbell Squat', 100, 5]]);
    const server = new FakeServer();
    const sync = await signIn(server);
    let now = T + 10 * DAY;
    const clock = (): number => now;

    const plan = await sync.scanCopy(clock);
    expect(plan!.ops.filter((o) => o.kind === 'w')).toHaveLength(2);
    expect(queued().map((q) => q.kind).sort()).toEqual(['b', 'u', 'w', 'w']);

    server.fail = 'offline';
    const first = await sync.drainCopy(clock);
    expect(first).toMatchObject({ sent: 0, failure: 'offline', left: 4 });
    expect(queued().every((q) => q.attempts === 1 && q.next_try_at === now + 30_000)).toBe(true);

    // 10 seconds later: not due yet, the server is not even asked.
    now += 10_000;
    const puts = server.puts;
    expect((await sync.drainCopy(clock)).sent).toBe(0);
    expect(server.puts).toBe(puts);

    // Online again, after the wait.
    server.fail = null;
    now += 25_000;
    const second = await sync.drainCopy(clock);
    expect(second).toMatchObject({ sent: 4, failure: null, left: 0 });
    expect(server.live('w')).toHaveLength(2);
    expect((await sync.copyStatus()).lastAt).toBe(now);

    // Nothing changed: the next scan queues nothing.
    expect((await sync.scanCopy(clock))!.ops).toEqual([]);
  });

  it('an edit and a delete are sent; an emptied phone sends no deletes', async () => {
    await phone();
    const a = await workout(T, [['Barbell Bench Press', 80, 5]]);
    const b = await workout(T + DAY, [['Barbell Bench Press', 82.5, 5]]);
    const server = new FakeServer();
    const sync = await signIn(server);
    await sync.scanCopy(() => T + 5 * DAY);
    await sync.drainCopy(() => T + 5 * DAY);

    db.raw.run("UPDATE workout_sessions SET notes = 'felt strong' WHERE id = ?", [a]);
    const { deleteSession } = await import('@/db/repos/workoutRepo');
    await deleteSession(b);
    const plan = await sync.scanCopy(() => T + 6 * DAY);
    expect(plan!.ops.map((o) => `${o.id}:${o.data == null ? 'deleted' : 'changed'}`).sort()).toEqual([`${a}:changed`, `${b}:deleted`].sort());
    await sync.drainCopy(() => T + 6 * DAY);
    expect(server.rows.get(`w:${b}`)!.data).toBeNull();
    expect(server.rows.get(`w:${a}`)!.data).toContain('felt strong');

    // Every workout gone at once (a wipe, a bug): held, never sent.
    await workout(T + 2 * DAY, [['Barbell Bench Press', 85, 5]]);
    await sync.scanCopy(() => T + 7 * DAY);
    await sync.drainCopy(() => T + 7 * DAY);
    db.raw.run('DELETE FROM set_entries');
    db.raw.run('DELETE FROM workout_sessions');
    const wiped = await sync.scanCopy(() => T + 8 * DAY);
    expect(wiped!.held).toBe(2);
    expect(wiped!.ops.filter((o) => o.kind === 'w')).toEqual([]);
  });

  it('a newer edit queued while the older one was on its way is not lost', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    await signIn(new FakeServer());
    const local = await import('@/cloud/copyLocal');
    await local.initCloudCopySchema();
    await local.queueOps(db, [{ kind: 'w', id: 'x', data: '"v1"', editedAt: 100 }]);
    await local.queueOps(db, [{ kind: 'w', id: 'x', data: '"v2"', editedAt: 200 }]);
    // The answer for v1 arrives after v2 was queued.
    await local.markSent(db, [{ kind: 'w', id: 'x', data: '"v1"', editedAt: 100 }]);
    expect(db.all<{ data: string }>("SELECT data FROM cloud_copy_queue WHERE item_id = 'x'")).toEqual([{ data: '"v2"' }]);
    // An older write never replaces the waiting newer one.
    await local.queueOps(db, [{ kind: 'w', id: 'x', data: '"v0"', editedAt: 50 }]);
    expect(db.all<{ data: string }>("SELECT data FROM cloud_copy_queue WHERE item_id = 'x'")).toEqual([{ data: '"v2"' }]);
  });

  it('one item the server refuses never holds the others back', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    const sync = await signIn(server);
    await sync.scanCopy(() => T + DAY);
    const local = await import('@/cloud/copyLocal');
    await local.queueOps(db, [{ kind: 'w', id: 'bad', data: '"?"', editedAt: 1 }]);
    server.refuseId = 'bad';
    const r = await sync.drainCopy(() => T + DAY);
    expect(r.failure).toBeNull();
    expect(server.live('w')).toHaveLength(1);
    const left = queued();
    expect(left.map((q) => q.item_id)).toEqual(['bad']);
    expect(left[0].next_try_at).toBe(T + DAY + 6 * 3600_000);
  });

  it('the server without 0032 yet: the queue waits hours, nothing is lost', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    server.fail = 'not-ready';
    const sync = await signIn(server);
    await sync.scanCopy(() => T);
    const r = await sync.drainCopy(() => T);
    expect(r.failure).toBe('not-ready');
    expect(queued().every((q) => q.next_try_at >= T + 3600_000)).toBe(true);
  });
});

describe('bringing the copy back to a new phone', () => {
  it('no duplicate workouts, the newest edit wins, and nothing is sent back twice', async () => {
    // ---- Phone A: three workouts (one on an exercise the member made), a routine, body weight.
    const dbA = await phone();
    const { createCustomExercise } = await import('@/tracker/db/customExercise');
    await createCustomExercise(
      { name: 'My Landmine Twist', logType: 'weight_reps', muscles: { primary: ['front_delts'], secondary: [] }, equipment: 'barbell', isCompound: true, incrementKg: 2.5, countsBodyweight: false },
      { uri: null, type: null },
    );
    const w1 = await workout(T, [['Barbell Bench Press', 80, 5], ['Barbell Bench Press', 80, 5]]);
    const w2 = await workout(T + DAY, [['My Landmine Twist', 30, 10]]);
    const w3 = await workout(T + 2 * DAY, [['Barbell Squat', 100, 5]]);
    const { createRoutine } = await import('@/tracker/db/routineRepo');
    await createRoutine({ name: 'Push A', dayType: 'push', folderId: null });
    const server = new FakeServer();
    let syncA = await signIn(server);
    await syncA.scanCopy(() => T + 3 * DAY);
    expect((await syncA.drainCopy(() => T + 3 * DAY)).left).toBe(0);
    const aWorkouts = workouts();
    expect(aWorkouts).toHaveLength(3);

    // ---- Phone B: a new phone, its own setup, the SAME first workout (a Hevy import: same start,
    // another id), and one workout of its own.
    await phone({ member: { ...MEMBER, name: 'New Phone' } });
    const twin = await workout(T, [['Barbell Bench Press', 80, 5], ['Barbell Bench Press', 80, 5]], 'twin-on-phone-b');
    const own = await workout(T + 5 * DAY, [['Barbell Bench Press', 90, 3]]);
    const syncB = await signIn(server);
    const back = await syncB.bringBackCopy(() => T + 6 * DAY);
    expect(back.ok).toBe(true);
    const bWorkouts = workouts();
    // A's three (the twin replaced by A's, not added) + B's own one.
    expect(bWorkouts.map((w) => w.id)).toEqual([w1, w2, w3, own]);
    expect(new Set(bWorkouts.map((w) => w.started_at)).size).toBe(4);
    expect(bWorkouts.find((w) => w.id === twin)).toBeUndefined();
    expect(bWorkouts.map((w) => w.sets)).toEqual([2, 1, 1, 1]);
    // The member's own exercise came back with its sets, and the routine and body weight.
    expect(db.all<{ n: number }>("SELECT COUNT(*) AS n FROM set_entries s JOIN exercises e ON e.id = s.exercise_id WHERE e.name = 'My Landmine Twist'")[0].n).toBe(1);
    expect(db.all<{ name: string }>("SELECT name FROM plan_days WHERE name = 'Push A'")).toHaveLength(1);
    expect(db.all<{ name: string }>('SELECT name FROM user_profile')[0].name).toBe('Copy Owner');
    // Records worked out from the sets that came back.
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM personal_records')[0].n).toBeGreaterThan(0);

    // Nothing that came back is sent again: only B's own workout (and B's own body weight entry).
    const next = await syncB.scanCopy(() => T + 6 * DAY + 1000);
    expect(next!.ops.filter((o) => o.kind === 'w').map((o) => o.id)).toEqual([own]);
    expect(next!.ops.filter((o) => o.kind === 'x' || o.kind === 'r')).toEqual([]);
    // The twin on the server side: there was none (B's twin was never sent).
    await syncB.drainCopy(() => T + 6 * DAY + 1000);
    expect(server.live('w').map((r) => r.id).sort()).toEqual([w1, w2, w3, own].sort());

    // A second bring-back changes nothing (no duplicates, ever).
    const again = await syncB.bringBackCopy(() => T + 6 * DAY + 2000);
    expect(again.ok && again.result.workouts).toBe(0);
    expect(workouts()).toHaveLength(4);

    // ---- The newest edit wins. B edits w2 (and it is copied); A, offline meanwhile, edits w3.
    db.raw.run("UPDATE workout_sessions SET notes = 'edited on B' WHERE id = ?", [w2]);
    await syncB.scanCopy(() => T + 7 * DAY);
    await syncB.drainCopy(() => T + 7 * DAY);

    await phone({ db: dbA });
    syncA = await signIn(server);
    db.raw.run("UPDATE workout_sessions SET notes = 'edited on A, not copied yet' WHERE id = ?", [w3]);
    const backA = await syncA.bringBackCopy(() => T + 8 * DAY);
    expect(backA.ok && backA.result.keptLocal).toBe(1);
    const onA = Object.fromEntries(workouts().map((w) => [w.id, w.notes]));
    expect(onA[w2]).toBe('edited on B'); // newer on the server: came to A
    expect(onA[w3]).toBe('edited on A, not copied yet'); // newer on A: kept, and sent next
    expect(onA[own]).toBeNull(); // B's own workout reached A too
    const sendA = await syncA.scanCopy(() => T + 8 * DAY + 1000);
    expect(sendA!.ops.filter((o) => o.kind === 'w').map((o) => o.id)).toEqual([w3]);
    expect(aWorkouts).toHaveLength(3);
  });

  it('a server workout deleted after this phone last copied it goes from this phone too', async () => {
    await phone();
    const a = await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    const sync = await signIn(server);
    await sync.scanCopy(() => T + DAY);
    await sync.drainCopy(() => T + DAY);
    server.rows.set(`w:${a}`, { kind: 'w', id: a, v: 1, data: null, editedAt: T + 2 * DAY });
    const back = await sync.bringBackCopy(() => T + 3 * DAY);
    expect(back.ok && back.result.removed).toBe(1);
    expect(workouts()).toEqual([]);
    // …and no delete is queued back for it (the server already has it).
    expect((await sync.scanCopy(() => T + 3 * DAY))!.ops.filter((o) => o.kind === 'w')).toEqual([]);
  });

  it('on the welcome screen (no profile yet): workouts come back onto the real library', async () => {
    await phone();
    const a = await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    let sync = await signIn(server);
    await sync.scanCopy(() => T + DAY);
    await sync.drainCopy(() => T + DAY);

    await phone({ member: null });
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM user_profile')[0].n).toBe(0);
    sync = await signIn(server);
    const back = await sync.bringBackCopy(() => T + 2 * DAY);
    expect(back.ok && back.result.workouts).toBe(1);
    const lifted = db.all<{ name: string; catalog_key: string | null; muscles: string | null }>(
      'SELECT e.name, e.catalog_key, e.muscles FROM set_entries s JOIN exercises e ON e.id = s.exercise_id WHERE s.session_id = ?',
      [a],
    );
    expect(lifted).toHaveLength(1);
    expect(lifted[0].name).toBe('Barbell Bench Press');
    expect(lifted[0].catalog_key).toBeTruthy();
    // One library row per entry: the library was added, not a stand-in row beside it.
    expect(db.all<{ n: number }>("SELECT COUNT(*) AS n FROM exercises WHERE name = 'Barbell Bench Press'")[0].n).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Review of 24 Oct 2026: one test per data-loss fix.

const meta = (key: string): string | undefined => db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])[0]?.value;
const stateRows = (): number => db.all<{ n: number }>('SELECT COUNT(*) AS n FROM cloud_copy_state')[0].n;

/** Sign in through the real account rules (Google and Supabase are the stand-ins above). */
async function googleSignIn(server: FakeServer, userId: string): Promise<typeof import('@/cloud/copySync')> {
  h.userId = userId;
  const sync = await import('@/cloud/copySync');
  sync.setCopyApi(server.api);
  await (await import('@/cloud/account')).signInWithGoogle();
  return sync;
}

describe('review fixes: nothing is lost', () => {
  it('1. signing out keeps the copy records: the same person signing in again keeps a newer phone edit', async () => {
    await phone();
    const server = new FakeServer();
    const sync = await googleSignIn(server, 'user-1');
    await sync.copyNow('first copy');
    expect(server.live('b').map((r) => r.data)).toEqual(['[78]']);
    const before = stateRows();
    expect(before).toBeGreaterThan(0);

    await (await import('@/cloud/account')).signOutAccount();
    expect(stateRows()).toBe(before); // kept
    db.raw.run('UPDATE body_weight SET weight_kg = 81.5'); // a newer edit while signed out

    await googleSignIn(server, 'user-1');
    await sync.copyNow('signed in again');
    expect(db.all<{ weight_kg: number }>('SELECT weight_kg FROM body_weight')[0].weight_kg).toBe(81.5);
    expect(server.live('b').map((r) => r.data)).toEqual(['[81.5]']);
  });

  it('2. right after sign-in nothing is sent until the server copy is in; the kept profile is not replaced', async () => {
    await phone({ member: { ...MEMBER, name: 'New Phone' } });
    const server = new FakeServer();
    const { packProfile } = await import('@/cloud/pack');
    const kept = { name: 'Kept Name', age: 30, height_cm: 175, goal: 'muscle', experience: 'intermediate', gym_name: '', member_since_iso: '2026-01-01', calorie_target: 2700, protein_target_g: 135, carbs_target_g: 370, fat_target_g: 75, unit_system: 'metric', language: 'en', bio: null, link: null };
    server.rows.set('u:me', { kind: 'u', id: 'me', v: 1, data: packProfile(kept), editedAt: T });
    server.getFail = 'offline';
    const sync = await googleSignIn(server, 'user-1');
    expect(meta('cloud_copy_merge_pending')).toBe('1');

    await sync.copyNow('offline after sign-in');
    expect(server.puts).toBe(0); // nothing went up
    expect(meta('cloud_copy_merge_pending')).toBe('1');

    server.getFail = null;
    await sync.copyNow('online');
    expect(meta('cloud_copy_merge_pending')).toBe('');
    expect(db.all<{ name: string }>('SELECT name FROM user_profile')[0].name).toBe('Kept Name');
    expect(server.rows.get('u:me')!.data).toBe(packProfile(kept));
  });

  it('3. a Drive restore of an OLDER backup never deletes the newer workouts on the server', async () => {
    await phone();
    const w1 = await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    const sync = await googleSignIn(server, 'user-1');
    await sync.copyNow('first');
    const { exportSnapshot, importSnapshot, parseSnapshot } = await import('@/cloud/snapshot');
    const older = await exportSnapshot();
    const w2 = await workout(T + DAY, [['Barbell Bench Press', 82.5, 5]]);
    const w3 = await workout(T + 2 * DAY, [['Barbell Bench Press', 85, 5]]);
    await sync.copyNow('second', { force: true });
    expect(server.live('w')).toHaveLength(3);

    await importSnapshot(parseSnapshot(older)); // only w1 on the phone now
    expect(stateRows()).toBe(0);
    expect(meta('cloud_copy_merge_pending')).toBe('1');
    await sync.copyNow('after the restore');
    expect(workouts().map((x) => x.id).sort()).toEqual([w1, w2, w3].sort()); // brought back
    expect(server.live('w')).toHaveLength(3); // nothing deleted
  });

  it('8. another person’s Google account is refused while this phone holds someone’s workouts', async () => {
    await phone();
    await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    await googleSignIn(server, 'user-1');
    await (await import('@/cloud/account')).signOutAccount();
    h.userId = 'someone-else';
    await expect((await import('@/cloud/account')).signInWithGoogle()).rejects.toThrow(/another person’s workouts/);
    expect(await (await import('@/cloud/accountMeta')).getStoredAccount()).toBeNull();
    expect(meta('cloud_copy_owner')).toBe('user-1');
  });

  it('11. two of the member’s own exercises missing from the copy stay two exercises', async () => {
    await phone();
    const { packWorkout } = await import('@/cloud/pack');
    const row = (n: number) => ({ id: `s${n}`, date_iso: '2026-10-01', started_at: T + n * DAY, ended_at: null, day_type: 'push', notes: null, source: 'manual', easy_week: null, title: null, routine_id: null });
    const set = (ex: string) => ({ exercise_id: ex, set_number: 1, weight_kg: 10, reps: 10, is_warmup: 0, rpe: null, set_type: null, note: null, superset_group: null, duration_sec: null, distance_m: null, load_mode: null, card_index: null });
    const server = new FakeServer();
    server.rows.set('w:s1', { kind: 'w', id: 's1', v: 1, data: packWorkout(row(1), [set('gone-1')], (id) => `x:${id}`), editedAt: T });
    server.rows.set('w:s2', { kind: 'w', id: 's2', v: 1, data: packWorkout(row(2), [set('gone-2')], (id) => `x:${id}`), editedAt: T });
    const sync = await signIn(server);
    expect((await sync.bringBackCopy(() => T + 3 * DAY)).ok).toBe(true);
    const used = db.all<{ id: string; name: string }>('SELECT DISTINCT e.id, e.name FROM set_entries s JOIN exercises e ON e.id = s.exercise_id ORDER BY e.id');
    expect(used.map((e) => e.id)).toEqual(['gone-1', 'gone-2']);
    expect(new Set(used.map((e) => e.name)).size).toBe(2);
  });

  it('12. the server holding a newer edit: the phone brings it in next time instead of dropping it silently', async () => {
    await phone();
    const a = await workout(T, [['Barbell Bench Press', 80, 5]]);
    const server = new FakeServer();
    server.rows.set(`w:${a}`, { kind: 'w', id: a, v: 1, data: '"edited on another phone"', editedAt: Date.now() + 3600_000 });
    const sync = await signIn(server);
    await sync.scanCopy();
    await sync.drainCopy();
    expect(meta('cloud_copy_merge_pending')).toBe('1');
    expect(server.rows.get(`w:${a}`)!.data).toBe('"edited on another phone"');
  });

  it('the plan this phone follows never changes on a merge', async () => {
    await phone();
    db.raw.run("INSERT INTO workout_plans (id, name, is_active) VALUES ('mine', 'My plan', 1)");
    const { packFolder } = await import('@/cloud/pack');
    const server = new FakeServer();
    const data = packFolder({ id: 'theirs', name: 'From the copy', is_active: 1, folder_order: null, source: null, settings: null }, [], [], (id) => `x:${id}`);
    server.rows.set('r:theirs', { kind: 'r', id: 'theirs', v: 1, data, editedAt: T });
    const sync = await signIn(server);
    await sync.bringBackCopy(() => T + DAY);
    expect(db.all<{ id: string; is_active: number }>("SELECT id, is_active FROM workout_plans WHERE id IN ('mine', 'theirs') ORDER BY id")).toEqual([
      { id: 'mine', is_active: 1 },
      { id: 'theirs', is_active: 0 },
    ]);
  });

  it('10. a page with an unreadable row does not end the bring-back early', async () => {
    await phone();
    const sync = await import('@/cloud/copySync');
    const calls: string[] = [];
    sync.setCopyApi({
      put: async () => ({ ok: true, data: { saved: 0, older: 0, olderIds: [] } }),
      get: async (afterKind: string, afterId: string) => {
        calls.push(`${afterKind}:${afterId}`);
        if (calls.length === 1) {
          // A full page whose last row this app cannot read: still the place to go on from.
          const items = Array.from({ length: sync.PAGE - 1 }, (_, i) => ({ kind: 'b' as const, id: `2026-01-${i}`, v: 1, data: '[70]', editedAt: 1 }));
          return { ok: true, data: { items, rows: sync.PAGE, last: { kind: 'zz', id: 'unreadable' } } };
        }
        return { ok: true, data: { items: [{ kind: 'w' as const, id: 'late', v: 1, data: '[]', editedAt: 1 }], rows: 1, last: { kind: 'w', id: 'late' } } };
      },
    });
    const r = await sync.pullCopy();
    expect(r.ok && r.data.length).toBe(sync.PAGE);
    expect(calls).toEqual([':', 'zz:unreadable']);
  });
});
