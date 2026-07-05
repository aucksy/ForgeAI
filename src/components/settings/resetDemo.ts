import { getDb, getMeta } from '@/db';
import { forceReseed } from '@/db/seed';

/**
 * Danger-zone reset: wipe every table (children before parents so foreign
 * keys never trip), then regenerate the demo in-session via forceReseed()
 * (which bypasses the launch-seed memo). We still verify the `seeded` meta flag
 * and report the result so the caller can fall back to a "restart the app"
 * notice if the reseed genuinely failed (per the CONTRACTS "restart notice" spec).
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
    await forceReseed();
  } catch {
    // fall through — the flag check below reports the truth either way
  }

  const reseeded = (await getMeta('seeded')) === '1';
  return { reseeded };
}
