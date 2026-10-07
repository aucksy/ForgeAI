/**
 * Phase 3, third adversarial review ("will it work on a real phone") — one test per fix.
 * Each one fails on the code before the fix (commit 949d272) and passes after it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { keyboardRoom } from '@/lib/keyboardRoom';
import { launchFor, pendingAsset, takePendingPick, type PickStore } from '@/lib/pendingPick';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { photoEraseSteps, wipePhotoStorage } from '@/tracker/services/progressPhotos';
import type { RecordEventRow } from '@/tracker/services/recordsService';
import { sceneTexts } from '@/tracker/share/scene';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { workoutShareInput } from '@/tracker/share/workoutInput';

// ------------------------------------------------------------------ records after editing a workout
/**
 * A stand-in for the app's SQLite connection, keeping the rules that matter here as real
 * SQLite has them (checked with node:sqlite, 7 Oct 2026): a new row takes MAX(rowid) + 1, so
 * deleting the newest workout's sets and inserting the same number back hands out the SAME
 * row numbers; total_changes() counts every row written on this connection; PRAGMA
 * data_version moves when another connection commits (demo data, erase and Drive restore
 * write on a connection of their own).
 */
const sqlite = vi.hoisted(() => {
  interface SetRow {
    rowid: number;
    session_id: string;
    exercise_id: string;
    weight_kg: number;
    reps: number;
    is_warmup: number;
    load_mode: string | null;
  }
  const state = {
    sets: [] as SetRow[],
    sessions: [
      { id: 's1', date_iso: '2026-09-01', started_at: 1 },
      { id: 's2', date_iso: '2026-09-05', started_at: 2 },
    ],
    changes: 0,
    dataVersion: 1,
    setReads: 0,
  };
  const insert = (sessionId: string, weightKg: number, reps: number) => {
    const rowid = state.sets.reduce((m, s) => Math.max(m, s.rowid), 0) + 1;
    state.sets.push({ rowid, session_id: sessionId, exercise_id: 'x', weight_kg: weightKg, reps, is_warmup: 0, load_mode: null });
    state.changes += 1;
  };
  /** What `saveSessionEdits` does: every set of the workout out, the edited list back in. */
  const replaceSets = (sessionId: string, sets: [number, number][]) => {
    const before = state.sets.length;
    state.sets = state.sets.filter((s) => s.session_id !== sessionId);
    state.changes += before - state.sets.length;
    for (const [w, r] of sets) insert(sessionId, w, r);
  };
  const reset = () => {
    state.sets = [];
    state.changes = 0;
    state.dataVersion = 1;
    state.setReads = 0;
    insert('s1', 50, 5);
    insert('s2', 600, 5); // a typo: meant 60
  };
  return { state, insert, replaceSets, reset };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    getFirstAsync: async (sql: string) => {
      const s = sqlite.state;
      if (/PRAGMA data_version/i.test(sql)) return { data_version: s.dataVersion };
      if (!sql.includes('sets_n')) return null;
      const row: Record<string, string | number | null> = {
        sets_n: s.sets.length,
        sets_max: s.sets.reduce((m, x) => Math.max(m, x.rowid), 0),
        sets_modes: s.sets.filter((x) => x.load_mode != null).length,
        ws_n: s.sessions.length,
        ws_starts: s.sessions.reduce((n, x) => n + x.started_at, 0),
        ws_days: s.sessions.reduce((n, x) => n + Number(x.date_iso.replace(/-/g, '')), 0),
        ws_max: 's2',
        bw_n: 0,
        bw_sum: 0,
        ex: 'x:Squat::::',
      };
      if (sql.includes('total_changes()')) row.changes = s.changes;
      return row;
    },
    getAllAsync: async (sql: string) => {
      const s = sqlite.state;
      if (sql.includes('FROM set_entries se')) {
        s.setReads += 1;
        return s.sets
          .filter((x) => x.is_warmup === 0)
          .map((x) => {
            const ws = s.sessions.find((w) => w.id === x.session_id)!;
            return { ...x, duration_sec: null, distance_m: null, date_iso: ws.date_iso, started_at: ws.started_at };
          })
          .sort((a, b) => a.started_at - b.started_at || a.rowid - b.rowid);
      }
      if (sql.includes('FROM exercises')) {
        return [
          {
            id: 'x', name: 'Squat', aliases: '[]', muscle_group: 'quads', secondary_muscles: '[]', equipment: 'barbell', is_compound: 1,
            increment_kg: 2.5, catalog_key: null, log_type: null, load_mode: null, bw_share: null, muscles: null, media_uri: null, media_type: null,
          },
        ];
      }
      return [];
    },
  }),
}));

