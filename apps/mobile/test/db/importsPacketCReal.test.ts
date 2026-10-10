/**
 * Audit Phase 4, packet C — imports exactly as in Hevy and Strong, against REAL SQLite.
 *  - IM-02 / IM-03 / IM-12: the owner's Hevy folder "Jaipur" (its share page's own data,
 *    test/fixtures/hevy-folder-api.json) saved after a made-up history: Push 1's incline bench
 *    has 2 warm-ups + 3 working sets and Hevy's rest; the folder is in the real rotation and
 *    after Push 1 comes Pull 1.
 *  - IM-22: copying the same link again keeps the member's own changes.
 *  - IM-21: a single-routine link goes into the folder the member picks.
 *  - The one-time repair of a folder copied before (warm-ups and order from the history).
 *  - IM-07: imported times are the real moment; an older import is moved once.
 *  - IM-09 / IM-15: a re-import knows every workout; a matched name lands on ForgeAI's exercise.
 * Every history file here is made up.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

const api = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'hevy-folder-api.json'), 'utf8')) as unknown;
const URL = 'https://hevy.com/folder/177335';

let db: RealDb;
beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
});

const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A made-up Hevy export: `days` workouts, one every 2 days from 1 Jun 2026, cycling `cycle`. */
function hevyCsv(cycle: readonly string[], days: number, extra: string[] = []): string {
  const rows = [HEAD];
  for (let i = 0; i < days; i++) {
    const d = new Date(2026, 5, 1 + i * 2);
    const stamp = (h: number) => `"${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:05"`;
    const title = cycle[i % cycle.length];
    const ex = title.startsWith('Push') ? 'Incline Bench Press (Dumbbell)' : 'Lat Pulldown (Cable)';
    const set = (k: number, type: string, w: number, r: number) => `"${title}",${stamp(18)},${stamp(19)},"",${ex},,"",${k},${type},${w},${r},,,`;
    rows.push(set(0, 'warmup', 15, 15), set(1, 'warmup', 20, 12), set(2, 'normal', 30, 10), set(3, 'normal', 32, 8), set(4, 'normal', 32, 8));
  }
  return [...rows, ...extra].join('\n');
}

async function importCsv(csv: string, mode: 'replace' | 'merge' = 'merge', matches?: Map<string, string>) {
  const { parseHevyBase64, previewImport, runImport } = await import('@/tracker/services/hevyImport');
  const parsed = parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64'));
  const preview = await previewImport(parsed);
  const result = await runImport(parsed, { mode, matches });
  return { parsed, preview, result };
}

const days = (folderId: string) =>
  db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days WHERE plan_id = ? ORDER BY day_order', [folderId]);
const rowsOf = (dayId: string) =>
  db.all<{ id: string; name: string; target_sets: number; sets_json: string | null; rest_sec: number | null }>(
    `SELECT pe.id, e.name, pe.target_sets, pe.sets_json, pe.rest_sec FROM plan_exercises pe JOIN exercises e ON e.id = pe.exercise_id
      WHERE pe.plan_day_id = ? ORDER BY pe.ex_order`,
    [dayId],
  );
const types = (json: string | null) => (json ? (JSON.parse(json) as { type: string }[]).map((s) => s.type) : null);

async function copyJaipur(follow = true, data: unknown = api) {
  const { parseHevyApi, linkedToFound } = await import('@/tracker/services/routineLink');
  const { inferDayType } = await import('@/tracker/services/hevyImport');
  const { linkRotation, saveLinkedRoutines } = await import('@/tracker/services/routineImport');
  const folder = parseHevyApi(data)!;
  const found = linkedToFound(folder, inferDayType);
  const order = await linkRotation(found.map((r) => r.title));
  const saved = await saveLinkedRoutines({ url: URL, kind: 'folder', folderName: folder.name }, found, { follow, order });
  return { saved, order };
}

