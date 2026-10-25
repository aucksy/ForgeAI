import { describe, expect, it } from 'vitest';

import { backupDay, foundBackupLine, replaceBody, START_WORDS } from '@/onboarding/welcomeStart';

describe('welcome start view words (R-131)', () => {
  it('names the day of a Drive backup', () => {
    expect(backupDay('2026-10-20T09:15:00.000Z')).toBe('20 Oct 2026');
    expect(backupDay('')).toBe('');
    expect(backupDay('not a date')).toBe('');
  });

  it('says what was found and asks', () => {
    expect(foundBackupLine('2026-10-20T09:15:00.000Z', 412)).toBe('We found your backup from 20 Oct 2026 with 412 workouts. Bring it back to this phone?');
    expect(foundBackupLine('2026-10-20T09:15:00.000Z', 1)).toContain('with 1 workout.');
    // A backup made before workouts were counted, or with no readable date.
    expect(foundBackupLine('', null)).toBe('We found your backup. Bring it back to this phone?');
  });

  it('warns before replacing workouts already on the phone', () => {
    expect(replaceBody(1)).toBe('The 1 workout on this phone is deleted and your backup takes its place.');
    expect(replaceBody(12)).toBe('The 12 workouts on this phone are deleted and your backup takes their place.');
  });

  it('keeps the labels the phone tests and Settings use', () => {
    expect(START_WORDS.restoreFile).toBe('Restore from a backup');
    expect(START_WORDS.googleButton).toBe('Continue with Google');
    expect(START_WORDS.startFresh).toBe('Start fresh');
  });

  it('never uses banned or inside words', () => {
    const all = Object.values(START_WORDS).join(' ');
    expect(all).not.toMatch(/\b(sync|session|PR|volume|cloud)\b/i);
  });
});
