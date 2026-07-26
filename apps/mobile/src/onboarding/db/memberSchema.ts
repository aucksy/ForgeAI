/**
 * Additive member schema — Phase O2 (W1 real onboarding).
 *
 * The base schema (`src/db/schema.ts`) is FROZEN, so the member's mobile number —
 * captured at onboarding and the identity the gym will eventually verify against
 * its roster — is added here purely ADDITIVELY, exactly like `initTrackerSchema()`:
 * an idempotent, PRAGMA-guarded ALTER run once from `app/_layout.tsx` after
 * `initDb()`. `schema.ts` and every frozen repo signature stay untouched.
 *
 * Safe against the frozen layer for the same reasons as the tracker columns:
 *  - `phone` is nullable with no default → existing rows (incl. the demo seed's,
 *    which INSERTs an explicit column list) simply get NULL.
 *  - The frozen `userRepo` maps named fields off a `SELECT *`, so an extra column
 *    is silently ignored.
 */
import { getDb, getMeta, setMeta } from '@/db';

export const MEMBER_SCHEMA_VERSION = 1;
const META_KEY = 'member_schema_version';

/** SQLite has no `ADD COLUMN IF NOT EXISTS` — introspect so re-runs are idempotent. */
async function ensureColumn(table: string, column: string, decl: string): Promise<void> {
  const cols = await getDb().getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await getDb().runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/**
 * Bring the DB up to MEMBER_SCHEMA_VERSION. Idempotent: fast-paths on the stored
 * version, and each ensureColumn is a no-op when the column exists, so a kill
 * mid-migration self-heals (the flag is stamped only once every column is there).
 */
export async function initMemberSchema(): Promise<void> {
  const stored = Number((await getMeta(META_KEY)) ?? '0');
  if (stored >= MEMBER_SCHEMA_VERSION) return;

  // v1 (Phase O2): the member's mobile number in E.164 (e.g. '+919876543210').
  await ensureColumn('user_profile', 'phone', 'TEXT');

  await setMeta(META_KEY, String(MEMBER_SCHEMA_VERSION));
}
