/**
 * F67 "Install the watch app from the phone": when the Workout tab's card shows, what Settings says,
 * what the member reads after "Install on watch", and the native wiring (read as text).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { settingsGroups } from '@/components/settings/settingsLines';
import { NOTICE_ORDER, pickNotice } from '@/lib/workoutNotices';
import { usesBannedWord } from '@/lib/words';
import {
  CARD_DONE,
  WATCH_WORDS,
  installNote,
  parseInstallResult,
  parseWatchState,
  resultEndsCard,
  stateEndsCard,
  watchCardShows,
  watchRowLine,
  type WatchCardInput,
} from '@/tracker/services/watchInstall';

const due: WatchCardInput = { state: 'missing', hasWorkouts: true, demo: false, stored: null };

describe('watchCardShows', () => {
  it('shows after the first finished workout with a watch that lacks MettleUp', () => {
    expect(watchCardShows(due)).toBe(true);
  });

  it('no watch, no card; the app already there, no card; Wear OS unsure, no card', () => {
    expect(watchCardShows({ ...due, state: 'none' })).toBe(false);
    expect(watchCardShows({ ...due, state: 'installed' })).toBe(false);
    expect(watchCardShows({ ...due, state: 'unknown' })).toBe(false);
  });

  it('never before a finished workout, nor for the demo workouts', () => {
    expect(watchCardShows({ ...due, hasWorkouts: false })).toBe(false);
    expect(watchCardShows({ ...due, hasWorkouts: null })).toBe(false);
    expect(watchCardShows({ ...due, demo: true })).toBe(false);
  });

  it('never again once closed or done, and not before the mark is read', () => {
    expect(watchCardShows({ ...due, stored: CARD_DONE })).toBe(false);
    expect(watchCardShows({ ...due, stored: undefined })).toBe(false);
  });

  it('an install, or the Play Store opening, ends the card for good', () => {
    expect(stateEndsCard('installed')).toBe(true);
    expect(stateEndsCard('missing')).toBe(false);
    expect(stateEndsCard('none')).toBe(false);
    expect(stateEndsCard('unknown')).toBe(false);
    expect(resultEndsCard('opened')).toBe(true);
    expect(resultEndsCard('installed')).toBe(true);
    expect(resultEndsCard('failed')).toBe(false);
    expect(resultEndsCard('none')).toBe(false);
    expect(resultEndsCard('unknown')).toBe(false);
  });
});

describe('the native answers', () => {
  it('reads the four states; anything else is unknown', () => {
    for (const s of ['none', 'installed', 'missing', 'unknown'] as const) expect(parseWatchState(s)).toBe(s);
    expect(parseWatchState(null)).toBe('unknown');
    expect(parseWatchState(undefined)).toBe('unknown');
    expect(parseWatchState('yes')).toBe('unknown');
    expect(parseWatchState(1)).toBe('unknown');
  });

  it('reads the install results; anything else is a failure', () => {
    for (const r of ['opened', 'installed', 'none', 'failed', 'unknown'] as const) expect(parseInstallResult(r)).toBe(r);
    expect(parseInstallResult(null)).toBe('failed');
    expect(parseInstallResult('ok')).toBe('failed');
  });
});

describe('the words', () => {
  it('the Settings row says Installed or Install on watch, and is left out otherwise', () => {
    expect(watchRowLine('installed')).toBe('Installed');
    expect(watchRowLine('missing')).toBe('Install on watch');
    expect(watchRowLine('none')).toBeNull();
    expect(watchRowLine('unknown')).toBeNull();
  });

  it('every failure ends with the search-on-the-watch way', () => {
    expect(installNote('opened')).toMatch(/Play Store is open on MettleUp/);
    expect(installNote('installed')).toBe('MettleUp is already on your watch.');
    expect(installNote('failed')).toBe('Open Play Store on your watch and search MettleUp.');
    expect(installNote('unknown')).toBe('Open Play Store on your watch and search MettleUp.');
    expect(installNote('none')).toMatch(/Open Play Store on your watch and search MettleUp\.$/);
  });

  it('the card says what the owner approved', () => {
    expect(WATCH_WORDS.cardTitle).toBe('MettleUp works on your watch too');
    expect(WATCH_WORDS.install).toBe('Install on watch');
    expect(WATCH_WORDS.rowTitle).toBe('Your watch');
  });

  it('no banned member word', () => {
    for (const w of Object.values(WATCH_WORDS)) expect(usesBannedWord(w)).toBe(false);
  });
});

describe('where it shows', () => {
  it('the card takes its turn in the one notice slot, after What is new', () => {
    expect(NOTICE_ORDER.indexOf('watch')).toBe(NOTICE_ORDER.indexOf('whatsNew') + 1);
    expect(pickNotice({ watch: true, backup: true }, null, '2026-10-29')).toBe('watch');
    expect(pickNotice({ whatsNew: true, watch: true }, null, '2026-10-29')).toBe('whatsNew');
  });

  it('Settings has "Your watch" under Reminders and phone only with a watch', () => {
    const ctx = { gymName: null, canAddGymLogo: false, hasHealth: false, coach: false };
    const phone = (watch?: boolean) => settingsGroups({ ...ctx, watch }).find((g) => g.title === 'Reminders and phone')!.rows.map((r) => r.key);
    expect(phone(true)).toContain('watch');
    expect(phone(false)).not.toContain('watch');
    expect(phone(undefined)).not.toContain('watch');
  });
});

describe('native wiring (text)', () => {
  const root = resolve(__dirname, '../..');
  const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

  it('the phone asks Wear OS with the capability and opens the watch Play Store on the package', () => {
    const sync = read('modules/forge-rest/android/src/main/java/com/forgeai/rest/WearSync.kt');
    expect(sync).toMatch(/fun watchAppState\(ctx: Context, done: \(String\) -> Unit\)/);
    expect(sync).toMatch(/fun installOnWatch\(ctx: Context, done: \(String\) -> Unit\)/);
    expect(sync).toMatch(/WearWire\.playStoreUri\(app\.packageName\)/);
    const wire = read('modules/forge-rest/android/src/main/java/com/forgeai/rest/WearWire.kt');
    expect(wire).toMatch(/"market:\/\/details\?id=\$pkg"/);
    const mod = read('modules/forge-rest/android/src/main/java/com/forgeai/rest/ForgeRestModule.kt');
    expect(mod).toMatch(/AsyncFunction\("watchAppState"\)/);
    expect(mod).toMatch(/AsyncFunction\("installOnWatch"\)/);
  });

  it('the watch app declares the capability and has the phone package name', () => {
    expect(read('android/wear/src/main/res/values/wear.xml')).toMatch(/<item>forgeai_watch_app<\/item>/);
    expect(read('android/wear/build.gradle')).toMatch(/applicationId 'com\.mettleup\.app'/);
    expect(read('android/app/build.gradle')).toMatch(/applicationId 'com\.mettleup\.app'/);
  });
});
