/**
 * F148 (the trainer's video on an exercise) and F151 (the gym's workout of the day): reading the gym's answers
 * (pure), the plans' sync leaving the "Workouts of the day" folder alone, and the read hiding everything on a
 * server without 0051.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let answer: unknown = null;
let calls = 0;
vi.mock('@/shop/gymApi', () => ({
  apiGymWod: async () => {
    calls += 1;
    return answer;
  },
}));
// The start path (saving the folder, opening the workout) is not run here: kept out of the import.
vi.mock('@/tracker/services/todayStart', () => ({ startShownWorkout: async () => undefined }));
vi.mock('@/tracker/services/routineMerge', () => ({ saveImportedFolder: async () => ({ folderId: 'f', keptEdits: [] }) }));
vi.mock('@/tracker/services/plansService', () => ({ resolveSharedRoutines: async () => ({ routines: [], added: [], skipped: [] }) }));
vi.mock('@/tracker/services/workoutFolders', () => ({ forgetWorkoutFolders: () => undefined }));
const saved: unknown[] = [];
vi.mock('@/tracker/services/trainerVideos', () => ({
  saveTrainerVideos: async (source: string, list: unknown[]) => {
    saved.push([source, list]);
  },
}));

import { gymPlanFromRow } from '@/shop/gymPlans';
import { gymWodAnswerFromRow, gymWodFromRow, wodHeading, wodSubLine } from '@/shop/gymWod';
import { parseVideoList, videoFor, videosInRoutines, videoUrlOk } from '@/shop/trainerVideo';
import { gymSyncSteps, WOD_PLAN_ID } from '@/tracker/lib/gymPlanSteps';
import { readGymWod, resetGymWodForTests } from '@/tracker/services/gymWodSync';

const ex = { name: 'Bench Press', catalogKey: 'bench_press', logType: 'weight_reps', sets: 3, repMin: 6, repMax: 10, primary: ['chest'] };
const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple', joinCode: 'IRON01', name: 'Asha' };
const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('trainer video links (F148)', () => {
  it('opens only https YouTube links', () => {
    expect(videoUrlOk('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(videoUrlOk('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(true);
    expect(videoUrlOk('https://m.youtube.com/shorts/abc')).toBe(true);
    for (const bad of ['http://youtu.be/abc', 'https://vimeo.com/1', 'https://youtube.com.evil.in/x', 'https://youtube.com@evil.in/x', 'intent://youtu.be/x', 'https://youtu.be/a b', 42, null]) {
      expect(videoUrlOk(bad), String(bad)).toBe(false);
    }
  });

  it('reads the good links from raw routines and finds them by key, then by name', () => {
    const list = videosInRoutines(
      [
        { exercises: [{ ...ex, videoUrl: 'https://youtu.be/bench1' }, { name: 'Lunge walk', catalogKey: null, videoUrl: 'https://youtu.be/lunge1' }] },
        { exercises: [{ ...ex, name: 'Squat', catalogKey: 'squat', videoUrl: 'https://evil.in/x' }, 'junk'] },
        'junk',
      ],
      'Ravi',
    );
    expect(list.map((v) => v.url)).toEqual(['https://youtu.be/bench1', 'https://youtu.be/lunge1']);
    expect(videoFor(list, { catalogKey: 'bench_press', name: 'Anything' })?.url).toBe('https://youtu.be/bench1');
    expect(videoFor(list, { catalogKey: null, name: '  lunge   WALK ' })?.byName).toBe('Ravi');
    expect(videoFor(list, { catalogKey: 'squat', name: 'Squat' })).toBeNull();
    expect(videosInRoutines(null, null)).toEqual([]);
  });

  it('a saved list read back drops anything broken', () => {
    const good = { catalogKey: 'squat', name: 'Squat', url: 'https://youtu.be/sq', byName: null };
    expect(parseVideoList(JSON.stringify([good, { ...good, url: 'https://evil.in' }, 7]))).toEqual([good]);
    expect(parseVideoList('{not json')).toEqual([]);
    expect(parseVideoList(null)).toEqual([]);
  });

  it("a plan's links come with it from the gym", () => {
    const p = gymPlanFromRow({ id: 'wp', version: 1, name: 'P', byName: 'Ravi', routines: [{ name: 'Push', dayType: 'push', exercises: [{ ...ex, videoUrl: 'https://youtu.be/b' }] }] })!;
    expect(p.videos).toEqual([{ catalogKey: 'bench_press', name: 'Bench Press', url: 'https://youtu.be/b', byName: 'Ravi' }]);
    // The routine itself is the routine file's (the link is not in it).
    expect('videoUrl' in p.file.routines[0].exercises[0]).toBe(false);
  });
});

describe('workout of the day (F151): reading the answer', () => {
  const wod = (over: Record<string, unknown> = {}) => ({ day: '2026-11-03', name: 'Leg day', dayType: 'legs', exercises: [ex, { ...ex, name: 'Squat', catalogKey: 'squat', videoUrl: 'https://youtu.be/sq' }], note: ' Warm up ', byName: 'Ravi', updatedAt: 99, ...over });

  it('reads the workout through the routine-file reader', () => {
    const w = gymWodFromRow(wod())!;
    expect(w).toMatchObject({ day: '2026-11-03', name: 'Leg day', note: 'Warm up', byName: 'Ravi', updatedAt: 99 });
    expect(w.file.routines).toHaveLength(1);
    expect(w.file.routines[0]).toMatchObject({ name: 'Leg day', dayType: 'legs' });
    expect(w.file.routines[0].exercises.map((e) => e.name)).toEqual(['Bench Press', 'Squat']);
    expect(w.videos.map((v) => v.url)).toEqual(['https://youtu.be/sq']);
    expect(wodSubLine(w)).toBe('2 exercises · from Ravi');
    expect(wodSubLine({ ...w, byName: null, file: { ...w.file, routines: [{ ...w.file.routines[0], exercises: [w.file.routines[0].exercises[0]] }] } })).toBe('1 exercise');
    expect(wodHeading("RAM'S FITNESS")).toBe("Today at RAM'S FITNESS");
  });

  it('skips what it cannot read', () => {
    expect(gymWodFromRow(wod({ exercises: [] }))).toBeNull();
    expect(gymWodFromRow(wod({ day: 'today' }))).toBeNull();
    expect(gymWodFromRow(wod({ name: '' }))).toBeNull();
    expect(gymWodFromRow('junk')).toBeNull();
  });

  it("shows only the server's today, and reads the see-the-desk answers", () => {
    const a = gymWodAnswerFromRow({ ok: true, gymId: 'g1', gymName: 'G', today: '2026-11-03', wod: wod() });
    expect(a?.ok && a.wod?.name).toBe('Leg day');
    const old = gymWodAnswerFromRow({ ok: true, gymId: 'g1', gymName: 'G', today: '2026-11-04', wod: wod() });
    expect(old).toMatchObject({ ok: true, wod: null });
    expect(gymWodAnswerFromRow({ ok: true, gymId: 'g1', gymName: 'G', today: '2026-11-03', wod: null })).toMatchObject({ ok: true, wod: null });
    expect(gymWodAnswerFromRow({ error: 'NO_PHONE', gymName: 'G' })).toEqual({ ok: false, problem: 'NO_PHONE', gymName: 'G' });
    expect(gymWodAnswerFromRow({ ok: true, gymId: 'g1' })).toBeNull();
  });
});

describe('the plans sync leaves "Workouts of the day" alone', () => {
  it('never relabels it as no longer sent', () => {
    const wodFolder = { id: 'f-wod', name: 'Workouts of the day', settings: { fromGym: { gymId: 'g1', planId: WOD_PLAN_ID, version: 5, gymName: 'G', byName: null } } };
    expect(gymSyncSteps('g1', [], [wodFolder])).toEqual([]);
    // Leaving the gym still relabels it (a folder from another gym).
    expect(gymSyncSteps('g2', [], [wodFolder]).map((s) => s.kind)).toEqual(['gone']);
  });
});

describe('reading the workout of the day', () => {
  beforeEach(() => {
    resetGymWodForTests();
    calls = 0;
    saved.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it("today's workout is shown, its links kept, and not asked again for 10 minutes", async () => {
    const data = gymWodAnswerFromRow({ ok: true, gymId: 'g1', gymName: 'G', today: todayStr(), wod: { day: todayStr(), name: 'Legs', exercises: [{ ...ex, videoUrl: 'https://youtu.be/b' }], updatedAt: 1 } });
    answer = { ok: true, data };
    const a = await readGymWod(LINK, { now: 1000 });
    expect(a?.wod?.name).toBe('Legs');
    expect(saved).toEqual([['wod', [{ catalogKey: 'bench_press', name: 'Bench Press', url: 'https://youtu.be/b', byName: null }]]]);
    await readGymWod(LINK, { now: 2000 });
    expect(calls).toBe(1);
    await readGymWod(LINK, { now: 1000 + 10 * 60 * 1000 + 1 });
    expect(calls).toBe(2);
  });

  it('a server without 0051: nothing shown, and never asked again', async () => {
    answer = { ok: false, missing: true };
    expect(await readGymWod(LINK)).toBeNull();
    expect(await readGymWod(LINK, { force: true })).toBeNull();
    expect(calls).toBe(1);
    expect(saved).toEqual([]);
  });

  it('offline: the last answer stays; a see-the-desk answer shows nothing', async () => {
    answer = { ok: true, data: gymWodAnswerFromRow({ ok: true, gymId: 'g1', gymName: 'G', today: todayStr(), wod: null }) };
    expect(await readGymWod(LINK, { now: 1 })).toMatchObject({ ok: true, wod: null });
    expect(saved).toEqual([['wod', []]]);
    answer = { ok: false, error: { kind: 'offline' } };
    expect(await readGymWod(LINK, { force: true, now: 2 })).toMatchObject({ ok: true });
    answer = { ok: true, data: { ok: false, problem: 'NO_PHONE', gymName: 'G' } };
    expect(await readGymWod(LINK, { force: true, now: 3 })).toBeNull();
    expect(await readGymWod(null)).toBeNull();
  });
});
