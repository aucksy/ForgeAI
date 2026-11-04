/**
 * Launch audit, 3 Nov 2026 (member app #3): "Your workouts are only on this phone" for a member with no
 * account, from their 3rd workout, hidden 30 days by "Hide for 30 days".
 * R-320 (4 Nov 2026): the MettleUp account is the one backup. The card points to signing in only, and a
 * phone with Google Drive linked from an older version is told once that backups moved (lib/backupMoved.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BACKUP_MOVED_WORDS, backupMovedDue, type BackupMovedFacts } from '@/lib/backupMoved';
import {
  SAFEKEEP_AFTER_WORKOUTS,
  SAFEKEEP_WORDS,
  parseHiddenUntil,
  safekeepDue,
  safekeepHiddenUntil,
  type SafekeepFacts,
} from '@/lib/safekeepNudge';
import { NOTICE_ORDER, pickNotice } from '@/lib/workoutNotices';
import { usesBannedWord } from '@/lib/words';

const NOW = Date.UTC(2026, 10, 3, 12);
const DAY = 24 * 60 * 60 * 1000;
const base: SafekeepFacts = {
  workouts: 3,
  signedIn: false,
  accountAvailable: true,
  hiddenUntil: null,
  now: NOW,
};
const ROOT = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('when the card shows', () => {
  it('from the 3rd workout, never before', () => {
    expect(SAFEKEEP_AFTER_WORKOUTS).toBe(3);
    expect(safekeepDue({ ...base, workouts: 2 })).toBe(false);
    expect(safekeepDue({ ...base, workouts: 3 })).toBe(true);
    expect(safekeepDue({ ...base, workouts: 40 })).toBe(true);
  });
  it('never to a member who signed in', () => {
    expect(safekeepDue({ ...base, signedIn: true })).toBe(false);
  });
  it('never on a build that cannot sign in (the button would lead nowhere useful)', () => {
    expect(safekeepDue({ ...base, accountAvailable: false })).toBe(false);
  });
  it('"Hide for 30 days" hides it for 30 days, then it comes back', () => {
    const until = safekeepHiddenUntil(NOW);
    expect(until - NOW).toBe(30 * DAY);
    expect(safekeepDue({ ...base, hiddenUntil: until, now: NOW + 29 * DAY })).toBe(false);
    expect(safekeepDue({ ...base, hiddenUntil: until, now: NOW + 30 * DAY })).toBe(true);
  });
  it('a broken saved "hidden until" counts as never hidden', () => {
    expect(parseHiddenUntil(null)).toBeNull();
    expect(parseHiddenUntil('')).toBeNull();
    expect(parseHiddenUntil('soon')).toBeNull();
    expect(parseHiddenUntil(String(NOW))).toBe(NOW);
  });
});

describe('R-320: "Backups now go to your MettleUp account", once, for a phone with Drive linked', () => {
  const moved: BackupMovedFacts = { driveLinked: true, seen: false, signedIn: false, accountAvailable: true };
  it('shows only while Drive is linked, not yet closed, not signed in, on a build that can sign in', () => {
    expect(backupMovedDue(moved)).toBe(true);
    expect(backupMovedDue({ ...moved, driveLinked: false })).toBe(false);
    expect(backupMovedDue({ ...moved, seen: true })).toBe(false);
    expect(backupMovedDue({ ...moved, signedIn: true })).toBe(false);
    expect(backupMovedDue({ ...moved, accountAvailable: false })).toBe(false);
  });
  it('the words are the agreed line, with "Sign in" and "Got it"', () => {
    expect(BACKUP_MOVED_WORDS.body).toBe('Backups now go to your MettleUp account. Sign in to keep your workouts safe.');
    expect(BACKUP_MOVED_WORDS.button).toBe('Sign in');
    expect(BACKUP_MOVED_WORDS.close).toBe('Got it');
  });
  it('[source-text check] Drive backups no longer run by themselves: no call after a workout or on return', () => {
    expect(read('src/app/session/finish.tsx')).not.toMatch(/autoBackup|backupNow/);
    expect(read('src/app/_layout.tsx')).not.toMatch(/backUpIfOwed|autoBackup/);
    expect(read('src/components/settings/BackupCard.tsx')).not.toMatch(/backupNow/);
  });
});

describe('its place among the Workout tab notices', () => {
  it('is drawn last, one notice at a time, and waits a day after another notice was closed', () => {
    expect(NOTICE_ORDER.at(-1)).toBe('safekeep');
    expect(pickNotice({ safekeep: true }, null, '2026-11-03')).toBe('safekeep');
    expect(pickNotice({ backup: true, safekeep: true }, null, '2026-11-03')).toBe('backup');
    expect(pickNotice({ safekeep: true }, '2026-11-03', '2026-11-03')).toBeNull();
  });
  it('the Workout tab draws both cards in the notice slot', () => {
    const tab = read('src/app/(tabs)/workout.tsx');
    expect(tab).toMatch(/<SafekeepNudgeCard hidden=\{notice !== 'safekeep'\} onWant=\{want\('safekeep'\)\} onDone=\{noticeClosed\} \/>/);
    expect(tab).toMatch(/<BackupMovedCard hidden=\{notice !== 'backup'\} onWant=\{want\('backup'\)\} onDone=\{noticeClosed\} \/>/);
  });
});

describe('the words (member-words)', () => {
  it('are the agreed lines, complete sentences, with no banned word', () => {
    expect(SAFEKEEP_WORDS.body).toBe('Your workouts are only on this phone. Sign in with Google and MettleUp keeps them safe in your account.');
    expect(SAFEKEEP_WORDS.body).not.toMatch(/Drive/);
    for (const w of [...Object.values(SAFEKEEP_WORDS), ...Object.values(BACKUP_MOVED_WORDS)]) {
      expect(usesBannedWord(w)).toBe(false);
      expect(w).not.toMatch(/—|✓|\b(volume|PR|session|last)\b/i);
    }
  });
});
