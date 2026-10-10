/**
 * Audit Phase 5 — review fixes on the Progress tab, the body tools and the photo backup.
 * Each test failed before its fix.
 *
 *  1. Turning the photo backup off while a copy run is going never leaves a (full-size) copy
 *     in the folder Google backs up; one run at a time; the card always shows the stored choice.
 *  2. Logging for an earlier day that already has an entry asks first.
 *  3. "Replace" in the fix sheet can be undone: the replaced entry AND the edited one's old
 *     day and value come back.
 *  4. A photo is decoded once, every native image is released, and a photo that fails to
 *     shrink twice is skipped (remembered, not retried every launch).
 *  6. Every weigh-in can be reached (the history list pages instead of stopping at 60).
 *  7. Two Progress readers share one records read.
 *  8. The lift row's sparkline and the lift chart plot the same number.
 *  9. "This week" is compared with the usual week up to the same weekday; shrunk backup copies
 *     are named .jpg.
 * 10. The copy run remembers the photo that didn't fit; the card says when copies failed.
 * 11. The muscle sheet's total is the sum of its rows; a zoomed photo can't be dragged away;
 *     several deletes in a row are all undone by one Undo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { replaceMeasurementsQuestion, replaceWeighInQuestion, shouldAskReplace } from '@/tracker/engine/bodyCheck';
import { historyPage } from '@/tracker/engine/bodyHistory';
import { muscleBreakdown } from '@/tracker/engine/bodyMap';
import { liftPoints, liftTrendPoints, usualByText, weekVsUsual, type ProgressSession, type ProgressSet } from '@/tracker/engine/progressTop';
import { clampPan } from '@/tracker/components/zoomMath';
import { backupNames, MB, photoBackupLine } from '@/tracker/services/photoBackupPlan';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8');

// ------------------------------------------------------------------ a phone folder with timing control
interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * A stand-in phone: files (path → bytes) and folders. Like the phone: a copy creates the folder
 * it writes into (expo's copyAsync does), the shrink's final move does NOT (it fails when the
 * folder is gone).
 */
function phone(files: Record<string, number>, dirs: string[] = []) {
  const map = new Map(Object.entries(files));
  const folders = new Set(dirs);
  const parent = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
  const calls = { shrink: [] as string[], copy: [] as string[] };
  const fs = {
    map,
    folders,
    calls,
    docDir: 'file:///docs/',
    size: async (uri: string) => map.get(uri) ?? null,
    isDir: async (uri: string) => folders.has(uri),
    copy: async (from: string, to: string) => {
      calls.copy.push(from);
      const s = map.get(from);
      if (s == null) throw new Error(`no file ${from}`);
      folders.add(parent(to));
      map.set(to, s);
    },
    remove: async (uri: string) => {
      for (const k of [...map.keys()]) if (k === uri || k.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) map.delete(k);
      for (const d of [...folders]) if (d === uri || d.startsWith(uri)) folders.delete(d);
    },
    mkdir: async (dir: string) => {
      folders.add(dir);
    },
    list: async (dir: string) =>
      [...map.keys()].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/')).map((k) => k.slice(dir.length)),
  };
  return fs;
}

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

