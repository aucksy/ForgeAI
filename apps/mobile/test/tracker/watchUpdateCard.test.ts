/**
 * R-438 (owner, 10 Nov 2026): the phone's "Your watch app has an update" pop-up. When it shows (state,
 * "Later", a workout, the phone's own update), what "New on your watch" lists, what each answer to
 * "Update on watch" leads to, the QA links, and that the tabs mount it (read as text).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import type { WatchNode } from '@/tracker/services/watchUpdate';
import {
  SNOOZE_MS,
  WATCH_UPDATE_WORDS,
  cardShows,
  oldestWatchVersion,
  qaWatchLink,
  qaWatchRead,
  readSnooze,
  shortVersion,
  snoozeMark,
  snoozed,
  stepAfter,
  stepWords,
  targetNode,
  watchLine,
  watchNews,
  type CardInput,
} from '@/tracker/services/watchUpdateCard';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const due: CardInput = { state: 'update-ready', snooze: null, phoneVersion: '0.77.0', now: NOW, workoutOpen: false, phoneUpdateWaits: false };
const node = (over: Partial<WatchNode> = {}): WatchNode => ({
  nodeId: 'w1',
  displayName: 'Pixel Watch 3',
  hasApp: true,
  versionName: '0.76.0',
  versionCode: null,
  ...over,
});

describe('cardShows', () => {
  it('shows on update-ready with no "Later"', () => {
    expect(cardShows(due)).toBe(true);
  });

  it('never on unknown, none or up-to-date', () => {
    for (const state of ['unknown', 'none', 'up-to-date'] as const) expect(cardShows({ ...due, state })).toBe(false);
  });

  it('waits until "Later" has been read', () => {
    expect(cardShows({ ...due, snooze: undefined })).toBe(false);
  });

  it('never while a workout is open', () => {
    expect(cardShows({ ...due, workoutOpen: true })).toBe(false);
  });

  it("the phone's own update goes first", () => {
    expect(cardShows({ ...due, phoneUpdateWaits: true })).toBe(false);
  });

  it('"Later" holds for 24 hours, then asks again', () => {
    const snooze = { version: '0.77.0', at: NOW };
    expect(cardShows({ ...due, snooze, now: NOW + 60_000 })).toBe(false);
    expect(cardShows({ ...due, snooze, now: NOW + SNOOZE_MS - 1 })).toBe(false);
    expect(cardShows({ ...due, snooze, now: NOW + SNOOZE_MS })).toBe(true);
  });

  it('a NEW phone version asks at once, whatever "Later" said', () => {
    expect(cardShows({ ...due, snooze: { version: '0.76.0', at: NOW }, now: NOW + 1000 })).toBe(true);
  });

  it('a clock set back asks rather than blocking for ever', () => {
    expect(snoozed({ version: '0.77.0', at: NOW }, '0.77.0', NOW - 1000)).toBe(false);
  });
});

// R-444 (fresh-eyes review): Play may have no watch build for this member (the watch went only to the
// internal track), so after "Update on watch" the watch stays old. Asking every day would nag.
describe('after "Update on watch" (R-444)', () => {
  const tapped = snoozeMark('0.77.0', NOW, true);

  it('never asks again for the same phone version, even days later with the watch still old', () => {
    expect(tapped).toEqual({ version: '0.77.0', at: NOW, tapped: true });
    for (const later of [60_000, SNOOZE_MS, 30 * SNOOZE_MS]) expect(cardShows({ ...due, snooze: tapped, now: NOW + later })).toBe(false);
  });

  it('a NEWER phone version asks once more', () => {
    expect(cardShows({ ...due, phoneVersion: '0.78.0', snooze: tapped, now: NOW + 1000 })).toBe(true);
  });

  it('a clock set back does not bring it back either', () => {
    expect(snoozed(tapped, '0.77.0', NOW - SNOOZE_MS)).toBe(true);
  });

  it('plain "Later" (no tap) still asks again after 24 hours (regression)', () => {
    const later = snoozeMark('0.77.0', NOW, false);
    expect(later).toEqual({ version: '0.77.0', at: NOW });
    expect(cardShows({ ...due, snooze: later, now: NOW + SNOOZE_MS })).toBe(true);
  });

  it('the stored mark keeps "tapped" through a restart; anything else is not tapped', () => {
    expect(readSnooze(JSON.stringify(tapped))).toEqual(tapped);
    expect(readSnooze(JSON.stringify({ version: '0.77.0', at: NOW, tapped: 'yes' }))).toEqual({ version: '0.77.0', at: NOW });
  });

  it('the pop-up saves the mark at the tap and on "Got it" after it (read as text)', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/WatchUpdatePrompt.tsx'), 'utf8');
    expect(src).toMatch(/const tapped = step !== 'offer'/);
    expect(src).toMatch(/snoozeWatchCard\(phoneVersion, now, tapped\)/);
    expect(src).toMatch(/setBusy\(true\);[\s\S]{0,200}snoozeWatchCard\(phoneVersion, Date\.now\(\), true\)/);
  });
});

describe('readSnooze', () => {
  it('reads the stored mark, and anything broken as none', () => {
    expect(readSnooze(JSON.stringify({ version: '0.77.0', at: NOW }))).toEqual({ version: '0.77.0', at: NOW });
    expect(readSnooze(null)).toBeNull();
    expect(readSnooze('')).toBeNull();
    expect(readSnooze('{nope')).toBeNull();
    expect(readSnooze(JSON.stringify({ version: 1, at: NOW }))).toBeNull();
  });
});

describe('New on your watch', () => {
  it('keeps only lines about the watch, without the "Watch:" label', () => {
    expect(watchLine('Watch: bigger -15 and +15 buttons on the rest timer, and long names fit.')).toBe(
      'Bigger -15 and +15 buttons on the rest timer, and long names fit.',
    );
    expect(watchLine('On your watch, you can now log each set with the dial and one tap on Done.')).toMatch(/^On your watch/);
    expect(watchLine('Your watch now keeps MettleUp open all workout.')).toMatch(/^Your watch/);
    expect(watchLine('If your trainer filmed an exercise, tap "Watch your trainer" on that exercise\'s page.')).toBeNull();
    expect(watchLine('Small fixes.')).toBeNull();
  });

  const log = [
    { version: '0.78.0', date: '', lines: [{ text: 'Watch: a line from a newer phone.' }] },
    { version: '0.77.0', date: '', lines: [{ text: 'Charts tap.' }, { text: 'Watch: new rest ring.' }] },
    { version: '0.76.0', date: '', lines: [{ text: 'On your watch, heart rate reads faster.' }] },
    { version: '0.75.0', date: '', lines: [{ text: 'Watch: an old line.' }] },
  ];

  it('lists the versions newer than the watch, up to the phone, newest first', () => {
    expect(watchNews('0.77.0', '0.75.0', log)).toEqual(['New rest ring.', 'On your watch, heart rate reads faster.']);
  });

  it('a watch too old to say its version: the last 3 versions up to the phone', () => {
    expect(watchNews('0.77.0', null, log)).toEqual(['New rest ring.', 'On your watch, heart rate reads faster.', 'An old line.']);
  });

  it('nothing about the watch: empty (the pop-up then says why to update)', () => {
    expect(watchNews('0.77.0', '0.76.0', [{ version: '0.77.0', date: '', lines: [{ text: 'Charts tap.' }] }])).toEqual([]);
  });

  it('at most 3 lines', () => {
    const many = [{ version: '0.77.0', date: '', lines: ['a', 'b', 'c', 'd'].map((x) => ({ text: `Watch: ${x}.` })) }];
    expect(watchNews('0.77.0', '0.76.0', many)).toHaveLength(3);
  });

  it('uses the real What\'s new log (0.73.0 had a watch line)', () => {
    expect(watchNews('0.73.0', '0.72.0')).toEqual(['Bigger -15 and +15 buttons on the rest timer, and long names fit.']);
  });

  it('the oldest watch decides the range; one without a version means "too old to say"', () => {
    expect(oldestWatchVersion([node({ versionName: '0.75.0' }), node({ versionName: '0.74.0' })])).toBe('0.74.0');
    expect(oldestWatchVersion([node(), node({ versionName: null })])).toBeNull();
  });
});

describe('Update on watch', () => {
  it('asks the one watch to update, or every watch when several', () => {
    expect(targetNode([node({ nodeId: 'a' })])).toBe('a');
    expect(targetNode([node({ nodeId: 'a' }), node({ nodeId: 'b' })])).toBeNull();
  });

  it('opened: "Check your watch"; no watch: not connected; anything else: search for it', () => {
    expect(stepAfter('opened')).toBe('opened');
    expect(stepAfter('none')).toBe('noWatch');
    for (const r of ['failed', 'missing', 'unknown'] as const) expect(stepAfter(r)).toBe('fallback');
    expect(stepWords('opened').title).toBe('Check your watch');
    expect(stepWords('fallback').title).toBe('The update did not start');
    expect(stepWords('fallback').body).toBe('Open Play Store on your watch, search for MettleUp and tap Update.');
    expect(stepWords('noWatch').title).toBe('Your watch is not connected');
    expect(stepWords('noWatch').body).toMatch(/Bluetooth/);
  });

  it('shows the version short on the watch face', () => {
    expect(shortVersion('0.76.0')).toBe('0.76');
    expect(shortVersion('0.62.1')).toBe('0.62.1');
  });
});

describe('member words', () => {
  it('no banned or inside words', () => {
    const all = Object.values(WATCH_UPDATE_WORDS).map((w) => (typeof w === 'function' ? w('0.77') : w));
    for (const w of all) {
      expect(usesBannedWord(w), w).toBe(false);
      expect(w, w).not.toMatch(/\b(sync|node|session|capability|data layer)\b/i);
    }
  });
});

describe('QA links (QA builds only)', () => {
  it('reads the made-up watch and the made-up tap answer', () => {
    expect(qaWatchLink('mettleup://qa-update?watch=old')).toEqual({ watch: 'old', tap: null });
    expect(qaWatchLink('mettleup://qa-update?watch=forget&watchtap=failed')).toEqual({ watch: 'forget', tap: 'failed' });
    expect(qaWatchLink('mettleup://qa-update?behind=1')).toEqual({ watch: null, tap: null });
    expect(qaWatchLink('https://evil.example/qa-update?watch=old')).toEqual({ watch: null, tap: null });
  });

  it('old = one version behind (update-ready); same = up to date', () => {
    expect(qaWatchRead('old', '0.76.0')?.nodes[0].versionName).toBe('0.75.0');
    expect(qaWatchRead('same', '0.76.0')?.nodes[0].versionName).toBe('0.76.0');
    expect(qaWatchRead('', '0.76.0')).toBeNull();
  });
});

describe('wiring (read as text)', () => {
  const root = resolve(__dirname, '../..');
  it('the tabs mount the pop-up next to the phone update', () => {
    const layout = readFileSync(resolve(root, 'src/app/(tabs)/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/<UpdatePrompt \/>[\s\S]*<WatchUpdatePrompt \/>/);
  });

  it('the pop-up gives way to a workout and only shows over the tabs', () => {
    const src = readFileSync(resolve(root, 'src/components/WatchUpdatePrompt.tsx'), 'utf8');
    expect(src).toContain("useSegments()[0] === '(tabs)'");
    expect(src).toMatch(/workoutOpen: workout/);
    expect(src).toMatch(/!workout/);
  });
});
