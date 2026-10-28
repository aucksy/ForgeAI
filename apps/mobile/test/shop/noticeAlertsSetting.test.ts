/**
 * "Messages from my gym" (usePhonePrefs.gymMessagesOn): on by default, reset by Erase, carried by a
 * backup, shown next to "Reminders from my gym", and the background job wired from the app's entry.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

import { FIELDS_LEFT_OUT, STORAGE_LEFT_OUT } from '@/backup/backupCoverage';
import { SETTINGS_KEYS } from '@/backup/backupFormat';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

const read = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('Messages from my gym', () => {
  it('is on by default, can be switched off, and Erase puts it back on', () => {
    expect(usePhonePrefs.getState().gymMessagesOn).toBe(true);
    usePhonePrefs.getState().setGymMessagesOn(false);
    expect(usePhonePrefs.getState().gymMessagesOn).toBe(false);
    usePhonePrefs.getState().reset();
    expect(usePhonePrefs.getState().gymMessagesOn).toBe(true);
  });

  it('a backup carries it (not listed as left out)', () => {
    expect(SETTINGS_KEYS['forgeai-phone-prefs']).toContain('gymMessagesOn');
    expect(FIELDS_LEFT_OUT['forgeai-phone-prefs']?.gymMessagesOn).toBeUndefined();
  });

  it('the list of what was alerted stays on the phone, with a reason', () => {
    expect(STORAGE_LEFT_OUT['forgeai-gym-notice-alerts']).toBeTruthy();
  });

  it('sits on the Reminders page next to "Reminders from my gym"', () => {
    const page = read('src/app/settings/notifications.tsx');
    expect(page).toMatch(/<GymRemindersSwitch gymName=\{gymName\} \/>\s*[^]*<GymMessagesSwitch gymName=\{gymName\} \/>/);
  });

  it('the background job is defined in the entry file and a tap opens the inbox', () => {
    expect(read('index.js')).toMatch(/import '\.\/src\/shop\/noticeTask';/);
    expect(read('src/shop/noticeTask.ts')).toMatch(/TaskManager\.defineTask\(NOTICE_TASK/);
    expect(read('src/tracker/components/WorkoutPresenceHost.tsx')).toMatch(/route === NOTICE_ROUTE/);
  });
});
