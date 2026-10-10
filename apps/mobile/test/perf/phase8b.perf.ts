/**
 * Audit Phase 8, packet B — import / export with years of data, OLD vs NEW in the same run.
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts phase8b
 *
 * Same synthetic files as phase8.perf.ts (5 years = 1,300 workouts / 31,869 rows; 50,003 rows).
 * Each pair runs on the same machine load, one after the other:
 *  - base64 decode: the old indexOf-per-character code (kept here) vs the lookup table;
 *  - import 5y and 50k (Merge, fresh phone), and Replace 5y over 5y: `writePath: 'legacy'` (the
 *    old one-row-at-a-time path, kept as the reference) vs the fast path;
 *  - export: one SELECT + one 4 MB string vs a page of workouts at a time;
 *  - safety copy: the copy + a full JSON.parse for its ids vs reading only the ids' part.
 * Peak memory = the most heap seen above a garbage-collected baseline at sampling points: during
 * the import at every 25th progress tick (garbage included); for export and the safety copy
 * after a collection (only what is still held — the rows, the text) at each page / step.
 * sql.js on a desktop is not the phone: read ms as relative; statements are what scale.
 */
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from './syntheticHistory';

vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/cloud/sync', () => ({ maybeSync: async () => undefined }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc') as () => void;

