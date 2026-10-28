/**
 * R-170: exercise demo clips — the approved list (clips/clipManifest.ts) and the download-once
 * cache (clips/clipCache.ts), on an in-memory file system.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { createClipCache, RETRY_AFTER_MS, staleFiles, type ClipFs } from '@/tracker/clips/clipCache';
import { approvedInQueue, CLIP_BASE_URL, CLIP_VERSIONS, clipFor, hasClip } from '@/tracker/clips/clipManifest';

const QUEUE = resolve(__dirname, '../../../../tools/exercise-anim/QUEUE.md');

describe('the approved clip list', () => {
  it('matches the approved rows of tools/exercise-anim/QUEUE.md exactly (key and version)', () => {
    const approved = approvedInQueue(readFileSync(QUEUE, 'utf8'));
    expect(Object.keys(approved).length).toBeGreaterThan(0);
    expect({ ...CLIP_VERSIONS }).toEqual(approved);
  });

  it('every clip belongs to a real library exercise', () => {
    for (const key of Object.keys(CLIP_VERSIONS)) expect(catalogEntry(key)?.key, key).toBe(key);
  });

  it('reads QUEUE rows: only "approved (vN)" counts', () => {
    const md = [
      '| # | Key | Name | New equipment needed | Status |',
      '|---|---|---|---|---|',
      '| 1 | a_key | A | - | approved (v6) |',
      '| 2 | b_key | B | - | waiting for owner |',
      '| 3 | c_key | C | - | to do |',
      '| 4 | d_key | D | - | approved (v12) - new pose |',
    ].join('\r\n');
    expect(approvedInQueue(md)).toEqual({ a_key: 6, d_key: 12 });
  });

  it('builds the release file names and links from the key and version', () => {
    const f = clipFor('lateral_raise');
    expect(f).toEqual({
      key: 'lateral_raise',
      version: CLIP_VERSIONS.lateral_raise,
      clipName: `lateral_raise.v${CLIP_VERSIONS.lateral_raise}.webp`,
      clipUrl: `${CLIP_BASE_URL}lateral_raise.v${CLIP_VERSIONS.lateral_raise}.webp`,
      posterName: `lateral_raise.v${CLIP_VERSIONS.lateral_raise}.poster.webp`,
      posterUrl: `${CLIP_BASE_URL}lateral_raise.v${CLIP_VERSIONS.lateral_raise}.poster.webp`,
    });
    expect(CLIP_BASE_URL).toBe('https://github.com/aucksy/ForgeAI/releases/download/exercise-clips/');
  });

  it('an exercise without an approved clip has none (it looks as before)', () => {
    expect(clipFor('barbell_bench_press')).toBeNull();
    expect(clipFor(null)).toBeNull();
    expect(clipFor(undefined)).toBeNull();
    expect(clipFor('toString')).toBeNull();
    expect(hasClip('machine_lateral_raise')).toBe(false);
    expect(hasClip('incline_dumbbell_press')).toBe(true);
  });
});

/** In-memory file system; downloads answer from `remote` (missing = a failed download). */
function memFs(remote: Record<string, string>) {
  const files = new Map<string, string>();
  const calls = { downloads: [] as string[], removed: [] as string[] };
  let online = true;
  const fs: ClipFs = {
    dir: '/docs/exercise-clips/',
    exists: async (p) => (files.get(p) ?? '').length > 0,
    makeDir: async () => undefined,
    download: async (url, path) => {
      calls.downloads.push(url);
      if (!online) throw new Error('offline');
      const body = remote[url];
      if (body == null) throw new Error('download answered 404');
      files.set(path, body);
    },
    move: async (from, to) => {
      const body = files.get(from);
      if (body == null) throw new Error('no such file');
      files.delete(from);
      files.set(to, body);
    },
    remove: async (p) => {
      calls.removed.push(p);
      files.delete(p);
    },
    list: async (dir) => [...files.keys()].filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length)),
  };
  return { fs, files, calls, setOnline: (v: boolean) => (online = v) };
}

const lr = clipFor('lateral_raise')!;
const remoteFor = (f = lr) => ({ [f.clipUrl]: 'CLIP', [f.posterUrl]: 'POSTER' });