describe('IM-02 / IM-03: the owner’s Hevy folder copied from its link', () => {
  it('Push 1’s incline bench: 2 warm-ups + 3 working sets, Hevy’s rest; the folder in the real rotation; after Push 1 comes Pull 1', async () => {
    await importCsv(hevyCsv(['Push 1', 'Pull 1', 'Push 2', 'Pull 2'], 13)); // the newest is Push 1
    const { saved, order } = await copyJaipur();
    expect(order).toEqual(['Push 1', 'Pull 1', 'Push 2', 'Pull 2', 'Leg 2', 'Legs 1']);
    expect(days(saved.folderId).map((d) => d.name)).toEqual(order);
    const push1 = days(saved.folderId)[0];
    const bench = rowsOf(push1.id)[0];
    expect(bench.target_sets).toBe(3);
    expect(types(bench.sets_json)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'normal']);
    expect(bench.rest_sec).toBe(210);
    const { homeToday } = await import('@/tracker/services/routineImport');
    expect(await homeToday()).toBe('Pull 1');
  });

  it('with no history the folder keeps Hevy’s order (and says so — no rotation to claim)', async () => {
    const { saved, order } = await copyJaipur();
    expect(order).toBeNull();
    expect(days(saved.folderId).map((d) => d.name)).toEqual(['Pull 2', 'Leg 2', 'Pull 1', 'Push 2', 'Legs 1', 'Push 1']);
  });
});

describe('IM-22: copying the same link again keeps the member’s own changes', () => {
  it('a changed row keeps its rest; untouched rows take Hevy’s new sets; one folder, not two', async () => {
    const first = await copyJaipur();
    const push1 = days(first.saved.folderId).find((d) => d.name === 'Push 1')!;
    const [bench, lateral] = rowsOf(push1.id);
    const { updateRoutineExercise } = await import('@/tracker/db/routineRepo');
    await updateRoutineExercise(bench.id, { restSec: 90 });

    // Hevy now has a 5th working lateral raise.
    const changed = JSON.parse(JSON.stringify(api)) as { routines: { title: string; exercises: { title: string; sets: unknown[] }[] }[] };
    const lat = changed.routines.find((r) => r.title === 'Push 1')!.exercises.find((e) => e.title === 'Lateral Raise (Dumbbell)')!;
    lat.sets.splice(1, 0, { indicator: 'normal', reps: 20, duration_seconds: null });
    const again = await copyJaipur(true, changed);

    expect(again.saved.folderId).toBe(first.saved.folderId);
    expect(again.saved.keptEdits).toEqual(['Push 1']);
    const [bench2, lateral2] = rowsOf(push1.id);
    expect(bench2.rest_sec).toBe(90);
    expect(lateral.target_sets).toBe(4);
    expect(lateral2.target_sets).toBe(5);
    expect(db.all<{ n: number }>("SELECT COUNT(*) AS n FROM workout_plans WHERE name = 'Jaipur'")[0].n).toBe(1);
  });
});

describe('IM-21: a single-routine link goes into the folder the member picks', () => {
  it('into "My routines" (not a new folder named after it); again → updated, not doubled', async () => {
    const { parseHevyApi, linkedToFound } = await import('@/tracker/services/routineLink');
    const { inferDayType } = await import('@/tracker/services/hevyImport');
    const { saveLinkedRoutines } = await import('@/tracker/services/routineImport');
    const one = parseHevyApi({ routine: (api as { routines: unknown[] }).routines[5] }, 'routine')!;
    const found = linkedToFound(one, inferDayType);
    const before = db.all<{ n: number }>('SELECT COUNT(*) AS n FROM workout_plans')[0].n;
    const a = await saveLinkedRoutines({ url: 'https://hevy.com/routine/X', kind: 'routine', folderName: one.name }, found, { follow: false, folderId: null });
    await saveLinkedRoutines({ url: 'https://hevy.com/routine/X', kind: 'routine', folderName: one.name }, found, { follow: false, folderId: a.folderId });
    expect(a.name).toBe('My routines');
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM workout_plans')[0].n).toBe(before + 1);
    expect(days(a.folderId).map((d) => d.name)).toEqual(['Push 1']);
    expect(db.all<{ n: number }>("SELECT COUNT(*) AS n FROM workout_plans WHERE name = 'Push 1'")[0].n).toBe(0);
  });
});

