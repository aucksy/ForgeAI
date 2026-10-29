/**
 * F121: make the gym's workout report ON THE PHONE - the same spreadsheet as Settings -> Save as a
 * spreadsheet (`writeHistoryCsv`), holding only the workouts on or after `fromDay`, the member's join
 * date at the gym that asked (the server's own date, 0045). Nothing is written to a file and nothing
 * is shared: the text goes only to that gym, by `apiAttachReport`. Reads only.
 */
import { hevyCsvEncoder, writeHistoryCsv } from '@/tracker/services/historyExport';
import type { UnitSystem } from '@/types/models';

export interface GymReportFile {
  csv: string;
  workouts: number;
  sets: number;
}

/** The report text: the header alone (plus a line end) when nothing was logged since `fromDay`. */
export async function makeGymReport(units: UnitSystem, fromDay: string): Promise<GymReportFile> {
  const parts: string[] = [];
  const counts = await writeHistoryCsv(
    units,
    async (chunk) => {
      parts.push(chunk);
    },
    { fromDay },
  );
  const csv = parts.length > 0 ? parts.join('') : `${hevyCsvEncoder(units).header}\n`;
  return { csv, workouts: counts.workouts, sets: counts.sets };
}
