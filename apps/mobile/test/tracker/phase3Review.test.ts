/**
 * Phase 3 adversarial review — one test per fix. Each one fails on the code before the fix
 * (commit 12b833a) and passes after it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exerciseRecords } from '@/tracker/engine/records';
import { emptyReportText, monthNote, timeText, totalsOf, yearNote, yearRowSub, type ReportSession } from '@/tracker/engine/reports';
import { liveRecordFlags, liveRecordHits, toastHit, type PriorBests } from '@/tracker/services/liveRecords';
import { flattenEvents } from '@/tracker/services/recordsService';
import { keepPhoto, photoDateISO, wipePhotoStorage } from '@/tracker/services/progressPhotos';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

let n = 0;
const set = (over: Partial<DraftSet>): DraftSet => ({ key: `k${++n}`, weightKg: null, reps: null, isWarmup: false, done: true, ...over });
const card = (exerciseId: string, sets: DraftSet[], bests: PriorBests) => ({ key: `c${++n}`, exerciseId, sets, bests, logType: 'weight_reps' as const, loadMode: 'one' as const });

describe('the same lift on two cards counts as one workout', () => {
  const bests: PriorBests = { weightKg: 95, e1rm: 110, by: { weight: 95, e1rm: 110, best_set: 600, best_session: 1500 } };

  it('a lighter set on the second card is not a "heaviest weight" (before: it was)', () => {
    const first = card('bench', [set({ weightKg: 100, reps: 5 })], bests);
    const later = set({ weightKg: 97.5, reps: 5 });
    const second = card('bench', [later], bests);
    expect(liveRecordFlags(second, [first]).get(later.key)).toBeUndefined();
    expect(toastHit([first, second], second.key, later.key)).toBeNull();
  });

  it('a best session split over two cards is announced where it passes the old best (before: never)', () => {
    const first = card('bench', [set({ weightKg: 90, reps: 5 }), set({ weightKg: 90, reps: 5 })], bests); // 900
    const a = set({ weightKg: 90, reps: 5 }); // 1,350
    const b = set({ weightKg: 90, reps: 5 }); // 1,800 > 1,500
    const second = card('bench', [a, b], bests);
    expect([...liveRecordHits(second, [first]).entries()].map(([k, h]) => [k, h.kind])).toEqual([[b.key, 'best_session']]);
  });
});

describe('the pop-up does not cheer a set that is already beaten', () => {
  it('ticking set 3 at 102.5 kg, then set 2 at 100 kg: no pop-up for 100 (before: "Heaviest weight 100 kg")', () => {
    const bests: PriorBests = { weightKg: 95, e1rm: 120, by: { weight: 95, e1rm: 120 } };
    const s2 = set({ weightKg: 100, reps: 5 });
    const s3 = set({ weightKg: 102.5, reps: 5 });
    const c = card('bench', [set({ weightKg: 60, reps: 5 }), s2, s3], bests);
    expect(toastHit([c], c.key, s3.key)?.kind).toBe('weight');
    expect(toastHit([c], c.key, s2.key)).toBeNull();
    // The medal still follows set order: set 2 did beat the old best when it is read in order.
    expect(liveRecordFlags(c).get(s2.key)).toBe('weight');
  });
});

describe('two workouts on one day list newest first', () => {
  it('the evening record sits above the morning one (before: below)', () => {
    const rule = { logType: 'weight_reps' as const, loadMode: 'one' as const, bwShare: 0 };
    const sessions = [
      { sessionId: 'old', dateISO: '2026-09-01', startedAt: 1, sets: [{ weightKg: 90, reps: 5 }] },
      { sessionId: 'am', dateISO: '2026-09-10', startedAt: 100, sets: [{ weightKg: 100, reps: 5 }] },
      { sessionId: 'pm', dateISO: '2026-09-10', startedAt: 200, sets: [{ weightKg: 102.5, reps: 5 }] },
    ];
    const info = { id: 'bench', name: 'Bench', ...rule, distUnit: 'km' } as never;
    const rows = flattenEvents(new Map([['bench', { info, records: exerciseRecords(sessions, rule, []) }]])).filter((r) => r.kind === 'weight');
    expect(rows.map((r) => r.sessionId)).toEqual(['pm', 'am']);
  });
});

describe('progress photos are private and dated right', () => {
  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] the photo screens never write a copy to the image disk cache (before: default disk cache)', () => {
    // Audit PG-18: the zoomable viewer moved into its own component; it is checked the same way.
    const screens = ['src/app/photos/index.tsx', 'src/app/photos/compare.tsx', 'src/tracker/components/ZoomImage.tsx'].map((f) => readFileSync(join(__dirname, '..', '..', f), 'utf8'));
    const images = screens.flatMap((s) => s.match(/<Image\b[^>]*>/g) ?? []);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const tag of images) expect(tag).toContain('cachePolicy="memory"');
  });

  it('a gallery photo takes the day it was taken (before: always today)', () => {
    expect(photoDateISO({ DateTimeOriginal: '2026:01:15 07:42:10' }, '2026-10-07')).toBe('2026-01-15');
    expect(photoDateISO({ DateTime: '2025:12:31 23:59:59' }, '2026-10-07')).toBe('2025-12-31');
    expect(photoDateISO({}, '2026-10-07')).toBe('2026-10-07');
    expect(photoDateISO(null, '2026-10-07')).toBe('2026-10-07');
    expect(photoDateISO({ DateTimeOriginal: '0000:00:00 00:00:00' }, '2026-10-07')).toBe('2026-10-07');
    // A camera clock set in the future is today.
    expect(photoDateISO({ DateTimeOriginal: '2031:05:05 10:00:00' }, '2026-10-07')).toBe('2026-10-07');
  });
});

describe('keeping a photo never loses it', () => {
  const deps = (log: string[], failInsert = false) => ({
    dir: 'file:///docs/progress-photos/',
    cacheDir: 'file:///cache/',
    mkdir: async () => {
      log.push('mkdir');
    },
    copy: async (from: string, to: string) => {
      log.push(`copy ${from} -> ${to}`);
    },
    remove: async (uri: string) => {
      log.push(`remove ${uri}`);
    },
    insert: async () => {
      if (failInsert) throw new Error('disk full');
      log.push('insert');
    },
    newId: () => 'p1',
    today: '2026-10-07',
    now: 1,
  });
  const asset = { uri: 'file:///cache/ImagePicker/a.jpg', exif: { DateTimeOriginal: '2026:01:15 07:00:00' } };

  it('removes the picker\'s copy only after the photo is saved', async () => {
    const log: string[] = [];
    const p = await keepPhoto(asset, deps(log));
    expect(p).toMatchObject({ id: 'p1', dateISO: '2026-01-15', uri: 'file:///docs/progress-photos/p1.jpg' });
    expect(log).toEqual(['mkdir', 'copy file:///cache/ImagePicker/a.jpg -> file:///docs/progress-photos/p1.jpg', 'insert', 'remove file:///cache/ImagePicker/a.jpg']);
  });

  it('a failed save keeps the picker\'s copy (before: both copies were gone)', async () => {
    const log: string[] = [];
    await expect(keepPhoto(asset, deps(log, true))).rejects.toThrow('disk full');
    expect(log).toContain('remove file:///docs/progress-photos/p1.jpg');
    expect(log).not.toContain('remove file:///cache/ImagePicker/a.jpg');
  });

  it('erase empties the photo folder AND the image caches, even when one step fails', async () => {
    const done: string[] = [];
    await wipePhotoStorage({
      removeFolder: async () => {
        throw new Error('already gone');
      },
      clearDisk: async () => done.push('disk'),
      clearMemory: async () => done.push('memory'),
    });
    expect(done).toEqual(['disk', 'memory']);
  });
});

describe('the reports say true things', () => {
  const s = (d: string, durationSec = 3600): ReportSession => ({ sessionId: d, dateISO: d, durationSec, volumeKg: 5000, sets: 20, exercises: [{ exerciseId: 'b', name: 'Bench Press', sets: 20 }] });

  it('a month still running gets no "X got no work" advice (before: it did)', () => {
    const sessions = ['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => s(d));
    const base = {
      month: '2026-10',
      complete: false,
      totals: totalsOf(sessions),
      previous: null,
      trainedDays: [],
      records: [],
      muscles: [{ muscle: 'chest' as const, sets: 60 }],
      topExercises: [],
      bodyweight: null,
    };
    expect(monthNote(base)).not.toMatch(/got no work|got only/);
    expect(monthNote({ ...base, complete: true })).toMatch(/got no work/);
  });

  it('time only covers the workouts that have one, and says so (before: read as the whole)', () => {
    const t = totalsOf([s('2026-10-01'), s('2026-10-02'), s('2026-10-03', 0)]);
    expect(t.timed).toBe(2);
    expect(timeText(t)).toBe('2h in 2 timed workouts');
    expect(timeText(totalsOf([s('2026-10-01')]))).toBe('1h');
    const note = yearNote({
      year: 2026,
      complete: false,
      totals: t,
      byMonth: [],
      busiest: null,
      topExercises: [],
      recordCount: 0,
      gain: null,
      longestStreakWeeks: 0,
      muscles: [],
      bodyweight: null,
    });
    expect(note).toContain('2 hours of timed workouts');
  });

  it('a finished year is not "this year", and an empty past month is not "will show here"', () => {
    expect(yearRowSub(150, false, 2026)).toBe('150 workouts in 2026');
    expect(yearRowSub(73, true, 2026)).toBe('73 workouts this year');
    expect(emptyReportText('month', true, 'August')).toEqual({ title: 'No workouts in August', body: 'Nothing was logged that month.' });
    expect(emptyReportText('year', false, '2026').body).toBe('Workouts you log this year will show here.');
  });
});

// ------------------------------------------------------------------ records kept between visits
const db = vi.hoisted(() => ({ version: 1, setReads: 0 }));
vi.mock('@/db', () => ({
  getDb: () => ({
    // Audit Phase 8: the training data's version (tracker schema v13's trigger-kept counter).
    getFirstAsync: async (sql: string) => (sql.includes('training_changes') ? { seq: db.version } : null),
    getAllAsync: async (sql: string) => {
      // What changed since: a body weight (everything is worked out again).
      if (sql.includes('FROM training_changes')) return [{ id: '#all' }];
      if (sql.includes('FROM set_entries se')) {
        db.setReads += 1;
        return [
          { session_id: 's1', exercise_id: 'x', weight_kg: 50, reps: 5, duration_sec: null, distance_m: null, load_mode: null, date_iso: '2026-09-01', started_at: 1 },
          { session_id: 's2', exercise_id: 'x', weight_kg: 60, reps: 5, duration_sec: null, distance_m: null, load_mode: null, date_iso: '2026-09-05', started_at: 2 },
        ];
      }
      if (sql.includes('FROM exercises')) {
        return [{ id: 'x', name: 'Squat', aliases: '[]', muscle_group: 'quads', secondary_muscles: '[]', equipment: 'barbell', is_compound: 1, increment_kg: 2.5, catalog_key: null, log_type: null, load_mode: null, bw_share: null, muscles: null, media_uri: null, media_type: null }];
      }
      return [];
    },
  }),
}));

describe('Progress keeps the records until the data changes', () => {
  beforeEach(async () => {
    const { forgetRecordCache } = await import('@/tracker/services/recordsService');
    forgetRecordCache();
    db.version = 1;
    db.setReads = 0;
  });

  it('a second visit with nothing new reads no sets (before: every visit read every set)', async () => {
    const { getRecordEvents, getPriorRecordBests } = await import('@/tracker/services/recordsService');
    expect((await getRecordEvents()).map((e) => e.kind)).toContain('weight');
    expect(db.setReads).toBe(1);
    await getRecordEvents();
    expect(db.setReads).toBe(1);
    // Starting a workout reuses them too.
    expect((await getPriorRecordBests('x'))?.by?.weight).toBe(60);
    expect(db.setReads).toBe(1);
    // New data: read again.
    db.version = 2;
    await getRecordEvents();
    expect(db.setReads).toBe(2);
  });
});
