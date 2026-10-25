/**
 * R-123 GUARD (owner, 25 Oct 2026: "Everything that I have changed should backup right"). Reads the
 * app's own source for every place it keeps something on the phone and holds each one to the
 * backup: carried (SETTINGS_KEYS, META_IN_BACKUP, TABLES_IN_BACKUP) or left out with a reason
 * (src/backup/backupCoverage.ts). A NEW setting, saved store, store field, meta key or table that is
 * in neither list fails here — add it to the backup, or to the left-out list with its reason.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BACKUP_META_KEYS, BACKUP_ROW_TABLES } from '@/backup/backupCollect';
import { DYNAMIC_KEYS, FIELDS_LEFT_OUT, META_IN_BACKUP, META_LEFT_OUT, STORAGE_LEFT_OUT, TABLES_IN_BACKUP, TABLES_LEFT_OUT } from '@/backup/backupCoverage';
import { SETTINGS_KEYS } from '@/backup/backupFormat';

import { scanSource } from './storageScan';

const found = scanSource(path.resolve(__dirname, '../../src'));
const STORES = Object.keys(SETTINGS_KEYS).filter((k) => k !== 'meta');

describe('every stored thing is in the backup or left out on purpose', () => {
  it('meta keys', () => {
    const carried = new Set([...META_IN_BACKUP, ...SETTINGS_KEYS.meta]);
    const unknown = [...found.meta.keys()].filter((k) => !carried.has(k) && !(k in META_LEFT_OUT));
    expect(unknown, 'a meta key nobody classified (backupCoverage.ts)').toEqual([]);
    for (const k of carried) expect(found.meta.has(k), `carried key ${k} is still used`).toBe(true);
    for (const k of Object.keys(META_LEFT_OUT)) expect(carried.has(k)).toBe(false);
  });

  it('AsyncStorage keys, saved stores, the key-value store and SecureStore', () => {
    const all = new Set([...found.storage.keys(), ...found.kv.keys(), ...found.secure.keys()]);
    const unknown = [...all].filter((k) => !STORES.includes(k) && !(k in STORAGE_LEFT_OUT));
    expect(unknown, 'a saved key nobody classified (backupCoverage.ts)').toEqual([]);
    // A left-out key no longer used is harmless (another helper may be adding it right now); a CARRIED one must exist.
    for (const k of STORES) expect(all.has(k), `${k} is still used`).toBe(true);
  });

  it('keys worked out at run time are only in the files named, each with what they are', () => {
    expect([...found.dynamic].sort()).toEqual(Object.keys(DYNAMIC_KEYS).sort());
  });

  it('database tables', () => {
    const tables = [...found.tables.keys()];
    expect(tables.filter((t) => !(t in TABLES_IN_BACKUP) && !(t in TABLES_LEFT_OUT)), 'a table nobody classified').toEqual([]);
    for (const t of Object.keys(TABLES_IN_BACKUP)) expect(tables).toContain(t);
    for (const t of Object.keys(BACKUP_ROW_TABLES)) expect(t in TABLES_IN_BACKUP).toBe(true);
    expect(BACKUP_META_KEYS.every((k) => META_IN_BACKUP.includes(k))).toBe(true);
  });

  it('every field of every carried store is carried or left out with a reason', async () => {
    const stores: Record<string, () => object> = {
      'forgeai-settings': (await import('@/store/settingsStore')).useSettings.getState,
      'forgeai-tracker-prefs': (await import('@/tracker/store/trackerPrefsStore')).useTrackerPrefs.getState,
      'forgeai-plate-setup': (await import('@/tracker/store/plateSetupStore')).usePlateSetup.getState,
      'forgeai-rest-alert-prefs': (await import('@/tracker/store/restAlertPrefsStore')).useRestAlertPrefs.getState,
      'forgeai-phone-prefs': (await import('@/tracker/phone/phonePrefs')).usePhonePrefs.getState,
      'forgeai-muscle-tips': (await import('@/tracker/store/muscleTipsStore')).useMuscleTips.getState,
      'forgeai-folder-open': (await import('@/tracker/store/folderOpenStore')).useFolderOpen.getState,
    };
    expect(Object.keys(stores).sort()).toEqual([...STORES].sort());
    for (const [name, get] of Object.entries(stores)) {
      const state = get() as Record<string, unknown>;
      const fields = Object.keys(state).filter((k) => typeof state[k] !== 'function');
      const carried = SETTINGS_KEYS[name];
      const left = FIELDS_LEFT_OUT[name] ?? {};
      expect(fields.filter((f) => !carried.includes(f) && !(f in left)), `${name}: a field nobody classified`).toEqual([]);
      for (const f of [...carried, ...Object.keys(left)]) expect(fields, `${name}.${f} still exists`).toContain(f);
    }
  });

  it('each left-out entry says why', () => {
    const reasons = [
      ...Object.values(META_LEFT_OUT),
      ...Object.values(STORAGE_LEFT_OUT),
      ...Object.values(DYNAMIC_KEYS),
      ...Object.values(TABLES_LEFT_OUT),
      ...Object.values(FIELDS_LEFT_OUT).flatMap((f) => Object.values(f)),
    ];
    for (const r of reasons) expect(r.trim().length).toBeGreaterThan(5);
  });
});
