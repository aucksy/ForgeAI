/**
 * Audit Phase 4, packet C — imports exactly as in Hevy and Strong (the pure rules).
 *
 * The link fixture is the owner's public Hevy folder "Jaipur" as its share page loads it
 * (test/fixtures/hevy-folder-api.json, trimmed: no weights, ids or people); every other file
 * here is made up.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { csvObjects, delimiterOf, num } from '@/tracker/services/csvText';
import { dayTypeOfWorkout, inferDayType, parseHevyBase64 } from '@/tracker/services/hevyImport';
import { dateOrderOf, localMoment, readWallClock, wallISO } from '@/tracker/services/importDates';
import { searchVariants, suggestFor } from '@/tracker/services/importMatch';
import { inOrder, toNewRoutines, withHistoryTypes } from '@/tracker/services/routineImport';
import {
  CAPTURE_API_JS,
  hevyLogType,
  linkedToFound,
  parseHevyApi,
  parsePageMessage,
  partialRead,
  partialReadText,
  readLinkedFolder,
  type PageNode,
} from '@/tracker/services/routineLink';
import { editedByMember, mergeRows, newRowPrint, rowPrint, type RowFacts } from '@/tracker/services/routineMerge';
import { chosenRoutines, isDefaultWorkoutName, rotationOrder, rowKey } from '@/tracker/services/routineRebuild';
import { parseStrongText, unitsExample } from '@/tracker/services/strongImport';
import { routineRowValues } from '@/tracker/db/folderRepo';

const fixture = (name: string): string => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
const api = JSON.parse(fixture('hevy-folder-api.json')) as unknown;
const page = JSON.parse(fixture('hevy-folder-page.json')) as { nodes: PageNode[]; expected: number };
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

// ---------------------------------------------------------------- 1. link routines

describe('IM-02: a Hevy link — warm-ups stay warm-ups', () => {
  const folder = parseHevyApi(api)!;
  const push1 = folder.routines.find((r) => r.title === 'Push 1')!;

  it("the owner's Push 1 incline bench has 3 working sets (and 2 warm-ups), as saved in Hevy", () => {
    const bench = push1.exercises[0];
    expect(bench.title).toBe('Incline Bench Press (Dumbbell)');
    expect(bench.sets).toBe(3);
    expect(bench.setList?.map((s) => s.type)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'normal']);
    expect([bench.repMin, bench.repMax]).toEqual([8, 15]);
    expect(bench.restSec).toBe(210);
  });

  it('drop sets hang off the set before; the other Push 1 counts match Hevy', () => {
    expect(push1.exercises.map((e) => [e.title, e.sets])).toEqual([
      ['Incline Bench Press (Dumbbell)', 3],
      ['Lateral Raise (Dumbbell)', 4],
      ['Skullcrusher (Dumbbell)', 3],
      ['Chest Fly (Machine)', 3],
      ['Triceps Kickback (Cable)', 3],
      ['Rear Delt Reverse Fly (Machine)', 2],
      ['Single Arm Lateral Raise (Cable)', 5],
    ]);
    expect(push1.exercises[1].setList?.at(-1)?.type).toBe('drop');
  });

  it('the page data wins over the headings (which count warm-ups); the headings are the fallback', () => {
    const withData = readLinkedFolder({ nodes: page.nodes, expected: 6, notFound: false, timedOut: false, api }, 'folder');
    expect(withData.fromPageData).toBe(true);
    const headingsOnly = readLinkedFolder({ nodes: page.nodes, expected: 6, notFound: false, timedOut: false }, 'folder');
    expect(headingsOnly.routines.find((r) => r.title === 'Push 1')!.exercises[0].sets).toBe(5);
  });

  it('saved rows keep the set list, so the routine starts with 2 warm-ups + 3 sets', () => {
    const found = linkedToFound(folder, inferDayType);
    const ids = new Map(found.flatMap((r) => r.exercises.map((e) => [e.title, `id:${e.title}`] as const)));
    const [row] = toNewRoutines([found.find((r) => r.title === 'Push 1')!], ids)[0].exercises;
    expect(row.sets).toBe(3);
    expect(row.restSec).toBe(210);
    expect(routineRowValues(row).targetSets).toBe(3);
    expect(JSON.parse(routineRowValues(row).setsJson!).map((s: { type: string }) => s.type)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'normal']);
  });

  it('with only the headings, the last workout of that routine tells the warm-ups apart', () => {
    const headings = linkedToFound(readLinkedFolder({ nodes: page.nodes, expected: 6, notFound: false, timedOut: false }, 'folder'), inferDayType);
    const types = new Map([['Push 1', new Map([['Incline Bench Press (Dumbbell)', ['warmup', 'warmup', 'normal', 'normal', 'normal'] as const]])]]);
    const out = withHistoryTypes(headings, types as never);
    const bench = out.find((r) => r.title === 'Push 1')!.exercises[0];
    expect(bench.sets).toBe(3);
    // A count that does not match the last workout is left as Hevy shows it.
    const lateral = out.find((r) => r.title === 'Push 1')!.exercises[1];
    expect(lateral.sets).toBe(6);
  });
});

describe('IM-12: exactly as saved — repeated blocks, timed exercises, big numbers', () => {
  const made = parseHevyApi({
    title: 'F',
    routines: [
      {
        title: 'Push A',
        exercises: [
          { title: 'Bench Press (Barbell)', exercise_type: 'weight_reps', rest_seconds: 180, sets: [{ indicator: 'normal', reps: 5 }, { indicator: 'normal', reps: 5 }] },
          { title: 'Plank', exercise_type: 'duration', rest_seconds: 60, sets: [{ indicator: 'normal', duration_seconds: 60 }, { indicator: 'normal', duration_seconds: 60 }] },
          { title: 'Crunch', exercise_type: 'reps_only', rest_seconds: 30, sets: Array.from({ length: 15 }, () => ({ indicator: 'normal', reps: 60 })) },
          { title: 'Bench Press (Barbell)', exercise_type: 'weight_reps', rest_seconds: 120, superset_id: 7, sets: [{ indicator: 'failure', reps: 12 }] },
        ],
      },
    ],
  })!;
  const found = linkedToFound(made, inferDayType)[0];

  it('the same exercise twice keeps both rows, each with its own key', () => {
    expect(found.exercises.map((e) => e.title)).toEqual(['Bench Press (Barbell)', 'Plank', 'Crunch', 'Bench Press (Barbell)']);
    expect(new Set(found.exercises.map(rowKey)).size).toBe(4);
    // Unticking one block leaves the other.
    const chosen = chosenRoutines([found], new Set(['Push A']), new Map([['Push A', new Set(found.exercises.slice(0, 3).map(rowKey))]]));
    expect(chosen[0].exercises).toHaveLength(3);
    expect(found.exercises[3].supersetGroup).toBe(1);
  });

  it('a timed exercise keeps its time target, not "8–12 reps"', () => {
    const plank = found.exercises[1];
    expect(plank.timed).toBe(true);
    expect([plank.repMin, plank.repMax]).toEqual([null, null]);
    expect(plank.setList?.[0]).toEqual({ type: 'normal', durationSec: 60 });
    expect(hevyLogType('duration')).toBe('time');
    const ids = new Map(found.exercises.map((e) => [e.title, `id:${e.title}`]));
    const row = toNewRoutines([found], ids)[0].exercises[1];
    expect(row.repMin).not.toBe(8);
    expect(JSON.parse(routineRowValues(row).setsJson!)[0]).toEqual({ type: 'normal', durationSec: 60 });
  });

  it('15 sets of 60 reps stay 15 × 60', () => {
    const crunch = found.exercises[2];
    const ids = new Map(found.exercises.map((e) => [e.title, `id:${e.title}`]));
    const v = routineRowValues(toNewRoutines([found], ids)[0].exercises[2]);
    expect(crunch.sets).toBe(15);
    expect([v.targetSets, v.repMin, v.repMax]).toEqual([15, 60, 60]);
  });

  it("a single routine's page data ({ routine }) is one routine named as in Hevy", () => {
    const one = parseHevyApi({ routine: { title: 'Push 1', exercises: [{ title: 'Chin Up', exercise_type: 'reps_only', sets: [{ indicator: 'normal', reps: 8 }] }] } }, 'routine')!;
    expect(one.name).toBe('Push 1');
    expect(one.routines.map((r) => r.title)).toEqual(['Push 1']);
  });
});

describe('IM-13: a partial page read is flagged', () => {
  it('fewer routines than the page says → "Only 4 of 6 routines could be read — try again"', () => {
    const cut = page.nodes.slice(0, page.nodes.findIndex((n) => n.tag === 'h3' && n.text === 'Legs 1'));
    const read = { nodes: cut, expected: 6, notFound: false, timedOut: true };
    const folder = readLinkedFolder(read, 'folder');
    const p = partialRead(read, folder)!;
    expect(partialReadText(p)).toBe('Only 4 of 6 routines could be read — try again');
  });

  it('an exercise drawn without its sets is flagged too; a whole read is not', () => {
    const nodes = page.nodes.map((n) => (n.text === 'Chest Dip' ? { ...n, detail: 'Chest Dip' } : n));
    const read = { nodes, expected: 6, notFound: false, timedOut: false };
    expect(partialReadText(partialRead(read, readLinkedFolder(read, 'folder'))!)).toBe('1 exercise came without its sets — try again');
    const whole = { nodes: page.nodes, expected: 6, notFound: false, timedOut: false, api };
    expect(partialRead(whole, readLinkedFolder(whole, 'folder'))).toBeNull();
  });
});

describe('the hidden reader keeps the page’s own data as the page receives it', () => {
  it('a request for the folder is kept; nothing else is', () => {
    type Listener = () => void;
    class FakeXhr {
      responseType = '';
      responseText = '';
      response: unknown = null;
      private load: Listener[] = [];
      open(_m: string, _u: string): void {}
      send(): void {
        this.load.forEach((f) => f());
      }
      addEventListener(_t: string, f: Listener): void {
        this.load.push(f);
      }
    }
    const win: Record<string, unknown> = {};
    const run = new Function('window', 'XMLHttpRequest', CAPTURE_API_JS);
    run(win, FakeXhr);
    const other = new FakeXhr();
    other.open('GET', 'https://api.hevyapp.com/paddle_prices');
    other.responseText = '{"x":1}';
    other.send();
    expect(win.__forgeHevyApi).toBeUndefined();
    const x = new FakeXhr();
    x.open('GET', 'https://api.hevyapp.com/shareable_folder/177335');
    x.responseText = JSON.stringify({ title: 'Jaipur', routines: [] });
    x.send();
    expect(win.__forgeHevyApi).toEqual({ title: 'Jaipur', routines: [] });
  });

  it('the message carries the data back', () => {
    expect(parsePageMessage(JSON.stringify({ nodes: [], expected: 6, api }))?.api).toBeTruthy();
    expect(parsePageMessage(JSON.stringify({ nodes: [], expected: 6, api: 'x' }))?.api).toBeUndefined();
  });
});

describe('IM-03: the folder in the member’s real rotation', () => {
  const day = (title: string, d: number) => ({ title, dateISO: `2026-0${Math.floor(d / 28) + 6}-${String((d % 28) + 1).padStart(2, '0')}` });
  const names = ['Pull 2', 'Leg 2', 'Pull 1', 'Push 2', 'Legs 1', 'Push 1'];

  it('Push 1 → Pull 1 → Push 2 → Pull 2 from the workouts, routines not done follow', () => {
    const cycle = ['Push 1', 'Pull 1', 'Push 2', 'Pull 2'];
    const history = Array.from({ length: 14 }, (_, i) => day(cycle[i % 4], i * 3));
    history.splice(5, 0, day('Morning workout', 16));
    expect(rotationOrder(names, history)).toEqual(['Push 1', 'Pull 1', 'Push 2', 'Pull 2', 'Leg 2', 'Legs 1']);
    expect(inOrder(names.map((title) => ({ title })), rotationOrder(names, history)).map((r) => r.title)[1]).toBe('Pull 1');
  });

  it('no history to go by → null (the folder keeps Hevy’s order and says so)', () => {
    expect(rotationOrder(names, [day('Push 1', 1)])).toBeNull();
    expect(rotationOrder(names, [])).toBeNull();
  });
});

describe('IM-22: copying again keeps the member’s own changes', () => {
  const x = (exerciseId: string, sets = 3) => ({ exerciseId, sets, repMin: 8, repMax: 12, restSec: 120 });
  const facts = (r: ReturnType<typeof x>): RowFacts => {
    const v = routineRowValues(r);
    return { exerciseId: r.exerciseId, targetSets: v.targetSets, repMin: v.repMin, repMax: v.repMax, setsJson: v.setsJson, restSec: v.restSec, supersetGroup: v.supersetGroup, note: v.note };
  };

  it('a row as copied takes Hevy’s new values; a row the member changed keeps theirs', () => {
    const before = [x('bench'), x('fly'), x('dip')];
    const marks = before.map(newRowPrint);
    const current = [facts(x('bench')), { ...facts(x('fly')), restSec: 60 }, facts(x('dip'))];
    const next = [x('bench', 4), x('fly', 4), x('dip', 4)];
    const { rows, keptEdits } = mergeRows(current, next, marks);
    expect(keptEdits).toBe(true);
    expect(rows.map((r) => ('keep' in r ? `kept ${r.keep.exerciseId} rest ${r.keep.restSec}` : `new ${r.write.exerciseId} ${r.write.sets}`))).toEqual([
      'new bench 4',
      'kept fly rest 60',
      'new dip 4',
    ]);
  });

  it('a row the member deleted stays deleted; one they added stays; one Hevy dropped goes', () => {
    const before = [x('bench'), x('fly'), x('dip')];
    const marks = before.map(newRowPrint);
    const current = [facts(x('bench')), facts(x('dip')), facts(x('curl'))];
    const next = [x('bench'), x('fly')];
    const { rows } = mergeRows(current, next, marks);
    expect(rows.map((r) => ('keep' in r ? `kept ${r.keep.exerciseId}` : `new ${r.write.exerciseId}`))).toEqual(['new bench', 'kept curl']);
  });

  it('nothing remembered (built by hand, or copied before rows were remembered): every row is the member’s', () => {
    // Review fix: a hand-built routine looks just like an old copy, so neither is overwritten.
    expect(editedByMember(facts(x('bench')), undefined)).toBe(true);
    expect(editedByMember({ ...facts(x('bench')), restSec: null }, undefined)).toBe(true);
    expect(rowPrint({ ...facts(x('bench')) })).toBe(newRowPrint(x('bench')));
  });
});

// ---------------------------------------------------------------- 3. history files

describe('IM-11: any date format', () => {
  it('Hevy, ISO, Excel day-first and month-first, Japanese, AM/PM', () => {
    const at = (v: string, o: 'dmy' | 'mdy' = 'dmy') => {
      const c = readWallClock(v, o);
      return c ? `${wallISO(c)} ${String(c.h).padStart(2, '0')}:${String(c.mi).padStart(2, '0')}` : null;
    };
    expect(at('9 Oct 2025, 18:05')).toBe('2025-10-09 18:05');
    expect(at('9 окт. 2025, 18:05')).toBe('2025-10-09 18:05');
    expect(at('9 paź 2025, 18:05')).toBe('2025-10-09 18:05');
    expect(at('2025-10-09 18:05:33')).toBe('2025-10-09 18:05');
    expect(at('2025-10-09T18:05')).toBe('2025-10-09 18:05');
    expect(at('09.10.2025 18:05')).toBe('2025-10-09 18:05');
    expect(at('10/09/2025 6:05 PM', 'mdy')).toBe('2025-10-09 18:05');
    expect(at('Oct 9, 2025, 6:05 PM')).toBe('2025-10-09 18:05');
    expect(at('2025年10月9日 18:05')).toBe('2025-10-09 18:05');
    expect(at('31/02/2025 10:00')).toBeNull();
    expect(readWallClock(45939.75)).not.toBeNull(); // an Excel date number
  });

  it('day-first or month-first is told by scanning the column', () => {
    expect(dateOrderOf(['03/04/2025 10:00', '13/04/2025 10:00'])).toBe('dmy');
    expect(dateOrderOf(['03/04/2025 10:00', '04/13/2025 10:00'])).toBe('mdy');
    expect(dateOrderOf(['03/04/2025 10:00'])).toBe('dmy');
  });

  it('numbers as Excel writes them', () => {
    expect(num('72,5', true)).toBe(72.5);
    expect(num('1.072,5', false)).toBe(1072.5);
    expect(num('1,072.5', false)).toBe(1072.5);
    expect(delimiterOf('sep=;\ntitle;start_time')).toBe(';');
    expect(delimiterOf('"a,b";c;d\n')).toBe(';');
  });

  it('an Excel-saved Hevy file imports: BOM, ";", day-first numeric dates, decimal commas', () => {
    const csv = [
      '﻿title;start_time;end_time;description;exercise_title;superset_id;exercise_notes;set_index;set_type;weight_kg;reps;distance_km;duration_seconds;rpe',
      'Push A;13.10.2025 18:05;13.10.2025 19:10;felt strong;Bench Press (Barbell);;;0;warmup;40;10;;;',
      'Push A;13.10.2025 18:05;13.10.2025 19:10;felt strong;Bench Press (Barbell);;;1;normal;"72,5";8;;;"8,5"',
      'Pull A;02.11.2025 07:30;02.11.2025 08:20;;Lat Pulldown (Cable);;;0;normal;55;10;;;',
    ].join('\r\n');
    const p = parseHevyBase64(b64(csv));
    expect(p.workouts.map((w) => w.dateISO)).toEqual(['2025-10-13', '2025-11-02']);
    expect(p.workouts[0].exercises[0].sets[1].weightKg).toBe(72.5);
    expect(p.workouts[0].exercises[0].sets[1].rpe).toBe(8.5);
    expect(p.workouts[0].notes).toBe('Push A\nfelt strong');
    // IM-07: the clock time the member saw, as that moment on this phone.
    expect(p.workouts[0].startedAt).toBe(new Date(2025, 9, 13, 18, 5).getTime());
  });

  it('a file whose dates cannot be read says which column, with an example', () => {
    const csv = 'title,start_time,end_time,exercise_title,set_type,weight_kg,reps\nPush,someday,someday,Bench,normal,60,5\n';
    expect(() => parseHevyBase64(b64(csv))).toThrow('The dates in its start_time column could not be read (for example “someday”)');
  });

  it('csvObjects keys rows by the header', () => {
    expect(csvObjects('A;B\n1;2\n').rows).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('IM-14: free-workout names in any language', () => {
  it('the apps’ own names for an empty workout are not routines', () => {
    for (const t of [
      'Morning workout',
      'Entrenamiento de mañana',
      'Entrenamiento de tarde',
      'Morgentraining',
      'Nachmittagstraining',
      'Entraînement du soir',
      'Allenamento serale',
      'Treino da manhã',
      'Ochtendtraining',
      'Утренняя тренировка',
      'Poranny trening',
      'Akşam antrenmanı',
      '朝のワークアウト',
      '저녁 운동',
    ]) {
      expect(isDefaultWorkoutName(t), t).toBe(true);
    }
    for (const t of ['Push 1', 'Día de pierna', 'Pierna y glúteo', 'Leg day', 'Upper A']) expect(isDefaultWorkoutName(t), t).toBe(false);
  });

  it('a name in another language gets its day from its exercises', () => {
    expect(dayTypeOfWorkout('Día de pierna', ['Squat (Barbell)', 'Leg Press (Machine)', 'Seated Leg Curl (Machine)', 'Standing Calf Raise'])).toBe('legs');
    expect(dayTypeOfWorkout('Тренировка спины', ['Lat Pulldown (Cable)', 'Seated Cable Row', 'Bicep Curl (Dumbbell)'])).toBe('pull');
    expect(dayTypeOfWorkout('Push 1', ['Squat (Barbell)'])).toBe('push'); // the name says it
  });
});

describe('Strong: workout notes, real times, the units question with a real set', () => {
  const OLD = [
    'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
    '2026-09-01 18:30:12,Push,1h 5m,Bench Press (Barbell),W,40,10,0,0,,"left shoulder twinge",',
    '2026-09-01 18:30:12,Push,1h 5m,Bench Press (Barbell),1,100,5,0,0,,"left shoulder twinge",8',
    '2026-09-01 18:30:12,Push,1h 5m,Incline Press,1,80,5,0,0,,"left shoulder twinge",',
  ].join('\n');

  it('IM-04: "Workout Notes" are kept with the workout', () => {
    const p = parseStrongText(OLD, 'metric');
    // A bare day name says nothing the day does not: the note alone (as for Hevy, `workoutNotes`).
    expect(p.workouts[0].notes).toBe('left shoulder twinge');
    const named = parseStrongText(OLD.replace(/,Push,/g, ',Push Day A,'), 'metric');
    expect(named.workouts[0].notes).toBe('Push Day A\nleft shoulder twinge');
  });

  it('IM-07: the clock time the member saw', () => {
    expect(parseStrongText(OLD, 'metric').workouts[0].startedAt).toBe(new Date(2026, 8, 1, 18, 30, 12).getTime());
  });

  it('IM-06: the heaviest working set, as written, to ask "kg or lb?"', () => {
    expect(unitsExample(OLD)).toEqual({ exercise: 'Bench Press (Barbell)', value: 100 });
  });
});

describe('IM-15: names new to ForgeAI get a suggested match', () => {
  const lib = [
    { id: 'row', name: 'Seated Cable Row', aliases: [], equipment: 'cable' as const, muscles: { primary: [], secondary: [] } },
    { id: 'pec', name: 'Pec Deck Fly', aliases: ['butterfly'], equipment: 'machine' as const, muscles: { primary: [], secondary: [] } },
  ];
  it('"Seated Cable Row - V Grip (Cable)" → ForgeAI’s Seated Cable Row', () => {
    expect(searchVariants('Seated Cable Row - V Grip (Cable)')).toEqual(['Seated Cable Row - V Grip (Cable)', 'Seated Cable Row - V Grip', 'Seated Cable Row']);
    expect(suggestFor('Seated Cable Row - V Grip (Cable)', lib)).toEqual({ id: 'row', name: 'Seated Cable Row' });
  });
  it('nothing close → no suggestion', () => {
    expect(suggestFor('Landmine Rotation', lib)).toBeNull();
  });
});

// Keep `localMoment` honest: it is this phone's clock.
describe('localMoment', () => {
  it('is the phone’s own clock time', () => {
    expect(new Date(localMoment({ y: 2026, mo: 6, d: 7, h: 21, mi: 0, s: 0 })).getHours()).toBe(21);
  });
});

// ---------------------------------------------------------------- the import screen's words

describe('IM-08 / IM-09 / IM-06 / IM-17: what the import screens say', async () => {
  const w = await import('@/tracker/services/importWords');
  const { shareProblemText } = await import('@/tracker/phone/sharedImport');
  const { choosePendingImport, takePendingImport } = await import('@/tracker/services/switcher');

  it('the date range has its years', () => {
    expect(w.dateRangeText('2024-03-01', '2026-09-29')).toBe('Mar 2024 → Sep 2026');
    expect(w.dateRangeText('2026-09-01', '2026-09-29')).toBe('Sep 2026');
  });

  it('a file already imported says so; the button says what really happens', () => {
    expect(w.allHereText({ workouts: 12, alreadyHere: 12 })).toBe('All 12 workouts are already here');
    expect(w.allHereText({ workouts: 12, alreadyHere: 3 })).toBeNull();
    expect(w.importButtonLabel('merge', { workouts: 12, alreadyHere: 3 })).toBe('Add 9 new workouts');
    expect(w.importButtonLabel('merge', { workouts: 12, alreadyHere: 0 })).toBe('Import 12 workouts');
    expect(w.importButtonLabel('replace', { workouts: 1, alreadyHere: 0 })).toBe('Replace with 1 workout');
    expect(w.doneTitle(1)).toBe('1 workout imported');
    expect(w.doneTitle(0)).toBe('Nothing new to add');
  });

  it('kg or lb is asked with a real set', () => {
    expect(w.unitsQuestion({ exercise: 'Bench Press', value: 100 })).toBe('Bench Press 100 — kg or lb?');
  });

  it('a share ForgeAI could not take says why', () => {
    expect(shareProblemText('too_big')).toMatch(/too big/);
    expect(shareProblemText('unreadable')).toMatch(/couldn’t open/);
    expect(shareProblemText(undefined)).toBeNull();
  });

  it('the app picked on the welcome screen opens its import once', () => {
    choosePendingImport('strong');
    expect(takePendingImport()).toBe('strong');
    expect(takePendingImport()).toBeNull();
  });
});

describe('IM-14: an app’s own name for an empty workout stays full body', () => {
  it('in English and in other languages; any other unknown name goes by its exercises', () => {
    expect(dayTypeOfWorkout('Morning workout', ['Bench Press (Barbell)', 'Chest Fly (Machine)'])).toBe('full');
    expect(dayTypeOfWorkout('Entrenamiento de mañana', ['Bench Press (Barbell)', 'Chest Fly (Machine)'])).toBe('full');
    expect(dayTypeOfWorkout('Brustkorb', ['Bench Press (Barbell)', 'Chest Fly (Machine)'])).toBe('push');
  });
});
