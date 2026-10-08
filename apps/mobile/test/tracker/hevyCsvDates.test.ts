/**
 * v0.28.0 — a Hevy .csv export (text) was read with no workouts: SheetJS turned "5 Oct 2026,
 * 11:10" into a spreadsheet date number the date reader did not take. Found 8 Oct 2026 on the
 * owner's own export (509 workouts → 0).
 */
import { describe, expect, it } from 'vitest';

import { parseHevyBase64, parseHevyDate } from '@/tracker/services/hevyImport';

const CSV = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Push 1","5 Oct 2026, 11:10","5 Oct 2026, 12:31","","Incline Bench Press (Dumbbell)",,"",0,"warmup",20,15,,,6',
  '"Push 1","5 Oct 2026, 11:10","5 Oct 2026, 12:31","","Incline Bench Press (Dumbbell)",,"",1,"normal",32.5,10,,,8',
  '"Pull 1","29 Sep 2026, 7:05","29 Sep 2026, 8:00","","Chin Up",,"",0,"normal",,13,,,',
].join('\n');
const b64 = Buffer.from(CSV, 'utf8').toString('base64');

describe('a Hevy .csv export', () => {
  it('reads every workout, at its clock time', () => {
    const p = parseHevyBase64(b64);
    expect(p.workouts.map((w) => [w.title, w.dateISO])).toEqual([
      ['Pull 1', '2026-09-29'],
      ['Push 1', '2026-10-05'],
    ]);
    expect(p.workouts[1].startedAt).toBe(Date.UTC(2026, 9, 5, 11, 10));
    expect(p.workouts[1].endedAt).toBe(Date.UTC(2026, 9, 5, 12, 31));
    expect(p.workouts[1].exercises[0].sets.map((s) => [s.isWarmup, s.weightKg, s.reps])).toEqual([
      [true, 20, 15],
      [false, 32.5, 10],
    ]);
  });

  it('a spreadsheet date number reads as the same clock time', () => {
    // 5 Oct 2026 11:10 = day 46300 + 11h10m
    expect(parseHevyDate(46300 + (11 * 60 + 10) / 1440)).toBe(Date.UTC(2026, 9, 5, 11, 10));
    expect(parseHevyDate('5 Oct 2026, 11:10')).toBe(Date.UTC(2026, 9, 5, 11, 10));
  });
});
