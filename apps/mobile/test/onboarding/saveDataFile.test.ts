/**
 * "Save my data file" on the start-up error screen (DS-08): a consistent copy when the database
 * opens, the raw files in place when it will not. Never writes to the member's database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  files: {} as Record<string, number>,
  shared: [] as string[],
  sql: [] as { sql: string; params: unknown }[],
  openFails: false,
  vacuumFails: false,
  closed: 0,
  opened: 0,
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///data/user/0/app/cache/',
  documentDirectory: 'file:///data/user/0/app/files/',
  getInfoAsync: async (uri: string) => (uri in h.files ? { exists: true, size: h.files[uri] } : { exists: false }),
  deleteAsync: async (uri: string) => {
    delete h.files[uri];
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string) => {
    h.shared.push(uri);
  },
}));
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    h.opened += 1;
    if (h.openFails) throw new Error('file is not a database');
    return {
      runAsync: async (sql: string, params: unknown[]) => {
        h.sql.push({ sql, params });
        if (h.vacuumFails) throw new Error('database or disk is full');
        h.files[`file://${String(params[0])}`] = 4096;
      },
      closeAsync: async () => {
        h.closed += 1;
      },
    };
  },
}));

import { dataFileName, saveDataFile, toPlainPath } from '@/onboarding/services/saveDataFile';

const NOW = new Date(2026, 9, 10, 9, 5);
const DB = 'file:///data/user/0/app/files/SQLite/forgeai.db';

beforeEach(() => {
  h.files = {};
  h.shared = [];
  h.sql = [];
  h.openFails = false;
  h.vacuumFails = false;
  h.closed = 0;
  h.opened = 0;
});

describe('saveDataFile', () => {
  it('names the file by date and gives SQLite a plain path', () => {
    expect(dataFileName(NOW)).toBe('forgeai-data-2026-10-10-0905.db');
    expect(toPlainPath('file:///data/user/0/app/cache/a%20b.db')).toBe('/data/user/0/app/cache/a b.db');
  });

  it('database opens → one consistent copy (VACUUM INTO) in the cache, shared once', async () => {
    h.files[DB] = 1_000_000;
    const r = await saveDataFile(NOW);
    expect(r).toEqual({ ok: true, files: 1, consistent: true });
    expect(h.sql).toEqual([{ sql: 'VACUUM INTO ?', params: ['/data/user/0/app/cache/forgeai-data-2026-10-10-0905.db'] }]);
    expect(h.shared).toEqual(['file:///data/user/0/app/cache/forgeai-data-2026-10-10-0905.db']);
    expect(h.closed).toBe(1); // the extra connection it opened is closed again
  });

  it('database will not open → the raw file and its unsaved-pages file are shared in place', async () => {
    h.openFails = true;
    h.files[DB] = 1_000_000;
    h.files[`${DB}-wal`] = 32_000;
    const r = await saveDataFile(NOW);
    expect(r).toEqual({ ok: true, files: 2, consistent: false });
    expect(h.shared).toEqual([DB, `${DB}-wal`]);
  });

  it('phone too full for a copy → falls back to sharing in place (an empty -wal is skipped)', async () => {
    h.vacuumFails = true;
    h.files[DB] = 1_000_000;
    h.files[`${DB}-wal`] = 0;
    const r = await saveDataFile(NOW);
    expect(r).toEqual({ ok: true, files: 1, consistent: false });
    expect(h.shared).toEqual([DB]);
  });

  it('no file at all → says so, shares nothing', async () => {
    h.openFails = true;
    expect(await saveDataFile(NOW)).toEqual({ ok: false, reason: 'no-file' });
    expect(h.shared).toEqual([]);
  });

  it('no data file → never opens one: opening would CREATE an empty database and share that as "your data"', async () => {
    // The database would open fine — SQLite makes a new, empty file when none is there.
    expect(await saveDataFile(NOW)).toEqual({ ok: false, reason: 'no-file' });
    expect(h.opened).toBe(0);
    expect(h.sql).toEqual([]);
    expect(h.shared).toEqual([]);
  });

  it('an empty (0-byte) data file counts as no data file', async () => {
    h.files[DB] = 0;
    expect(await saveDataFile(NOW)).toEqual({ ok: false, reason: 'no-file' });
    expect(h.opened).toBe(0);
    expect(h.shared).toEqual([]);
  });

  it('the screen says so in plain words', async () => {
    const { NO_DATA_FILE_MESSAGE } = await import('@/onboarding/services/saveDataFile');
    expect(NO_DATA_FILE_MESSAGE).toBe('No data file found on this phone.');
  });
});
