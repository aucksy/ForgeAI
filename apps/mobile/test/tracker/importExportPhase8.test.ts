/**
 * Audit Phase 8 (fast import/export with years of data) — the parts that are not the write path:
 *  - base64: a 256-entry lookup table replaced `indexOf` per character. Every input reads exactly
 *    as before (padding, white space, line breaks, URL-safe letters, junk, BOM, emoji, bytes that
 *    are not UTF-8) — compared with the old code itself, kept here.
 *  - "Save my history" written a page of workouts at a time: the same bytes as the whole-file
 *    text, across page edges (two workouts that would write the same title and times stay apart),
 *    in kg and lb; the file gets the first page, then each next page appended.
 *  - The Replace safety copy reads its workout ids from just that part of the copy: the same ids
 *    as parsing it all, even with notes full of quotes, brackets and the key's own name.
 * Real SQLite; every file and workout is made up.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { edgeRows, hevyCsv, toB64 } from '../helpers/importEquivalence';
import { bootRealApp, type RealDb } from '../helpers/realDb';
import { generateHistory } from '../perf/syntheticHistory';

vi.setConfig({ testTimeout: 60_000 });

const files = vi.hoisted(() => ({
  writes: [] as { uri: string; text: string; append: boolean }[],
  listed: 0,
  /** The write (0 = the first) that fails; -1 = none. */
  failAt: -1,
  deleted: [] as string[],
}));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readDirectoryAsync: async () => {
    files.listed += 1;
    return [];
  },
  deleteAsync: async (uri: string) => {
    files.deleted.push(uri);
  },
  writeAsStringAsync: async (uri: string, text: string, o?: { append?: boolean }) => {
    if (files.failAt === files.writes.length) throw new Error('disk full');
    files.writes.push({ uri, text, append: o?.append === true });
  },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

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

const fixture = (name: string): string => readFileSync(join(__dirname, '..', '..', 'qa', 'fixtures', name), 'utf8');

