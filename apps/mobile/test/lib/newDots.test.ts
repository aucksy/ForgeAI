/**
 * F198 "follow the dots" (R-389/R-390): the trail from a What's new line's `go`, fixes never light, the 30-day
 * end in India time, at most 3 at once, seen clears the parents but keeps another feature's, broken storage.
 */
import { describe, expect, it } from 'vitest';

import {
  DOT_DAYS,
  dotTestId,
  featuresAt,
  featuresOf,
  istDay,
  litFeatures,
  litSpots,
  liveAtOf,
  parseSeen,
  stillNew,
  trailOf,
  withSeen,
} from '@/lib/newDots';
import { WHATS_NEW_LOG, type WhatsNewEntry } from '@/lib/whatsNew';

/** An instant given in India time. */
const ist = (s: string): number => Date.parse(`${s}+05:30`);

const LOG: WhatsNewEntry[] = [
  {
    version: '0.74.0',
    date: '7 Nov',
    lines: [
      { text: 'New A', go: { label: 'A', href: '/settings/ask-ai' }, feature: true },
      { text: 'A fix with a button', go: { label: 'Rest', href: '/settings/rest' } },
      { text: 'Many small fixes.' },
    ],
  },
  {
    version: '0.73.0',
    date: '6 Nov',
    lines: [{ text: 'Sleep', go: { label: 'Sleep and workouts', href: '/settings/health' }, feature: true }],
  },
  {
    version: '0.72.0',
    date: '5 Nov',
    lines: [
      { text: 'Gym', go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' }, feature: true },
      { text: 'Feature with nowhere to go', feature: true },
    ],
  },
  { version: '0.71.0', date: '4 Nov', lines: [{ text: 'Watch', go: { label: 'Your watch', href: '/settings/watch' }, feature: true }] },
];

const NOW = ist('2026-11-07T12:00:00');
const none = new Set<string>();

describe('the trail comes from the line’s go', () => {
  it('a Settings page: Profile tab, Settings button, its row, the page', () => {
    expect(trailOf({ label: 'x', href: '/settings/health' })).toEqual(['tab:profile', 'gear', 'row:/settings/health', 'page:/settings/health']);
  });
  it('a tab, and a part of the Gym tab', () => {
    expect(trailOf({ label: 'x', href: '/progress' })).toEqual(['tab:progress', 'page:/progress']);
    expect(trailOf({ label: 'x', href: '/shop', section: 'gym' })).toEqual(['tab:shop', 'section:gym', 'page:/shop#gym']);
  });
  it('test ids the device flows look for', () => {
    expect(dotTestId('tab:profile')).toBe('new-dot-tab-profile');
    expect(dotTestId('gear')).toBe('new-dot-gear');
    expect(dotTestId('row:/settings/health')).toBe('new-dot-row-health');
    expect(dotTestId('page:/settings/health')).toBe('new-dot-page-health');
    expect(dotTestId('page:/shop#gym')).toBe('new-dot-page-shop-gym');
    expect(dotTestId('section:gym')).toBe('new-dot-section-gym');
  });
});

describe('fixes never light a dot', () => {
  it('only lines marked as a feature with a place to go', () => {
    const ids = featuresOf(LOG, NOW).map((f) => f.id);
    expect(ids).toEqual(['0.74.0|/settings/ask-ai', '0.73.0|/settings/health', '0.72.0|/shop#gym', '0.71.0|/settings/watch']);
    expect(ids.some((id) => id.includes('/settings/rest'))).toBe(false);
  });
  it('the real log: every feature line has a go, and no fix-like line is a feature', () => {
    for (const e of WHATS_NEW_LOG) {
      for (const l of e.lines) {
        if (!l.feature) continue;
        expect(l.go, l.text).toBeTruthy();
        expect(l.text).not.toMatch(/\bfix|bug|no longer|is gone|are gone/i);
      }
    }
  });
  it('the real log: Sleep and workouts (0.73.0) is a feature on Health apps', () => {
    const f = featuresOf(WHATS_NEW_LOG, ist('2026-11-07T12:00:00')).find((x) => x.version === '0.73.0');
    expect(f?.href).toBe('/settings/health');
  });
});

describe('30 days from the entry’s date, India time', () => {
  const sleep = (now: number) => litFeatures({ log: LOG, now, seen: none }).some((f) => f.version === '0.73.0');
  it('the entry’s date is midnight in India', () => {
    expect(liveAtOf('6 Nov', NOW)).toBe(ist('2026-11-06T00:00:00'));
  });
  it('lit on its own day from India midnight, and for 29 more days', () => {
    expect(sleep(ist('2026-11-06T00:00:00'))).toBe(true);
    expect(sleep(ist('2026-12-05T23:59:59'))).toBe(true);
  });
  it('gone at India midnight on day 30 (still 5 Dec in UTC)', () => {
    expect(sleep(ist('2026-12-06T00:00:00'))).toBe(false);
    expect(new Date(ist('2026-12-06T00:00:00')).getUTCDate()).toBe(5);
    expect(DOT_DAYS).toBe(30);
  });
  it('just before India midnight the day before it went live: not yet (that date is last year’s)', () => {
    expect(sleep(ist('2026-11-05T23:59:00'))).toBe(false);
  });
  it('a December entry read in January is last year’s', () => {
    expect(liveAtOf('28 Dec', ist('2027-01-10T09:00:00'))).toBe(ist('2026-12-28T00:00:00'));
    expect(stillNew({ liveAt: ist('2026-12-28T00:00:00') }, ist('2027-01-10T09:00:00'))).toBe(true);
  });
  it('an unreadable date lights nothing', () => {
    expect(liveAtOf('soon', NOW)).toBeNull();
    expect(featuresOf([{ version: '9.0.0', date: 'soon', lines: [{ text: 'x', go: { label: 'x', href: '/settings/rest' }, feature: true }] }], NOW)).toEqual([]);
  });
  it('India day numbers turn at 18:30 UTC', () => {
    expect(istDay(Date.parse('2026-11-06T18:29:59Z'))).toBe(istDay(Date.parse('2026-11-06T00:00:00Z')));
    expect(istDay(Date.parse('2026-11-06T18:30:00Z'))).toBe(istDay(Date.parse('2026-11-06T00:00:00Z')) + 1);
  });
});

describe('at most 3 at once, newest first', () => {
  it('the 4th waits', () => {
    expect(litFeatures({ log: LOG, now: NOW, seen: none }).map((f) => f.version)).toEqual(['0.74.0', '0.73.0', '0.72.0']);
  });
  it('a seen one makes room for the next', () => {
    const seen = new Set(['0.74.0|/settings/ask-ai']);
    expect(litFeatures({ log: LOG, now: NOW, seen }).map((f) => f.version)).toEqual(['0.73.0', '0.72.0', '0.71.0']);
  });
  it('a feature this phone cannot show is skipped, never a dot to nowhere', () => {
    const lit = litFeatures({ log: LOG, now: NOW, seen: none, available: (f) => f.href !== '/settings/health' });
    expect(lit.map((f) => f.version)).toEqual(['0.74.0', '0.72.0', '0.71.0']);
  });
});

describe('opening the page clears its dots; another feature keeps its parents', () => {
  const settingsOnly = LOG.slice(0, 2); // Ask an AI + Sleep, both behind Settings
  it('both lit: the Profile tab, the Settings button and both rows', () => {
    const spots = litSpots(litFeatures({ log: settingsOnly, now: NOW, seen: none }));
    expect([...spots]).toEqual(expect.arrayContaining(['tab:profile', 'gear', 'row:/settings/ask-ai', 'row:/settings/health']));
  });
  it('Health apps opened: its row and page dots go, the tab and button stay for Ask an AI', () => {
    const lit = litFeatures({ log: settingsOnly, now: NOW, seen: none });
    const here = featuresAt(lit, '/settings/health');
    expect(here.map((f) => f.id)).toEqual(['0.73.0|/settings/health']);
    const seen = new Set(withSeen([], here.map((f) => f.id)));
    const spots = litSpots(litFeatures({ log: settingsOnly, now: NOW, seen }));
    expect(spots.has('row:/settings/health')).toBe(false);
    expect(spots.has('page:/settings/health')).toBe(false);
    expect(spots.has('gear')).toBe(true);
    expect(spots.has('tab:profile')).toBe(true);
  });
  it('both opened: no dots at all', () => {
    const seen = new Set(['0.74.0|/settings/ask-ai', '0.73.0|/settings/health']);
    expect(litSpots(litFeatures({ log: settingsOnly, now: NOW, seen })).size).toBe(0);
  });
  it('the seen list keeps each id once', () => {
    expect(withSeen(['a'], ['a', 'b', 'b'])).toEqual(['a', 'b']);
  });
});

describe('broken storage stays quiet', () => {
  it('nothing stored yet = nothing seen', () => {
    expect(parseSeen(null)).toEqual([]);
  });
  it('a stored list reads back', () => {
    expect(parseSeen(JSON.stringify(['0.73.0|/settings/health']))).toEqual(['0.73.0|/settings/health']);
  });
  it('a damaged list is unknown (null), and unknown lights no dots', () => {
    expect(parseSeen('{oops')).toBeNull();
    expect(parseSeen('{"a":1}')).toBeNull();
    expect(parseSeen('[1,2]')).toBeNull();
    expect(litFeatures({ log: LOG, now: NOW, seen: null })).toEqual([]);
  });
});
