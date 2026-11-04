/**
 * Launch audit, 3 Nov 2026 (member app #3): "Your workouts are only on this phone" for a member with no
 * account and no backup, from their 3rd workout, hidden 30 days by "Hide for 30 days".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  driveLinked: false,
  lastBackupAt: null,
  driveAvailable: true,
  hiddenUntil: null,
  now: NOW,
};

describe('when the card shows', () => {
  it('from the 3rd workout, never before', () => {
    expect(SAFEKEEP_AFTER_WORKOUTS).toBe(3);
    expect(safekeepDue({ ...base, workouts: 2 })).toBe(false);
    expect(safekeepDue({ ...base, workouts: 3 })).toBe(true);
    expect(safekeepDue({ ...base, workouts: 40 })).toBe(true);
  });
  it('never to a member who signed in, linked Drive, or backed up before', () => {
    expect(safekeepDue({ ...base, signedIn: true })).toBe(false);
    expect(safekeepDue({ ...base, driveLinked: true })).toBe(false);
    expect(safekeepDue({ ...base, lastBackupAt: '2026-10-30T10:00:00.000Z' })).toBe(false);
  });
  it('never on a build without Drive backup (the button would lead nowhere useful)', () => {
    expect(safekeepDue({ ...base, driveAvailable: false })).toBe(false);
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

describe('its place among the Workout tab notices', () => {
  it('is drawn last, one notice at a time, and waits a day after another notice was closed', () => {
    expect(NOTICE_ORDER.at(-1)).toBe('safekeep');
    expect(pickNotice({ safekeep: true }, null, '2026-11-03')).toBe('safekeep');
    expect(pickNotice({ backup: true, safekeep: true }, null, '2026-11-03')).toBe('backup');
    expect(pickNotice({ safekeep: true }, '2026-11-03', '2026-11-03')).toBeNull();
  });
  it('the Workout tab draws it in the notice slot', () => {
    const tab = readFileSync(join(__dirname, '..', '..', 'src', 'app', '(tabs)', 'workout.tsx'), 'utf8');
    expect(tab).toMatch(/<SafekeepNudgeCard hidden=\{notice !== 'safekeep'\} onWant=\{want\('safekeep'\)\} onDone=\{noticeClosed\} \/>/);
  });
});

describe('the words (member-words)', () => {
  it('are the agreed lines, complete sentences, with no banned word', () => {
    expect(SAFEKEEP_WORDS.body).toBe('Your workouts are only on this phone. Back them up to Google Drive so you never lose them.');
    for (const w of Object.values(SAFEKEEP_WORDS)) {
      expect(usesBannedWord(w)).toBe(false);
      expect(w).not.toMatch(/—|✓|\b(volume|PR|session|last)\b/i);
    }
  });
});
