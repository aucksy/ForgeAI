/**
 * v0.28.1 — the end-to-end audit after the tracker plan was built (9 Oct 2026). One test per
 * fix, each written from the case the audit found.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { base64Utf8, parseHevyBase64, parseHevyDate, sanitizeTitle } from '@/tracker/services/hevyImport';
import { num } from '@/tracker/services/strongImport';

const HEAD = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const csv = (...rows: string[]): string => Buffer.from([HEAD, ...rows].join('\n'), 'utf8').toString('base64');

describe('a Hevy .csv is read as UTF-8 (it has no marker at its start)', () => {
  it('names with accents stay as written; before: "bÃºlgara", a new exercise', () => {
    const p = parseHevyBase64(
      csv(
        '"Día de pierna","5 Oct 2026, 7:00","5 Oct 2026, 8:00","","Sentadilla búlgara",,"Muy bien 💪",0,"normal",20,10,,,',
        '"Día de pierna","5 Oct 2026, 7:00","5 Oct 2026, 8:00","","Sentadilla búlgara",,"",1,"normal",20,10,,,',
      ),
    );
    expect(p.distinctExerciseTitles).toEqual(['Sentadilla búlgara']);
    expect(p.workouts[0].title).toBe('Día de pierna');
    expect(p.workouts[0].exercises[0].note).toBe('Muy bien 💪');
  });

  it("a title in another alphabet stays; Hevy's emoji goes", () => {
    expect(sanitizeTitle('पैर का दिन')).toBe('पैर का दिन');
    expect(sanitizeTitle('Тренировка ног')).toBe('Тренировка ног');
    expect(sanitizeTitle('Morning workout ☀️')).toBe('Morning workout');
    expect(sanitizeTitle('Afternoon workout 💪')).toBe('Afternoon workout');
  });

  it('the decoder matches Node for every kind of character, with or without the marker', () => {
    const text = 'Bench ☀️ büt Ж पैर 💪🏽 end';
    expect(base64Utf8(Buffer.from(text, 'utf8').toString('base64'))).toBe(text);
    expect(base64Utf8(Buffer.from('﻿' + text, 'utf8').toString('base64'))).toBe(text);
  });

  it('a file that is not UTF-8 text goes to the spreadsheet reader as before', () => {
    // Windows-1252 "é" is one byte that UTF-8 cannot have alone.
    expect(base64Utf8(Buffer.from([0x42, 0xe9, 0x42]).toString('base64'))).toBeNull();
    const row = (ex: string): string => `"Push","5 Oct 2026, 7:00","5 Oct 2026, 8:00","","${ex}",,"",0,"normal",20,10,,,`;
    const latin = Buffer.from([HEAD, row('Press café')].join('\n'), 'latin1').toString('base64');
    expect(parseHevyBase64(latin).distinctExerciseTitles).toEqual(['Press café']);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([HEAD, row('Bench')].join('\n'), 'utf16le')]).toString('base64');
    expect(parseHevyBase64(utf16).workouts).toHaveLength(1);
  });

  it('a joiner inside a Persian word stays; an emoji family goes whole', () => {
    const word = 'می‌خواهم'; // with a zero-width non-joiner
    expect(sanitizeTitle(word)).toBe(word);
    expect(sanitizeTitle('Family 👨‍👩‍👧 day')).toBe('Family day');
  });

  it("the phone test's file still reads the same", () => {
    expect(parseHevyBase64(readFileSync('qa/fixtures/qa-hevy.csv').toString('base64')).workouts).toHaveLength(12);
  });
});

describe('the same exercise twice in one Hevy workout', () => {
  it('the second block follows the first; before: 100×5, 60×12, 100×5, 40×15', () => {
    const r = (ex: string, i: number, kg: number, reps: number, type = 'normal'): string =>
      `"Push","5 Oct 2026, 7:00","5 Oct 2026, 8:00","","${ex}",,"",${i},"${type}",${kg},${reps},,,`;
    const p = parseHevyBase64(csv(r('Bench', 0, 100, 5), r('Bench', 1, 100, 5), r('Fly', 0, 20, 12), r('Bench', 0, 60, 12, 'dropset'), r('Bench', 1, 40, 15, 'dropset')));
    const bench = p.workouts[0].exercises.find((e) => e.title === 'Bench')!;
    expect(bench.sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [100, 5],
      [100, 5],
      [60, 12],
      [40, 15],
    ]);
  });
});

describe('Hevy dates in other languages', () => {
  it('German, French, Spanish, Italian, Portuguese and Dutch months read; before: skipped rows', () => {
    const oct5 = Date.UTC(2026, 9, 5, 7, 30);
    for (const s of ['5 Okt 2026, 7:30', '5 oct. 2026, 7:30', '5 Oct 2026, 7:30', '5 ott 2026, 7:30', '5 out 2026, 7:30', '5. Okt. 2026, 7:30'])
      expect(parseHevyDate(s)).toBe(oct5);
    expect(parseHevyDate('7 Mär 2026, 7:30')).toBe(Date.UTC(2026, 2, 7, 7, 30));
    expect(parseHevyDate('7 juin 2026, 7:30')).toBe(Date.UTC(2026, 5, 7, 7, 30));
    expect(parseHevyDate('7 juil. 2026, 7:30')).toBe(Date.UTC(2026, 6, 7, 7, 30));
    expect(parseHevyDate('7 déc. 2026, 7:30')).toBe(Date.UTC(2026, 11, 7, 7, 30));
    expect(parseHevyDate('7 Dez 2026, 7:30')).toBe(Date.UTC(2026, 11, 7, 7, 30));
    expect(parseHevyDate('7 Xyz 2026, 7:30')).toBeNull();
  });
});

describe('Strong numbers with a comma', () => {
  it('"72,5" in a comma-separated file is 72.5 kg; before: 0 kg', () => {
    expect(num('72,5', false)).toBe(72.5);
    expect(num('72,5', true)).toBe(72.5);
    expect(num('1.072,5', true)).toBe(1072.5);
    expect(num('1,072.5', false)).toBe(1072.5);
    expect(num('1,072', false)).toBe(1072);
    expect(num('60', false)).toBe(60);
    expect(num('', false)).toBeNull();
  });

  it('one "72,5" in a comma-separated file makes "1,234" km read as 1.234', async () => {
    const { parseStrongText } = await import('@/tracker/services/strongImport');
    const text = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2026-10-05 07:00:00,Push,1h,Bench Press (Barbell),1,"72,5",8,0,0,,,',
      '2026-10-05 07:00:00,Push,1h,Running,1,0,0,"1,234",600,,,',
    ].join('\n');
    const p = parseStrongText(text, 'metric');
    const sets = p.workouts[0].exercises.flatMap((e) => e.sets);
    expect(sets.map((s) => s.weightKg)).toContain(72.5);
    expect(sets.find((s) => s.distanceM != null)?.distanceM).toBe(1234);
  });
});

describe('Health Connect tells a live workout from an imported one', () => {
  it('a live start is never a whole second (an imported one always is)', async () => {
    const { liveStart } = await import('@/tracker/store/activeWorkoutStore');
    expect(liveStart(1_760_000_000_000) % 1000).not.toBe(0);
    expect(liveStart(1_760_000_000_123)).toBe(1_760_000_000_123);
  });
});

describe("Today's page after today's routine is done", () => {
  it('says so instead of only offering Start', async () => {
    const { doneToday } = await import('@/tracker/lib/todayLink');
    expect(doneToday({ headline: 'Push 1 is in the books — chest got their work today. Now go eat.' })).toBe(true);
    expect(doneToday({ headline: "Push 1 today — chest on the menu. Let's move some iron." })).toBe(false);
    expect(doneToday(null)).toBe(false);
  });
});

describe('every table the tracker adds is backed up (or left out on purpose)', () => {
  it('each own rest length is in the backup; before: lost on a restore', () => {
    const schema = readFileSync('src/tracker/db/trackerSchema.ts', 'utf8');
    const snap = readFileSync('src/cloud/snapshot.ts', 'utf8');
    const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(tables.filter((t) => !snap.includes(`name: '${t}'`))).toEqual(['progress_photos']); // photos stay on the phone
  });
});

describe('the audit fixes are wired where the member meets them', () => {
  const read = (p: string): string => readFileSync(p, 'utf8');

  it('"Workout sounds" off reaches the rest-over alert on a locked phone', () => {
    expect(read('src/tracker/services/workoutAlerts.ts')).toMatch(/showRestCard\(startedAt, endsAt, nextLabel, quiet\)/);
    expect(read('modules/forge-rest/android/src/main/java/com/forgeai/rest/RestCard.kt')).toMatch(/appOnScreen\(ctx\) \|\| quiet\(ctx\)/);
  });

  it('Start waits for a workout saved before Android closed the app', () => {
    expect(read('src/app/today.tsx')).toMatch(/await hydrate\(\);\s+if \(!useActiveWorkout\.getState\(\)\.active\) await startFromPlan\(\)/);
    expect(read('src/app/(tabs)/workout.tsx')).toMatch(/await hydrate\(\);\s+if \(!useActiveWorkout\.getState\(\)\.active\) await startFromPlan\(\)/);
  });

  it('a restore waits until the open workout is finished or discarded', () => {
    expect(read('src/components/settings/BackupCard.tsx')).toMatch(/Finish your workout first/);
  });

  it('a failed check never starts the import on Replace', () => {
    expect(read('src/app/import/index.tsx')).toMatch(/isDemoData\(\)\.catch\(\(\) => false\)/);
  });

  it('Replace takes the deleted workouts out of Health Connect', () => {
    const s = read('src/app/import/index.tsx');
    expect(s).toMatch(/const gone = wasDemo \? \[\] : \(r\.replacedSessionIds \?\? \[\]\)/);
    expect(s).toMatch(/for \(const id of gone\) await removeWorkoutFromHealth\(id\)/);
  });
});