describe('records follow an edited workout at once', () => {
  beforeEach(async () => {
    const { forgetRecordCache } = await import('@/tracker/services/recordsService');
    forgetRecordCache();
    sqlite.reset();
  });

  const heaviest = async () => {
    const { getRecordEvents } = await import('@/tracker/services/recordsService');
    return (await getRecordEvents()).filter((e) => e.kind === 'weight').map((e) => e.value);
  };

  it('fixing a typo in the newest workout changes the record (before: Progress kept "600 kg" until a restart)', async () => {
    expect(await heaviest()).toEqual([600]);
    // History → edit the newest workout → 600 kg becomes 55 kg. Same number of sets, so
    // SQLite hands the new rows the same row numbers and the counts do not move.
    sqlite.replaceSets('s2', [[55, 5]]);
    expect(await heaviest()).toEqual([55]);
    const { getPriorRecordBests } = await import('@/tracker/services/recordsService');
    // The next workout's record pop-up measures against 55 kg too.
    expect((await getPriorRecordBests('x'))?.by?.weight).toBe(55);
  });

  it('a change written on another connection (Drive restore, demo data) is seen too', async () => {
    expect(await heaviest()).toEqual([600]);
    sqlite.state.sets[1].weight_kg = 70; // same rows, new numbers, written elsewhere
    sqlite.state.dataVersion += 1;
    expect(await heaviest()).toEqual([70]);
  });

  it('a visit with nothing written in between still reads no sets', async () => {
    await heaviest();
    await heaviest();
    expect(sqlite.state.setReads).toBe(1);
  });
});

// ------------------------------------------------------------------ the share picture keeps body weight private
type Kind = SessionSummaryData['kinds'][string];
const PULL_UP: Kind = { logType: 'reps', loadMode: 'one', distUnit: 'km', catalogKey: 'pull_up', bwShare: 1 };
const WEIGHTED_PULL_UP: Kind = { logType: 'weighted', loadMode: 'one', distUnit: 'km', catalogKey: 'weighted_pull_up', bwShare: 1 };
const BENCH: Kind = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', catalogKey: 'barbell_bench_press', bwShare: 0 };

/** A finished workout as the finish screen reads it; `totalVolumeKg` counts body weight, as the app does. */
function summaryOf(groups: { id: string; name: string; kind: Kind; sets: [number, number][] }[], totalVolumeKg: number, records: RecordEventRow[] = []): SessionSummaryData {
  let k = 0;
  return {
    session: {
      id: 'w1',
      dateISO: '2026-10-07',
      startedAt: 0,
      endedAt: 1_800_000,
      dayType: 'pull',
      notes: null,
      source: 'manual',
      exercises: groups.map((g) => ({
        exercise: { id: g.id, name: g.name, aliases: [], muscleGroup: 'back', secondaryMuscles: [], equipment: 'bodyweight', isCompound: true, incrementKg: 2.5 },
        sets: g.sets.map(([weightKg, reps], i) => ({ id: `s${++k}`, sessionId: 'w1', exerciseId: g.id, setNumber: i + 1, weightKg, reps, isWarmup: false })),
        volumeKg: 0,
      })),
      totalVolumeKg,
    },
    durationSec: 1800,
    totalVolumeKg,
    workingSetCount: groups.reduce((n, g) => n + g.sets.length, 0),
    exerciseCount: groups.length,
    prs: [],
    records,
    muscles: [{ muscle: 'lats', sets: groups.reduce((n, g) => n + g.sets.length, 0) }],
    setMeta: {},
    kinds: Object.fromEntries(groups.map((g) => [g.id, g.kind])),
    needsBodyweight: false,
  };
}