// ---------------------------------------------------------------- the OLD base64 code, verbatim

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function oldUtf8(base64: string): string | null {
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
function oldLatin1(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  let buf = 0;
  let bits = 0;
  const chunk: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    buf = ((buf << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      chunk.push((buf >> bits) & 0xff);
      if (chunk.length > 8000) out += String.fromCharCode(...chunk.splice(0));
    }
  }
  return out + String.fromCharCode(...chunk);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('base64 → text: the lookup table reads every input exactly as indexOf did', () => {
  it('padding, white space, URL-safe letters, junk, BOM, emoji, Latin-1 and broken UTF-8, short and long', async () => {
    const { base64Utf8, base64Latin1 } = await import('@/tracker/services/hevyImport');
    const rand = mulberry(42);
    const texts = [
      '',
      'a',
      'ab',
      'abc',
      'Día de pierna, búlgara — 100 kg ✓ 💪🏽 "quoted" \r\n line',
      '﻿title,start_time\n"Push 1","1 Jan 2025, 18:00"\n',
      'Тренировка ног · हिंदी · 日本語',
      fixture('qa-hevy.csv'),
    ];
    const inputs: string[] = [];
    for (const t of texts) {
      const b = Buffer.from(t, 'utf8').toString('base64');
      inputs.push(b, b.replace(/=+$/, ''), b.replace(/(.{76})/g, '$1\r\n'), ` \t${b}\n`, b.replace(/\+/g, '-').replace(/\//g, '_'));
    }
    // Bytes that are not UTF-8 (Windows-1252 "Excel CSV"), a lone BOM, cut-off sequences.
    for (const bytes of [[0xe9, 0x41], [0xef, 0xbb, 0xbf], [0xef, 0xbb], [0xc3], [0xf0, 0x9f, 0x92], [0xff, 0xfe, 0x41, 0x00], [0xed, 0xa0, 0x80]]) {
      inputs.push(Buffer.from(bytes).toString('base64'));
    }
    // Random bytes and random junk in the text itself (non-ASCII letters, symbols, '=' mid-way).
    for (let k = 0; k < 300; k++) {
      const len = Math.floor(rand() * 64);
      const bytes = Array.from({ length: len }, () => Math.floor(rand() * 256));
      let b = Buffer.from(bytes).toString('base64');
      if (k % 3 === 0) {
        const junk = ['=', ' ', '\n', '-', '_', 'é', '€', '😀', '.', '*', '\u0000'];
        const at = Math.floor(rand() * (b.length + 1));
        b = b.slice(0, at) + junk[Math.floor(rand() * junk.length)] + b.slice(at);
      }
      inputs.push(b);
    }
    // Long: past the 8,000-character flush.
    inputs.push(Buffer.from('x'.repeat(20_000) + 'é'.repeat(9_000), 'utf8').toString('base64'));
    inputs.push(Buffer.from(Array.from({ length: 30_000 }, (_, i) => (i * 7) % 256)).toString('base64'));
    for (const b of inputs) {
      expect(base64Utf8(b)).toBe(oldUtf8(b));
      expect(base64Latin1(b)).toBe(oldLatin1(b));
    }
  });
});

// ---------------------------------------------------------------- export + safety copy

async function phoneWithHistory(): Promise<RealDb> {
  const db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const { parseHevyBase64, runImport } = await import('@/tracker/services/hevyImport');
  const { parseStrongText } = await import('@/tracker/services/strongImport');
  await runImport(parseHevyBase64(toB64(hevyCsv(edgeRows()))), { mode: 'merge' });
  await runImport(parseHevyBase64(toB64(fixture('qa-hevy.csv'))), { mode: 'merge' });
  await runImport(parseStrongText(fixture('qa-strong.csv'), 'metric'), { mode: 'merge' });
  await runImport(parseHevyBase64(toB64(generateHistory({ workouts: 130, seed: 9, endISO: '2025-12-31' }).csv)), { mode: 'merge' });
  // Two workouts that write the same title, start minute and end minute (the export moves the
  // later one a minute) — next to each other, so a page edge can fall between them.
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const t = new Date(2026, 1, 3, 18, 0, 5, 120).getTime();
  for (const start of [t, t + 20_000]) {
    const s = await createSession({ dateISO: '2026-02-03', dayType: 'push', notes: 'He said "go", [then] \\ stop', source: 'manual', startedAt: start, endedAt: t + 3_600_000 });
    await addSetsWithMeta(s.id, [{ exerciseId: bench, weightKg: 80, reps: 5, note: 'a,"b"\nc' }]);
  }
  return db;
}

describe('"Save my history" a page at a time = the whole-file text, byte for byte', () => {
  it('every page size, kg and lb; the file gets the first page, then appends', async () => {
    await phoneWithHistory();
    const exp = await import('@/tracker/services/historyExport');
    const rows = await exp.readHistoryRows();
    expect(rows.length).toBeGreaterThan(1500);
    for (const units of ['metric', 'imperial'] as const) {
      const whole = exp.hevyCsvFromRows(rows, units);
      for (const per of [1, 2, 7, 100, 10_000]) {
        const chunks: string[] = [];
        const firsts: boolean[] = [];
        const n = await exp.writeHistoryCsv(units, async (c, first) => {
          chunks.push(c);
          firsts.push(first);
        }, { workoutsPerPage: per });
        expect(chunks.join('')).toBe(whole);
        expect(firsts.filter(Boolean)).toHaveLength(1);
        expect(firsts[0]).toBe(true);
        expect(n).toEqual({ workouts: new Set(rows.map((r) => r.session_id)).size, sets: rows.length });
      }
      // The real save: through the file API, first write then appends.
      files.writes = [];
      const res = await exp.saveMyHistory(units);
      expect(res.written).toBe(true);
      expect(res.sets).toBe(rows.length);
      expect(files.writes.length).toBeGreaterThan(1);
      expect(files.writes[0].append).toBe(false);
      expect(files.writes.slice(1).every((w) => w.append)).toBe(true);
      expect(new Set(files.writes.map((w) => w.uri)).size).toBe(1);
      expect(files.writes.map((w) => w.text).join('')).toBe(whole);
    }
    // And it reads back: the exported file through the importer finds every workout.
    const { parseHevyBase64 } = await import('@/tracker/services/hevyImport');
    expect(parseHevyBase64(toB64(exp.hevyCsvFromRows(rows, 'metric'))).workouts).toHaveLength(new Set(rows.map((r) => r.session_id)).size);
  });

  it('nothing logged: no file, and the old files are left alone (as before)', async () => {
    const db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    expect(db.count('workout_sessions')).toBe(0);
    files.writes = [];
    files.listed = 0;
    const { saveMyHistory } = await import('@/tracker/services/historyExport');
    expect(await saveMyHistory('metric')).toEqual({ written: false, shared: false, workouts: 0, sets: 0, uri: '' });
    expect(files.writes).toHaveLength(0);
    expect(files.listed).toBe(0);
  });

  it('audit Phase 8 review: a failed append deletes the half-written file, then reports the failure', async () => {
    await phoneWithHistory();
    const { saveMyHistory } = await import('@/tracker/services/historyExport');
    files.writes = [];
    files.deleted = [];
    files.failAt = 1; // the first page is written, the second append fails
    try {
      await expect(saveMyHistory('metric')).rejects.toThrow('disk full');
    } finally {
      files.failAt = -1;
    }
    expect(files.writes).toHaveLength(1);
    expect(files.deleted).toContain(files.writes[0].uri);
  });
});

describe('Replace safety copy: the workout ids without parsing the whole copy', () => {
  it('the same ids as a full parse, on a real copy with tricky notes and titles', async () => {
    const db = await phoneWithHistory();
    // Notes that hold the key's own name, brackets and escapes.
    db.raw.run(`UPDATE workout_sessions SET notes = '"workout_sessions":[{"id":"x"}] \\" ] } {', title = 'tables"workout_sessions":[' WHERE rowid IN (SELECT rowid FROM workout_sessions LIMIT 3)`);
    db.raw.run(`UPDATE set_entries SET note = '"workout_sessions":[]' WHERE rowid IN (SELECT rowid FROM set_entries LIMIT 5)`);
    db.raw.run(`UPDATE exercises SET aliases = '["workout_sessions\\":["]' WHERE rowid IN (SELECT rowid FROM exercises LIMIT 2)`);
    const { takeSafetyCopy, snapshotSessionIds } = await import('@/onboarding/db/importSafety');
    const copy = await takeSafetyCopy();
    const full = (JSON.parse(copy.json) as { tables: { workout_sessions: { id: string }[] } }).tables.workout_sessions.map((s) => String(s.id));
    expect(full.length).toBe(db.count('workout_sessions'));
    expect(copy.sessionIds).toEqual(full);
    expect(snapshotSessionIds(copy.json)).toEqual(full);
  });

  it('a text it cannot read in part falls back to the full parse (same answer as before)', async () => {
    const { snapshotSessionIds } = await import('@/onboarding/db/importSafety');
    const env = (sessions: unknown): string => JSON.stringify({ app: 'forgeai', tables: { workout_sessions: sessions } });
    expect(snapshotSessionIds(env([{ id: 'a' }, { id: 7 }]))).toEqual(['a', '7']);
    expect(snapshotSessionIds(env([]))).toEqual([]);
    expect(snapshotSessionIds(JSON.stringify({ app: 'forgeai', tables: {} }))).toEqual([]);
    // Spaced out (not how the app writes it): the full parse answers.
    expect(snapshotSessionIds('{"tables": {"workout_sessions": [ {"id": "b"} ] }}')).toEqual(['b']);
    expect(snapshotSessionIds(JSON.stringify({ tables: { workout_sessions: [{ id: 'q', notes: 'x"]}' }] } }))).toEqual(['q']);
  });
});
