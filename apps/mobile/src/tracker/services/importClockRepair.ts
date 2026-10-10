/**
 * Audit IM-07 — a one-time repair: imported workouts' times become the real moment.
 *
 * Until Phase 4 an imported Hevy / Strong time ("7 Jul 2026, 21:00") was stored as that clock
 * time written as UTC, so in India the export said 02:30 the next morning and every reader had to
 * guess which workouts to correct (a whole second whose UTC day is the workout's day). Imports
 * now store the real moment (`importDates.localMoment`); this moves the ones stored before, once:
 *  - only workouts the import wrote. Review fix — no stored mark tells an old import from a
 *    workout logged here (both are source 'manual'; imports kept no key before Phase 4), so the
 *    most reliable signal there is, ALL of:
 *      · source 'manual';
 *      · the start on a whole second (ForgeAI's own starts never are — `liveStart`);
 *      · the END on a whole second too, or none (an export's end is a clock time; ForgeAI ends a
 *        workout at "now", and the one edit that can put a start on a whole second — sliding it
 *        back to the start of its day, `sessionTiming` — ends it at "now" as well);
 *      · the start's UTC day is the workout's day (how the old import wrote it);
 *  - start and end move together (the workout's length is kept);
 *  - the first start remembered for a moved workout (`importKeys`) moves the same way.
 * Marked done in `meta` (it is also carried in a backup, so restoring an older backup repairs
 * that one again on the next start). A failure changes nothing and tries again next launch.
 */
import { getDb, getMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export const CLOCK_REPAIR_KEY = 'import_clock_real_v1';
const ORIGINALS_KEY = 'importOriginalStarts';

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A start stored the old way (clock time written as UTC) → the real moment on this phone; any
 * other start unchanged. PURE but for the phone's zone.
 */
export function realFromStored(startedAt: number, dateISO: string, endedAt?: number | null): number {
  if (startedAt % 1000 !== 0) return startedAt;
  // Review fix: ForgeAI's own workouts end at a real "now" (never a whole second).
  if (endedAt != null && endedAt % 1000 !== 0) return startedAt;
  const d = new Date(startedAt);
  const utcDay = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (utcDay !== dateISO) return startedAt;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

/** Run once (queued). Returns how many workouts moved; 0 when done before. */
export async function repairImportedClockTimes(): Promise<number> {
  if ((await getMeta(CLOCK_REPAIR_KEY).catch(() => null)) === '1') return 0;
  return enqueueWrite(async () => {
    const db = getDb();
    if ((await getMeta(CLOCK_REPAIR_KEY).catch(() => null)) === '1') return 0;
    let moved = 0;
    await db.withTransactionAsync(async () => {
      const rows = await db.getAllAsync<{ id: string; date_iso: string; started_at: number; ended_at: number | null }>(
        "SELECT id, date_iso, started_at, ended_at FROM workout_sessions WHERE source = 'manual' AND started_at % 1000 = 0 AND (ended_at IS NULL OR ended_at % 1000 = 0)",
      );
      for (const r of rows) {
        const real = realFromStored(r.started_at, r.date_iso, r.ended_at);
        const shift = real - r.started_at;
        if (shift === 0) continue;
        await db.runAsync('UPDATE workout_sessions SET started_at = ?, ended_at = ? WHERE id = ?', [
          real,
          r.ended_at == null ? null : r.ended_at + shift,
          r.id,
        ]);
        moved += 1;
      }
      // The first starts remembered for moved workouts (the importer's extra keys) move too.
      const raw = await getMeta(ORIGINALS_KEY).catch(() => null);
      if (raw) {
        try {
          const all = JSON.parse(raw) as Record<string, { startedAt?: unknown; dateISO?: unknown }>;
          let changed = false;
          for (const v of Object.values(all)) {
            if (typeof v?.startedAt === 'number' && typeof v.dateISO === 'string') {
              const real = realFromStored(v.startedAt, v.dateISO);
              if (real !== v.startedAt) [v.startedAt, changed] = [real, true];
            }
          }
          if (changed) await db.runAsync('UPDATE meta SET value = ? WHERE key = ?', [JSON.stringify(all), ORIGINALS_KEY]);
        } catch {
          // unreadable: the importer ignores it anyway
        }
      }
      await db.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [CLOCK_REPAIR_KEY, '1']);
    });
    return moved;
  });
}
