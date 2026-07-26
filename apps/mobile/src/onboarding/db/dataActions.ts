/**
 * The three data lifecycle actions — Phase O2 (W1 real onboarding).
 *
 *   completeOnboarding()  a REAL member starts EMPTY (profile + exercise catalog only)
 *   loadDemoData()        the Arjun demo, on purpose, for a sales pitch
 *   eraseAllData()        wipe back to a fresh install — never regenerates fake data
 *
 * Before O2 the app auto-seeded 13 weeks of invented history on first launch and
 * "Reset" regenerated it. A member handed the app by their real gym must never see
 * someone else's numbers, so the seed now runs ONLY from an explicit demo action.
 *
 * Nothing in `src/db/seed/*` is edited: the demo generator is reused as-is through
 * `forceReseed()`. No frozen file, no `schema.ts` change.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta, setMeta } from '@/db';
import { forceReseed } from '@/db/seed';
import { todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';

import { insertExerciseCatalog } from './catalog';
import type { OnboardingInput } from '../form';

type TxLike = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync'>;

/**
 * Thrown when onboarding is asked to run against a database that already holds
 * someone's training. See completeOnboarding — this is the last line of defence
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
 * `meta` is NOT here — see OWNED_META_KEYS.
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
  'user_profile',
  'exercises',
  'sync_outbox',
] as const;

/**
 * The only `meta` keys an erase removes. Everything else in `meta` belongs to a
 * different subsystem and surviving is the correct behaviour:
 *   cloud_identity / cloud_client_version — the gym link and its monotonic push
 *     version (resetting the counter would make fresh pushes look STALE to the
 *     server, so the owner's dashboard would keep showing pre-erase numbers),
 *   drive_linked / drive_last_backup_at — the member's own Drive backup,
 *   schema_version / tracker_schema_version / member_schema_version — migrations,
 *   restTimerDefaultSec — a preference, not data.
 */
export const OWNED_META_KEYS = ['seeded', 'demo_data', 'activeWorkoutDraft'] as const;

const DEMO_FLAG = 'demo_data';

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

/** True when the CURRENT data is the demo (set by loadDemoData, cleared by erase). */
export async function isDemoData(): Promise<boolean> {
  return (await getMeta(DEMO_FLAG)) === '1';
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
  await getDb().runAsync('UPDATE user_profile SET phone = ?', [phoneE164]);
}

// ---------------------------------------------------------------- writes

async function wipe(tx: TxLike): Promise<void> {
  for (const table of WIPE_TABLES_IN_ORDER) await tx.runAsync(`DELETE FROM ${table}`);
  for (const key of OWNED_META_KEYS) await tx.runAsync('DELETE FROM meta WHERE key = ?', [key]);
}

/**
 * A real member's day one. ONE transaction writes exactly: their profile row, the
 * reference exercise catalog, and (only if they gave one) a first body-weight entry.
 * No session, set, PR, meal, plan or chat row is ever written here — that is the
 * W1 guarantee, and test/onboarding/dataActions.test.ts asserts it.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const today = todayISO();
  const profileId = uuid();
  const bodyWeightRow =
    input.bodyWeightKg !== null ? { id: uuid(), dateISO: today, weightKg: input.bodyWeightKg } : null;

  await getDb().withExclusiveTransactionAsync(async (tx) => {
    // Onboarding is only ever reached when the boot check found no profile, but
    // that check runs outside this transaction and a failed READ must never be
    // able to authorise a wipe. Re-verify against the live rows: if anything real
    // is here, refuse rather than destroy it (the caller recovers by re-booting
    // straight into the app).
    const existing = await tx.getFirstAsync<{ profiles: number; sessions: number }>(
      `SELECT (SELECT COUNT(*) FROM user_profile) AS profiles,
              (SELECT COUNT(*) FROM workout_sessions) AS sessions`,
    );
    if ((existing?.profiles ?? 0) > 0 || (existing?.sessions ?? 0) > 0) {
      throw new ExistingDataError();
    }

    // Defensive: a stray exercise row (an abandoned catalog with no profile) must
    // not collide on UNIQUE(exercises.name).
    await wipe(tx);

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

    await insertExerciseCatalog(tx);

    if (bodyWeightRow) {
      await tx.runAsync('INSERT INTO body_weight (id, date_iso, weight_kg) VALUES (?, ?, ?)', [
        bodyWeightRow.id,
        bodyWeightRow.dateISO,
        bodyWeightRow.weightKg,
      ]);
    }
  });
}

/**
 * Erase everything and go back to a fresh install (the app returns to the welcome
 * screen because no profile row remains). Deliberately does NOT reseed — that was
 * the W1 defect.
 */
export async function eraseAllData(): Promise<void> {
  await getDb().withExclusiveTransactionAsync(wipe);
}

/**
 * Load the Arjun demo — explicit, destructive, and only ever user-initiated.
 * Erase first so the demo can't merge into real data, then reuse the existing
 * generator via forceReseed() (which bypasses the launch-seed memo).
 */
export async function loadDemoData(): Promise<void> {
  await eraseAllData();
  // Flag BEFORE seeding: if the app dies mid-seed, "flagged but empty" is a
  // harmless state, whereas "seeded but unflagged" would present Arjun's 13 weeks
  // as the member's own training with no demo badge — the exact W1 failure.
  await setMeta(DEMO_FLAG, '1');
  await forceReseed();
}

/**
 * Stop calling the data a demo. Used when real data REPLACES it wholesale — a
 * Drive restore or a Hevy import — so the badge and the softened erase wording
 * can't linger over genuine training.
 */
export async function clearDemoFlag(): Promise<void> {
  await getDb().runAsync('DELETE FROM meta WHERE key = ?', [DEMO_FLAG]);
}
