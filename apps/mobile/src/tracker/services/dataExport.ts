/**
 * Offline data export — reads the frozen workout repos and writes a clean,
 * human-readable Excel (.xlsx) workbook (one row per set), then hands it to the
 * OS share sheet. No network; SheetJS + expo-file-system + expo-sharing only.
 *
 * Phase 2: each row says how the exercise is logged, carries time and distance, shows
 * assisted help as a positive "Help (kg)", and its volume follows the one volume rule
 * (body weight on pull-ups and dips, both dumbbells…) — the same number the app shows.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { getDb } from '@/db';
import { getRecentSessionDetails } from '@/db/repos/workoutRepo';
import { todayISO } from '@/lib/date';

import { MUSCLE_LABEL } from '../catalog/muscles';
import { LOG_TYPE_LABEL, typedWeight } from '../engine/logTypes';
import { bodyweightOn, setVolumeKg } from '../engine/volume';
import { getVolumeContext } from './volumeService';

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
  'Logged As',
  'Set',
  'Set Type',
  'Weight (kg)',
  'Help (kg)',
  'Reps',
  'Time (s)',
  'Distance (km)',
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
  const ctx = await getVolumeContext(ordered.flatMap((s) => s.exercises.map((g) => g.exercise.id)));
  const extras = await getDb().getAllAsync<{ id: string; duration_sec: number | null; distance_m: number | null }>(
    'SELECT id, duration_sec, distance_m FROM set_entries WHERE duration_sec IS NOT NULL OR distance_m IS NOT NULL',
  );
  const extraById = new Map(extras.map((e) => [e.id, e]));

  const rows: Record<string, string | number>[] = [];
  for (const s of ordered) {
    const body = bodyweightOn(ctx.bw, s.dateISO);
    let firstRow = true;
    for (const ex of s.exercises) {
      const info = ctx.exercises.get(ex.exercise.id);
      const lt = info?.logType ?? 'weight_reps';
      for (const set of ex.sets) {
        const extra = extraById.get(set.id);
        rows.push({
          Date: s.dateISO,
          Start: localStamp(s.startedAt),
          End: localStamp(s.endedAt),
          'Day Type': cap(s.dayType),
          Notes: firstRow ? (s.notes ?? '') : '',
          Exercise: ex.exercise.name,
          Muscle: info ? MUSCLE_LABEL[info.muscles.primary[0]] ?? cap(ex.exercise.muscleGroup) : cap(ex.exercise.muscleGroup),
          Equipment: cap(ex.exercise.equipment),
          'Logged As': LOG_TYPE_LABEL[lt],
          Set: set.setNumber,
          'Set Type': set.isWarmup ? 'Warm-up' : 'Working',
          'Weight (kg)': lt === 'assisted' ? '' : set.weightKg,
          'Help (kg)': lt === 'assisted' ? typedWeight(lt, set.weightKg) : '',
          Reps: set.reps,
          'Time (s)': extra?.duration_sec ?? '',
          'Distance (km)': extra?.distance_m != null ? Math.round(extra.distance_m) / 1000 : '',
          'Volume (kg)': Math.round(
            setVolumeKg(
              { ...set, loadMode: ctx.setModes?.get(set.id) ?? null },
              info ?? { logType: 'weight_reps', loadMode: 'one', bwShare: 0 },
              body,
            ),
          ),
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
  ws['!cols'] = [11, 17, 17, 10, 24, 26, 15, 12, 18, 5, 9, 11, 9, 6, 8, 12, 11].map((wch) => ({ wch }));
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
