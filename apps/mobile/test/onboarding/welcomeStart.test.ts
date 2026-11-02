import { describe, expect, it } from 'vitest';

import { backupDay, foundBackupLine, keptWorkoutsLine, replaceBody, RESTORED_NO_PROFILE, START_WORDS } from '@/onboarding/welcomeStart';

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
  });

  it('uses the owner-approved words of the new welcome (R-277, 2 Nov 2026)', () => {
    expect(START_WORDS.title).toBe('Get stronger every week');
    expect(START_WORDS.sub).toBe('Log every set at the gym. See what you lifted last time.');
    expect(START_WORDS.joinGym).toBe('Join my gym');
    expect(START_WORDS.bringWorkouts).toBe('Bring workouts');
    expect(START_WORDS.useWithout).toBe('Use without an account');
    expect(START_WORDS.exampleCard).toBe('Example of a logged bench press');
    expect([START_WORDS.fromHevy, START_WORDS.fromStrong, START_WORDS.fromBackup]).toEqual(['From Hevy', 'From Strong', 'A MettleUp backup']);
    // Google Drive is named only by the Google button's own note; the file row names this phone.
    expect(START_WORDS.driveNote).toMatch(/Google Drive.*Continue with Google/);
    expect(START_WORDS.fromBackupHint).toMatch(/this phone/);
    expect(START_WORDS.fromBackupHint).not.toMatch(/Google/);
  });

  it('says how to carry on with workouts kept on this phone, naming a button that is there', () => {
    expect(keptWorkoutsLine(1)).toBe('Your 1 workout is still here. Tap "Use without an account" and add your details to carry on.');
    expect(keptWorkoutsLine(3)).toMatch(/^Your 3 workouts are still here\./);
    // "Start fresh" is gone from the welcome: no line may send a member to it.
    expect(Object.values(START_WORDS).join(' ')).not.toMatch(/Start fresh/);
    expect(RESTORED_NO_PROFILE).not.toMatch(/Start fresh/);
  });

  it('never uses banned or inside words', () => {
    const all = Object.values(START_WORDS).join(' ');
    expect(all).not.toMatch(/\b(sync|session|PR|volume|cloud)\b/i);
  });
});
