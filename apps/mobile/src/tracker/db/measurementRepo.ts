/**
 * Body measurements (Phase 3, tracker schema v6). One value per measurement per day: saving
 * the same day again replaces it, like the body-weight log.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';

import { isMeasureKind, MEASURES, type MeasureKind, type MeasurementEntry } from '../engine/measurements';

interface Row {
  id: string;
  date_iso: string;
  kind: string;
  value: number;
}

/** Save the given measurements for a day in one go. Returns how many were saved. */
export async function logMeasurements(dateISO: string, values: Partial<Record<MeasureKind, number>>): Promise<number> {
  const kinds = MEASURES.filter((k) => values[k] != null);
  if (kinds.length === 0) return 0;
  // The one app-wide write queue (DS-04): never nest inside another module's transaction.
  await enqueueWrite(() =>
    getDb().withTransactionAsync(async () => {
      for (const kind of kinds) {
        await getDb().runAsync(
          `INSERT INTO body_measurements(id, date_iso, kind, value) VALUES(?, ?, ?, ?)
           ON CONFLICT(date_iso, kind) DO UPDATE SET value = excluded.value`,
          [uuid(), dateISO, kind, values[kind] as number],
        );
      }
    }),
  );
  return kinds.length;
}

/** Every entry, oldest first. */
export async function getMeasurements(): Promise<MeasurementEntry[]> {
  const rows = await getDb().getAllAsync<Row>('SELECT id, date_iso, kind, value FROM body_measurements ORDER BY date_iso ASC, kind ASC');
  return rows
    .filter((r) => isMeasureKind(r.kind))
    .map((r) => ({ id: r.id, dateISO: r.date_iso, kind: r.kind as MeasureKind, value: r.value }));
}

export async function deleteMeasurement(id: string): Promise<void> {
  await enqueueWrite(() => getDb().runAsync('DELETE FROM body_measurements WHERE id = ?', [id]));
}
