import { getDb, getMeta } from '@/db';
import { ensureSeeded } from '@/db/seed';

/**
 * Danger-zone reset: wipe every table (children before parents so foreign
 * keys never trip), then ask the seeder to regenerate the demo.
 *
 * Foundation note: `ensureSeeded()` memoises its in-flight promise at module
 * scope, so when the launch seed already succeeded this call resolves without
 * re-seeding. We therefore verify the `seeded` meta flag afterwards and report
 * whether the data really regenerated — the caller shows a "restart the app"
 * notice when it did not (per the CONTRACTS "restart notice" spec).
 */
const TABLES_IN_DELETE_ORDER = [
  'set_entries',
  'personal_records',
  'workout_sessions',
  'plan_exercises',
  'plan_days',
  'workout_plans',
  'meals',
  'chat_messages',
  'body_weight',
  'user_profile',
  'exercises',
  'meta', // includes the seeded flag
] as const;

export async function resetDemoData(): Promise<{ reseeded: boolean }> {
  const db = getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await tx.runAsync(`DELETE FROM ${table}`);
    }
  });

  try {
    await ensureSeeded();
  } catch {
    // fall through — the flag check below reports the truth either way
  }

  const reseeded = (await getMeta('seeded')) === '1';
  return { reseeded };
}
