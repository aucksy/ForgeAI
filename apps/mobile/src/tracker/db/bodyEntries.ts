/**
 * Fixing body entries (audit PG-03 / PG-16): edit, re-date or delete a body-weight entry or a
 * measurement, put a deleted one back (Undo), and set a progress photo's date.
 *
 * Additive: the frozen `userRepo` keeps its upsert and reads; Home, Progress and the strength
 * numbers read the same `body_weight` table, so a fix shows everywhere at once. Every write goes
 * through the one app-wide write queue (DS-04) — NEVER call these from inside an
 * `enqueueWrite` job.
 *
 * One entry per day (per measurement): moving an entry onto a day that already has one
 * REPLACES that day's entry — the screen asks first and names the value it replaces.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { todayISO } from '@/lib/date';
import type { BodyWeightEntry } from '@/types/models';

import type { MeasurementEntry } from '../engine/measurements';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A day an entry may be saved on: a real date, never after today. Throws otherwise. */
export function checkEntryDay(dateISO: string, today: string = todayISO()): void {
  if (!ISO_DAY.test(dateISO)) throw new Error(`not a day: ${dateISO}`);
  if (dateISO > today) throw new Error('A day in the future cannot be saved');
}

function checkValue(v: number): void {
  if (!Number.isFinite(v) || v <= 0) throw new Error('value must be above 0');
}

// ---------------------------------------------------------------- body weight

/** Change an entry's value and/or day. Returns the entry it replaced on the new day, if any. */
export async function editBodyWeight(id: string, next: { dateISO: string; weightKg: number }): Promise<{ replaced: BodyWeightEntry | null }> {
  checkEntryDay(next.dateISO);
  checkValue(next.weightKg);
  return enqueueWrite(async () => {
    let replaced: BodyWeightEntry | null = null;
    await getDb().withTransactionAsync(async () => {
      const other = await getDb().getFirstAsync<{ id: string; date_iso: string; weight_kg: number }>(
        'SELECT id, date_iso, weight_kg FROM body_weight WHERE date_iso = ? AND id <> ?',
        [next.dateISO, id],
      );
      if (other) {
        replaced = { id: other.id, dateISO: other.date_iso, weightKg: other.weight_kg };
        await getDb().runAsync('DELETE FROM body_weight WHERE id = ?', [other.id]);
      }
      await getDb().runAsync('UPDATE body_weight SET date_iso = ?, weight_kg = ? WHERE id = ?', [next.dateISO, next.weightKg, id]);
    });
    return { replaced };
  });
}

export async function deleteBodyWeight(id: string): Promise<void> {
  await enqueueWrite(() => getDb().runAsync('DELETE FROM body_weight WHERE id = ?', [id]));
}

/** Undo a delete: the same entry back. A weigh-in logged on that day since then is kept. */
export async function restoreBodyWeight(e: BodyWeightEntry): Promise<void> {
  await enqueueWrite(() =>
    getDb().runAsync('INSERT OR IGNORE INTO body_weight(id, date_iso, weight_kg) VALUES(?, ?, ?)', [e.id, e.dateISO, e.weightKg]),
  );
}

/** One undoable change on the body-weight screen. */
export type BodyWeightUndo =
  | { kind: 'deleted'; entry: BodyWeightEntry }
  /** An edit that REPLACED another day's entry: `before` = the edited entry as it was. */
  | { kind: 'edited'; before: BodyWeightEntry; replaced: BodyWeightEntry | null };

/**
 * Undo (review fix, Phase 5): every change in the list, newest first, in ONE queued write. An
 * edit goes back to its old day and value (unless a weigh-in was logged on that day since —
 * then it stays), and the entry it replaced comes back; a deleted entry comes back.
 */
