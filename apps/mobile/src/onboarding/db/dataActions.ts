/**
 * The data lifecycle actions — Phase O2 (W1 real onboarding), Phase 1 packet D.
 *
 *   completeOnboarding()      a REAL member starts EMPTY (profile + exercise catalog only)
 *   loadDemoData()            the Arjun demo, on purpose, for a sales pitch
 *   removeDemoData()          the demo goes; every workout the member logged THEMSELVES stays
 *   prepareImportOverDemo()   a history import over the demo: the whole demo goes first
 *   eraseAllData()            wipe back to a fresh install — never regenerates fake data
 *
 * Before O2 the app auto-seeded 13 weeks of invented history on first launch and
 * "Reset" regenerated it. A member handed the app by their real gym must never see
 * someone else's numbers, so the seed now runs ONLY from an explicit demo action.
 *
 * Phase 1 (owner decision D5 = A): "Load demo data" lives on the welcome screen only (plus a
 * hidden sales switch in Profile), and demo data is a sandbox — real history arriving over it
 * (an import) or "Remove demo data" takes away EVERY demo row (profile, body weight,
 * measurements, meals, chat, the demo plan, records, sessions) and keeps the member's own.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { PLAN_NAME } from '@/db/seed/plan';
import { SEED_PROFILE } from '@/db/seed/profile';
import { forceReseed } from '@/db/seed';
import { addDays, todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import { applyCatalogSync, forgetCatalogSync, markCatalogSynced, resyncExerciseCatalog } from '@/tracker/catalog/catalogSync';
import { seedDemoMeasurements } from '@/tracker/db/demoBody';
import { deleteAllProgressPhotoFiles } from '@/tracker/services/progressPhotos';

import { insertExerciseCatalog } from './catalog';
import { computeTargets, normalizeName, type OnboardingInput } from '../form';
import { eraseDeviceData } from '../eraseDevice';

type TxLike = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync'>;

/** Why a demo action did nothing: the data on this phone is not (or no longer) the demo. */
export const NOT_DEMO_REASON = 'This isn’t demo data, so nothing was removed.';

/**
 * Read INSIDE the job: the screen's demo flag is a cached read from before the confirm, and a
 * restore, an import or another tab may have replaced the demo since. Only a stored '1' lets a
 * demo action delete anything — on a member's real data it would delete their history.
 */
async function storedDemoFlag(tx: Pick<SQLiteDatabase, 'getFirstAsync'>): Promise<boolean> {
  const row = await tx.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [DEMO_FLAG]);
  return row?.value === '1';
}

/**
 * Thrown when onboarding is asked to run against a database that already holds
 * a member's PROFILE. See completeOnboarding — this is the last line of defence
 * for the owner's own 487-workout history.
 */
export class ExistingDataError extends Error {
  constructor() {
    super('This device already has training data.');
    this.name = 'ExistingDataError';
  }
}

/**
 * Every table an erase clears, CHILDREN BEFORE PARENTS so foreign keys never trip
 * (`PRAGMA foreign_keys = ON` — see db/index.ts). `sync_outbox` is included: a
 * pending push describing data that no longer exists must not reach the gym.
 * `exercise_prefs` (each exercise's own rest length, QA-22) goes before `exercises`.
 * `meta` is NOT here — see KEPT_META_KEYS.
 */
export const WIPE_TABLES_IN_ORDER = [
  'set_entries',
  'personal_records',
  'plan_exercises',
  'plan_days',
  'workout_plans',
  'workout_sessions',
  'meals',
  'chat_messages',
  'body_weight',
  // Phase 3 (tracker schema v6). The photo FILES are deleted after the wipe commits.
  'body_measurements',
  'progress_photos',
  'user_profile',
  'exercise_prefs',
  'exercises',
  'sync_outbox',
] as const;

/**
 * The only `meta` keys an erase KEEPS (DS-13: erase means a fresh install). Everything else —
 * the demo flags, a workout draft, the rest-timer default, the gym link (`cloud_identity`), the
 * Drive link, import bookkeeping — goes.
 *   schema_version / tracker_schema_version / member_schema_version — the migrations already ran
 *     on this database; forgetting them would re-run them.
 *   exercise_catalog_version — the library stamp (onboarding writes the library and stamps it).
 *   cloud_client_version — a monotonic push counter, not personal data: resetting it would make
 *     a later push look STALE to the server.
 */
export const KEPT_META_KEYS = [
  'schema_version',
  'tracker_schema_version',
  'member_schema_version',
  'exercise_catalog_version',
  'cloud_client_version',
] as const;