describe('the one-time repair of a folder copied from a link before', () => {
  it('warm-ups from the last workout of that routine, the real order; an edited routine untouched; once', async () => {
    await importCsv(hevyCsv(['Push 1', 'Pull 1', 'Push 2', 'Pull 2'], 13));
    const { saveLinkFolder, exerciseIdsByName } = await import('@/tracker/db/folderRepo');
    const ids = await exerciseIdsByName([]);
    void ids;
    const { exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
    const ex = await exerciseIdsForTitles(['Incline Bench Press (Dumbbell)', 'Lat Pulldown (Cable)']);
    const bench = ex.get('Incline Bench Press (Dumbbell)')!;
    const pulldown = ex.get('Lat Pulldown (Cable)')!;
    // As an older version copied it: Hevy's page order, warm-ups counted as working sets.
    const folderId = await saveLinkFolder(
      URL,
      'Jaipur',
      [
        { name: 'Pull 2', dayType: 'pull', exercises: [{ exerciseId: pulldown, sets: 5, repMin: 10, repMax: 20 }] },
        { name: 'Pull 1', dayType: 'pull', exercises: [{ exerciseId: pulldown, sets: 5, repMin: 10, repMax: 20 }] },
        { name: 'Push 2', dayType: 'push', exercises: [{ exerciseId: bench, sets: 5, repMin: 8, repMax: 15 }] },
        { name: 'Push 1', dayType: 'push', exercises: [{ exerciseId: bench, sets: 5, repMin: 8, repMax: 15 }] },
      ],
      { follow: true, todayISO: '2026-10-10' },
    );
    // The member set Push 2's rest themselves: that routine is theirs now.
    const push2 = days(folderId).find((d) => d.name === 'Push 2')!;
    const { updateRoutineExercise } = await import('@/tracker/db/routineRepo');
    await updateRoutineExercise(rowsOf(push2.id)[0].id, { restSec: 100 });

    const { repairLinkFolders } = await import('@/tracker/services/linkFolderRepair');
    expect(await repairLinkFolders()).toEqual({ rows: 3, reordered: 0 });
    // Review fix: Hevy's page order was never remembered for this older copy, so the member
    // may have arranged it — its order stays.
    expect(days(folderId).map((d) => d.name)).toEqual(['Pull 2', 'Pull 1', 'Push 2', 'Push 1']);
    const push1 = rowsOf(days(folderId).find((d) => d.name === 'Push 1')!.id)[0];
    expect([push1.target_sets, types(push1.sets_json)]).toEqual([3, ['warmup', 'warmup', 'normal', 'normal', 'normal']]);
    expect(rowsOf(push2.id)[0].target_sets).toBe(5); // untouched
    expect(await repairLinkFolders()).toEqual({ rows: 0, reordered: 0 });
  });

  /** A link folder copied WITH Hevy's page order remembered, in that order. */
  async function copiedInPageOrder(): Promise<string> {
    await importCsv(hevyCsv(['Push 1', 'Pull 1', 'Push 2', 'Pull 2'], 13));
    const { exerciseIdsForTitles } = await import('@/tracker/services/hevyImport');
    const ex = await exerciseIdsForTitles(['Incline Bench Press (Dumbbell)', 'Lat Pulldown (Cable)']);
    const bench = ex.get('Incline Bench Press (Dumbbell)')!;
    const pulldown = ex.get('Lat Pulldown (Cable)')!;
    const page = ['Pull 2', 'Pull 1', 'Push 2', 'Push 1'];
    const { saveImportedFolder } = await import('@/tracker/services/routineMerge');
    const { folderId } = await saveImportedFolder(
      null,
      'Jaipur',
      page.map((name) => ({
        name,
        dayType: name.startsWith('Push') ? ('push' as const) : ('pull' as const),
        exercises: [{ exerciseId: name.startsWith('Push') ? bench : pulldown, sets: 3, repMin: 8, repMax: 12 }],
      })),
      { fromLink: URL, pageOrder: page },
      { follow: true, todayISO: '2026-10-10' },
    );
    return folderId;
  }

  it('a folder still exactly as copied (in Hevy’s page order) is put in the real rotation', async () => {
    const folderId = await copiedInPageOrder();
    const { repairLinkFolders } = await import('@/tracker/services/linkFolderRepair');
    expect((await repairLinkFolders()).reordered).toBe(1);
    expect(days(folderId).map((d) => d.name)).toEqual(['Push 1', 'Pull 1', 'Push 2', 'Pull 2']);
  });

  it('a followed folder the member arranged themselves keeps their order', async () => {
    const folderId = await copiedInPageOrder();
    // The member moved Push 1 to the top.
    const ids = days(folderId).map((d) => d.id);
    const mine = [ids[3], ids[0], ids[1], ids[2]];
    mine.forEach((id, i) => db.raw.run('UPDATE plan_days SET day_order = ? WHERE id = ?', [i, id]));
    const before = days(folderId).map((d) => d.name);
    const { repairLinkFolders } = await import('@/tracker/services/linkFolderRepair');
    expect((await repairLinkFolders()).reordered).toBe(0);
    expect(days(folderId).map((d) => d.name)).toEqual(before);
  });
});

describe('IM-07: imported times are the time the member saw', () => {
  it('a new import stores the real moment; an older import (clock time as UTC) is moved once', async () => {
    const { result } = await importCsv(hevyCsv(['Push 1'], 1));
    expect(result.imported).toBe(1);
    expect(db.all<{ s: number }>('SELECT started_at AS s FROM workout_sessions')[0].s).toBe(new Date(2026, 5, 1, 18, 5).getTime());

    const { createSession } = await import('@/db/repos/workoutRepo');
    const { setMeta } = await import('@/db');
    await setMeta('import_clock_real_v1', '');
    const old = await createSession({ dateISO: '2026-07-07', dayType: 'push', notes: null, source: 'manual', startedAt: Date.UTC(2026, 6, 7, 21, 0), endedAt: Date.UTC(2026, 6, 7, 22, 0) });
    const live = await createSession({ dateISO: '2026-07-08', dayType: 'push', notes: null, source: 'manual', startedAt: new Date(2026, 6, 8, 7, 0).getTime() + 1, endedAt: null });
    const { repairImportedClockTimes } = await import('@/tracker/services/importClockRepair');
    await repairImportedClockTimes();
    const at = (id: string) => db.all<{ s: number; e: number | null }>('SELECT started_at AS s, ended_at AS e FROM workout_sessions WHERE id = ?', [id])[0];
    expect(at(old.id)).toEqual({ s: new Date(2026, 6, 7, 21, 0).getTime(), e: new Date(2026, 6, 7, 22, 0).getTime() });
    expect(at(live.id).s).toBe(new Date(2026, 6, 8, 7, 0).getTime() + 1);
  });
});

describe('IM-09: importing the same file again', () => {
  it('the preview knows every workout is already here; nothing is doubled', async () => {
    const csv = hevyCsv(['Push 1', 'Pull 1'], 6);
    await importCsv(csv);
    const again = await importCsv(csv);
    expect(again.preview.alreadyHere).toBe(6);
    expect(again.result.imported).toBe(0);
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions')[0].n).toBe(6);
  });
});

describe('IM-15: a name new to ForgeAI, matched by the member', () => {
  it('"Same as ForgeAI’s …" logs the sets on that exercise; no new exercise is made', async () => {
    const name = 'Seated Cable Row (Gym 2)';
    const extra = [`"Pull X","1 Sep 2026, 18:05","1 Sep 2026, 19:05","",${name},,"",0,normal,50,10,,,`];
    const csv = [HEAD, ...extra].join('\n');
    const { parseHevyBase64, previewImport } = await import('@/tracker/services/hevyImport');
    const preview = await previewImport(parseHevyBase64(Buffer.from(csv, 'utf8').toString('base64')));
    expect(preview.newExercises).toEqual([name]);
    const { suggestMatches, matchesFrom } = await import('@/tracker/services/importMatch');
    const [s] = await suggestMatches(preview.newExercises);
    expect(s.match?.name).toMatch(/Seated Cable Row/);
    const before = db.all<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')[0].n;
    const { result } = await importCsv(csv, 'merge', matchesFrom([s], new Set([name])));
    expect(result.createdExercises).toBe(0);
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')[0].n).toBe(before);
    expect(db.all<{ id: string }>('SELECT exercise_id AS id FROM set_entries')[0].id).toBe(s.match!.id);
  });
});

describe('IM-15: names ForgeAI knows under another name are shown with both', () => {
  it('a Hevy title that lands on a library exercise of another name', async () => {
    const { renamedIn } = await import('@/tracker/services/hevyImport');
    const r = await renamedIn(['Chest Fly (Machine)', 'Made Up Thing']);
    expect(r).toHaveLength(1);
    expect(r[0].from).toBe('Chest Fly (Machine)');
    expect(r[0].to).not.toBe('Chest Fly (Machine)');
  });
});
