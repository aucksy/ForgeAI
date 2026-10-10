/**
 * Audit Phase 4 (IM-02, IM-03) — a one-time repair for folders copied from a Hevy link before
 * the reader could see set types (the owner's "Jaipur" folder among them).
 *
 * Those copies counted warm-ups as working sets (Push 1's incline bench: "5 sets" for 2 warm-ups
 * + 3 working) and kept Hevy's page order. On the next start, once:
 *  - a routine row still as it was copied (no set types, rest or note of its own) whose set count
 *    equals the sets of the member's last workout of that routine for that exercise takes that
 *    workout's warm-ups and drop sets ("2 warm-up · 3 sets"); any other row is left alone;
 *  - a routine the member changed since (set types, its own rest, a note on any row) is not
 *    touched at all;
 *  - the folder's routines are put in the member's real rotation, when their history says it
 *    (Push 1 → Pull 1 → Push 2 → Pull 2) — review fix: ONLY while the folder is still exactly as
 *    copied: in Hevy's page order as remembered at the copy (`settings.pageOrder`), with every
 *    routine's exercises as copied (their remembered fingerprints, in order). A folder whose page
 *    order was never remembered, or that the member arranged or changed (a followed plan they
 *    put in their own order), keeps its order.
 * Marked done in `meta`; a failure changes nothing and tries again next launch.
 */
import { getDb, getMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { listFolders } from '../db/folderRepo';
import { planSetsJson, workingCount, type PlanSet } from '../plans/routineSets';
import { editedByMember, lastSetTypes, readMarks, reorderedByMember, routineHistory, rowPrint, rowsOfDay, ROUTINE_MARKS_KEY } from './routineMerge';
import { rotationOrder } from './routineRebuild';

export const LINK_REPAIR_KEY = 'link_folder_repair_v1';

interface RowChange {
  id: string;
  setsJson: string;
  targetSets: number;
}

const key = (n: string): string => n.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * May the repair put this folder in the history's order? Only when Hevy's page order was
 * remembered at the copy, the folder is still in exactly that order, and no routine in it was
 * changed since (each routine's remembered copy matches, in order). PURE.
 */
export function mayReorder(
  routines: readonly { name: string; rows: readonly Parameters<typeof editedByMember>[0][]; marks: readonly string[] | undefined }[],
  pageOrder: readonly string[] | undefined,
): boolean {
  if (!pageOrder || pageOrder.length !== routines.length) return false;
  if (routines.some((r, i) => key(r.name) !== key(pageOrder[i]))) return false;
  return routines.every((r) => r.marks != null && !reorderedByMember(r.rows, r.marks) && !r.rows.some((row) => editedByMember(row, r.marks)) && r.rows.length === r.marks.length);
}

export async function repairLinkFolders(): Promise<{ rows: number; reordered: number }> {
  const none = { rows: 0, reordered: 0 };
  if ((await getMeta(LINK_REPAIR_KEY).catch(() => null)) === '1') return none;
  const folders = (await listFolders()).filter((f) => f.settings.fromLink);
  const history = folders.length > 0 ? await routineHistory() : [];
  const stored = folders.length > 0 ? readMarks(await getMeta(ROUTINE_MARKS_KEY).catch(() => null)) : {};

  const rowChanges: RowChange[] = [];
  const orderChanges: { dayId: string; order: number }[] = [];
  const marks = new Map<string, string[]>();
  for (const f of folders) {
    const order = rotationOrder(
      f.routines.map((r) => r.name),
      history,
    );
    const asCopied = mayReorder(
      await Promise.all(f.routines.map(async (r) => ({ name: r.name, rows: await rowsOfDay(r.id), marks: stored[r.id] }))),
      f.settings.pageOrder,
    );
    if (order && asCopied) {
      const now = f.routines.map((r) => r.name);
      if (order.join('\u0000') !== now.join('\u0000')) {
        order.forEach((name, i) => {
          const day = f.routines.find((r) => r.name === name);
          if (day) orderChanges.push({ dayId: day.id, order: i });
        });
      }
    }
    for (const r of f.routines) {
      // Changed by the member since it was copied: left exactly as it is.
      if (r.exercises.some((pe) => pe.sets != null || pe.restSec != null || pe.note != null)) continue;
      const types = await lastSetTypes(r.name, r.exercises.map((pe) => pe.exerciseId));
      const prints: string[] = [];
      for (const pe of r.exercises) {
        const t = types.get(pe.exerciseId);
        let setsJson: string | null = null;
        let targetSets = pe.targetSets;
        if (t && t.length === pe.targetSets && t.some((x) => x === 'warmup' || x === 'drop')) {
          const list: PlanSet[] = t.map((type) => ({ type }));
          setsJson = planSetsJson(list);
          targetSets = Math.max(1, workingCount(list));
          if (setsJson) rowChanges.push({ id: pe.id, setsJson, targetSets });
        }
        prints.push(
          rowPrint({
            exerciseId: pe.exerciseId,
            targetSets,
            repMin: pe.repRangeMin,
            repMax: pe.repRangeMax,
            setsJson,
            restSec: null,
            supersetGroup: pe.supersetGroup ?? null,
            note: null,
          }),
        );
      }
      marks.set(r.id, prints);
    }
  }

  await enqueueWrite(async () => {
    const db = getDb();
    if ((await getMeta(LINK_REPAIR_KEY).catch(() => null)) === '1') return;
    await db.withTransactionAsync(async () => {
      for (const c of rowChanges) {
        // Only a row still without its own set list (nothing changed it since it was read).
        await db.runAsync('UPDATE plan_exercises SET sets_json = ?, target_sets = ? WHERE id = ? AND sets_json IS NULL', [c.setsJson, c.targetSets, c.id]);
      }
      for (const o of orderChanges) await db.runAsync('UPDATE plan_days SET day_order = ? WHERE id = ?', [o.order, o.dayId]);
      if (marks.size > 0) {
        const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [ROUTINE_MARKS_KEY]);
        let all: Record<string, string[]> = {};
        try {
          all = row?.value ? (JSON.parse(row.value) as Record<string, string[]>) : {};
        } catch {
          all = {};
        }
        for (const [dayId, prints] of marks) if (!all[dayId]) all[dayId] = prints;
        await db.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [ROUTINE_MARKS_KEY, JSON.stringify(all)]);
      }
      await db.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [LINK_REPAIR_KEY, '1']);
    });
  });
  return { rows: rowChanges.length, reordered: orderChanges.length > 0 ? 1 : 0 };
}