/** The demo's own `meta` keys (kept exported for older callers; an erase now clears all but KEPT). */
export const OWNED_META_KEYS = ['seeded', 'demo_data', 'activeWorkoutDraft'] as const;

const DEMO_FLAG = 'demo_data';
/** The last day the demo's invented rows cover (its load day). Written by loadDemoData. */
const DEMO_UNTIL = 'demo_until';
/** Set once the pre-v0.20 "seeded but never flagged" check has run on this install. */
const LEGACY_CHECKED = 'demo_legacy_checked';

const PROFILE_COLUMNS = [
  'id',
  'name',
  'phone',
  'age',
  'height_cm',
  'goal',
  'experience',
  'gym_name',
  'member_since_iso',
  'calorie_target',
  'protein_target_g',
  'carbs_target_g',
  'fat_target_g',
  'unit_system',
  'language',
] as const;

// ---------------------------------------------------------------- reads

/** True once a real profile exists — the ONLY signal that onboarding is done.
 *  Keying off the row (not a flag) means every pre-O2 install, demo or real,
 *  upgrades straight into the app instead of being sent back to a welcome screen. */
export async function hasMemberProfile(): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM user_profile');
  return (row?.n ?? 0) > 0;
}

/**
 * True when the CURRENT data is the demo (set by loadDemoData, cleared by erase / remove /
 * an import). DS-05: installs from before v0.20 were auto-seeded with Arjun and only ever got
 * `seeded` — once, they are recognised by that flag plus the seed's own profile name.
 */
export async function isDemoData(): Promise<boolean> {
  const flag = await getMeta(DEMO_FLAG);
  if (flag === '1') return true;
  if (flag === null && (await getMeta(LEGACY_CHECKED)) === null) {
    const seeded = (await getMeta('seeded')) === '1';
    const row = seeded
      ? await getDb().getFirstAsync<{ name: string }>('SELECT name FROM user_profile LIMIT 1')
      : null;
    await setMeta(LEGACY_CHECKED, '1');
    if (seeded && row?.name === SEED_PROFILE.name) {
      await setMeta(DEMO_FLAG, '1');
      return true;
    }
  }
  return false;
}

/** The member's mobile number in E.164, or null on a pre-O2 / demo profile. */
export async function getMemberPhone(): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ phone: string | null }>(
    'SELECT phone FROM user_profile LIMIT 1',
  );
  const phone = row?.phone ?? null;
  return phone && phone.length > 0 ? phone : null;
}

export async function setMemberPhone(phoneE164: string): Promise<void> {
  await enqueueWrite(() => getDb().runAsync('UPDATE user_profile SET phone = ?', [phoneE164]));
}

// ---------------------------------------------------------------- the demo's rows

/**
 * Which workouts are the demo's: the seed writes `source = 'seed'`, and `'chat'` for the few
 * its coach conversation "logged". A member's own coach-logged workout is dated after the
 * demo was loaded (the seed's history ends the day before), so `date_iso <= demo_until`
 * tells the two apart. Imports and live logging write other sources and always stay.
 */
const DEMO_SESSION_WHERE = `(source = 'seed' OR (source = 'chat' AND date_iso <= ?))`;

/**
 * The demo's last day. Recorded at load since Phase 1; for an older demo, the newest seed meal
 * (the seed logs meals up to its load day) or the day after the newest seed workout.
 */
export async function demoUntil(): Promise<string> {
  const stored = await getMeta(DEMO_UNTIL);
  if (stored) return stored;
  const db = getDb();
  const meal = await db.getFirstAsync<{ d: string | null }>("SELECT MAX(date_iso) AS d FROM meals WHERE source = 'seed'");
  if (meal?.d) return meal.d;
  const session = await db.getFirstAsync<{ d: string | null }>(
    "SELECT MAX(date_iso) AS d FROM workout_sessions WHERE source = 'seed'",
  );
  if (session?.d) return addDays(session.d, 1);
  return todayISO();
}

