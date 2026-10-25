/**
 * R-123 — ForgeAI 0.55.2's "Save full backup" on a REAL database (sql.js), the phone's files in
 * memory: the file holds what MettleUp 0.57.0 restores (MettleUp's own round-trip test restores a
 * file made by this same writer). The member changed a lot away from the defaults (next-weight rules,
 * rest, reminders, plates, units, …) and keeps folders and routines in an order that is NOT the order
 * they were made in. Made-up data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { fakePicture, MemIo } from './memIo';

vi.setConfig({ testTimeout: 60_000 });

// The phone's saved settings (AsyncStorage), in memory: cleared for each new phone. AsyncStorage
// and the legacy file system share one stub module (vitest.config.ts): one mock with both shapes.
const store = vi.hoisted(() => ({ items: new Map<string, string>() }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async () => ({ exists: false, size: 0 }),
  deleteAsync: async () => undefined,
  readDirectoryAsync: async () => [],
  default: {
    getItem: async (k: string) => store.items.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.items.set(k, v),
    removeItem: async (k: string) => void store.items.delete(k),
  },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.57.0', extra: {} } } }));

const MEMBER: OnboardingInput = {
  name: 'Aarav Mehta',
  phoneE164: '+919876500001',
  goal: 'strength',
  experience: 'advanced',
  age: 34,
  heightCm: 178,
  gymName: '',
  bodyWeightKg: 81.5,
  targets: { calorieTarget: 2800, proteinTargetG: 160, carbsTargetG: 320, fatTargetG: 80 },
};

let db: RealDb;
const T = Date.UTC(2026, 8, 1, 1, 30); // 7 am IST, far from the demo's times
const DAY = 86_400_000;

const lib = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

/** A phone full of the member's own things, many of them away from the defaults. */
async function fillPhone(io: MemIo): Promise<void> {
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const bench = lib('Barbell Bench Press');
  const squat = lib('Barbell Squat');
  const run = (sql: string, p: (string | number | null)[] = []): void => {
    db.raw.run(sql, p);
  };
  run("UPDATE user_profile SET bio = 'Lifting since 2019', link = 'https://example.com/aarav', unit_system = 'imperial', language = 'hi'");
  run(`INSERT INTO exercises (id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg, log_type, load_mode, dist_unit)
       VALUES ('own-y', 'Cable Y Raise', '["y raise"]', 'shoulders', '[]', 'cable', 0, 1.25, 'weight_reps', 'one', NULL)`);
  // Folders made in one order, put in another: Hypertrophy is first and followed.
  run("INSERT INTO workout_plans (id, name, is_active, folder_order, source, settings) VALUES ('f-str', 'Strength', 0, 2, NULL, NULL)");
  run(`INSERT INTO workout_plans (id, name, is_active, folder_order, source, settings) VALUES ('f-hyp', 'Hypertrophy', 1, 1, 'builder', '{"easyEvery":4}')`);
  // Routines made Pull, Push, Legs; their order is Push, Pull, Legs.
  run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d-pull', 'f-hyp', 'pull', 1, 'Pull')");
  run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d-push', 'f-hyp', 'push', 0, 'Push')");
  run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d-legs', 'f-hyp', 'legs', 2, 'Legs')");
  run("INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES ('d-5x5', 'f-str', 'full', 0, '5x5 A')");
  const pe = (id: string, day: string, ex: string, order: number, sets: number, lo: number, hi: number, json: string | null, rest: number | null, ss: number | null, note: string | null): void =>
    run(
      `INSERT INTO plan_exercises (id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, day, ex, order, sets, lo, hi, json, rest, ss, note],
    );
  // Made squat, own, bench; ordered bench (0), own (1, superset with squat), squat (2, superset).
  pe('pe-3', 'd-push', squat, 2, 4, 5, 8, null, 210, 1, null);
  pe('pe-2', 'd-push', 'own-y', 1, 3, 12, 15, '[{"type":"warmup","reps":15},{"type":"normal","reps":12}]', 60, 1, 'thumbs up');
  pe('pe-1', 'd-push', bench, 0, 5, 3, 5, '[{"type":"normal","kg":100,"reps":5}]', 180, null, 'pause on chest');
  pe('pe-4', 'd-5x5', squat, 0, 5, 5, 5, null, null, null, null);
  // Workouts with warm-ups, a drop set, effort, a superset and a heavy and a back-off card.
  const w = (id: string, start: number, routine: string | null, title: string | null): void =>
    run(
      `INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source, easy_week, title, routine_id)
       VALUES (?, ?, ?, ?, 'push', 'felt good', 'manual', NULL, ?, ?)`,
      [id, new Date(start).toISOString().slice(0, 10), start, start + 3600_000, title, routine],
    );
  const set = (id: string, s: string, ex: string, n: number, kg: number, reps: number, warm: number, rpe: number | null, type: string | null, ss: number | null, card: number | null): void =>
    run(
      `INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note, superset_group, duration_sec, distance_m, load_mode, card_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?)`,
      [id, s, ex, n, kg, reps, warm, rpe, type, ss, card],
    );
  w('w-1', T, 'd-push', 'Push heavy');
  set('s1', 'w-1', bench, 1, 60, 10, 1, null, 'warmup', null, 0);
  set('s2', 'w-1', bench, 2, 100, 5, 0, 8.5, null, null, 0);
  set('s3', 'w-1', bench, 3, 80, 8, 0, 9, 'drop', null, 1);
  set('s4', 'w-1', 'own-y', 1, 7.5, 15, 0, null, null, 1, null);
  set('s5', 'w-1', squat, 1, 140, 5, 0, null, null, 1, null);
  w('w-2', T + 2 * DAY, 'd-pull', null);
  set('s6', 'w-2', squat, 1, 145, 5, 0, null, 'failure', null, null);
  w('w-3', T + 5 * DAY, null, 'Quick one');
  set('s7', 'w-3', bench, 1, 102.5, 3, 0, 9.5, null, null, null);
  run("INSERT INTO exercise_prefs (exercise_id, rest_sec, records_from) VALUES (?, 240, '2026-08-01')", [bench]);
  run("INSERT INTO exercise_prefs (exercise_id, rest_sec, records_from) VALUES ('own-y', 45, NULL)");
  run(`INSERT INTO body_weight (id, date_iso, weight_kg) VALUES ('bw-2', '2026-09-03', 80.9)`);
  run(`INSERT INTO body_measurements (id, date_iso, kind, value) VALUES ('m-1', '2026-09-03', 'waist', 84.5), ('m-2', '2026-09-03', 'body_fat', 17.5)`);
  run(`INSERT INTO meals (id, date_iso, logged_at, description, calories, protein_g, carbs_g, fat_g, source) VALUES ('meal-1', '2026-09-03', ${T}, 'Dal and rice', 520, 21, 80, 9, 'text')`);
  run(`INSERT INTO chat_messages (id, role, kind, text, payload, created_at) VALUES ('c-1', 'user', 'text', 'How was my week?', NULL, ${T})`);
  // Photos: two progress photos, a workout photo, the profile photo, an exercise's own picture and
  // a library exercise's own video.
  const pics: [string, Uint8Array][] = [
    ['file:///docs/progress-photos/pp-1.jpg', fakePicture(1)],
    ['file:///docs/progress-photos/pp-2.png', fakePicture(2, 1_700_000)],
    ['file:///docs/workout-photos/wp-1.jpg', fakePicture(3)],
    ['file:///docs/profile-photo/me-1.jpg', fakePicture(4)],
    ['file:///docs/exercise-media/own.jpg', fakePicture(5)],
    ['file:///docs/exercise-media/bench.mp4', fakePicture(6, 2_300_000)],
  ];
  for (const [u, b] of pics) io.put(u, b);
  run(`INSERT INTO progress_photos (id, date_iso, uri, created_at) VALUES ('pp-1', '2026-09-01', 'file:///docs/progress-photos/pp-1.jpg', ${T}), ('pp-2', '2026-09-05', 'file:///docs/progress-photos/pp-2.png', ${T + 1})`);
  run(`INSERT INTO workout_photos (id, session_id, uri, position, created_at) VALUES ('wp-1', 'w-1', 'file:///docs/workout-photos/wp-1.jpg', 0, ${T})`);
  run("UPDATE user_profile SET photo_uri = 'file:///docs/profile-photo/me-1.jpg'");
  run("UPDATE exercises SET media_uri = 'file:///docs/exercise-media/own.jpg', media_type = 'image' WHERE id = 'own-y'");
  run("UPDATE exercises SET media_uri = 'file:///docs/exercise-media/bench.mp4', media_type = 'video', load_mode = 'both' WHERE id = ?", [bench]);
  // A hidden library exercise, and the import marks.
  const hidden = lib('Barbell Squat');
  run("INSERT INTO meta(key, value) VALUES('hidden_exercises', ?)", [JSON.stringify([hidden])]);
  run(`INSERT INTO meta(key, value) VALUES('importOriginalStarts', '{"w-1":${T}}'), ('import_clock_real_v1', '1'), ('routine_import_marks', '{"d-push":["x"]}')`);
  run("INSERT INTO meta(key, value) VALUES('restTimerDefaultSec', '135')");
  run("INSERT INTO meta(key, value) VALUES('photo_backup_on', '1')");

  // Settings outside the database, every kind away from its default.
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  const p = useTrackerPrefs.getState();
  p.setWeightJump('large');
  p.setRepRange('strength');
  p.setWeeklyGoal(4);
  p.setRestSound('whistle');
  p.setSounds(false);
  p.setAdvancedSets(true);
  p.setInUseAfterSet(true);
  p.setPreviousFrom('routine');
  p.setBodyFigure('female');
  p.setChartRange('all' as never);
  p.setShareLook('clear' as never);
  const { useSettings } = await import('@/store/settingsStore');
  useSettings.getState().setUnitSystem('imperial');
  useSettings.getState().setLanguage('hi');
  const { usePhonePrefs } = await import('@/tracker/phone/phonePrefs');
  usePhonePrefs.getState().setReminders({ remindersOn: true, reminderDays: [1, 3, 5], reminderMinutes: 6 * 60 + 30, reminderChosen: true });
  usePhonePrefs.getState().setGymRemindersOn(false);
  usePhonePrefs.getState().setHealthConnect(true);
  const { usePlateSetup } = await import('@/tracker/store/plateSetupStore');
  usePlateSetup.getState().setSetup('imperial', { off: [2.5], extra: [], bar: 35 });
  usePlateSetup.getState().setSetup('metric', { off: [1.25], extra: [], bar: 15 });
  const { useMuscleTips } = await import('@/tracker/store/muscleTipsStore');
  useMuscleTips.getState().setOn(false);
  useMuscleTips.getState().mute('chest' as never);
  const { useRestAlertPrefs } = await import('@/tracker/store/restAlertPrefsStore');
  useRestAlertPrefs.getState().setRingThroughDnd(true);
  const { useFolderOpen } = await import('@/tracker/store/folderOpenStore');
  useFolderOpen.getState().setOpen('f-str', false);
}

async function settingsNow(): Promise<Record<string, Record<string, unknown>>> {
  const { deviceSettingsIo } = await import('@/backup/backupSettings');
  return deviceSettingsIo.read();
}

beforeEach(() => {
  store.items.clear();
});

describe('Save full backup (ForgeAI 0.55.2)', () => {
  it('writes one ZIP with every record, the routines in order, every setting and every photo', async () => {
    db = await bootRealApp();
    const io = new MemIo();
    await fillPhone(io);
    const settings = await settingsNow();
    const { saveBackupZip } = await import('@/backup/backupSave');
    const res = await saveBackupZip(io, { app: 'ForgeAI', appVersion: '0.55.2', units: 'imperial', settings, now: new Date(2026, 9, 25, 9, 0) });
    expect(res.kind).toBe('saved');
    if (res.kind !== 'saved') return;
    expect(res.name).toBe('mettleup-backup-2026-10-25.zip');
    expect(io.biggestRead).toBeLessThanOrEqual(1 << 20);

    const { listZipEntries, readEntry, copyEntry, utf8Decode } = await import('@/backup/zipStore');
    const { parseBackup, backupSummary } = await import('@/backup/backupFormat');
    const zip = io.files.get(res.uri)!;
    const src = { size: zip.length, readAt: (o: number, n: number) => zip.slice(o, o + n) };
    const entries = await listZipEntries(src);
    const json = entries.find((e) => e.name === 'backup.json')!;
    const parsed = parseBackup(utf8Decode(await readEntry(src, json)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const f = parsed.file;
    expect(f.app).toBe('ForgeAI');
    expect(f.appVersion).toBe('0.55.2');
    expect(backupSummary(f)).toBe('3 workouts, 4 routines, 4 measurements and 6 photos, saved on 25 Oct 2026 by ForgeAI 0.55.2');

    // Folders: Hypertrophy followed and first; its routines Push, Pull, Legs; Push's exercises in order.
    const folders = f.items.filter((i) => i[0] === 'r').map((i) => ({ id: i[1], name: i[2][0], active: i[2][1], order: i[2][3], days: i[2][2] as unknown[][] }));
    const hyp = folders.find((x) => x.id === 'f-hyp')!;
    expect(hyp).toMatchObject({ name: 'Hypertrophy', active: 1, order: 1 });
    expect(folders.find((x) => x.id === 'f-str')).toMatchObject({ name: 'Strength', active: 0, order: 2 });
    const days = [...hyp.days].sort((a, b) => (a[2] as number) - (b[2] as number));
    expect(days.map((d) => d[3])).toEqual(['Push', 'Pull', 'Legs']);
    const push = (days[0][4] as unknown[][]).slice().sort((a, b) => (a[1] as number) - (b[1] as number));
    expect(push.map((e) => e[0])).toEqual(['c:barbell_bench_press', 'x:own-y', 'c:barbell_back_squat']);
    expect(push[1]).toEqual(['x:own-y', 1, 3, 12, 15, '[{"type":"warmup","reps":15},{"type":"normal","reps":12}]', 60, 1, 'thumbs up']);

    // Every setting the member changed, exactly as read (Health Connect too: MettleUp asks again).
    expect(f.settings).toEqual(settings);
    expect(f.settings['forgeai-tracker-prefs']).toMatchObject({ weightJump: 'large', repRange: 'strength', weeklyGoal: 4, restSound: 'whistle' });
    expect(f.settings.meta).toEqual({ restTimerDefaultSec: 135, photo_backup_on: '1' });

    // Never the phone number; the profile is there.
    expect(JSON.stringify(f)).not.toContain('9876500001');
    expect(f.items.find((i) => i[0] === 'u')?.[2][0]).toBe('Aarav Mehta');
    expect(f.hiddenExercises).toEqual(['c:barbell_back_squat']);
    expect(f.libraryEdits).toEqual([['c:barbell_bench_press', null, 'both']]);

    // Every picture, byte for byte.
    for (const p of f.photos) {
      const e = entries.find((x) => x.name === p.file)!;
      const out: Uint8Array[] = [];
      await copyEntry(src, e, (c) => void out.push(c.slice()));
      const bytes = Buffer.concat(out.map((o) => Buffer.from(o)));
      const original = [...io.files.entries()].find(([k, v]) => k.startsWith('file:///docs/') && Buffer.compare(Buffer.from(v), bytes) === 0);
      expect(original, p.file).toBeDefined();
    }
    expect(f.photos.map((p) => p.kind).sort()).toEqual(['exercise', 'exercise', 'profile', 'progress', 'progress', 'workout']);
  });

  it('a phone short of space is told before anything is written', async () => {
    db = await bootRealApp();
    const io = new MemIo();
    await fillPhone(io);
    io.free = 5 * 1024 * 1024;
    const { saveBackupZip } = await import('@/backup/backupSave');
    const res = await saveBackupZip(io, { app: 'ForgeAI', appVersion: '0.55.2', units: 'metric', settings: {} });
    expect(res.kind).toBe('no-space');
    expect([...io.files.keys()].some((k) => k.startsWith('file:///cache/'))).toBe(false);
  });
});
