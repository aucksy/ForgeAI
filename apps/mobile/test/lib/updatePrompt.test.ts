import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countLaunch,
  DAY_MS,
  earlierLine,
  hasUpdateStandIn,
  isUrgent,
  kickerFor,
  lineFor,
  markFor,
  markShown,
  newsFor,
  popupDue,
  qaStandInBehind,
  readMark,
  standInVersion,
  versionsBehind,
  type PopupMark,
} from '@/lib/updatePrompt';

const T0 = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

/** A mark that showed at `lastAt`, then `n` launches counted (as the store does on each launch). */
function after(n: number, lastAt = T0): PopupMark {
  let m: PopupMark = markShown(markFor(null, 'k', T0), lastAt);
  for (let i = 0; i < n; i++) m = countLaunch(m);
  return m;
}
const due = (mark: PopupMark, now: number, urgent = false, workoutOpen = false) => popupDue({ now, mark, urgent, workoutOpen });

describe('updatePrompt (R-336: when the full-screen update shows)', () => {
  it('counts versions behind', () => {
    expect(versionsBehind('0.65.0', '0.64.0')).toBe(1);
    expect(versionsBehind('0.66.0', '0.64.0')).toBe(2);
    expect(versionsBehind('0.64.1', '0.64.0')).toBe(1);
    expect(versionsBehind('1.0.0', '0.64.0')).toBe(99);
    expect(versionsBehind('0.64.0', '0.64.0')).toBe(0);
    expect(versionsBehind('0.63.0', '0.64.0')).toBe(0);
    expect(versionsBehind(null, '0.64.0')).toBe(0);
  });

  it('is far behind when 2+ versions, Play says 14+ days, or known for 14+ days', () => {
    expect(isUrgent({ behind: 2, staleDays: null, firstAt: T0, now: T0 })).toBe(true);
    expect(isUrgent({ behind: 0, staleDays: 14, firstAt: T0, now: T0 })).toBe(true);
    expect(isUrgent({ behind: 1, staleDays: 3, firstAt: T0, now: T0 + 14 * DAY_MS })).toBe(true);
    expect(isUrgent({ behind: 1, staleDays: 3, firstAt: T0, now: T0 + 13 * DAY_MS })).toBe(false);
  });

  it('first show: the first launch that finds a newer version', () => {
    const fresh = countLaunch(markFor(null, '0.73.0', T0));
    expect(fresh).toEqual({ key: '0.73.0', firstAt: T0, lastAt: 0, launchesSince: 0 });
    expect(due(fresh, T0)).toBe(true);
  });

  it('launches 1 to 6 after it showed: no; the 7th: yes', () => {
    const later = T0 + 30 * DAY_MS; // far past the 24-hour cap
    for (let n = 1; n <= 6; n++) expect(due(after(n), later)).toBe(false);
    expect(due(after(7), later)).toBe(true);
    expect(due(after(8), later)).toBe(true); // a 7th launch blocked by the cap shows on the next one
  });

  it('far behind: every 3rd launch instead of the 7th', () => {
    const later = T0 + 30 * DAY_MS;
    expect(due(after(2), later, true)).toBe(false);
    expect(due(after(3), later, true)).toBe(true);
  });

  it('never twice within 24 hours, however many launches', () => {
    expect(due(after(7), T0 + 23 * HOUR)).toBe(false);
    expect(due(after(3), T0 + DAY_MS - 1, true)).toBe(false);
    expect(due(after(7), T0 + DAY_MS)).toBe(true);
  });

  it('a clock set back: the 24-hour cap is skipped, the launch count still rules', () => {
    expect(due(after(7), T0 - DAY_MS)).toBe(true);
    expect(due(after(2), T0 - DAY_MS)).toBe(false);
  });

  it('a new version resets everything: it shows on the next launch', () => {
    const old = after(2);
    const fresh = countLaunch(markFor(old, '0.74.0', T0 + HOUR));
    expect(fresh).toEqual({ key: '0.74.0', firstAt: T0 + HOUR, lastAt: 0, launchesSince: 0 });
    expect(due(fresh, T0 + HOUR)).toBe(true);
    expect(markFor(old, 'k', T0 + 9)).toBe(old);
  });

  it('never while a workout is open', () => {
    expect(due(countLaunch(markFor(null, 'k', T0)), T0, false, true)).toBe(false);
    expect(due(after(7), T0 + 30 * DAY_MS, true, true)).toBe(false);
  });

  it('showing starts the count again', () => {
    const shown = markShown(after(7), T0 + 30 * DAY_MS);
    expect(shown.launchesSince).toBe(0);
    expect(shown.lastAt).toBe(T0 + 30 * DAY_MS);
    expect(countLaunch(markFor(null, 'k', T0)).launchesSince).toBe(0); // not counted before the first show
  });

  it('reads saved marks; broken ones read as none; a mark from before R-336 counts 0 launches', () => {
    expect(readMark(JSON.stringify({ key: 'k', firstAt: 1, lastAt: 2, launchesSince: 4 }))).toEqual({ key: 'k', firstAt: 1, lastAt: 2, launchesSince: 4 });
    expect(readMark(JSON.stringify({ key: 'k', firstAt: 1, lastAt: 2 }))).toEqual({ key: 'k', firstAt: 1, lastAt: 2, launchesSince: 0 });
    expect(readMark(JSON.stringify({ key: 'k', firstAt: 1, lastAt: 2, launchesSince: -3 }))?.launchesSince).toBe(0);
    expect(readMark('{bad')).toBeNull();
    expect(readMark(JSON.stringify({ key: 'k' }))).toBeNull();
    expect(readMark(null)).toBeNull();
  });
});