/** Workouts the member logged or imported themselves (everything that is not the demo's). */
export async function countOwnWorkouts(): Promise<number> {
  const db = getDb();
  if (!(await isDemoData())) {
    const all = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
    return all?.n ?? 0;
  }
  const until = await demoUntil();
  const own = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM workout_sessions WHERE NOT ${DEMO_SESSION_WHERE}`,
    [until],
  );
  return own?.n ?? 0;
}

/** Ids of the demo's workouts (empty when the data is not the demo). */
export async function demoSessionIds(): Promise<Set<string>> {
  if (!(await isDemoData())) return new Set();
  const until = await demoUntil();
  const rows = await getDb().getAllAsync<{ id: string }>(
    `SELECT id FROM workout_sessions WHERE ${DEMO_SESSION_WHERE}`,
    [until],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Delete every demo row and keep the member's own. Inside the caller's transaction.
 * Exercises (the library, now linked to the demo's ~40) and each exercise's rest stay: they
 * are the library, not the demo member's training.
 */
async function stripDemo(tx: TxLike, until: string): Promise<void> {
  const demoSessions = `SELECT id FROM workout_sessions WHERE ${DEMO_SESSION_WHERE}`;
  await tx.runAsync(`DELETE FROM personal_records WHERE session_id IN (${demoSessions})`, [until]);
  await tx.runAsync(`DELETE FROM set_entries WHERE session_id IN (${demoSessions})`, [until]);
  await tx.runAsync(`DELETE FROM workout_sessions WHERE ${DEMO_SESSION_WHERE}`, [until]);
  // The demo's plan (its folder and routines). The member's own folders have other names or a source.
  const plan = 'SELECT id FROM workout_plans WHERE name = ? AND source IS NULL';
  await tx.runAsync(
    `DELETE FROM plan_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plan}))`,
    [PLAN_NAME],
  );
  await tx.runAsync(`DELETE FROM plan_days WHERE plan_id IN (${plan})`, [PLAN_NAME]);
  await tx.runAsync('DELETE FROM workout_plans WHERE name = ? AND source IS NULL', [PLAN_NAME]);
  // Food, body weight and measurements of the demo's 13 weeks. The coach chat is the demo's
  // own conversation (the coach is hidden from members, D4).
  await tx.runAsync("DELETE FROM meals WHERE source = 'seed' OR date_iso <= ?", [until]);
  await tx.runAsync('DELETE FROM chat_messages');
  await tx.runAsync('DELETE FROM body_weight WHERE date_iso <= ?', [until]);
  await tx.runAsync('DELETE FROM body_measurements WHERE date_iso <= ?', [until]);
  // Nothing describing the demo may reach a gym.
  await tx.runAsync('DELETE FROM sync_outbox');
  for (const key of [DEMO_FLAG, 'seeded', DEMO_UNTIL]) await tx.runAsync('DELETE FROM meta WHERE key = ?', [key]);
  // Never re-flag this install as an old demo.
  await tx.runAsync(
    `INSERT INTO meta(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LEGACY_CHECKED],
  );
}

/** Exercises the kept workouts use — their records are re-derived without the demo's history. */
async function keptExerciseIds(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ exercise_id: string }>(
    'SELECT DISTINCT exercise_id FROM set_entries WHERE is_warmup = 0',
  );
  return rows.map((r) => r.exercise_id);
}

/** Records beaten only by the demo's invented lifts never got a row; add them (best effort). */
async function reconcileKeptRecords(): Promise<void> {
  try {
    const ids = await keptExerciseIds();
    if (ids.length === 0) return;
    const { reconcilePrsForExercises } = await import('@/tracker/services/prRebuild');
    await reconcilePrsForExercises(ids);
  } catch {
    // Records catch up on the next edit; the removal itself has committed.
  }
}

// ---------------------------------------------------------------- writes

async function wipe(tx: TxLike): Promise<void> {
  for (const table of WIPE_TABLES_IN_ORDER) await tx.runAsync(`DELETE FROM ${table}`);
  await tx.runAsync(
    `DELETE FROM meta WHERE key NOT IN (${KEPT_META_KEYS.map(() => '?').join(', ')})`,
    [...KEPT_META_KEYS],
  );
}

