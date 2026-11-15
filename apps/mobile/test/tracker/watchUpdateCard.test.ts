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
  AWAY_TRIES,
  SNOOZE_MS,
  WATCH_UPDATE_WORDS,
  cardDecision,
  cardShows,
  popupLine,
  oldestWatchVersion,
  qaWatchLink,
  qaWatchRead,
  readSnooze,
  retryAfter,
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
  connected: true,
  versionName: '0.76.0',
  versionCode: null,
  ...over,
});

describe('R-596 (review G4): a watch out of reach waits, then shows when it is back', () => {
  it('the reported case: away -> no pop-up, reason "waits: watch not connected"', () => {
    expect(cardDecision({ ...due, state: 'away' })).toEqual({ shows: false, why: 'waits: watch not connected' });
  });

  it('reconnected (update-ready) -> shows', () => {
    expect(cardShows({ ...due, state: 'away' })).toBe(false);
    expect(cardShows({ ...due, state: 'update-ready' })).toBe(true);
  });

  it('"Later" and "Update on watch tapped" still hold once the watch is back', () => {
    expect(cardDecision({ ...due, snooze: { version: '0.77.0', at: NOW } }).why).toBe('hidden: Later (24 hours)');
    expect(cardDecision({ ...due, snooze: { version: '0.77.0', at: NOW, tapped: true } }).why).toBe('hidden: Update on watch tapped for this version');
    expect(cardShows({ ...due, state: 'away', snooze: null })).toBe(false);
  });

  it('away is asked again: 20 s, then every 2 minutes for about half an hour, then not until the app is back', () => {
    expect(retryAfter('away', 0)).toBe(20_000);
    expect(retryAfter('away', 1)).toBe(120_000);
    expect(retryAfter('away', AWAY_TRIES - 1)).toBe(120_000);
    expect(retryAfter('away', AWAY_TRIES)).toBeNull();
  });

  it('the old retries are unchanged; a found or current watch is not asked again', () => {
    expect(retryAfter('unknown', 0)).toBe(20_000);
    expect(retryAfter('none', 1)).toBe(120_000);
    expect(retryAfter('none', 2)).toBeNull();
    expect(retryAfter('update-ready', 0)).toBeNull();
    expect(retryAfter('up-to-date', 0)).toBeNull();
  });

  it('the QA stand-in "away" is the older watch, not connected', () => {
    expect(qaWatchLink('mettleup://qa-update?watch=away')).toEqual({ watch: 'away', tap: null });
    const r = qaWatchRead('away', '0.79.0');
    expect(r?.nodes[0]).toMatchObject({ connected: false, hasApp: true, versionName: '0.78.0' });
  });
});

describe('cardShows', () => {
  it('shows on update-ready with no "Later"', () => {
    expect(cardShows(due)).toBe(true);
  });

  it('never on unknown, none, up-to-date or away', () => {
    for (const state of ['unknown', 'none', 'up-to-date', 'away'] as const) expect(cardShows({ ...due, state })).toBe(false);
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

  it('R-575: it waits for another pop-up, tries a bad read again and notes each decision', () => {
    const src = readFileSync(resolve(root, 'src/components/WatchUpdatePrompt.tsx'), 'utf8');
    expect(src).toContain('useConfirmStore((s) => s.request != null)');
    expect(src).toMatch(/otherPopup,/);
    // R-596: the retry rule lives in watchUpdateCard.ts (retryAfter); the screen uses it and reads again on return.
    expect(src).toContain('retryAfter(r.state, attempt)');
    expect(src).toContain('away.current && retry.current == null');
    const card = readFileSync(resolve(root, 'src/tracker/services/watchUpdateCard.ts'), 'utf8');
    expect(card).toContain('RETRY_MS: readonly number[] = [20_000, 120_000]');
    expect(src).toContain('notePopup(popupLine(');
    // The log's head reads the same note.
    const diag = readFileSync(resolve(root, 'src/lib/watchDiag.ts'), 'utf8');
    expect(diag).toContain('lastPopupNote');
  });
});

describe('R-575: the decision says why', () => {
  it('each rule names itself', () => {
    expect(cardDecision(due)).toEqual({ shows: true, why: 'shown' });
    expect(cardDecision({ ...due, state: 'unknown' })).toEqual({ shows: false, why: 'no pop-up: watch unknown' });
    expect(cardDecision({ ...due, state: 'none' }).why).toBe('no pop-up: watch none');
    expect(cardDecision({ ...due, snooze: undefined }).why).toBe('waits: Later not read yet');
    expect(cardDecision({ ...due, workoutOpen: true }).why).toBe('waits: workout open');
    expect(cardDecision({ ...due, phoneUpdateWaits: true }).why).toBe('waits: phone update first');
    expect(cardDecision({ ...due, snooze: { version: '0.77.0', at: NOW } }).why).toBe('hidden: Later (24 hours)');
    expect(cardDecision({ ...due, snooze: { version: '0.77.0', at: NOW, tapped: true } }).why).toBe('hidden: Update on watch tapped for this version');
  });

  it('another pop-up up (a question sheet) holds it; it shows once that closes', () => {
    expect(cardDecision({ ...due, otherPopup: true })).toEqual({ shows: false, why: 'waits: another pop-up' });
    expect(cardShows({ ...due, otherPopup: true })).toBe(false);
    expect(cardShows({ ...due, otherPopup: false })).toBe(true);
  });

  it('the log line is short, timed, and carries the read only when it was not update-ready', () => {
    const at = Date.UTC(2026, 10, 15, 13, 20);
    expect(popupLine(at, 'update-ready', 'shown', 'nodes=1 capR=1 capA=1 ver=0 diag=1')).toBe('11-15 13:20 UTC update-ready, shown');
    expect(popupLine(at, 'unknown', 'no pop-up: watch unknown', 'timeout')).toBe('11-15 13:20 UTC unknown, no pop-up: watch unknown (read: timeout)');
    expect(popupLine(at, 'none', 'no pop-up: watch none')).toBe('11-15 13:20 UTC none, no pop-up: watch none');
  });

  it('the QA stand-in reads as a connected watch', () => {
    const r = qaWatchRead('old', '0.78.0');
    expect(r?.nodes[0].connected).toBe(true);
    expect(r?.why).toBe('qa');
  });
});
