/**
 * R-123 — "Save a backup" then "Restore from a backup" on a REAL database (sql.js), the phone's
 * files in memory. Owner, 25 Oct 2026: "ensure that I will be able to backup my routines along with
 * its sequence all other settings ... my photo, any profile info ... Everything that I have changed
 * should backup". So the member here changes a lot away from the defaults (next-weight rules, rest,
 * reminders, plates, units, language, …), keeps folders and routines in an order that is NOT the
 * order they were made in, own exercises, supersets, set targets, photos of every kind — and an
 * empty phone must end up with exactly the same. Made-up data.
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

/** Everything a member would notice, by library key / own id (row ids differ per phone). */
function dump(): Record<string, unknown> {
  const ref = (id: string): string => {
    const r = db.all<{ catalog_key: string | null }>('SELECT catalog_key FROM exercises WHERE id = ?', [id])[0];
    return r?.catalog_key ? `c:${r.catalog_key}` : `x:${id}`;
  };
  const folders = db.all<Record<string, unknown>>('SELECT id, name, is_active, folder_order, source, settings FROM workout_plans ORDER BY folder_order');
  const days = db.all<Record<string, unknown>>('SELECT id, plan_id, day_type, day_order, name FROM plan_days ORDER BY plan_id, day_order');
  const exs = db
    .all<Record<string, unknown>>(
      'SELECT plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note FROM plan_exercises ORDER BY plan_day_id, ex_order',
    )
    .map(({ exercise_id, ...r }) => ({ ...r, ex: ref(String(exercise_id)) }));
  const sessions = db.all<Record<string, unknown>>('SELECT * FROM workout_sessions ORDER BY started_at');
  const sets = db
    .all<Record<string, unknown>>(
      'SELECT session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note, superset_group, duration_sec, distance_m, load_mode, card_index FROM set_entries',
    )
    .map(({ exercise_id, ...r }) => ({ ...r, ex: ref(String(exercise_id)) }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const prefs = db
    .all<{ exercise_id: string; rest_sec: number | null; records_from: string | null }>('SELECT * FROM exercise_prefs')
    .map((p) => ({ ex: ref(p.exercise_id), rest: p.rest_sec, from: p.records_from }))
    .sort((a, b) => a.ex.localeCompare(b.ex));
  const own = db.all('SELECT id, name, aliases, muscle_group, equipment, is_compound, increment_kg, log_type, load_mode, bw_share, dist_unit FROM exercises WHERE catalog_key IS NULL ORDER BY id');
  const edits = db.all('SELECT catalog_key, log_type, load_mode FROM exercises WHERE catalog_key IS NOT NULL AND (log_type IS NOT NULL OR load_mode IS NOT NULL) ORDER BY catalog_key');
  const profile = db.all('SELECT name, age, height_cm, goal, experience, calorie_target, protein_target_g, carbs_target_g, fat_target_g, unit_system, language, bio, link FROM user_profile');
  const meta = db.all("SELECT key, value FROM meta WHERE key IN ('importOriginalStarts', 'import_clock_real_v1', 'routine_import_marks', 'restTimerDefaultSec', 'photo_backup_on') ORDER BY key");
  const hiddenRow = db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'hidden_exercises'")[0];
  const hidden = hiddenRow ? (JSON.parse(hiddenRow.value) as string[]).map(ref) : [];
  return {
    folders,
    days,
    exs,
    sessions,
    sets,
    prefs,
    own,
    edits,
    profile,
    meta,
    hidden,
    bw: db.all('SELECT date_iso, weight_kg FROM body_weight ORDER BY date_iso'),
    measures: db.all('SELECT date_iso, kind, value FROM body_measurements ORDER BY date_iso, kind'),
    meals: db.all('SELECT id, date_iso, logged_at, description, calories, protein_g, carbs_g, fat_g, source FROM meals'),
    chat: db.all('SELECT id, role, kind, text, payload, created_at FROM chat_messages'),
    progress: db.all('SELECT id, date_iso, created_at FROM progress_photos ORDER BY id'),
    workoutPhotos: db.all('SELECT id, session_id, position, created_at FROM workout_photos ORDER BY id'),
  };
}

/** Every saved setting, as the backup reads it. */
async function settingsNow(): Promise<Record<string, Record<string, unknown>>> {
  const { deviceSettingsIo } = await import('@/backup/backupSettings');
  return deviceSettingsIo.read();
}

/** The picture bytes each kept photo points at. */
function pictures(io: MemIo): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const take = (k: string, uri: string | null | undefined): void => {
    const b = uri ? io.files.get(uri) : undefined;
    out[k] = b ? [b.length, b[0], b[b.length - 1], b[Math.floor(b.length / 2)]] : [];
  };
  for (const p of db.all<{ id: string; uri: string }>('SELECT id, uri FROM progress_photos')) take(`progress:${p.id}`, p.uri);
  for (const p of db.all<{ id: string; uri: string }>('SELECT id, uri FROM workout_photos')) take(`workout:${p.id}`, p.uri);
  take('profile', db.all<{ photo_uri: string | null }>('SELECT photo_uri FROM user_profile')[0]?.photo_uri);
  for (const e of db.all<{ name: string; media_uri: string; media_type: string }>('SELECT name, media_uri, media_type FROM exercises WHERE media_uri IS NOT NULL')) {
    take(`exercise:${e.name}:${e.media_type}`, e.media_uri);
  }
  return out;
}

async function save(io: MemIo, app: 'MettleUp' | 'ForgeAI' = 'MettleUp'): Promise<{ zip: Uint8Array; name: string }> {
  const { saveBackupZip } = await import('@/backup/backupSave');
  const res = await saveBackupZip(io, { app, appVersion: app === 'ForgeAI' ? '0.55.2' : '0.57.0', units: 'imperial', settings: await settingsNow(), now: new Date(2026, 9, 25, 9, 0) });
  if (res.kind !== 'saved') throw new Error(`not saved: ${res.kind}`);
  return { zip: io.files.get(res.uri)!, name: res.name };
}

/** A new phone: nothing saved, no profile (the welcome screen). */
async function newPhone(): Promise<MemIo> {
  store.items.clear();
  db = await bootRealApp();
  return new MemIo();
}

async function restore(io: MemIo, zip: Uint8Array, mode: 'replace' | 'add') {
  io.put('file:///cache/picked.zip', zip);
  const { openBackup } = await import('@/backup/backupOpen');
  const { restoreBackup } = await import('@/backup/backupRestore');
  const { deviceSettingsIo } = await import('@/backup/backupSettings');
  const opened = await openBackup(io, 'file:///cache/picked.zip');
  if (!opened.ok) throw new Error(opened.why);
  const r = await restoreBackup(io, opened.backup, mode, { settings: deviceSettingsIo });
  if (r.kind !== 'restored') throw new Error(r.kind);
  return { opened: opened.backup, result: r };
}

beforeEach(() => {
  store.items.clear();
});

describe('save, then restore on an empty phone', () => {
  it('everything comes back: routines in their order, workouts, settings, profile and every photo', async () => {
    const ioA = await newPhone();
    await fillPhone(ioA);
    const before = dump();
    const settingsBefore = await settingsNow();
    const picsBefore = pictures(ioA);
    const { zip, name } = await save(ioA);
    expect(name).toBe('mettleup-backup-2026-10-25.zip');
    // Photos are read and written a megabyte at a time, never whole.
    expect(ioA.biggestRead).toBeLessThanOrEqual(1 << 20);

    const ioB = await newPhone();
    const { opened, result } = await restore(ioB, zip, 'replace');
    expect(opened.summary).toBe('3 workouts, 4 routines, 4 measurements and 6 photos, saved on 25 Oct 2026 by MettleUp 0.57.0');
    expect(result.photos).toBe(6);
    expect(result.photosFailed).toBe(0);
    // Only what the member changed on a library exercise travels (not the library's own values).
    expect(opened.file.libraryEdits).toEqual([['c:barbell_bench_press', null, 'both']]);

    const after = dump();
    expect(after).toEqual(before);
    // The order the member sees: folders Hypertrophy then Strength; Push, Pull, Legs; bench, own, squat.
    expect((after.folders as { name: string }[]).map((f) => f.name)).toEqual(['Hypertrophy', 'Strength']);
    expect((after.days as { name: string; plan_id: string }[]).filter((d) => d.plan_id === 'f-hyp').map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(pictures(ioB)).toEqual(picsBefore);

    // Settings: every one the member changed, identical — except Health Connect, which Android must
    // allow again on this phone (the screen says so).
    const settingsAfter = await settingsNow();
    const phoneBefore = settingsBefore['forgeai-phone-prefs'] as Record<string, unknown>;
    expect(phoneBefore.healthConnect).toBe(true);
    expect(settingsAfter).toEqual({ ...settingsBefore, 'forgeai-phone-prefs': { ...phoneBefore, healthConnect: false } });
    expect(result.healthConnectWasOn).toBe(true);
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    expect(useTrackerPrefs.getState()).toMatchObject({ weightJump: 'large', repRange: 'strength', weeklyGoal: 4, restSound: 'whistle', advancedSets: true, inUseAfterSet: true });

    // Never the phone number; records worked out again from the sets.
    expect(db.all('SELECT phone FROM user_profile')).toEqual([{ phone: null }]);
    expect(db.count('personal_records')).toBeGreaterThan(0);
  });

  it('a backup saved by ForgeAI 0.55.2 restores the same way, and says who made it', async () => {
    const ioA = await newPhone();
    await fillPhone(ioA);
    const before = dump();
    const { zip } = await save(ioA, 'ForgeAI');
    const ioB = await newPhone();
    const { opened } = await restore(ioB, zip, 'replace');
    expect(opened.file.app).toBe('ForgeAI');
    expect(opened.summary).toMatch(/by ForgeAI 0\.55\.2$/);
    expect(dump()).toEqual(before);
  });
});

describe('restore onto a phone that already has things', () => {
  it('"Add to what\'s here" adds only what is missing: no workout twice, the phone\'s profile and settings stay', async () => {
    const ioA = await newPhone();
    await fillPhone(ioA);
    const { zip } = await save(ioA);

    const ioB = await newPhone();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding({ ...MEMBER, name: 'Second Phone', phoneE164: null });
    // The same morning's workout, imported here earlier from a Hevy file (other id, same start).
    db.raw.run(`INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES ('hevy-1', '2026-09-01', ${T}, ${T + 3600_000}, 'push', NULL, 'hevy')`);
    db.raw.run(`INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES ('mine-1', '2026-10-01', ${T + 30 * DAY}, NULL, 'legs', NULL, 'manual')`);
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setWeightJump('small');
    const { result } = await restore(ioB, zip, 'add');
    expect(result.outcome.alreadyHere).toBe(1);
    expect(db.all('SELECT id FROM workout_sessions ORDER BY started_at').map((r) => (r as { id: string }).id)).toEqual(['hevy-1', 'w-2', 'w-3', 'mine-1']);
    expect(db.all('SELECT name FROM user_profile')).toEqual([{ name: 'Second Phone' }]);
    expect(useTrackerPrefs.getState().weightJump).toBe('small');
    expect(db.count('workout_plans')).toBe(2);
  });

  it('"Replace everything" can be undone while on the screen: the phone comes back as it was', async () => {
    const ioA = await newPhone();
    await fillPhone(ioA);
    const { zip } = await save(ioA);

    const ioB = await newPhone();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding({ ...MEMBER, name: 'Before Restore' });
    db.raw.run(`INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source) VALUES ('mine-1', '2026-10-01', ${T + 30 * DAY}, NULL, 'legs', NULL, 'manual')`);
    db.raw.run("INSERT INTO workout_plans (id, name, is_active, folder_order) VALUES ('my-f', 'My folder', 1, 0)");
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setWeightJump('small');
    const before = dump();
    const settingsBefore = await settingsNow();
    const filesBefore = [...ioB.files.keys()].filter((k) => !k.startsWith('file:///cache/')).sort();

    const { result } = await restore(ioB, zip, 'replace');
    expect(db.all('SELECT name FROM user_profile')).toEqual([{ name: 'Aarav Mehta' }]);
    expect(useTrackerPrefs.getState().weightJump).toBe('large');

    const { undoRestore } = await import('@/backup/backupRestore');
    const { deviceSettingsIo } = await import('@/backup/backupSettings');
    await undoRestore(ioB, result.undo, deviceSettingsIo);
    expect(dump()).toEqual(before);
    expect(await settingsNow()).toEqual(settingsBefore);
    expect([...ioB.files.keys()].filter((k) => !k.startsWith('file:///cache/')).sort()).toEqual(filesBefore);
  });

  it('a phone short of space is told before anything changes', async () => {
    const ioA = await newPhone();
    await fillPhone(ioA);
    ioA.free = 10 * 1024 * 1024;
    const { saveBackupZip } = await import('@/backup/backupSave');
    const res = await saveBackupZip(ioA, { app: 'MettleUp', appVersion: '0.57.0', units: 'metric', settings: {} });
    expect(res.kind).toBe('no-space');
    ioA.free = 1e12;
    const { zip } = await save(ioA);

    const ioB = await newPhone();
    ioB.free = 1024 * 1024;
    ioB.put('file:///cache/picked.zip', zip);
    const { openBackup } = await import('@/backup/backupOpen');
    const { restoreBackup } = await import('@/backup/backupRestore');
    const { deviceSettingsIo } = await import('@/backup/backupSettings');
    const opened = await openBackup(ioB, 'file:///cache/picked.zip');
    if (!opened.ok) throw new Error(opened.why);
    const r = await restoreBackup(ioB, opened.backup, 'replace', { settings: deviceSettingsIo });
    expect(r.kind).toBe('no-space');
    expect(db.count('workout_sessions')).toBe(0);
  });
});

describe('files that are not a backup', () => {
  it('are refused in plain words, nothing changed', async () => {
    const io = await newPhone();
    const { openBackup } = await import('@/backup/backupOpen');
    const { NOT_A_BACKUP, NEWER_BACKUP } = await import('@/backup/backupFormat');
    const { ZipWriter, utf8Encode } = await import('@/backup/zipStore');
    const zipOf = async (name: string, text: string): Promise<Uint8Array> => {
      const parts: Uint8Array[] = [];
      const z = new ZipWriter({ write: (b) => void parts.push(b.slice()) });
      await z.addBytes(name, utf8Encode(text));
      await z.finish();
      return Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
    };
    const cases: [string, string | Uint8Array, string][] = [
      ['a Hevy CSV', 'title,start_time,exercise_title\nPush,2026-09-01,Bench', NOT_A_BACKUP],
      ['random bytes', fakePicture(9, 5000), NOT_A_BACKUP],
      ['the old Drive backup', '{"app":"forgeai","schema_version":1,"tables":{}}', NOT_A_BACKUP],
      ['a ZIP of something else', await zipOf('notes.txt', 'hello'), NOT_A_BACKUP],
      ['a newer backup', await zipOf('backup.json', '{"format":"mettleup-backup","formatVersion":2,"packVersion":1,"items":[]}'), NEWER_BACKUP],
      ['empty', '', NOT_A_BACKUP],
    ];
    for (const [what, body, why] of cases) {
      io.put(`file:///cache/${what}`, body);
      const r = await openBackup(io, `file:///cache/${what}`);
      expect(r, what).toEqual({ ok: false, why });
    }
    expect(db.count('workout_sessions')).toBe(0);
  });
});
