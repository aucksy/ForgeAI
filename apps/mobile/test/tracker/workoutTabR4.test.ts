/**
 * Redesign R4 — the Workout tab's folders and routine cards (Hevy's layout): open/shut, the
 * "Following" / "Up next" / "Next" tags, the ⋯ menus, the moves that stand in for drag, where
 * "New routine" goes, the delete questions, the kept-read rule — and "Stop following" on REAL
 * SQL (the folder and its routines stay; no plan is followed any more).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  cleanOpenMap,
  deleteFolderQuestion,
  deleteRoutineQuestion,
  exerciseLine,
  folderA11y,
  folderMenu,
  folderTag,
  folderTitle,
  isFolderOpen,
  movedFolderOrder,
  movedRoutineOrder,
  moveTargets,
  newRoutineTarget,
  OPEN_MAP_MAX,
  prunedOpenMap,
  routineA11y,
  routineMenu,
  routineTag,
  type FolderLite,
  type RoutineLite,
} from '@/tracker/lib/workoutTab';
import { keepRead } from '@/tracker/services/workoutFolders';

import { bootRealApp } from '../helpers/realDb';

const ex = (name: string) => ({ exercise: { name } });
const routine = (id: string, names: string[] = []): RoutineLite => ({ id, name: id.toUpperCase(), exercises: names.map(ex) });
const folder = (id: string, routines: RoutineLite[], following = false): FolderLite => ({ id, name: `Folder ${id}`, following, routines });

const ppl = folder('ppl', [routine('push', ['Bench Press', 'Incline Dumbbell Press']), routine('pull', ['Lat Pulldown']), routine('legs')], true);
const bro = folder('bro', [routine('chest'), routine('back')]);
const jaipur = folder('jaipur', [routine('j1')]);
const all = [ppl, bro, jaipur];

describe('words', () => {
  it('folder title is "Name (count)" like Hevy', () => {
    expect(folderTitle(ppl)).toBe('Folder ppl (3)');
    expect(folderTitle(folder('e', []))).toBe('Folder e (0)');
  });

  it('the grey line lists the exercises in order, or says none yet', () => {
    expect(exerciseLine(ppl.routines[0])).toBe('Bench Press, Incline Dumbbell Press');
    expect(exerciseLine(ppl.routines[2])).toBe('No exercises yet');
  });

  it('screen reader names the folder, its count, open or shut, and its tag', () => {
    expect(folderA11y({ name: 'Push Pull Legs', routines: new Array(6).fill(routine('x')) }, true, null)).toBe('Push Pull Legs folder, 6 routines, open');
    expect(folderA11y({ name: 'Solo', routines: [routine('a')] }, false, 'Following')).toBe('Solo folder, 1 routine, shut, Following');
    expect(routineA11y(ppl.routines[1], 'Next')).toBe('PULL, next, Lat Pulldown');
    expect(routineA11y(ppl.routines[2], null)).toBe('LEGS, No exercises yet');
  });
});

describe('tags read the Up next answer only', () => {
  it('the followed folder says Following, whatever Up next says', () => {
    expect(folderTag(ppl, { folderId: 'ppl', nextId: 'pull' })).toBe('Following');
    expect(folderTag(ppl, { folderId: null, nextId: null })).toBe('Following');
  });

  it('otherwise the folder Up next comes from says Up next, the rest nothing', () => {
    expect(folderTag(bro, { folderId: 'bro', nextId: 'back' })).toBe('Up next');
    expect(folderTag(jaipur, { folderId: 'bro', nextId: 'back' })).toBeNull();
    expect(folderTag(bro, { folderId: null, nextId: null })).toBeNull();
  });

  it('exactly one routine carries Next: the one Up next names', () => {
    const up = { folderId: 'ppl', nextId: 'pull' };
    const tagged = all.flatMap((f) => f.routines).filter((r) => routineTag(r, up) === 'Next');
    expect(tagged.map((r) => r.id)).toEqual(['pull']);
    expect(all.flatMap((f) => f.routines).some((r) => routineTag(r, { folderId: null, nextId: null }))).toBe(false);
  });
});

describe('open / shut', () => {
  const up = { folderId: 'ppl', nextId: 'pull' };

  it('first time: the Up next (or followed) folder is open, the rest shut', () => {
    expect(isFolderOpen({}, ppl, up, 3)).toBe(true);
    expect(isFolderOpen({}, bro, up, 3)).toBe(false);
    expect(isFolderOpen({}, bro, { folderId: 'bro', nextId: 'back' }, 3)).toBe(true);
  });

  it('a lone folder is open', () => {
    expect(isFolderOpen({}, jaipur, { folderId: null, nextId: null }, 1)).toBe(true);
  });

  it("the member's own choice wins and is remembered both ways", () => {
    expect(isFolderOpen({ ppl: false }, ppl, up, 3)).toBe(false);
    expect(isFolderOpen({ bro: true }, bro, up, 3)).toBe(true);
  });

  it('a stored map is cleaned: only true/false, capped', () => {
    expect(cleanOpenMap(null)).toEqual({});
    expect(cleanOpenMap([true])).toEqual({});
    expect(cleanOpenMap({ a: true, b: 'yes', c: false, '': true })).toEqual({ a: true, c: false });
    const big: Record<string, boolean> = {};
    for (let i = 0; i < OPEN_MAP_MAX + 50; i++) big[`f${i}`] = true;
    expect(Object.keys(cleanOpenMap(big))).toHaveLength(OPEN_MAP_MAX);
  });

  it('deleted folders are forgotten', () => {
    expect(prunedOpenMap({ a: true, gone: false, b: false }, ['a', 'b'])).toEqual({ a: true, b: false });
  });
});

describe('moves (stand in for drag)', () => {
  it('folders: the followed one stays first and never moves', () => {
    expect(movedFolderOrder(all, 'ppl', 1)).toBeNull();
    expect(movedFolderOrder(all, 'ppl', -1)).toBeNull();
    // the first folder after the plan cannot go above it
    expect(movedFolderOrder(all, 'bro', -1)).toBeNull();
    expect(movedFolderOrder(all, 'bro', 1)).toEqual(['jaipur', 'bro']);
    expect(movedFolderOrder(all, 'jaipur', -1)).toEqual(['jaipur', 'bro']);
    expect(movedFolderOrder(all, 'jaipur', 1)).toBeNull();
    expect(movedFolderOrder(all, 'nope', 1)).toBeNull();
  });

  it('routines move up and down inside their folder', () => {
    expect(movedRoutineOrder(ppl.routines, 'pull', -1)).toEqual(['pull', 'push', 'legs']);
    expect(movedRoutineOrder(ppl.routines, 'pull', 1)).toEqual(['push', 'legs', 'pull']);
    expect(movedRoutineOrder(ppl.routines, 'push', -1)).toBeNull();
    expect(movedRoutineOrder(ppl.routines, 'legs', 1)).toBeNull();
  });

  it('a routine can move to every other folder', () => {
    expect(moveTargets(all, 'bro').map((f) => f.id)).toEqual(['ppl', 'jaipur']);
    expect(moveTargets([jaipur], 'jaipur')).toEqual([]);
  });
});

describe('New routine (RP-08: never into the plan by itself)', () => {
  it('no folder → My routines, made then', () => {
    expect(newRoutineTarget([])).toEqual({ kind: 'folder', folderId: null });
  });
  it('one folder not followed → straight in', () => {
    expect(newRoutineTarget([bro])).toEqual({ kind: 'folder', folderId: 'bro' });
  });
  it('one folder that is the plan → asks', () => {
    expect(newRoutineTarget([ppl])).toEqual({ kind: 'ask' });
  });
  it('two or more → asks which folder, as in Hevy', () => {
    expect(newRoutineTarget([bro, jaipur])).toEqual({ kind: 'ask' });
  });
});

describe('menus', () => {
  const labels = (xs: { label: string }[]) => xs.map((x) => x.label);

  it("the followed folder's ⋯: no moves, Stop following, Delete last", () => {
    const m = folderMenu({ ...ppl, easyOn: true }, all);
    expect(labels(m)).toEqual(['Rename folder', 'Add new routine', 'Share folder', 'Easy weeks…', 'Stop following', 'Delete folder']);
    expect(m.find((x) => x.action === 'easy')?.value).toBe('On');
    expect(m[m.length - 1].danger).toBe(true);
  });

  it("another folder's ⋯: the moves it can make, Follow this plan", () => {
    expect(labels(folderMenu({ ...bro, easyOn: false }, all))).toEqual([
      'Rename folder',
      'Add new routine',
      'Share folder',
      'Move folder down',
      'Easy weeks…',
      'Follow this plan',
      'Delete folder',
    ]);
    expect(labels(folderMenu({ ...jaipur, easyOn: false }, all))).toContain('Move folder up');
  });

  it('an empty folder has nothing to share', () => {
    expect(labels(folderMenu({ ...folder('e', []), easyOn: false }, [folder('e', [])]))).not.toContain('Share folder');
  });

  it("a routine's ⋯: Hevy's four plus the moves it can make", () => {
    expect(labels(routineMenu(ppl, 'push', all))).toEqual(['Share routine', 'Duplicate routine', 'Edit routine', 'Move down', 'Move to folder…', 'Delete routine']);
    expect(labels(routineMenu(ppl, 'pull', all))).toEqual([
      'Share routine',
      'Duplicate routine',
      'Edit routine',
      'Move up',
      'Move down',
      'Move to folder…',
      'Delete routine',
    ]);
    // one folder, one routine: no moves at all
    expect(labels(routineMenu(jaipur, 'j1', [jaipur]))).toEqual(['Share routine', 'Duplicate routine', 'Edit routine', 'Delete routine']);
  });
});

describe('delete questions', () => {
  it("Hevy's words, plus what happens to the routines", () => {
    expect(deleteFolderQuestion({ name: 'Push Pull Legs', following: false, routines: new Array(6).fill(routine('x')) })).toEqual({
      title: "Delete 'Push Pull Legs' folder?",
      body: "It'll be gone forever. Its 6 routines go too. Your workout history stays.",
    });
    expect(deleteFolderQuestion({ name: 'A', following: true, routines: [routine('x')] }).body).toBe(
      "It'll be gone forever. Its routine goes too. Your workout history stays. You stop following this plan.",
    );
    expect(deleteFolderQuestion({ name: 'E', following: false, routines: [] }).body).toContain('It has no routines.');
    expect(deleteRoutineQuestion({ name: 'Push 1' }).title).toBe("Delete 'Push 1'?");
  });

  it('calm words: no exclamation marks anywhere', () => {
    const texts = [
      ...folderMenu({ ...bro, easyOn: false }, all).map((x) => x.label),
      ...routineMenu(ppl, 'pull', all).map((x) => x.label),
      deleteFolderQuestion(ppl).title,
      deleteFolderQuestion(ppl).body,
      deleteRoutineQuestion(ppl.routines[0]).body,
    ];
    for (const t of texts) expect(t).not.toContain('!');
  });
});

describe('the tab keeps its read only while nothing was written', () => {
  it('same stamp before and after → kept; a write meanwhile or no stamp → read again', () => {
    expect(keepRead('1:10:3', '1:10:3')).toBe(true);
    expect(keepRead('1:10:3', '1:11:3')).toBe(false);
    expect(keepRead(null, null)).toBe(false);
    expect(keepRead('1:10:3', null)).toBe(false);
  });
});

describe('Stop following (real SQL)', () => {
  beforeEach(async () => {
    await bootRealApp();
  });

  it('the folder and its routines stay; no folder is the plan any more; Follow brings it back', async () => {
    const repo = await import('@/tracker/db/folderRepo');
    const routines = await import('@/tracker/db/routineRepo');
    const id = await repo.createFolder('Push Pull Legs');
    await routines.createRoutine({ name: 'Push 1', dayType: 'push', folderId: id });
    await routines.createRoutine({ name: 'Pull 1', dayType: 'pull', folderId: id });
    await repo.followFolder(id, '2026-10-11');
    expect((await repo.followedFolder())?.id).toBe(id);

    await repo.unfollowFolder(id);
    expect(await repo.followedFolder()).toBeNull();
    const after = (await repo.listFolders()).find((f) => f.id === id);
    expect(after?.following).toBe(false);
    expect(after?.routines.map((r) => r.name)).toEqual(['Push 1', 'Pull 1']);

    await repo.followFolder(id, '2026-10-12');
    expect((await repo.followedFolder())?.id).toBe(id);
  });

  it('moving a routine into another folder and reordering keep every routine once', async () => {
    const repo = await import('@/tracker/db/folderRepo');
    const routines = await import('@/tracker/db/routineRepo');
    const a = await repo.createFolder('A');
    const b = await repo.createFolder('B');
    const r1 = await routines.createRoutine({ name: 'One', dayType: 'full', folderId: a });
    const r2 = await routines.createRoutine({ name: 'Two', dayType: 'full', folderId: a });
    const r3 = await routines.createRoutine({ name: 'Three', dayType: 'full', folderId: b });

    const before = await repo.listFolders();
    const order = movedRoutineOrder(before.find((f) => f.id === a)!.routines, r2, -1);
    await routines.reorderRoutines(order!);
    await repo.moveRoutine(r1, b);

    const list = await repo.listFolders();
    expect(list.find((f) => f.id === a)?.routines.map((r) => r.id)).toEqual([r2]);
    expect(list.find((f) => f.id === b)?.routines.map((r) => r.id)).toEqual([r3, r1]);

    const folders = movedFolderOrder(list, b, -1);
    await repo.reorderFolders(folders!);
    const names = (await repo.listFolders()).filter((f) => f.id === a || f.id === b).map((f) => f.name);
    expect(names).toEqual(['B', 'A']);
  });
});
