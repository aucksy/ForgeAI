/**
 * Phase 4 review, round 2 — the pure rules behind each fix (all data made up):
 *  2. a routine with no remembered copy is the member's: nothing of theirs is overwritten;
 *  3. number-only dates: the whole column decides; "03/04/2026" with nothing to settle it is
 *     ASKED, never guessed; rows whose date can't be read are counted, not dropped silently;
 *  4. the link-folder repair only reorders a folder still exactly as copied;
 *  5. a copy again keeps the member's own exercise order;
 *  6. one workout here is matched by at most one workout in the file;
 *  7. a workout ending at a real "now" is never taken for an old import;
 *  8. the folder's own answer is kept over a routine's, and fetch is called on window;
 * 10. the routine-file fingerprint sees rest / superset / note; a set list stops at 50;
 * 11. "Same as …?" never offers an exercise logged another way.
 */
import { createContext, runInContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import type { NewRoutine } from '@/tracker/db/folderRepo';
import { fileFingerprint, makeRoutineFile, type SharedExercise } from '@/tracker/plans/routineFile';
import { parsePlanSets } from '@/tracker/plans/routineSets';
import { matchKnown, parseHevyBase64 } from '@/tracker/services/hevyImport';
import { realFromStored } from '@/tracker/services/importClockRepair';
import { dateOrderQuestion, scanDateOrder } from '@/tracker/services/importDates';
import { suggestFor } from '@/tracker/services/importMatch';
import { mayReorder } from '@/tracker/services/linkFolderRepair';
import { CAPTURE_API_JS } from '@/tracker/services/routineLink';
import { mergeRows, newRowPrint, type MergedRow, type RowFacts } from '@/tracker/services/routineMerge';
import { parseStrongText } from '@/tracker/services/strongImport';

type Row = NewRoutine['exercises'][number];
const hevy = (exerciseId: string, sets = 3, reps = 10): Row => ({ exerciseId, sets, repMin: reps, repMax: reps });
const facts = (exerciseId: string, sets = 3, reps = 10, extra: Partial<RowFacts> = {}): RowFacts => ({
  exerciseId,
  targetSets: sets,
  repMin: reps,
  repMax: reps,
  setsJson: null,
  restSec: null,
  supersetGroup: null,
  note: null,
  ...extra,
});
const ids = (rows: MergedRow[]) => rows.map((r) => ('keep' in r ? `keep:${r.keep.exerciseId}:${r.keep.targetSets}` : `write:${r.write.exerciseId}:${r.write.sets}`));

describe('2 · a routine never copied before (built by hand) is the member’s', () => {
  it('copying a Hevy routine of the same name keeps their sets, reps and extra exercises; only new ones are added', () => {
    const mine = [facts('squat', 5, 5), facts('lunge', 3, 12), facts('calf', 4, 15)];
    const fromHevy = [hevy('squat', 3, 8), hevy('legpress', 3, 10)];
    const { rows, keptEdits } = mergeRows(mine, fromHevy, undefined);
    expect(ids(rows)).toEqual(['keep:squat:5', 'write:legpress:3', 'keep:lunge:3', 'keep:calf:4']);
    expect(keptEdits).toBe(true);
  });
});

describe('5 · copying again keeps the member’s exercise order', () => {
  const copied = [hevy('bench'), hevy('fly'), hevy('dip')].map(newRowPrint);
  it('rows moved by the member stay in their order (Hevy’s values still come in for untouched rows)', () => {
    const now = [facts('dip'), facts('bench'), facts('fly')];
    const next = [hevy('bench', 4), hevy('fly', 4), hevy('dip', 4), hevy('pushup', 2)];
    expect(ids(mergeRows(now, next, copied).rows)).toEqual(['write:dip:4', 'write:pushup:2', 'write:bench:4', 'write:fly:4']);
  });
  it('rows still in the copied order follow Hevy’s new order', () => {
    const now = [facts('bench'), facts('fly'), facts('dip')];
    const next = [hevy('dip'), hevy('bench'), hevy('fly')];
    expect(ids(mergeRows(now, next, copied).rows)).toEqual(['write:dip:3', 'write:bench:3', 'write:fly:3']);
  });
});

describe('3 · dates that read two ways', () => {
  it('the WHOLE column decides — a settling date far down the file counts', () => {
    const col = [...Array.from({ length: 2500 }, () => '03/04/2026 18:00'), '04/13/2026 18:00'];
    expect(scanDateOrder(col)).toEqual({ order: 'mdy', ambiguous: null });
  });
  it('nothing settles it: the member is asked, with a date from the file', () => {
    expect(scanDateOrder(['03/04/2026 18:00', '05/04/2026 18:00'])).toEqual({ order: null, ambiguous: '03/04/2026' });
    expect(dateOrderQuestion('03/04/2026').question).toBe('Is 03/04/2026 the 3rd of April or March 4th?');
    expect(dateOrderQuestion('03/04/2026').dayFirst).toBe('3 April 2026 (day first)');
    expect(dateOrderQuestion('03/04/2026').monthFirst).toBe('March 4, 2026 (month first)');
  });

  const STRONG_HEAD = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';
  const strongRow = (date: string) => `${date},Legs,1h,Squat (Barbell),1,100,5,0,0,,,`;
  it('Strong: a month-first date after row 400 settles the order (no silent day-first read)', () => {
    const rows = [STRONG_HEAD, ...Array.from({ length: 450 }, (_, i) => strongRow(`0${1 + (i % 9)}/0${1 + (i % 9)}/2026 18:00`)), strongRow('03/04/2026 07:00'), strongRow('04/13/2026 07:00')];
    const p = parseStrongText(rows.join('\n'), 'metric');
    expect(p.dateQuestion).toBeNull();
    expect(p.dateOrder).toBe('mdy');
    expect(p.workouts.some((w) => w.dateISO === '2026-03-04')).toBe(true);
  });
  it('Strong: an ambiguous file asks, and the answer is how it is read', () => {
    const text = [STRONG_HEAD, strongRow('03/04/2026 18:00'), strongRow('05/04/2026 18:00')].join('\n');
    const asked = parseStrongText(text, 'metric');
    expect(asked.dateQuestion).toBe('03/04/2026');
    expect(parseStrongText(text, 'metric', 'mdy').workouts.map((w) => w.dateISO)).toEqual(['2026-03-04', '2026-05-04']);
    expect(parseStrongText(text, 'metric', 'mdy').dateQuestion).toBeNull();
  });
  it('Strong: a row whose date cannot be read is counted and shown, the rest come in', () => {
    const p = parseStrongText([STRONG_HEAD, strongRow('2026-09-01 18:00:00'), strongRow('not a date')].join('\n'), 'metric');
    expect(p.workouts).toHaveLength(1);
    expect(p.badDateRows).toBe(1);
    expect(p.badDateExample).toBe('not a date');
  });

  const HEVY_HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
  const hevyRow = (start: string, end: string) => `"Legs","${start}","${end}","","Squat (Barbell)",,"",0,normal,100,5,,,`;
  const b64 = (lines: string[]) => Buffer.from([HEVY_HEAD, ...lines].join('\n'), 'utf8').toString('base64');
  it('Hevy: ambiguous dates are asked; the answer reads them that way; unreadable rows are counted', () => {
    const file = b64([hevyRow('03/04/2026 18:00', '03/04/2026 19:00'), hevyRow('05/04/2026 18:00', '05/04/2026 19:00'), hevyRow('??', '??')]);
    const p = parseHevyBase64(file);
    expect(p.dateQuestion).toBe('03/04/2026');
    expect(p.badDateRows).toBe(1);
    const us = parseHevyBase64(file, { dateOrder: 'mdy' });
    expect(us.workouts.map((w) => w.dateISO)).toEqual(['2026-03-04', '2026-05-04']);
    expect(us.dateQuestion).toBeNull();
  });
});

describe('4 · the link-folder repair reorders only a folder still exactly as copied', () => {
  const prints = (...xs: string[]) => xs.map((x) => newRowPrint(hevy(x)));
  const routine = (name: string, rows: RowFacts[], marks: string[] | undefined) => ({ name, rows, marks });
  const asCopied = [routine('Push 1', [facts('bench')], prints('bench')), routine('Pull 1', [facts('row')], prints('row'))];
  it('page order remembered, folder untouched: yes', () => {
    expect(mayReorder(asCopied, ['Push 1', 'Pull 1'])).toBe(true);
  });
  it('page order never remembered (an older copy): no', () => {
    expect(mayReorder(asCopied, undefined)).toBe(false);
  });
  it('the member put the routines in their own order (a followed plan they arranged): no', () => {
    expect(mayReorder([asCopied[1], asCopied[0]], ['Push 1', 'Pull 1'])).toBe(false);
  });
  it('the member changed a routine since the copy: no', () => {
    const edited = [routine('Push 1', [facts('bench', 5)], prints('bench')), asCopied[1]];
    expect(mayReorder(edited, ['Push 1', 'Pull 1'])).toBe(false);
    const added = [routine('Push 1', [facts('bench'), facts('fly')], prints('bench')), asCopied[1]];
    expect(mayReorder(added, ['Push 1', 'Pull 1'])).toBe(false);
  });
});

describe('6 · one workout here is matched by at most one in the file', () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 6, 7, h, m);
  it('two 30-minute "Cardio" on one day, the morning one imported before: the evening one is new', () => {
    const here = [{ id: 'morning', dateISO: '2026-07-07', startedAt: at(7), endedAt: at(7, 30), title: 'Cardio' }];
    const file = [
      { dateISO: '2026-07-07', startedAt: at(7), endedAt: at(7, 30), title: 'Cardio' },
      { dateISO: '2026-07-07', startedAt: at(18), endedAt: at(18, 30), title: 'Cardio' },
    ];
    expect(matchKnown(file, here)).toEqual(['morning', null]);
    // Whatever order the file lists them in.
    expect(matchKnown([file[1], file[0]], here)).toEqual([null, 'morning']);
  });
  it('a phone moved to another zone still finds its workout (same day, name and length)', () => {
    const here = [{ id: 'w', dateISO: '2026-07-07', startedAt: at(7), endedAt: at(7, 30), title: 'Cardio' }];
    expect(matchKnown([{ dateISO: '2026-07-07', startedAt: at(9), endedAt: at(9, 30), title: 'Cardio' }], here)).toEqual(['w']);
  });
});