describe('1 / 4 / 9 / 10: the photo backup — real SQL', () => {
  let db: RealDb;
  beforeEach(async () => {
    db = await bootRealApp();
  });
  const addRow = (id: string, date: string, created: number, ext = 'jpg') =>
    db.raw.run('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [id, date, `file:///docs/progress-photos/${id}.${ext}`, created]);
  const backupFiles = (fs: ReturnType<typeof phone>) => [...fs.map.keys()].filter((k) => k.includes('/photo-backup/'));

  it('1: "off" while a copy is being shrunk: the run stops, nothing (and nothing full-size) is left in the backed-up folder', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    addRow('a', '2026-10-01', 1);
    addRow('b', '2026-09-01', 2);
    const fs = phone({
      'file:///docs/SQLite/forgeai.db': 2 * MB,
      'file:///docs/progress-photos/a.jpg': 5 * MB,
      'file:///docs/progress-photos/b.jpg': 5 * MB,
    });
    const gate = deferred();
    const started = deferred();
    const shrink = async (from: string, to: string) => {
      fs.calls.shrink.push(from);
      started.resolve();
      await gate.promise;
      // The move into the backup folder fails when the folder is gone (FileSystem.moveAsync).
      if (!fs.folders.has('file:///docs/photo-backup/')) throw new Error('no such folder');
      fs.map.set(to, 0.2 * MB);
    };
    await pb.setPhotoBackupOn(true, fs);
    const run = pb.syncPhotoBackup({ ...fs, shrink });
    await started.promise;
    const off = pb.setPhotoBackupOn(false, { ...fs, shrink });
    // Let "off" get as far as it can before the shrink finishes.
    await new Promise((r) => setTimeout(r, 20));
    gate.resolve();
    await Promise.all([run, off]);
    expect(await pb.isPhotoBackupOn()).toBe(false);
    expect(backupFiles(fs)).toEqual([]);
    expect(fs.folders.has('file:///docs/photo-backup/')).toBe(false);
    expect(fs.calls.copy).toEqual([]); // never an as-is (full-size) copy
    expect(fs.calls.shrink).toEqual(['file:///docs/progress-photos/a.jpg']); // b was never started
  });

  it('1: one copy run at a time — a second run waits for the first instead of copying alongside it', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    addRow('a', '2026-10-01', 1);
    const fs = phone({ 'file:///docs/SQLite/forgeai.db': 2 * MB, 'file:///docs/progress-photos/a.jpg': 5 * MB });
    let inside = 0;
    let most = 0;
    const shrink = async (_from: string, to: string) => {
      inside += 1;
      most = Math.max(most, inside);
      await new Promise((r) => setTimeout(r, 10));
      fs.map.set(to, 0.2 * MB);
      inside -= 1;
    };
    await pb.setPhotoBackupOn(true, fs);
    fs.map.delete('file:///docs/photo-backup/a.jpg');
    const [x, y] = await Promise.all([pb.syncPhotoBackup({ ...fs, shrink }), pb.syncPhotoBackup({ ...fs, shrink })]);
    expect(most).toBe(1);
    expect(x.kept).toBe(1);
    expect(y.kept).toBe(1);
  });

  it('1: at start-up with the backup off, a leftover backup folder is deleted', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    const fs = phone({ 'file:///docs/photo-backup/a.jpg': 4 * MB }, ['file:///docs/photo-backup/']);
    await pb.photoBackupAtStart(fs);
    expect(backupFiles(fs)).toEqual([]);
    expect(fs.folders.has('file:///docs/photo-backup/')).toBe(false);
  });

  it('1: the card shows the stored choice after a toggle, even when the copy run then fails', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    addRow('a', '2026-10-01', 1);
    const fs = phone({ 'file:///docs/progress-photos/a.jpg': 5 * MB });
    const broken = { ...fs, size: async () => { throw new Error('disk error'); } };
    const r = await pb.togglePhotoBackup(true, broken);
    expect(await pb.isPhotoBackupOn()).toBe(true);
    expect(r.on).toBe(true); // before: the card flipped back to "off" while the setting stayed on
    expect(r.state).toBeNull();
    expect(r.failed).toBe(true);
    const off = await pb.togglePhotoBackup(false, fs);
    expect(off).toEqual({ on: false, state: null, failed: false });
  });

  it('4: a photo that fails to shrink is never copied full-size; after two failures it is skipped, not retried every launch', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    addRow('x', '2026-10-01', 1);
    addRow('y', '2026-09-01', 2);
    const fs = phone({
      'file:///docs/SQLite/forgeai.db': 2 * MB,
      'file:///docs/progress-photos/x.jpg': 3 * MB,
      'file:///docs/progress-photos/y.jpg': 3 * MB,
    });
    const shrink = async (from: string, to: string) => {
      fs.calls.shrink.push(from);
      if (from.endsWith('x.jpg')) throw new Error('no decoder');
      fs.map.set(to, 0.2 * MB);
    };
    await pb.setPhotoBackupOn(true, fs);
    let s = await pb.syncPhotoBackup({ ...fs, shrink });
    expect(s).toMatchObject({ kept: 1, total: 2, failed: 1 });
    expect(fs.calls.copy).toEqual([]);
    await pb.syncPhotoBackup({ ...fs, shrink });
    s = await pb.syncPhotoBackup({ ...fs, shrink });
    expect(s).toMatchObject({ kept: 1, total: 2, failed: 1 });
    expect(fs.calls.shrink.filter((f) => f.endsWith('x.jpg'))).toHaveLength(2);
    expect(photoBackupLine(s)).toBe('Backing up 1 of your 2 photos (0.2 MB). 1 photo couldn’t be copied.');
  });

  it('10: the photo that does not fit is shrunk once, not again on every run', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    for (const [i, id] of ['a', 'b', 'c'].entries()) addRow(id, `2026-0${9 - i}-01`, i);
    const files: Record<string, number> = { 'file:///docs/SQLite/forgeai.db': 2 * MB };
    for (const id of ['a', 'b', 'c']) files[`file:///docs/progress-photos/${id}.jpg`] = 9 * MB;
    const fs = phone(files);
    const shrink = async (from: string, to: string) => {
      fs.calls.shrink.push(from);
      fs.map.set(to, 6 * MB); // 15 MB budget: two fit, the third does not
    };
    await pb.setPhotoBackupOn(true, fs);
    const first = await pb.syncPhotoBackup({ ...fs, shrink });
    expect(first).toMatchObject({ kept: 2, total: 3, failed: 0 });
    expect(fs.calls.shrink).toHaveLength(3);
    const again = await pb.syncPhotoBackup({ ...fs, shrink });
    expect(again).toMatchObject({ kept: 2, total: 3, failed: 0 });
    expect(fs.calls.shrink).toHaveLength(3); // before: 4 — the third was shrunk, measured and deleted again
  });

  it('9: a shrunk copy of a PNG is named .jpg; a relink points the row at a .jpg file', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    const { getProgressPhotos } = await import('@/tracker/services/progressPhotos');
    addRow('b', '2026-10-01', 1, 'png');
    const fs = phone({ 'file:///docs/SQLite/forgeai.db': 2 * MB, 'file:///docs/progress-photos/b.png': 4 * MB });
    const shrink = async (_from: string, to: string) => {
      fs.map.set(to, 0.2 * MB);
    };
    await pb.setPhotoBackupOn(true, fs);
    await pb.syncPhotoBackup({ ...fs, shrink });
    expect(backupFiles(fs)).toEqual(['file:///docs/photo-backup/b.jpg']);
    // A fresh install: the photo folder is gone, the backup came back.
    fs.map.delete('file:///docs/progress-photos/b.png');
    expect(await pb.relinkPhotosFromBackup(fs)).toBe(1);
    expect((await getProgressPhotos())[0].uri).toBe('file:///docs/progress-photos/b.jpg');
    expect(fs.map.has('file:///docs/progress-photos/b.jpg')).toBe(true);
  });

  it('9: deleting a photo deletes its backup copy under either name', () => {
    expect(backupNames('b', 'file:///docs/progress-photos/b.png')).toEqual(['b.jpg', 'b.png']);
    expect(backupNames('a', 'file:///docs/progress-photos/a.jpg')).toEqual(['a.jpg']);
  });
});