describe('R-336: the words on the full screen and the line', () => {
  it('kicker: the version, or how many versions behind', () => {
    expect(kickerFor(1, '0.73.0')).toBe('Version 0.73.0 is ready');
    expect(kickerFor(3, '0.75.0')).toBe('You are 3 versions behind');
    expect(kickerFor(1, null)).toBe('A new version is ready');
    expect(kickerFor(99, '1.0.0')).toBe('Version 1.0.0 is ready');
  });

  it('the earlier-updates line only when 2+ behind', () => {
    expect(earlierLine(1)).toBeNull();
    expect(earlierLine(2)).toBe('And the changes from 1 earlier update.');
    expect(earlierLine(3)).toBe('And the changes from 2 earlier updates.');
    expect(earlierLine(99)).toBeNull();
  });

  it('the rows count only when they are about the newest version', () => {
    const news = { version: '0.75.0', lines: ['a', 'b', 'c'] };
    expect(newsFor({ kind: 'github', version: '0.75.0', current: '0.72.0', news })).toEqual({ version: '0.75.0', behind: 3, lines: ['a', 'b', 'c'] });
    // GitHub offers 0.74.0 but the file is already 0.75.0: no rows.
    expect(newsFor({ kind: 'github', version: '0.74.0', current: '0.72.0', news })).toEqual({ version: '0.74.0', behind: 2, lines: [] });
    // Play gives only a build number: the file's version counts versions behind.
    expect(newsFor({ kind: 'play', version: null, current: '0.72.0', news })).toEqual({ version: '0.75.0', behind: 3, lines: ['a', 'b', 'c'] });
    // The file cannot be read, or it is not newer than this app: no rows, 1 behind, no version for Play.
    expect(newsFor({ kind: 'play', version: null, current: '0.72.0', news: null })).toEqual({ version: null, behind: 1, lines: [] });
    expect(newsFor({ kind: 'play', version: null, current: '0.75.0', news })).toEqual({ version: null, behind: 1, lines: [] });
  });

  it('the orange line: Update, downloading, Restart, after the workout', () => {
    expect(lineFor({ kind: null, playStatus: 'none', workout: false })).toBeNull();
    expect(lineFor({ kind: 'github', playStatus: 'none', workout: false })).toEqual({ text: 'A new version of MettleUp is ready', action: 'Update' });
    expect(lineFor({ kind: 'play', playStatus: 'downloading', workout: false })).toEqual({ text: 'Downloading the new version. Keep using the app.', action: null });
    expect(lineFor({ kind: 'play', playStatus: 'downloaded', workout: false })).toEqual({ text: 'The new version is ready.', action: 'Restart' });
    expect(lineFor({ kind: 'play', playStatus: 'downloaded', workout: true })?.action).toBeNull();
  });

  it('member words: never "volume", "PR" or "session"', () => {
    const all = [kickerFor(3, '0.75.0'), earlierLine(3), ...['ready', 'downloading', 'downloaded', 'afterWorkout'].map((k) => lineFor({ kind: 'play', playStatus: k === 'downloading' ? 'downloading' : k === 'ready' ? 'none' : 'downloaded', workout: k === 'afterWorkout' })?.text)].join(' ');
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession\b/i);
  });
});

describe('R-336 QA stand-in (test builds only)', () => {
  it('only with extra.qaStandIns containing updateOffer', () => {
    expect(hasUpdateStandIn({ qaStandIns: ['friendInvite', 'updateOffer'] })).toBe(true);
    expect(hasUpdateStandIn({ qaStandIns: ['friendInvite'] })).toBe(false);
    expect(hasUpdateStandIn(undefined)).toBe(false);
  });
  it('reads N from the test link only', () => {
    expect(qaStandInBehind('mettleup://qa-update?behind=3')).toBe(3);
    expect(qaStandInBehind('mettleup:///qa-update?behind=0')).toBe(0);
    expect(qaStandInBehind('mettleup://workout?behind=3')).toBeNull();
    expect(qaStandInBehind(null)).toBeNull();
  });
  it('a made-up version N steps ahead', () => {
    expect(standInVersion('0.72.0', 3)).toBe('0.75.0');
    expect(standInVersion('0.72.1', 1)).toBe('0.73.0');
    expect(standInVersion('0.72.0', 0)).toBeNull();
    expect(standInVersion(null, 2)).toBeNull();
  });
});

describe('R-336 UAT finding: "a workout is open" is the store true/false flag', () => {
  it('never `active != null` (always true for a boolean: the pop-up could never show)', () => {
    const src = join(__dirname, '..', '..', 'src');
    for (const f of ['components/UpdatePrompt.tsx', 'components/UpdateLine.tsx', 'lib/updateStore.ts']) {
      const text = readFileSync(join(src, f), 'utf8');
      expect(text, f).not.toMatch(/\.active\s*!==?\s*null/);
      expect(text, f).toMatch(/useActiveWorkout/);
    }
  });
});