/**
 * A real member's day one. ONE transaction writes exactly: their profile row, the
 * reference exercise catalog, and (only if they gave one) a first body-weight entry.
 * No session, set, PR, meal, plan or chat row is ever written here — that is the
 * W1 guarantee, and test/onboarding/dataActions.test.ts asserts it.
 *
 * Phase 1 (DS-06): "Remove demo data" keeps the member's own workouts and returns to this
 * screen, so a database with workouts but NO profile is a real state. Then nothing is
 * deleted: the profile is added, and the library topped up, around the kept workouts.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const today = todayISO();
  const profileId = uuid();
  const bodyWeightRow =
    input.bodyWeightKg !== null ? { id: uuid(), dateISO: today, weightKg: input.bodyWeightKg } : null;

  await enqueueWrite(() =>
    getDb().withExclusiveTransactionAsync(async (tx) => {
      // Onboarding is only ever reached when the boot check found no profile, but
      // that check runs outside this transaction and a failed READ must never be
      // able to authorise a wipe. Re-verify against the live rows: a profile here
      // means the boot read was wrong — refuse (the caller re-boots into the app).
      const existing = await tx.getFirstAsync<{ profiles: number; sessions: number }>(
        `SELECT (SELECT COUNT(*) FROM user_profile) AS profiles,
                (SELECT COUNT(*) FROM workout_sessions) AS sessions`,
      );
      if ((existing?.profiles ?? 0) > 0) throw new ExistingDataError();
      // Nothing is wiped here. After "Remove demo data" the member's own folders, routines, body
      // weight, measurements and photos are still in the tables even with no workout logged;
      // a wipe would take them. A stray library row cannot collide: the catalog insert below
      // ignores names already there.
      const library = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM exercises');

      await tx.runAsync(
        `INSERT INTO user_profile (${PROFILE_COLUMNS.join(', ')})
         VALUES (${PROFILE_COLUMNS.map(() => '?').join(', ')})`,
        [
          profileId,
          input.name,
          input.phoneE164,
          input.age,
          input.heightCm,
          input.goal,
          input.experience,
          input.gymName,
          today, // member since = the day they actually joined, not an invented date
          input.targets.calorieTarget,
          input.targets.proteinTargetG,
          input.targets.carbsTargetG,
          input.targets.fatTargetG,
          'metric',
          'en',
        ],
      );

      // An empty library gets the whole bundle. A library already there (the demo's, linked to
      // the bundle, or kept workouts' exercises) goes through the catalog sync's own matching:
      // a name-only insert would add "Pull-up" next to the demo's linked "Pull Up" — two rows
      // for one library entry — and the stamp below would stop the sync from ever repairing it.
      if ((library?.n ?? 0) === 0) await insertExerciseCatalog(tx);
      else await applyCatalogSync(tx, { demo: false });

      if (bodyWeightRow) {
        await tx.runAsync(
          `INSERT INTO body_weight (id, date_iso, weight_kg) VALUES (?, ?, ?)
           ON CONFLICT(date_iso) DO UPDATE SET weight_kg = excluded.weight_kg`,
          [bodyWeightRow.id, bodyWeightRow.dateISO, bodyWeightRow.weightKg],
        );
      }
    }),
  );
  // The whole bundled library went in above; nothing to link or top up on next launch.
  await markCatalogSynced().catch(() => undefined);
}

/** The database and the files the app keeps for it. Used by erase and by loading the demo. */
async function wipeDatabaseAndFiles(): Promise<void> {
  await enqueueWrite(() => getDb().withExclusiveTransactionAsync(wipe));
  // Phase 3: progress photos are files in the app's storage. The rows went in the wipe;
  // the pictures go now, so nothing private outlives an erase.
  await deleteAllProgressPhotoFiles().catch(() => undefined);
}

/**
 * Erase everything and go back to a fresh install (the app returns to the welcome
 * screen because no profile row remains). Deliberately does NOT reseed — that was
 * the W1 defect. Phase 1 (DS-13 / EX-04 / SH-14 / AI-14 / QA-22): also every rest length
 * and preference, the member's exercise photos and videos, exports, AI keys, the gym and
 * Drive links and the app's settings (see eraseDevice.ts). Health Connect's copies cannot be
 * deleted from here; the confirm says so.
 */
export async function eraseAllData(): Promise<void> {
  await wipeDatabaseAndFiles();
  await eraseDeviceData();
}

/**
 * Load the Arjun demo — explicit, destructive, and only ever user-initiated.
 * Erase first so the demo can't merge into real data, then reuse the existing
 * generator via forceReseed() (which bypasses the launch-seed memo).
 */
export async function loadDemoData(): Promise<void> {
  await wipeDatabaseAndFiles();
  // Flag BEFORE seeding: if the app dies mid-seed, "flagged but empty" is a
  // harmless state, whereas "seeded but unflagged" would present Arjun's 13 weeks
  // as the member's own training with no demo badge — the exact W1 failure.
  await setMeta(DEMO_FLAG, '1');
  // The demo's rows end today: what is dated after this is the member's own (DS-06).
  await setMeta(DEMO_UNTIL, todayISO());
  // Before the seed commits: a kill right after it still links the demo to the library.
  await forgetCatalogSync().catch(() => undefined);
  await forceReseed();
  // Phase 2: the demo seed writes its ~40 exercises; link them to the bundled library
  // (pictures, steps, types — the demo is known to log one dumbbell's weight) and add the
  // rest. A failure here leaves the demo usable; the next launch retries the sync.
  await resyncExerciseCatalog(true).catch(() => undefined);
  // Phase 3: a few months of waist / chest / arm measurements that follow the demo's body
  // weight, so the Measurements screen has something to show in a sales demo. No photos.
  await seedDemoMeasurements().catch(() => undefined);
}