describe('4: a photo is decoded once and every native image is released', () => {
  type Ctx = { source: unknown; resized: unknown; released: boolean; resize: (s: unknown) => Ctx; renderAsync: () => Promise<Ref>; release: () => void };
  type Ref = { width: number; height: number; released: boolean; saveAsync: () => Promise<{ uri: string }>; release: () => void };
  function fakeManipulator(width: number, height: number) {
    const ctxs: Ctx[] = [];
    const refs: Ref[] = [];
    const manipulate = (source: unknown): Ctx => {
      const ctx: Ctx = {
        source,
        resized: null,
        released: false,
        resize(s) {
          ctx.resized = s;
          return ctx;
        },
        async renderAsync() {
          const r = (ctx.resized ?? {}) as { width?: number; height?: number };
          const ref: Ref = {
            width: r.width ?? (r.height ? Math.round((width / height) * r.height) : width),
            height: r.height ?? (r.width ? Math.round((height / width) * r.width) : height),
            released: false,
            saveAsync: async () => ({ uri: 'file:///cache/out.jpg' }),
            release() {
              ref.released = true;
            },
          };
          refs.push(ref);
          return ref;
        },
        release() {
          ctx.released = true;
        },
      };
      ctxs.push(ctx);
      return ctx;
    };
    return { manipulate, ctxs, refs };
  }

  it('a 4000×3000 photo: the file is read once, the copy is 1080 wide, and everything is released', async () => {
    const { shrinkPhotoWith } = await import('@/tracker/services/photoBackup');
    const m = fakeManipulator(4000, 3000);
    const moved: string[] = [];
    await shrinkPhotoWith('file:///docs/progress-photos/a.jpg', 'file:///docs/photo-backup/a.jpg', {
      manipulate: m.manipulate as never,
      move: async (from, to) => {
        moved.push(`${from}->${to}`);
      },
      remove: async () => undefined,
    });
    expect(m.ctxs.filter((c) => typeof c.source === 'string')).toHaveLength(1); // one decode of the file
    expect(m.refs[m.refs.length - 1].width).toBe(1080);
    expect(m.ctxs.every((c) => c.released)).toBe(true);
    expect(m.refs.every((r) => r.released)).toBe(true);
    expect(moved).toEqual(['file:///cache/out.jpg->file:///docs/photo-backup/a.jpg']);
  });

  it('a failed move still releases everything and removes the stray cache file', async () => {
    const { shrinkPhotoWith } = await import('@/tracker/services/photoBackup');
    const m = fakeManipulator(800, 600);
    const removed: string[] = [];
    await expect(
      shrinkPhotoWith('file:///a.jpg', 'file:///gone/a.jpg', {
        manipulate: m.manipulate as never,
        move: async () => {
          throw new Error('no folder');
        },
        remove: async (u) => {
          removed.push(u);
        },
      }),
    ).rejects.toThrow('no folder');
    expect(m.ctxs.every((c) => c.released)).toBe(true);
    expect(m.refs.every((r) => r.released)).toBe(true);
    expect(removed).toEqual(['file:///cache/out.jpg']);
  });
});

