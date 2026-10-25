/**
 * The member's own choices outside the database (R-123): read them for a backup, put them back on a
 * restore. Which stores and fields: backupFormat.ts SETTINGS_KEYS (never AI keys, the gym link, the
 * Health Connect permission or notification ids). A restored value goes through each store's own
 * `merge`, so a value this version does not know falls back to its default, exactly as when the
 * app starts. Shared by MettleUp and ForgeAI 0.55.2 (same store names).
 */
import { getDb, getMeta, setMeta } from '@/db';
import { useSettings } from '@/store/settingsStore';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { useFolderOpen } from '@/tracker/store/folderOpenStore';
import { useMuscleTips } from '@/tracker/store/muscleTipsStore';
import { usePlateSetup } from '@/tracker/store/plateSetupStore';
import { useRestAlertPrefs } from '@/tracker/store/restAlertPrefsStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

import { pickSettings, type SettingsBlob } from './backupFormat';

export interface SettingsIo {
  read(): Promise<SettingsBlob>;
  /**
   * Put choices back. `fromBackup`: a backup never switches Health Connect on by itself (Android
   * asks for the permission on each phone); the answer says whether the backup had it on, so the
   * screen can say "turn it on again". An Undo puts this phone's own choice back as it was.
   */
  apply(blob: SettingsBlob, opts?: { fromBackup?: boolean }): Promise<{ healthConnectWasOn: boolean }>;
}

/** The choices to put back, and whether the backup had Health Connect on. PURE. */
export function settingsToApply(blob: SettingsBlob, fromBackup: boolean): { blob: SettingsBlob; healthConnectWasOn: boolean } {
  const phone = blob['forgeai-phone-prefs'];
  if (!fromBackup || !phone || !('healthConnect' in phone)) return { blob, healthConnectWasOn: false };
  const { healthConnect, ...rest } = phone;
  return { blob: { ...blob, 'forgeai-phone-prefs': rest }, healthConnectWasOn: healthConnect === true };
}

/** The persisted stores a backup carries, by their saved name. */
interface PersistedStore {
  getState: () => object;
  setState: (s: object) => void;
  persist: { getOptions: () => { merge?: (persisted: unknown, current: never) => unknown } };
}

const STORES: Record<string, PersistedStore> = {
  'forgeai-settings': useSettings as unknown as PersistedStore,
  'forgeai-tracker-prefs': useTrackerPrefs as unknown as PersistedStore,
  'forgeai-plate-setup': usePlateSetup as unknown as PersistedStore,
  'forgeai-rest-alert-prefs': useRestAlertPrefs as unknown as PersistedStore,
  'forgeai-phone-prefs': usePhonePrefs as unknown as PersistedStore,
  'forgeai-muscle-tips': useMuscleTips as unknown as PersistedStore,
  'forgeai-folder-open': useFolderOpen as unknown as PersistedStore,
};

const REST_KEY = 'restTimerDefaultSec';
const PHOTO_BACKUP_KEY = 'photo_backup_on';

export const deviceSettingsIo: SettingsIo = {
  async read() {
    const states: Record<string, unknown> = {};
    for (const [name, store] of Object.entries(STORES)) states[name] = store.getState();
    const rest = await getMeta(REST_KEY).catch(() => null);
    const n = rest != null ? Number(rest) : NaN;
    const photos = await getMeta(PHOTO_BACKUP_KEY).catch(() => null);
    // null = never set on this phone (the default): a restore or an undo puts that back too.
    const meta: Record<string, unknown> = { restTimerDefaultSec: Number.isFinite(n) ? n : null, photo_backup_on: photos };
    states.meta = meta;
    return pickSettings(states);
  },
  async apply(given, opts) {
    const { blob, healthConnectWasOn } = settingsToApply(given, opts?.fromBackup === true);
    for (const [name, picked] of Object.entries(blob)) {
      const store = STORES[name];
      if (!store) continue;
      try {
        const current = store.getState();
        const merge = store.persist.getOptions().merge;
        const next = merge ? (merge(picked, current as never) as object) : { ...current, ...picked };
        store.setState(next);
      } catch (e) {
        console.warn(`[backup] a setting could not be put back (${name})`, e);
      }
    }
    const rest = blob.meta?.restTimerDefaultSec;
    if (blob.meta && 'restTimerDefaultSec' in blob.meta) {
      if (typeof rest === 'number' && Number.isFinite(rest) && rest >= 0) await setMeta(REST_KEY, String(Math.round(rest)));
      else if (rest === null) await getDb().runAsync('DELETE FROM meta WHERE key = ?', [REST_KEY]);
      useRestTimer.setState({ loaded: false });
      await useRestTimer.getState().loadDefault().catch(() => undefined);
    }
    // "Include photos in my backup" (Android's own backup of this phone).
    const photos = blob.meta?.photo_backup_on;
    if (blob.meta && 'photo_backup_on' in blob.meta && (photos === null || typeof photos === 'string' || typeof photos === 'boolean')) {
      await import('@/tracker/services/photoBackup')
        .then(async (m) => {
          await m.setPhotoBackupOn(photos === true || photos === '1');
          // Never chosen on that phone: no choice stored here either (off, the default).
          if (photos === null) await getDb().runAsync('DELETE FROM meta WHERE key = ?', [PHOTO_BACKUP_KEY]);
        })
        .catch((e: unknown) => console.warn('[backup] "Include photos in my backup" not put back', e));
    }
    // Reminders follow their switch and days at once (scheduled by the phone).
    await import('@/tracker/phone/reminders')
      .then((m) => m.refreshReminders({ force: true }))
      .catch((e: unknown) => console.warn('[backup] reminders not rescheduled (they catch up on the next start)', e));
    return { healthConnectWasOn };
  },
};
