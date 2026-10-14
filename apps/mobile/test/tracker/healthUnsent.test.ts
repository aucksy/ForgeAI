/**
 * Silent-failure audit M2 (14 Oct 2026): a finished workout Health Connect refuses is no longer
 * dropped. It is logged, kept on the phone, and "Send again" sends it. Each test fails on the
 * code before the fix (the refusal left no trace).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  written: 1 as number,
  granted: true,
  writes: [] as string[],
  rows: ['s1', 's2', 's3'],
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/onboarding/db/dataActions', () => ({ isDemoData: async () => false }));
vi.mock('@/db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, args: string[]) => {
      if (/body_weight/.test(sql)) return [];
      const want = args.length > 0 ? args : h.rows;
      return h.rows
        .filter((id) => want.includes(id))
        .map((id, i) => ({ id, date_iso: '2026-10-10', started_at: 1_000_000 + i * 10_000_000, ended_at: 1_000_000 + i * 10_000_000 + 3_600_000, day_type: 'push', sets: 10, cardio: 0 }));
    },
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({
    healthWrite: async (json: string) => {
      h.writes.push(json);
      return h.written;
    },
    healthGranted: async () => h.granted,
  }),
}));

import { UNSENT_CAP, resendUnsentToHealth, sendWorkoutToHealth, unsentAfter, unsentText } from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

beforeEach(() => {
  h.written = 1;
  h.granted = true;
  h.writes.length = 0;
  usePhonePrefs.setState({ healthConnect: true, healthUnsent: [] });
});

describe('unsentAfter (pure)', () => {
  it('a full send clears what was asked; others stay owed', () => {
    expect(unsentAfter(['a', 'b'], ['a'], ['a'], { kind: 'sent', sent: 1, total: 1 })).toEqual(['b']);
  });
  it('a part-way failure keeps only the ones not reached, in order', () => {
    expect(unsentAfter([], ['a', 'b', 'c'], ['a', 'b', 'c'], { kind: 'failed', sent: 1, total: 3, reason: 'error' })).toEqual(['b', 'c']);
  });
  it('a deleted workout (no row) and demo data leave the list', () => {
    expect(unsentAfter(['gone'], ['gone'], [], { kind: 'none' })).toEqual([]);
    expect(unsentAfter(['d'], ['d'], ['d'], { kind: 'demo' })).toEqual([]);
  });
  it('never lists one twice', () => {
    expect(unsentAfter(['a'], ['a'], ['a'], { kind: 'failed', sent: 0, total: 1, reason: 'access' })).toEqual(['a']);
  });
  it('keeps only the newest UNSENT_CAP, so it never grows for ever', () => {
    const prev = Array.from({ length: UNSENT_CAP }, (_, i) => `old${i}`);
    const out = unsentAfter(prev, ['new'], ['new'], { kind: 'failed', sent: 0, total: 1, reason: 'unavailable' });
    expect(out).toHaveLength(UNSENT_CAP);
    expect(out[out.length - 1]).toBe('new');
    expect(out[0]).toBe('old1');
  });
  it('says how many in plain words', () => {
    expect(unsentText(1)).toBe("1 workout didn't reach Health Connect.");
    expect(unsentText(3)).toBe("3 workouts didn't reach Health Connect.");
  });
});

describe('a refused workout is kept and logged, then sent again', () => {
  it('a refusal keeps the id and logs a ForgeErr line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.written = -1;
    await sendWorkoutToHealth('s2');
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['s2']);
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[ForgeErr]'))).toBe(true);
    warn.mockRestore();
  });

  it('a send that works logs nothing and keeps nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sendWorkoutToHealth('s1');
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('"Send again" sends the kept ones and clears them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePhonePrefs.setState({ healthUnsent: ['s1', 's3'] });
    h.written = 2;
    const r = await resendUnsentToHealth();
    expect(r).toEqual({ kind: 'sent', sent: 2, total: 2 });
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
    expect(h.writes).toHaveLength(1);
    vi.mocked(console.warn).mockRestore();
  });

  it('"Send again" refused again keeps them, with the reason', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    usePhonePrefs.setState({ healthUnsent: ['s1', 's3'] });
    h.written = -1;
    h.granted = false;
    const r = await resendUnsentToHealth();
    expect(r).toMatchObject({ kind: 'failed', sent: 0, reason: 'access' });
    expect(usePhonePrefs.getState().healthUnsent).toEqual(['s1', 's3']);
    vi.mocked(console.warn).mockRestore();
  });

  it('"Send again" sends nothing while sending is switched off (Stop)', async () => {
    usePhonePrefs.setState({ healthConnect: false, healthUnsent: ['s1'] });
    expect(await resendUnsentToHealth()).toEqual({ kind: 'none' });
    expect(h.writes).toHaveLength(0);
  });

  it('Erase forgets the owed list', () => {
    usePhonePrefs.setState({ healthUnsent: ['s1'] });
    usePhonePrefs.getState().reset();
    expect(usePhonePrefs.getState().healthUnsent).toEqual([]);
  });
});