describe('10: the backup line says when copies failed', () => {
  it('names failures, and older photos only when some did not fit', () => {
    expect(photoBackupLine({ kept: 40, total: 45, bytes: 8 * MB, failed: 2 })).toBe(
      'Backing up 40 of your 45 photos (8 MB). 2 photos couldn’t be copied; older ones stay on this phone only.',
    );
    expect(photoBackupLine({ kept: 0, total: 1, bytes: 0, failed: 1 })).toBe('No photos backed up: 1 photo couldn’t be copied.');
    expect(photoBackupLine({ kept: 42, total: 60, bytes: 15 * MB, failed: 0 })).toBe('Backing up your newest 42 photos (15 MB). Older ones stay on this phone only.');
  });
});

// ------------------------------------------------------------------ 2: ask before replacing an earlier day
describe('2: logging for an earlier day that already has an entry asks first', () => {
  it('asks only for an earlier day that has an entry', () => {
    expect(shouldAskReplace('2026-10-03', '2026-10-10', { weightKg: 76.2 })).toBe(true);
    expect(shouldAskReplace('2026-10-03', '2026-10-10', undefined)).toBe(false);
    expect(shouldAskReplace('2026-10-10', '2026-10-10', { weightKg: 76.2 })).toBe(false); // today's re-weigh
  });
  it('names the value and the day', () => {
    expect(replaceWeighInQuestion({ dateISO: '2026-10-06', weightKg: 76.2 }, 'metric', '2026-10-10')).toBe('Replace 76.2 kg on Tue, 6 Oct?');
    expect(replaceMeasurementsQuestion(['Waist 82 cm'], '2026-10-06', '2026-10-10')).toBe('Replace Waist 82 cm on Tue, 6 Oct?');
    expect(replaceMeasurementsQuestion(['Waist 82 cm', 'Chest 100 cm', 'Hips 95 cm'], '2025-10-06', '2026-10-10')).toBe(
      'Replace Waist 82 cm, Chest 100 cm and Hips 95 cm on Mon, 6 Oct 2025?',
    );
  });
  it('[source-text check] both log screens ask before saving over an earlier day', () => {
    expect(src('app/bodyweight.tsx')).toContain('replaceWeighInQuestion(');
    expect(src('app/measurements/log.tsx')).toContain('replaceMeasurementsQuestion(');
    expect(src('app/measurements/log.tsx')).toContain('askConfirm(');
  });
});