describe('7 · the clock repair never moves a workout logged in ForgeAI', () => {
  it('a whole-second start whose end is a real "now" (an edit slid it to its day’s start) stays', () => {
    const start = Date.UTC(2026, 6, 7, 21, 0);
    expect(realFromStored(start, '2026-07-07', start + 3_600_000 + 417)).toBe(start);
  });
  it('an old import (start and end on whole seconds) is still moved', () => {
    const start = Date.UTC(2026, 6, 7, 21, 0);
    expect(realFromStored(start, '2026-07-07', start + 3_600_000)).toBe(new Date(2026, 6, 7, 21, 0).getTime());
  });
});

describe('8 · the link page’s data: the folder’s answer wins, fetch is called on window', () => {
  function page() {
    const responses: Record<string, unknown> = {
      'https://api.hevyapp.com/shareable_folder/abc': { kind: 'folder' },
      'https://api.hevyapp.com/shareable_routine/r1': { kind: 'routine' },
    };
    const win: Record<string, unknown> = {};
    createContext(win);
    // The page's own global (what `window` is inside the page).
    const global = runInContext('globalThis', win) as unknown;
    runInContext('var window = globalThis;', win);
    win.XMLHttpRequest = function XMLHttpRequest() {};
    (win.XMLHttpRequest as { prototype: object }).prototype = { open() {}, send() {} };
    win.fetch = function (this: unknown, url: string) {
      // A browser's fetch refuses any other `this`.
      if (this !== global) return Promise.reject(new TypeError('Illegal invocation'));
      const body = JSON.stringify(responses[url] ?? {});
      const res = { clone: () => res, text: () => Promise.resolve(body) };
      return Promise.resolve(res);
    };
    runInContext(CAPTURE_API_JS, win);
    return win as { fetch: (u: string) => Promise<unknown>; __forgeHevyApi?: unknown };
  }
  const settle = () => new Promise((r) => setTimeout(r, 10));
  it('a routine fetched after the folder does not replace it', async () => {
    const w = page();
    const f = w.fetch;
    await f('https://api.hevyapp.com/shareable_folder/abc'); // called bare, as page code may
    await f('https://api.hevyapp.com/shareable_routine/r1');
    await settle();
    expect(w.__forgeHevyApi).toEqual({ kind: 'folder' });
  });
  it('a routine page alone is still read', async () => {
    const w = page();
    await w.fetch('https://api.hevyapp.com/shareable_routine/r1');
    await settle();
    expect(w.__forgeHevyApi).toEqual({ kind: 'routine' });
  });
});

