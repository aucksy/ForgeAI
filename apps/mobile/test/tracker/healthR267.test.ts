/**
 * R-267 (1 Nov 2026): Health Connect audit and UAT. Each block fails on the code before its fix:
 *  - a workout is owed from the moment it is saved, so an app closed mid-send still sends it;
 *  - owed workouts go again by themselves when the app opens or comes back (not only on "Send
 *    again"), never while Health Connect refuses access, and at most every 10 minutes;
 *  - a deleted workout leaves Health Connect also after "Stop";
 *  - Health Connect's "privacy policy" link shows the privacy notice (Play requires it), not the
 *    app's home screen;
 *  - the new member words are complete sentences without banned words.
 * Plus the paths the audit walked: a workout crossing midnight in India keeps its real times.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  written: 1 as number,
  hang: false,
  access: { exercise: true, calories: true } as { exercise: boolean; calories: boolean } | 'throw',
  status: 'available' as 'available' | 'update' | 'unavailable',
  writes: [] as string[],
  deletes: [] as string[],
  deleteOk: true,
  rows: ['s1', 's2', 's3'],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/db', () => ({
  FIRST_RUN_KEY: 'first_run_at',
  getDb: () => ({
    getAllAsync: async (sql: string, args: string[]) => {
      if (/body_weight/.test(sql)) return [];
      const want = args.length > 0 ? args : h.rows;
      return h.rows
        .filter((id) => want.includes(id))
        .map((id, i) => ({ id, date_iso: '2026-10-10', started_at: 1_000_000 + i * 10_000_000, ended_at: 1_000_000 + i * 10_000_000 + 3_600_000, day_type: 'push', sets: 10, cardio: 0 }));
    },
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthStatus: () => h.status,
    healthAccess: async () => {
      if (h.access === 'throw') throw new Error('busy');
      return h.access;
    },
    healthGranted: async () => h.access !== 'throw' && h.access.exercise,
    healthWrite: async (json: string) => {
      h.writes.push(json);
      if (h.hang) return new Promise<number>(() => undefined);
      return h.written;
    },
    healthDelete: async (id: string) => {
      h.deletes.push(id);
      return h.deleteOk;
    },
  }),
}));

import {
  HC_STOPPED,
  RETRY_GAP_MS,
  healthPayload,
  owedWith,
  removeWorkoutFromHealth,
  resetAutoRetryForTests,
  retryOwedHealth,
  sendWorkoutToHealth,
  shouldRetryOwed,
  UNSENT_CAP,
} from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { PRIVACY_URL } from '@/shop/joinTerms';

const root = resolve(__dirname, '../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

beforeEach(() => {
  h.written = 1;
  h.hang = false;
  h.access = { exercise: true, calories: true };
  h.status = 'available';
  h.writes.length = 0;
  h.deletes.length = 0;
  h.deleteOk = true;
  resetAutoRetryForTests();
  usePhonePrefs.setState({ healthConnect: true, healthUnsent: [], healthLast: null });
});

describe('owed from the save (app closed mid-send)', () => {
  it('owedWith adds once, newest last, capped', () => {
    expect(owedWith(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(owedWith([], 'x')).toEqual(['x']);
    const full = Array.from({ length: UNSENT_CAP }, (_, i) => `o${i}`);
    const out = owedWith(full, 'new');
    expect(out).toHaveLength(UNSENT_CAP);
    expect(out[out.length - 1]).toBe('new');
  });

  it('while the send is still on its way, the workout is already on the owed list', async () => {
    h.hang = true;
    void sendWorkoutToHealth('s2');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['s2']);
  });

  it('once Health Connect has it, it is off the list', async () => {
    await sendWorkoutToHealth('s2');
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
  });

  it('nothing is marked while sending is off', async () => {
    usePhonePrefs.setState({ healthConnect: false });
    await sendWorkoutToHealth('s2');
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
    expect(h.writes).toHaveLength(0);
  });
});

describe('owed workouts go again by themselves', () => {
  it('shouldRetryOwed (pure)', () => {
    expect(shouldRetryOwed(1000, null, true, 1)).toBe(true);
    expect(shouldRetryOwed(1000, null, false, 1)).toBe(false);
    expect(shouldRetryOwed(1000, null, true, 0)).toBe(false);
    expect(shouldRetryOwed(1000 + RETRY_GAP_MS - 1, 1000, true, 1)).toBe(false);
    expect(shouldRetryOwed(1000 + RETRY_GAP_MS, 1000, true, 1)).toBe(true);
    // The clock moved back (a time zone or clock change): not stuck for hours.
    expect(shouldRetryOwed(10, 1000, true, 1)).toBe(true);
  });

  it('on open: sent and cleared when Health Connect allows workouts', async () => {
    usePhonePrefs.setState({ healthUnsent: ['s1', 's3'] });
    h.written = 2;
    const r = await retryOwedHealth(1_000_000);
    expect(r).toEqual({ kind: 'sent', sent: 2, total: 2 });
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
  });

  it('access taken away in Health Connect: no try, no error line, still owed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePhonePrefs.setState({ healthUnsent: ['s1'] });
    h.access = { exercise: false, calories: false };
    expect(await retryOwedHealth(1_000_000)).toBeNull();
    expect(h.writes).toHaveLength(0);
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['s1']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Health Connect missing or needing an update: no try', async () => {
    usePhonePrefs.setState({ healthUnsent: ['s1'] });
    h.status = 'update';
    expect(await retryOwedHealth(1_000_000)).toBeNull();
    expect(h.writes).toHaveLength(0);
  });

  it('at most once every 10 minutes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePhonePrefs.setState({ healthUnsent: ['s1'] });
    h.written = -1;
    await retryOwedHealth(1_000_000);
    expect(h.writes).toHaveLength(1);
    await retryOwedHealth(1_000_000 + 60_000);
    expect(h.writes).toHaveLength(1);
    await retryOwedHealth(1_000_000 + RETRY_GAP_MS);
    expect(h.writes).toHaveLength(2);
    vi.mocked(console.warn).mockRestore();
  });

  it('the app runs it on open and on every return (phoneSync)', () => {
    const s = read('src/tracker/phone/phoneSync.ts');
    const start = s.slice(s.indexOf('export function startPhoneSync'));
    expect(start.match(/retryOwedLater\(\)/g)?.length).toBe(2);
  });
});

describe('a deleted workout leaves Health Connect', () => {
  it('while sending is on', async () => {
    await removeWorkoutFromHealth('s1');
    expect(h.deletes).toEqual(['s1']);
  });

  it('after Stop too, when this phone sent before and access is still on', async () => {
    usePhonePrefs.setState({ healthConnect: false, healthLast: { at: 1, count: 3, past: true } });
    await removeWorkoutFromHealth('s1');
    expect(h.deletes).toEqual(['s1']);
  });

  it('never tried when nothing was ever sent from this phone', async () => {
    usePhonePrefs.setState({ healthConnect: false, healthLast: null });
    await removeWorkoutFromHealth('s1');
    expect(h.deletes).toEqual([]);
  });

  it('never tried after Stop when access is off, and no error line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePhonePrefs.setState({ healthConnect: false, healthLast: { at: 1, count: 3, past: true } });
    h.access = { exercise: false, calories: false };
    await removeWorkoutFromHealth('s1');
    expect(h.deletes).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a refused delete is logged, not silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.deleteOk = false;
    await removeWorkoutFromHealth('s1');
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[ForgeErr]'))).toBe(true);
    warn.mockRestore();
  });

  it('an owed workout that is deleted is no longer owed', async () => {
    usePhonePrefs.setState({ healthUnsent: ['s1', 's2'] });
    await removeWorkoutFromHealth('s1');
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['s2']);
  });
});

describe('times: a workout crossing midnight in India', () => {
  it('keeps its real start and end (Health Connect gets instants, no date shift)', () => {
    // 31 Oct 2026 23:30 IST = 18:00 UTC; ends 1 Nov 00:45 IST.
    const start = Date.UTC(2026, 9, 31, 18, 0);
    const end = Date.UTC(2026, 9, 31, 19, 15);
    const [w] = healthPayload(
      [{ id: 'm', date_iso: '2026-10-31', started_at: start, ended_at: end, day_type: 'legs', title: null, routine_name: null, sets: 12, cardio: 0 }],
      [{ dateISO: '2026-10-01', weightKg: 80 }],
    );
    expect(w.startMs).toBe(start);
    expect(w.endMs).toBe(end);
    // 75 min strength at 2.5 active MET, 80 kg = 250 kcal.
    expect(w.kcal).toBe(250);
  });
});

describe('Play: the "privacy policy" link shows the privacy notice', () => {
  const kt = read('modules/forge-phone/android/src/main/java/com/forgeai/phone/HealthRationaleActivity.kt');
  const mod = read('modules/forge-phone/android/src/main/AndroidManifest.xml');
  const app = read('android/app/src/main/AndroidManifest.xml');

  it('opens the same privacy notice the join screen links to', () => {
    expect(kt).toContain(`PRIVACY_URL = "${PRIVACY_URL}"`);
  });

  it('both Health Connect entry points go to it, the alias after its target', () => {
    const act = mod.indexOf('android:name="com.forgeai.phone.HealthRationaleActivity"');
    const alias = mod.indexOf('<activity-alias');
    expect(act).toBeGreaterThan(0);
    expect(alias).toBeGreaterThan(act);
    expect(mod).toContain('androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE');
    expect(mod).toContain('android.intent.action.VIEW_PERMISSION_USAGE');
    expect(mod).toContain('android.intent.category.HEALTH_PERMISSIONS');
    expect(mod).toContain('android:permission="android.permission.START_VIEW_PERMISSION_USAGE"');
  });

  it('the app home screen no longer answers them (it showed no policy)', () => {
    expect(app).not.toContain('<action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/>');
    expect(app).not.toContain('VIEW_PERMISSION_USAGE');
  });

  it('only the permissions MettleUp uses are declared (two writes; F55 weight and F62 steps reads)', () => {
    const perms = [...mod.matchAll(/android\.permission\.health\.[A-Z_]+/g)].map((m) => m[0]);
    expect(new Set(perms)).toEqual(
      new Set([
        'android.permission.health.WRITE_EXERCISE',
        'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
        'android.permission.health.READ_WEIGHT',
        'android.permission.health.READ_STEPS',
      ]),
    );
    // The app manifest declares none itself (the module's are merged in).
    expect(app).not.toMatch(/android\.permission\.health\./);
  });

  it('every declared read is used by the native code (Play rejects unused health permissions)', () => {
    const kt = read('modules/forge-phone/android/src/main/java/com/forgeai/phone/Health.kt');
    expect(kt).toContain('getReadPermission(WeightRecord::class)');
    expect(kt).toContain('getReadPermission(StepsRecord::class)');
    expect(kt).toContain('revokeAllPermissions()');
  });
});

describe('member words', () => {
  it('"Stop" says what happened in complete sentences, without banned words', () => {
    expect(HC_STOPPED).toMatch(/^[A-Z].*\.$/);
    expect(HC_STOPPED).not.toMatch(/\b(volume|PR|session)s?\b/i);
  });
});