export async function undoBodyWeight(items: readonly BodyWeightUndo[]): Promise<void> {
  if (items.length === 0) return;
  await enqueueWrite(() =>
    getDb().withTransactionAsync(async () => {
      const db = getDb();
      for (const u of [...items].reverse()) {
        if (u.kind === 'edited') {
          const taken = await db.getFirstAsync<{ id: string }>('SELECT id FROM body_weight WHERE date_iso = ? AND id <> ?', [u.before.dateISO, u.before.id]);
          if (!taken) await db.runAsync('UPDATE body_weight SET date_iso = ?, weight_kg = ? WHERE id = ?', [u.before.dateISO, u.before.weightKg, u.before.id]);
        }
        const back = u.kind === 'edited' ? u.replaced : u.entry;
        if (back) await db.runAsync('INSERT OR IGNORE INTO body_weight(id, date_iso, weight_kg) VALUES(?, ?, ?)', [back.id, back.dateISO, back.weightKg]);
      }
    }),
  );
}

// ---------------------------------------------------------------- measurements

/** Change a measurement's value and/or day (same kind). Returns the one it replaced, if any. */
export async function editMeasurement(id: string, next: { dateISO: string; value: number }): Promise<{ replaced: MeasurementEntry | null }> {
  checkEntryDay(next.dateISO);
  checkValue(next.value);
  return enqueueWrite(async () => {
    let replaced: MeasurementEntry | null = null;
    await getDb().withTransactionAsync(async () => {
      const me = await getDb().getFirstAsync<{ kind: string }>('SELECT kind FROM body_measurements WHERE id = ?', [id]);
      if (!me) return;
      const other = await getDb().getFirstAsync<{ id: string; date_iso: string; kind: string; value: number }>(
        'SELECT id, date_iso, kind, value FROM body_measurements WHERE date_iso = ? AND kind = ? AND id <> ?',
        [next.dateISO, me.kind, id],
      );
      if (other) {
        replaced = { id: other.id, dateISO: other.date_iso, kind: other.kind as MeasurementEntry['kind'], value: other.value };
        await getDb().runAsync('DELETE FROM body_measurements WHERE id = ?', [other.id]);
      }
      await getDb().runAsync('UPDATE body_measurements SET date_iso = ?, value = ? WHERE id = ?', [next.dateISO, next.value, id]);
    });
    return { replaced };
  });
}

/** Undo a delete: the same measurement back (one logged on that day since then is kept). */
export async function restoreMeasurement(e: MeasurementEntry): Promise<void> {
  await enqueueWrite(() =>
    getDb().runAsync('INSERT OR IGNORE INTO body_measurements(id, date_iso, kind, value) VALUES(?, ?, ?, ?)', [e.id, e.dateISO, e.kind, e.value]),
  );
}

/** One undoable change on the measurements screen. */
export type MeasurementUndo =
  | { kind: 'deleted'; entry: MeasurementEntry }
  | { kind: 'edited'; before: MeasurementEntry; replaced: MeasurementEntry | null };

/** Undo every change in the list, newest first, in one queued write (as `undoBodyWeight`). */
export async function undoMeasurements(items: readonly MeasurementUndo[]): Promise<void> {
  if (items.length === 0) return;
  await enqueueWrite(() =>
    getDb().withTransactionAsync(async () => {
      const db = getDb();
      for (const u of [...items].reverse()) {
        if (u.kind === 'edited') {
          const taken = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM body_measurements WHERE date_iso = ? AND kind = ? AND id <> ?',
            [u.before.dateISO, u.before.kind, u.before.id],
          );
          if (!taken) await db.runAsync('UPDATE body_measurements SET date_iso = ?, value = ? WHERE id = ?', [u.before.dateISO, u.before.value, u.before.id]);
        }
        const back = u.kind === 'edited' ? u.replaced : u.entry;
        if (back) {
          await db.runAsync('INSERT OR IGNORE INTO body_measurements(id, date_iso, kind, value) VALUES(?, ?, ?, ?)', [back.id, back.dateISO, back.kind, back.value]);
        }
      }
    }),
  );
}

// ---------------------------------------------------------------- photos

/** A progress photo's day (PG-16: a picture with no date of its own, or a wrong one). */
export async function setPhotoDate(id: string, dateISO: string): Promise<void> {
  checkEntryDay(dateISO);
  await enqueueWrite(() => getDb().runAsync('UPDATE progress_photos SET date_iso = ? WHERE id = ?', [dateISO, id]));
}