const MEMBER: OnboardingInput = {
  name: 'Perf Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 32,
  heightCm: 178,
  gymName: 'Test Gym',
  bodyWeightKg: 82,
  targets: { calorieTarget: 2800, proteinTargetG: 160, carbsTargetG: 330, fatTargetG: 80 },
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** The old decode loop (bytes only — the part the lookup table replaced). */
function oldBytes(base64: string): number {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let n = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = ((buf << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (buf >> bits) & 0xff;
    }
  }
  return n;
}

/** The old base64Utf8, verbatim. */
function oldUtf8Full(base64: string): string | null {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let n = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = ((buf << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (buf >> bits) & 0xff;
    }
  }
  let out = '';
  let chunk: number[] = [];
  const flush = (): void => {
    out += String.fromCharCode(...chunk);
    chunk = [];
  };
  for (let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0; i < n; i++) {
    const b = bytes[i];
    let cp = 0xfffd;
    let need = 0;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0) [cp, need] = [b & 0x1f, 1];
    else if (b >= 0xe0 && b < 0xf0) [cp, need] = [b & 0x0f, 2];
    else if (b >= 0xf0 && b < 0xf5) [cp, need] = [b & 0x07, 3];
    let ok = true;
    for (let k = 1; k <= need; k++) {
      const c = i + k < n ? bytes[i + k] : 0;
      if ((c & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (c & 0x3f);
    }
    if (need > 0 && ok) i += need;
    else if (b >= 0x80) return null;
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else chunk.push(cp);
    if (chunk.length > 8000) flush();
  }
  flush();
  return out;
}

interface Counter {
  n: number;
}
function count(db: RealDb): Counter {
  const c = { n: 0 };
  const target = db as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync']) {
    const orig = target[m].bind(db);
    target[m] = (...a: unknown[]) => {
      c.n += 1;
      return orig(...a);
    };
  }
  return c;
}

class Peak {
  private base: number;
  peak = 0;
  constructor() {
    gc();
    this.base = process.memoryUsage().heapUsed;
  }
  /** `live`: collect garbage first, so only what is still referenced counts. */
  sample(live = false): void {
    if (live) gc();
    this.peak = Math.max(this.peak, process.memoryUsage().heapUsed - this.base);
  }
  get mb(): number {
    return Math.round((this.peak / 1024 / 1024) * 10) / 10;
  }
}

const rows: Record<string, unknown>[] = [];
function log(r: Record<string, unknown>): void {
  rows.push(r);
  // eslint-disable-next-line no-console
  console.log(`[perf8b] ${JSON.stringify(r)}`);
}

const b64 = (csv: string): string => Buffer.from(csv, 'utf8').toString('base64');

async function freshPhone(): Promise<RealDb> {
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  return db;
}

async function timedImport(db: RealDb, label: string, base64: string, mode: 'merge' | 'replace', writePath: 'fast' | 'legacy'): Promise<void> {
  const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
  const parsed = parseHevyBase64(base64);
  const c = count(db);
  const peak = new Peak();
  let firstTickMs = -1;
  let last = performance.now();
  let maxGap = 0;
  let ticks = 0;
  const t0 = performance.now();
  let deleteDoneMs = -1;
  let deleteTicks = 0;
  const res = await runImport(parsed, {
    mode,
    writePath,
    onDeleteProgress: (d, total) => {
      deleteTicks += 1;
      if (d === total) deleteDoneMs = performance.now() - t0;
    },
    onProgress: () => {
      const now = performance.now();
      if (firstTickMs < 0) firstTickMs = now - t0;
      maxGap = Math.max(maxGap, now - last);
      last = now;
      ticks += 1;
      if (ticks % 25 === 0) peak.sample();
    },
  });
  const ms = performance.now() - t0;
  peak.sample();
  log({
    step: `${label} (${writePath})`,
    ms: Math.round(ms),
    statements: c.n,
    peakHeapMB: peak.mb,
    firstProgressMs: Math.round(firstTickMs),
    ...(mode === 'replace' ? { deleteDoneMs: Math.round(deleteDoneMs), deleteProgressTicks: deleteTicks } : {}),
    longestGapMs: Math.round(maxGap),
    imported: res.imported,
    sets: res.setsInserted,
    replaced: res.replacedSessionIds?.length ?? 0,
  });
}

describe('Phase 8 packet B — import / export, old vs new', () => {
  it('measures', async () => {
    const hist = generateHistory({ workouts: 1300 });
    const big = generateHistory({ workouts: 1, minRows: 50_000, seed: 7 });
    const base5 = b64(hist.csv);
    const base50 = b64(big.csv);

    // ---------------------------------------------------------- base64
    {
      const { base64Utf8 } = await import('@/tracker/services/hevyImport');
      for (const [label, b] of [['5y', base5], ['50k', base50]] as const) {
        let t = performance.now();
        const n = oldBytes(b);
        const oldBytesMs = performance.now() - t;
        t = performance.now();
        const oldText = oldUtf8Full(b);
        const oldMs = performance.now() - t;
        t = performance.now();
        const text = base64Utf8(b);
        const newMs = performance.now() - t;
        expect(text?.length).toBeGreaterThan(n / 2);
        expect(text).toBe(oldText);
        log({ step: `base64 → text ${label} (${(b.length / 1048576).toFixed(1)} MB)`, oldMs: Math.round(oldMs), newMs: Math.round(newMs), oldBytesLoopMs: Math.round(oldBytesMs) });
      }
    }

    // ---------------------------------------------------------- import 5y, 50k, Replace
    for (const path of ['legacy', 'fast'] as const) {
      let db = await freshPhone();
      await timedImport(db, 'import 5y merge', base5, 'merge', path);
      // Replace 5y over 5y (the same phone, restarted).
      db = await bootRealApp({ db, startup: false });
      {
        const { useOnboarding } = await import('@/onboarding/store/onboardingStore');
        await useOnboarding.getState().start();
      }
      await timedImport(db, 'Replace 5y over 5y', base5, 'replace', path);
      db = await freshPhone();
      await timedImport(db, 'import 50k merge', base50, 'merge', path);
    }

    // ---------------------------------------------------------- export + safety copy on 5 years
    const db = await freshPhone();
    {
      const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
      await runImport(parseHevyBase64(base5), { mode: 'merge' });
    }
    {
      const exp = await import('@/tracker/services/historyExport');
      let c = count(db);
      let peak = new Peak();
      let t = performance.now();
      const all = await exp.readHistoryRows();
      peak.sample(true);
      const csv = exp.hevyCsvFromRows(all, 'metric');
      peak.sample(true);
      const oldMs = performance.now() - t;
      const oldStatements = c.n;
      const oldPeak = peak.mb;
      const oldLen = csv.length;
      // New: pages handed to a sink (the file append on the phone).
      c = count(db);
      peak = new Peak();
      let bytes = 0;
      const parts: string[] = [];
      t = performance.now();
      await exp.writeHistoryCsv('metric', async (chunk) => {
        bytes += chunk.length;
        peak.sample(true);
        parts.push(chunk.length > 0 ? chunk.slice(0, 0) : ''); // keep nothing, as a file append
      });
      const newMs = performance.now() - t;
      peak.sample(true);
      expect(bytes).toBe(oldLen);
      log({ step: 'export 5y (Save my history)', oldMs: Math.round(oldMs), newMs: Math.round(newMs), oldStatements, newStatements: c.n, oldPeakHeapMB: oldPeak, newPeakHeapMB: peak.mb, csvMB: Math.round((oldLen / 1048576) * 10) / 10 });
    }
    {
      const { exportSnapshot } = await import('@/cloud/snapshot');
      const { takeSafetyCopy } = await import('@/onboarding/db/importSafety');
      let peak = new Peak();
      let t = performance.now();
      const json = await exportSnapshot();
      peak.sample(true);
      const sessions = (JSON.parse(json) as { tables?: Record<string, { id?: unknown }[]> }).tables?.workout_sessions ?? [];
      const ids = sessions.map((s) => String(s.id));
      peak.sample(true);
      const oldMs = performance.now() - t;
      const oldPeak = peak.mb;
      peak = new Peak();
      t = performance.now();
      const copy = await takeSafetyCopy();
      peak.sample(true);
      const newMs = performance.now() - t;
      expect(copy.sessionIds).toEqual(ids);
      log({ step: 'safety copy 5y (before Replace)', oldMs: Math.round(oldMs), newMs: Math.round(newMs), oldPeakHeapMB: oldPeak, newPeakHeapMB: peak.mb, copyMB: Math.round((json.length / 1048576) * 10) / 10 });
    }
    // eslint-disable-next-line no-console
    console.log(`\n[perf8b] summary\n${rows.map((r) => JSON.stringify(r)).join('\n')}`);
  });
});