describe('the clip cache', () => {
  it('downloads once, then answers from the phone (offline too)', async () => {
    const m = memFs(remoteFor());
    const logs: string[] = [];
    const cache = createClipCache(m.fs, (msg) => logs.push(msg));
    expect(await cache.clip(lr)).toBe(`/docs/exercise-clips/${lr.clipName}`);
    expect(await cache.poster(lr)).toBe(`/docs/exercise-clips/${lr.posterName}`);
    m.setOnline(false);
    expect(await cache.clip(lr)).toBe(`/docs/exercise-clips/${lr.clipName}`);
    expect(m.calls.downloads).toEqual([lr.clipUrl, lr.posterUrl]);
    expect(logs).toEqual([]);
  });

  it('a second screen asking at the same time shares the one download', async () => {
    const m = memFs(remoteFor());
    const cache = createClipCache(m.fs, () => undefined);
    const [a, b] = await Promise.all([cache.clip(lr), cache.clip(lr)]);
    expect(a).toBe(b);
    expect(m.calls.downloads).toEqual([lr.clipUrl]);
  });

  it('downloads to a .part file and renames it only when complete', async () => {
    const m = memFs(remoteFor());
    const cache = createClipCache(m.fs, () => undefined);
    await cache.clip(lr);
    expect([...m.files.keys()]).toEqual([`/docs/exercise-clips/${lr.clipName}`]);
  });

  it('no internet: null, the error is logged, no half file is left, and it is not retried at once', async () => {
    const m = memFs(remoteFor());
    m.setOnline(false);
    const logs: string[] = [];
    let t = 1_000_000;
    const cache = createClipCache(m.fs, (msg) => logs.push(msg), () => t);
    expect(await cache.clip(lr)).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/could not be downloaded/);
    expect(m.files.size).toBe(0);
    // A minute later: no new try (one per exercise, not one per visit).
    t += 60_000;
    m.setOnline(true);
    expect(await cache.clip(lr)).toBeNull();
    expect(m.calls.downloads).toHaveLength(1);
    // After the wait: tried again, and it works.
    t += RETRY_AFTER_MS;
    expect(await cache.clip(lr)).toBe(`/docs/exercise-clips/${lr.clipName}`);
    expect(m.calls.downloads).toHaveLength(2);
  });

  it('a missing file on the release (404) answers null and is logged', async () => {
    const m = memFs({ [lr.posterUrl]: 'POSTER' });
    const logs: string[] = [];
    const cache = createClipCache(m.fs, (msg) => logs.push(msg));
    expect(await cache.clip(lr)).toBeNull();
    expect(await cache.poster(lr)).toBe(`/docs/exercise-clips/${lr.posterName}`);
    expect(logs).toHaveLength(1);
  });

  it('a new version replaces the old files of that exercise only', async () => {
    const m = memFs({});
    const dir = m.fs.dir;
    for (const n of ['lateral_raise.v5.webp', 'lateral_raise.v5.poster.webp', 'lateral_raise.v6.webp.part', 'incline_dumbbell_press.v6.webp', 'lateral_raise_x.v1.webp']) {
      m.files.set(dir + n, 'OLD');
    }
    const v6 = { ...lr, version: 6, clipName: 'lateral_raise.v6.webp', posterName: 'lateral_raise.v6.poster.webp' };
    const remote = { [v6.clipUrl]: 'NEW' };
    Object.assign(m.fs, {
      download: async (url: string, path: string) => {
        if (!remote[url]) throw new Error('404');
        m.files.set(path, remote[url]);
      },
    });
    const cache = createClipCache(m.fs, () => undefined);
    expect(await cache.clip(v6)).toBe(dir + 'lateral_raise.v6.webp');
    await new Promise((r) => setTimeout(r, 0));
    expect([...m.files.keys()].map((p) => p.slice(dir.length)).sort()).toEqual([
      'incline_dumbbell_press.v6.webp',
      'lateral_raise.v6.webp',
      'lateral_raise_x.v1.webp',
    ]);
  });

  it('staleFiles never touches another exercise whose key starts the same way', () => {
    expect(
      staleFiles(
        ['lateral_raise.v5.webp', 'lateral_raise.v6.webp', 'lateral_raise.v6.poster.webp', 'lateral_raise_machine.v1.webp', 'lateral_raise.vX.webp', 'notes.txt'],
        { ...lr, clipName: 'lateral_raise.v6.webp', posterName: 'lateral_raise.v6.poster.webp' },
      ),
    ).toEqual(['lateral_raise.v5.webp']);
  });
});

describe('the screens use it (source checks: the screens are device-only)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
  it('the exercise page shows the clip on Summary and How to; the member\'s own picture wins', () => {
    const page = read('src/app/exercise/[id].tsx');
    expect(page.match(/<ExerciseClip catalogKey=\{ex\.catalogKey\}[^>]*hidden=\{Boolean\(ex\.mediaUri\)\}/g)).toHaveLength(2);
  });
  it('the how-to sheet plays the clip, falling back to the credited drawings', () => {
    const sheet = read('src/tracker/components/ExerciseDemoSheet.tsx');
    expect(sheet).toMatch(/<ExerciseClip/);
    expect(sheet).toMatch(/fallback=\{[\s\S]*<FrameLoop[\s\S]*<DrawingCredit/);
  });
  it('reduce motion shows the still frame only, and the clip plays silently on a loop', () => {
    const clip = read('src/tracker/components/ExerciseClip.tsx');
    expect(clip).toMatch(/useReduceMotion\(\)/);
    expect(clip).toMatch(/useExerciseClip\([^)]*!reduced\)/);
    expect(clip).not.toMatch(/expo-video/);
  });
});