const texts = (data: SessionSummaryData) => sceneTexts(workoutShareScene(workoutShareInput(data)));

describe('the workout picture never gives away body weight', () => {
  it('a pull-up-only workout shows its reps, not kilos that divide back to body weight (before: "KG LIFTED 3,104" with 40 reps = 77.6 kg)', () => {
    // 4 × 10 pull-ups at 77.6 kg body weight: the app's volume is 3,104 kg.
    const t = texts(summaryOf([{ id: 'pu', name: 'Pull Up', kind: PULL_UP, sets: [[0, 10], [0, 10], [0, 10], [0, 10]] }], 3104));
    expect(t.join(' | ')).not.toContain('3,104');
    expect(t).not.toContain('KG LIFTED');
    expect(t[t.indexOf('REPS') + 1]).toBe('40');
  });

  it('a mixed workout counts only the weight on the bar (before: bench + body weight on the pull-ups)', () => {
    // Bench 2 × 100 kg × 10 = 2,000 kg; pull-ups 2 × 10 at 80 kg body weight = 1,600 kg.
    const t = texts(
      summaryOf(
        [
          { id: 'bp', name: 'Barbell Bench Press', kind: BENCH, sets: [[100, 10], [100, 10]] },
          { id: 'pu', name: 'Pull Up', kind: PULL_UP, sets: [[0, 10], [0, 10]] },
        ],
        3600,
      ),
    );
    expect(t[t.indexOf('KG LIFTED') + 1]).toBe('2,000');
    expect(t.join(' | ')).not.toContain('3,600');
  });

  it('a weighted pull-up keeps its belt weight; its "best session" in kilos stays off the picture but still counts (before: "3,600 kg")', () => {
    // 3 × 12 at +10 kg on a 90 kg body weight: (90 + 10) × 12 × 3 = 3,600 kg, the app's volume
    // and the best session alike; the belt alone is 10 × 12 × 3 = 360 kg.
    const rec = (kind: RecordEventRow['kind'], value: number): RecordEventRow => ({
      kind,
      value,
      previous: 0,
      sessionId: 'w1',
      dateISO: '2026-10-07',
      startedAt: 0,
      set: kind === 'best_session' ? null : { weightKg: 10, reps: 12 },
      exerciseId: 'wpu',
      exerciseName: 'Weighted Pull Up',
      info: { logType: 'weighted', loadMode: 'one', distUnit: 'km' },
    });
    const t = texts(summaryOf([{ id: 'wpu', name: 'Weighted Pull Up', kind: WEIGHTED_PULL_UP, sets: [[10, 12], [10, 12], [10, 12]] }], 3600, [rec('weight', 10), rec('best_session', 3600)]));
    const all = t.join(' | ');
    expect(all).not.toContain('3,600');
    expect(t[t.indexOf('KG LIFTED') + 1]).toBe('360');
    expect(all).toContain('Heaviest weight +10 kg');
    expect(t[t.indexOf('RECORDS') + 1]).toBe('2');
    expect(all).toContain('and 1 more');
  });
});

// ------------------------------------------------------------------ the keyboard never hides what you type
const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
function filesEnding(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesEnding(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
const tsxFiles = (dir: string) => filesEnding(dir, '.tsx');
const tsFiles = (dir: string) => filesEnding(dir, '.ts');

describe('every screen makes room for the keyboard', () => {
  it('the room is the part of the screen under the keyboard (before: none — the keyboard covered the lower boxes)', () => {
    // An 800 dp screen with the keyboard's top edge at 500: 300 dp covered.
    expect(keyboardRoom(800, { screenY: 500, height: 276 })).toBe(300);
    expect(keyboardRoom(800, null)).toBe(0);
    // Edge not reported: fall back to the keyboard's height; never negative; nothing before layout.
    expect(keyboardRoom(800, { screenY: 0, height: 276 })).toBe(276);
    expect(keyboardRoom(800, { screenY: 900, height: 276 })).toBe(0);
    expect(keyboardRoom(0, { screenY: 500, height: 276 })).toBe(0);
  });

  it('the app root wraps every screen and the welcome form; no screen adds a second room on Android', () => {
    expect(read('app/_layout.tsx').match(/<KeyboardRoom>/g)?.length).toBe(2);
    // One handler: every other KeyboardAvoidingView leaves Android to the root (the chat
    // screen padded on Android too, on top of nothing else — before the root existed).
    const kavs = tsxFiles(SRC).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/<KeyboardAvoidingView[^>]*>/g)].map((m) => [relative(SRC, f), m[0]] as const),
    );
    expect(kavs.length).toBeGreaterThanOrEqual(3);
    for (const [file, tag] of kavs) expect(tag, file).toMatch(/behavior=\{Platform\.OS === 'ios' \? '\w+' : undefined\}/);
    // The tab bar (and the workout bar inside it) steps aside while the member types.
    expect(read('tracker/components/TrackerTabBar.tsx')).toMatch(/useKeyboardFrame\(\) != null/);
  });
});

