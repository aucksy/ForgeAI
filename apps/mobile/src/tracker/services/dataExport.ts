/**
 * Offline data export — reads the frozen workout repos and writes a clean,
 * human-readable Excel (.xlsx) workbook (one row per set), then hands it to the
 * OS share sheet. No network; SheetJS + expo-file-system + expo-sharing only.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { todayISO } from '@/lib/date';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** Local "YYYY-MM-DD HH:MM" for a workout timestamp (blank if missing). */
function localStamp(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HEADER = [
  'Date',
  'Start',
  'End',
  'Day Type',
  'Notes',
  'Exercise',
  'Muscle',
  'Equipment',
  'Set',
  'Set Type',
  'Weight (kg)',
  'Reps',
  'Volume (kg)',
] as const;

export interface ExportResult {
  shared: boolean;
  rowCount: number;
  sessionCount: number;
  uri: string;
}

/** Build a per-set .xlsx of the whole workout history and open the share sheet. */
export async function exportWorkoutsXlsx(): Promise<ExportResult> {
  const sessions = await getRecentSessionDetails(1_000_000); // newest-first, full detail
  const ordered = [...sessions].reverse(); // chronological, natural to read

  const rows: Record<string, string | number>[] = [];
  for (const s of ordered) {
    let firstRow = true;
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        rows.push({
          Date: s.dateISO,
          Start: localStamp(s.startedAt),
          End: localStamp(s.endedAt),
          'Day Type': cap(s.dayType),
          Notes: firstRow ? (s.notes ?? '') : '',
          Exercise: ex.exercise.name,
          Muscle: cap(ex.exercise.muscleGroup),
          Equipment: cap(ex.exercise.equipment),
          Set: set.setNumber,
          'Set Type': set.isWarmup ? 'Warm-up' : 'Working',
          'Weight (kg)': set.weightKg,
          Reps: set.reps,
          'Volume (kg)': Math.round(set.weightKg * set.reps),
        });
        firstRow = false;
      }
    }
  }

  // Nothing logged yet — don't write/share an empty header-only file (the caller
  // shows a "nothing to export" notice instead of a share sheet over a blank file).
  if (rows.length === 0) {
    return { shared: false, rowCount: 0, sessionCount: ordered.length, uri: '' };
  }

  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADER] });
  ws['!cols'] = [11, 17, 17, 10, 24, 26, 13, 12, 5, 9, 11, 6, 11].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Workouts');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  const uri = `${dir}forgeai-workouts-${todayISO()}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
      dialogTitle: 'Export ForgeAI workouts',
    });
    shared = true;
  }
  return { shared, rowCount: rows.length, sessionCount: ordered.length, uri };
}
