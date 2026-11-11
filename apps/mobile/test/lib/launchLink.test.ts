/**
 * 12 Nov 2026, UAT UK5 (default-profile run 43106098012): the app-icon shortcut "Log body weight"
 * made a new app screen, and React Native answered "the link the app was opened with" from the OLD
 * screen (the replayed Start link), so the member saw "Start Push Day A?" instead of Measures.
 * expo-linking's record of this launch's own link now wins; it is cleared after every link.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-linking's native record of the launch link, as Android keeps it (set in the new screen's
// onCreate, never cleared by a launch without a link).
const record: { url: string | null } = { url: null };
vi.mock('expo-linking', () => ({
  getLinkingURL: () => record.url,
  clearInitialURL: () => {
    record.url = null;
  },
}));

import { redirectSystemPath } from '@/app/+native-intent';
import { launchLinkPath, linkForLog } from '@/lib/launchLink';

const STALE_START = 'forgeai://workout/start?routine=seed-push-a&t=spent-key';
const WEIGHT = 'forgeai://measures?kind=bodyweight';
const ROOT = 'mettleup:///';

beforeEach(() => {
  record.url = null;
});

describe('launchLinkPath (pure)', () => {
  it('UK5: the launch record beats the old screen\'s link React Native returned', () => {
    expect(launchLinkPath({ path: STALE_START, launchRecord: WEIGHT })).toBe(WEIGHT);
  });
  it('UK2 variant: React Native timed out (the first page), the record still opens the link', () => {
    expect(launchLinkPath({ path: ROOT, launchRecord: 'forgeai://workout/start' })).toBe('forgeai://workout/start');
  });
  it('no record: React Native\'s answer stands', () => {
    expect(launchLinkPath({ path: WEIGHT, launchRecord: null })).toBe(WEIGHT);
    expect(launchLinkPath({ path: ROOT, launchRecord: undefined })).toBe(ROOT);
    expect(launchLinkPath({ path: ROOT, launchRecord: '   ' })).toBe(ROOT);
  });
  it('a record that is not a link is ignored', () => {
    expect(launchLinkPath({ path: WEIGHT, launchRecord: 'not a link' })).toBe(WEIGHT);
  });
  it('the log never carries a Start link\'s key', () => {
    expect(linkForLog(STALE_START)).toBe('forgeai://workout/start');
    expect(linkForLog(null)).toBe('(none)');
  });
});

describe('+native-intent redirectSystemPath (the UK5 order of events)', () => {
  it('a new screen made by the "Log body weight" shortcut opens Measures, not the old Start link', () => {
    // 1. The replayed Start link made the previous screen; that link was handled and the record cleared.
    record.url = STALE_START;
    expect(redirectSystemPath({ path: STALE_START, initial: true })).toBe(STALE_START);
    expect(record.url).toBeNull();
    // 2. The shortcut: Android makes a new screen and writes its link into the record; React Native,
    //    still pointing at the old screen, answers with the old link.
    record.url = WEIGHT;
    expect(redirectSystemPath({ path: STALE_START, initial: true })).toBe(WEIGHT);
    expect(record.url).toBeNull();
  });

  it('a later launch without a link never reopens a link already handled', () => {
    record.url = WEIGHT;
    redirectSystemPath({ path: WEIGHT, initial: true });
    // The launcher icon writes nothing; React Native says "no link" (the first page).
    expect(redirectSystemPath({ path: ROOT, initial: true })).toBe(ROOT);
  });

  it('a link to the running app is opened as given and clears the record', () => {
    record.url = 'forgeai://profile';
    expect(redirectSystemPath({ path: 'forgeai://profile', initial: false })).toBe('forgeai://profile');
    expect(record.url).toBeNull();
    // ...so a later fresh screen without a link does not reopen it.
    expect(redirectSystemPath({ path: ROOT, initial: true })).toBe(ROOT);
  });
});