// ------------------------------------------------------------------ a photo Android's restart left behind
function memoryStore(): PickStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}
const shot = { canceled: false as const, assets: [{ uri: 'file:///cache/ImagePicker/a.jpg', width: 1080, height: 1440 }] };

describe('a picture taken while Android closed the app is kept', () => {
  it('goes back to the screen that asked for it, once (before: it was lost)', async () => {
    const store = memoryStore();
    // Progress photos opens the camera; Android closes ForgeAI, so the launch never returns.
    void launchFor('progress-photo', () => new Promise<never>(() => undefined), store);
    await Promise.resolve();
    const pending = async () => shot;
    expect(await takePendingPick('chat-photo', { store, pending })).toBeNull();
    expect((await takePendingPick('progress-photo', { store, pending }))?.uri).toBe('file:///cache/ImagePicker/a.jpg');
    expect(await takePendingPick('progress-photo', { store, pending })).toBeNull();
  });

  it('a pick that came back normally is never added a second time; a cancelled or failed one gives nothing', async () => {
    const store = memoryStore();
    await launchFor('progress-photo', async () => shot, store);
    expect(await takePendingPick('progress-photo', { store, pending: async () => shot })).toBeNull();
    expect(pendingAsset({ canceled: true, assets: null })).toBeNull();
    expect(pendingAsset({ code: 'ERR_FAILED', message: 'no' })).toBeNull();
    expect(pendingAsset(null)).toBeNull();
  });

  it('every place that opens the camera or the gallery notes who asked, and takes its picture back', () => {
    const files = [...tsxFiles(SRC), ...tsFiles(SRC)];
    let launches = 0;
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/ImagePicker\.(launchImageLibraryAsync|launchCameraAsync)\(/g)) {
        launches += 1;
        expect(text.slice(Math.max(0, (m.index ?? 0) - 80), m.index), relative(SRC, f)).toMatch(/launchFor\('(progress-photo|exercise-media|chat-photo)', \(\) =>\s*$/);
      }
    }
    expect(launches).toBe(5); // progress photo ×2, exercise photo/video ×2, chat meal photo
    expect(read('app/photos/index.tsx')).toContain('keepPendingPhoto()');
    expect(read('app/library/new.tsx')).toContain('keepPendingMedia()');
    expect(read('app/(tabs)/coach.tsx')).toContain("takePendingPick('chat-photo')");
  });
});

// ------------------------------------------------------------------ erase leaves no pictures behind
describe('"Erase all data" leaves no pictures behind', () => {
  it("also deletes the picker's temporary copies and the share pictures (before: only progress-photos/)", async () => {
    const deleted: string[] = [];
    const files = { documentDirectory: 'file:///app/files/', cacheDirectory: 'file:///app/cache/', deleteAsync: async (uri: string) => void deleted.push(uri) };
    await wipePhotoStorage(photoEraseSteps(files, { clearDiskCache: async () => true, clearMemoryCache: async () => true }));
    expect(deleted).toEqual(['file:///app/files/progress-photos/', 'file:///app/cache/ImagePicker/', 'file:///app/cache/share/']);
    // The share sheet writes into that same folder.
    expect(read('tracker/components/ShareSheet.tsx')).toMatch(/cacheDirectory \?\? ''\}\$\{SHARE_FOLDER\}/);
  });
});