/**
 * DS-06: "Remove demo data". Every demo row goes, including the demo profile (so the app
 * returns to the welcome screen for the member's own details); every workout the member
 * logged or imported themselves stays, with its sets. Returns how many workouts stayed.
 */
export async function removeDemoData(): Promise<{ removed: boolean; keptWorkouts: number; reason?: string }> {
  const until = await demoUntil();
  let removed = false;
  await enqueueWrite(() =>
    getDb().withExclusiveTransactionAsync(async (tx) => {
      if (!(await storedDemoFlag(tx))) return; // not the demo (any more): touch nothing
      await stripDemo(tx, until);
      await tx.runAsync('DELETE FROM user_profile');
      removed = true;
    }),
  );
  const row = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
  if (!removed) return { removed: false, keptWorkouts: row?.n ?? 0, reason: NOT_DEMO_REASON };
  await reconcileKeptRecords();
  return { removed: true, keptWorkouts: row?.n ?? 0 };
}

/**
 * DS-05 / IM-01: real history is about to be imported over the demo. The whole demo goes
 * first (workouts the member logged themselves stay), and the demo member's profile becomes
 * the member's: their name, nothing else of Arjun's (age, height, gym, targets reset to
 * "not said"). Call BEFORE the import, so Merge never merges into the demo.
 */
export async function prepareImportOverDemo(name: string): Promise<{ prepared: boolean; reason?: string }> {
  const clean = normalizeName(name).slice(0, 60);
  if (clean.length === 0) throw new Error('A name is needed.');
  const until = await demoUntil();
  const targets = computeTargets('muscle', null);
  const today = todayISO();
  let prepared = false;
  await enqueueWrite(() =>
    getDb().withExclusiveTransactionAsync(async (tx) => {
      if (!(await storedDemoFlag(tx))) return; // a real install: its profile and history stay
      prepared = true;
      await stripDemo(tx, until);
      const has = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM user_profile');
      if ((has?.n ?? 0) > 0) {
        await tx.runAsync(
          `UPDATE user_profile SET name = ?, age = 0, height_cm = 0, goal = 'muscle', experience = 'beginner',
             gym_name = '', member_since_iso = ?, calorie_target = ?, protein_target_g = ?,
             carbs_target_g = ?, fat_target_g = ?`,
          [clean, today, targets.calorieTarget, targets.proteinTargetG, targets.carbsTargetG, targets.fatTargetG],
        );
      } else {
        await tx.runAsync(
          `INSERT INTO user_profile (${PROFILE_COLUMNS.join(', ')})
           VALUES (${PROFILE_COLUMNS.map(() => '?').join(', ')})`,
          [uuid(), clean, null, 0, 0, 'muscle', 'beginner', '', today, targets.calorieTarget,
            targets.proteinTargetG, targets.carbsTargetG, targets.fatTargetG, 'metric', 'en'],
        );
      }
    }),
  );
  if (!prepared) return { prepared: false, reason: NOT_DEMO_REASON };
  await reconcileKeptRecords();
  return { prepared: true };
}

/**
 * Stop calling the data a demo. Used when real data REPLACES it wholesale — a
 * Drive restore — so the badge and the softened erase wording can't linger over
 * genuine training.
 */
export async function clearDemoFlag(): Promise<void> {
  await getDb().runAsync('DELETE FROM meta WHERE key = ?', [DEMO_FLAG]);
}

/**
 * A history import brought real training in. Since Phase 1 the import screen calls
 * `prepareImportOverDemo` BEFORE importing (the whole demo goes); this stays for any other
 * caller: over the demo, every demo row goes and the profile keeps its current name only
 * when it is not the demo member's.
 */
export async function adoptImportedData(name?: string): Promise<void> {
  if (await isDemoData()) {
    const row = await getDb().getFirstAsync<{ name: string }>('SELECT name FROM user_profile LIMIT 1');
    const current = row?.name && row.name !== SEED_PROFILE.name ? row.name : null;
    await prepareImportOverDemo(name ?? current ?? 'Member');
    return;
  }
  await clearDemoFlag();
}