// ------------------------------------------------------------------ 3 / 11: undo a replace, undo several
describe('3 / 11: Undo after a replace, and after several deletes — real SQL', () => {
  beforeEach(async () => {
    const db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    db.raw.run('DELETE FROM body_weight');
  });

  it('3: undoing a replace brings back the replaced weigh-in AND the edited one\'s old day and value', async () => {
    const q = await import('@/db/queuedWrites');
    const body = await import('@/tracker/db/bodyEntries');
    const user = await import('@/db/repos/userRepo');
    await q.logBodyWeight('2026-10-01', 77);
    const b = await q.logBodyWeight('2026-10-08', 76);
    const before = (await user.getBodyWeightHistory()).map((x) => [x.id, x.dateISO, x.weightKg]);
    const out = await body.editBodyWeight(b.id, { dateISO: '2026-10-01', weightKg: 75 });
    expect(out.replaced?.weightKg).toBe(77);
    await body.undoBodyWeight([{ kind: 'edited', before: b, replaced: out.replaced }]);
    expect((await user.getBodyWeightHistory()).map((x) => [x.id, x.dateISO, x.weightKg])).toEqual(before);
  });

  it('3: the same for a measurement', async () => {
    const m = await import('@/tracker/db/measurementRepo');
    const body = await import('@/tracker/db/bodyEntries');
    await m.logMeasurements('2026-10-01', { waist: 82 });
    await m.logMeasurements('2026-10-08', { waist: 80 });
    const all = await m.getMeasurements();
    const moved = all.find((x) => x.value === 80)!;
    const out = await body.editMeasurement(moved.id, { dateISO: '2026-10-01', value: 79 });
    expect(out.replaced?.value).toBe(82);
    await body.undoMeasurements([{ kind: 'edited', before: moved, replaced: out.replaced }]);
    expect(await m.getMeasurements()).toEqual(all);
  });

  it('11: two deletes in a row — one Undo brings both back', async () => {
    const q = await import('@/db/queuedWrites');
    const body = await import('@/tracker/db/bodyEntries');
    const user = await import('@/db/repos/userRepo');
    const a = await q.logBodyWeight('2026-10-01', 77);
    const b = await q.logBodyWeight('2026-10-02', 76.5);
    await body.deleteBodyWeight(a.id);
    await body.deleteBodyWeight(b.id);
    await body.undoBodyWeight([
      { kind: 'deleted', entry: a },
      { kind: 'deleted', entry: b },
    ]);
    expect((await user.getBodyWeightHistory()).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('[source-text check] both screens keep every undoable change, not just the last', () => {
    for (const p of ['app/bodyweight.tsx', 'app/measurements/index.tsx']) {
      const s = src(p);
      expect(s, p).toContain('setUndo((cur) => [...cur,');
      expect(s, p).not.toContain('setDeleted(');
    }
  });
});

// ------------------------------------------------------------------ 6: every weigh-in reachable
describe('6: the weigh-in history pages instead of stopping at the newest 60', () => {
  const h = Array.from({ length: 150 }, (_, i) => ({ id: `w${i}`, dateISO: `d${String(i).padStart(3, '0')}`, weightKg: 70 }));
  it('newest first, a page at a time, with how many are left', () => {
    const p1 = historyPage(h, 1);
    expect(p1.rows).toHaveLength(60);
    expect(p1.rows[0].id).toBe('w149');
    expect(p1.more).toBe(90);
    const p3 = historyPage(h, 3);
    expect(p3.rows).toHaveLength(150);
    expect(p3.rows[149].id).toBe('w0');
    expect(p3.more).toBe(0);
  });
  it('[source-text check] the screen offers the older ones', () => {
    const s = src('app/bodyweight.tsx');
    expect(s).not.toContain('.slice(0, 60)');
    expect(s).toContain('historyPage(');
  });
});

// ------------------------------------------------------------------ 7: one records read for two readers
describe('7: two readers of every record share one read', () => {
  it('two at once: the working sets are read once', async () => {
    const db = await bootRealApp();
    const rs = await import('@/tracker/services/recordsService');
    const spy = vi.spyOn(db, 'getAllAsync');
    await Promise.all([rs.getRecordsByExercise(), rs.getRecordsByExercise()]);
    const reads = spy.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('FROM set_entries se JOIN workout_sessions ws'));
    expect(reads).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ 8 / 9: the Progress numbers
const BENCH = { id: 'bench', name: 'Barbell Bench Press', logType: 'weight_reps' as const };
const infos = new Map([[BENCH.id, BENCH]]);
let n = 0;
function workout(dateISO: string, sets: [number, number][], easy = false): { s: ProgressSession; sets: ProgressSet[] } {
  const id = `w${++n}`;
  return { s: { id, dateISO, easy }, sets: sets.map(([weightKg, reps]) => ({ sessionId: id, dateISO, easy, exerciseId: 'bench', weightKg, reps, isWarmup: false })) };
}

describe('8: the sparkline plots what the chart plots — heaviest weight per workout, easy weeks out', () => {
  it('heaviest weight, including a workout of only high-rep sets', () => {
    const ws = [workout('2026-10-01', [[100, 3], [90, 8]]), workout('2026-10-03', [[50, 15]]), workout('2026-10-05', [[120, 1]], true)];
    const series = liftPoints(ws.flatMap((w) => w.sets), infos).get('bench')!;
    expect(liftTrendPoints(series, 'metric')).toEqual([
      { x: '2026-10-01', y: 100 },
      { x: '2026-10-03', y: 50 },
    ]);
  });
  it('[source-text check] the lift rows use it and say the metric once', () => {
    const s = src('components/analytics/LiftsSection.tsx');
    expect(s).toContain('liftTrendPoints(');
    expect(s).toContain('Trend: heaviest weight per workout');
  });
});

describe('9: this week so far against the usual week up to the same day', () => {
  const TODAY = '2026-10-14'; // Wednesday
  const ws = [];
  for (const m of ['2026-09-21', '2026-09-28', '2026-10-05']) {
    ws.push(workout(m, [[80, 5]])); // Monday
    ws.push(workout(addDaysLocal(m, 3), [[80, 5], [80, 5]])); // Thursday
  }
  ws.push(workout('2026-10-12', [[82.5, 5]]));
  const input = { sessions: ws.map((w) => w.s), sets: ws.flatMap((w) => w.sets), infos, events: [], today: TODAY, firstWorkoutISO: '2026-09-21' };

  it('by Wednesday the usual is 1 workout and 1 set (before: the full week, 2 and 3)', () => {
    const w = weekVsUsual(input);
    expect(w.usual).toMatchObject({ workouts: 2, sets: 3 });
    expect(w.usualByNow).toEqual({ workouts: 1, sets: 1 });
    expect(usualByText(1, TODAY)).toBe('usually 1 by Wednesday');
    expect(usualByText(2, '2026-10-18')).toBe('usually 2'); // Sunday: the whole week
  });
  it('[source-text check] the card says "so far", the body map says "in the last 7 days"', () => {
    expect(src('components/analytics/WeekCard.tsx')).toContain('This week so far');
    expect(src('components/analytics/WeekCard.tsx')).toContain('usualByText(');
    const map = src('components/analytics/BodyMapSection.tsx');
    expect(map).not.toMatch(/this week/i);
    expect(map).toContain('in the last 7 days.');
  });
});

function addDaysLocal(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ 11: small things
describe('11: the muscle sheet, the zoomed photo', () => {
  it('the total is the sum of the rows as shown', () => {
    const groups = [
      { exerciseId: 'a', name: 'A', muscles: { primary: ['chest'], secondary: [] }, working: 3 },
      { exerciseId: 'b', name: 'B', muscles: { primary: ['triceps'], secondary: ['chest'] }, working: 3 },
    ];
    const d = muscleBreakdown(groups as never, 'chest');
    expect(d.sets).toBe(d.exercises.reduce((t, e) => t + e.sets, 0));
  });
  it('[source-text check] the sheet keeps its title while it slides away', () => {
    expect(src('components/analytics/MuscleSheet.tsx')).toContain('lastMuscle');
  });
  it('a zoomed photo stops at its edges', () => {
    // 2× on a 300-wide box: the picture is 600 wide, so it can move 150 either way.
    expect(clampPan(400, 300, 2)).toBe(150);
    expect(clampPan(-400, 300, 2)).toBe(-150);
    expect(clampPan(40, 300, 2)).toBe(40);
    expect(clampPan(40, 300, 1)).toBe(0);
  });
});