describe('10 · routine files', () => {
  const ex = (o: Partial<SharedExercise> = {}): SharedExercise => ({ name: 'Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps', sets: 3, repMin: 8, repMax: 10, primary: [], ...o });
  const print = (e: SharedExercise) => fileFingerprint(makeRoutineFile(null, [{ name: 'Push', dayType: 'push', exercises: [e] }]));
  it('rest, superset and note are part of the fingerprint', () => {
    expect(print(ex({ restSec: 90 }))).not.toBe(print(ex({ restSec: 120 })));
    expect(print(ex({ supersetGroup: 1 }))).not.toBe(print(ex()));
    expect(print(ex({ note: 'pause at the bottom' }))).not.toBe(print(ex()));
  });
  it('a set list stops at 50 sets, the same bound as the set count', () => {
    const list = parsePlanSets(JSON.stringify(Array.from({ length: 120 }, () => ({ type: 'normal', reps: 5 }))));
    expect(list).toHaveLength(50);
  });
});

describe('11 · "Same as …?" only offers an exercise logged the same way', () => {
  const lib = [
    { id: 'row', name: 'Plank Row', aliases: [], equipment: 'dumbbell' as const, muscles: { primary: [], secondary: [] }, catalogKey: null, logType: 'weight_reps' as const },
  ];
  it('a timed file name never matches a weight × reps exercise', () => {
    expect(suggestFor('Plank (Gym)', lib, 'time')).toBeNull();
    expect(suggestFor('Plank (Gym)', lib, 'weight_reps')?.id).toBe('row');
  });
  it('a distance name skips a closer weight × reps one for one logged by distance', () => {
    const two = [
      { ...lib[0], id: 'walk', name: 'Farmer Walk', logType: 'weight_reps' as const },
      { ...lib[0], id: 'walkd', name: 'Farmer Walk Carry', logType: 'distance' as const },
    ];
    expect(suggestFor('Farmer Walk (Gym)', two, 'distance')?.id).toBe('walkd');
  });
});
