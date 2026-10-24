import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isNewer } from '@/lib/appUpdate';
import { EARLIER_MAX, goFor, earlierUpdates, updatesUpTo, WHATS_NEW, WHATS_NEW_LOG, whatsNewToShow } from '@/lib/whatsNew';

describe("What's new after an update", () => {
  const v = '0.50.0';
  // Review 21 Oct: v0.49 never saved its version, so 0.49 -> 0.50 is "remembered", not shown;
  // the first update that shows news is 0.50 -> 0.51. The rule itself is what is tested here.
  it('after an update the news shows once', () => {
    expect(whatsNewToShow(v, '0.49.0')).toEqual(WHATS_NEW[v]);
    expect(whatsNewToShow(v, v)).toBeNull(); // "Got it" pressed, or already remembered
  });
  it('the first version an install meets is not announced (fresh installs, the cloud phone tests)', () => {
    expect(whatsNewToShow(v, null)).toBeNull();
  });
  it('a version with no lines, or no version: nothing', () => {
    expect(whatsNewToShow('9.9.9', '0.49.0')).toBeNull();
    expect(whatsNewToShow(undefined, '0.49.0')).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const e of WHATS_NEW_LOG)
      for (const l of e.lines) expect(`${l.text} ${l.go?.label ?? ''}`).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('R-56 / R-98: the last 3 updates (owner, 24 Oct: "the last three updates")', () => {
  it('the log is newest first, one entry per version, each with a date and lines', () => {
    for (let i = 1; i < WHATS_NEW_LOG.length; i++) expect(isNewer(WHATS_NEW_LOG[i - 1].version, WHATS_NEW_LOG[i].version)).toBe(true);
    for (const e of WHATS_NEW_LOG) {
      expect(e.date).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
      expect(e.lines.length).toBeGreaterThan(0);
    }
  });
  it('0.51.0 opens the 2 updates before it (3 with itself), newest first, never itself', () => {
    const list = earlierUpdates('0.51.0');
    expect(EARLIER_MAX).toBe(2);
    expect(list.map((e) => e.version)).toEqual(['0.50.0', '0.49.0']);
  });
  it('fewer when fewer exist; none without a version', () => {
    expect(earlierUpdates('0.45.0').map((e) => e.version)).toEqual(['0.44.0']);
    expect(earlierUpdates('0.44.0')).toEqual([]);
    expect(earlierUpdates(null)).toEqual([]);
  });
  it("Settings → What's new: this version and everything before it, never a later one", () => {
    expect(updatesUpTo('0.50.0')[0].version).toBe('0.50.0');
    expect(updatesUpTo('0.50.0').some((e) => e.version === '0.51.0')).toBe(false);
    expect(updatesUpTo('0.51.0').some((e) => e.version === '0.52.0')).toBe(false);
    expect(updatesUpTo(WHATS_NEW_LOG[0].version).map((e) => e.version)).toEqual(WHATS_NEW_LOG.slice(0, 3).map((e) => e.version));
  });
  it('the release being built has its own lines (app.json and the log agree)', async () => {
    const app = (await import('../../app.json')).default as {
      expo: { version: string };
    };
    expect(WHATS_NEW[app.expo.version]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('0.56.0, the first MettleUp release', () => {
  it('says the new name first, keeps the data promise, and points at the new tabs and pages', () => {
    const lines = WHATS_NEW['0.56.0'] ?? [];
    expect(lines.length).toBe(6);
    expect(lines[0].text).toMatch(/ForgeAI is now called MettleUp/);
    expect(lines[0].text).toMatch(/still here/);
    expect(lines.map((l) => l.go?.href).filter(Boolean)).toEqual(['/progress', '/shop', '/settings/rest', '/settings/health']);
  });
});

describe('R-98: short lines, each try-it button opens a real screen', () => {
  it('every line is one short sentence or two (at most 120 characters), at most 6 lines an update', () => {
    for (const e of WHATS_NEW_LOG) {
      expect(e.lines.length).toBeLessThanOrEqual(6);
      for (const l of e.lines) expect(l.text.length, l.text).toBeLessThanOrEqual(120);
    }
  });
  it('every button opens a screen that exists, with a short label', () => {
    const app = join(__dirname, '..', '..', 'src', 'app');
    const screen = (href: string) =>
      href === '/workout' || href === '/progress' || href === '/shop'
        ? join(app, '(tabs)', `${href.slice(1)}.tsx`)
        : join(app, `${href.slice(1)}.tsx`);
    for (const e of WHATS_NEW_LOG) {
      for (const l of e.lines) {
        if (!l.go) continue;
        expect(existsSync(screen(l.go.href)), l.go.href).toBe(true);
        expect(l.go.label.length, l.go.label).toBeLessThanOrEqual(32);
      }
    }
  });
});

describe('R-98 review: what a button does on this phone', () => {
  const offer = { text: 'x', go: { label: "See your gym's offer", href: '/shop' as const } };
  it('the Gym tab button says Join your gym when there is none (Release A: the tab is the join screen)', () => {
    expect(goFor(offer, false)).toEqual({ label: 'Join your gym', href: '/shop', tab: true });
    expect(goFor(offer, true)).toEqual({ label: "See your gym's offer", href: '/shop', tab: true });
  });
  it('0.56.0: the Progress tab button switches tabs, like Workout and Gym', () => {
    expect(goFor({ text: 'x', go: { label: 'Open Progress', href: '/progress' } }, true)).toEqual({ label: 'Open Progress', href: '/progress', tab: true });
    expect(goFor({ text: 'x', go: { label: 'Open', href: '/settings/rest' } }, true)?.tab).toBe(false);
  });
  it('no button to the page it is on; none for a line without one', () => {
    expect(goFor({ text: 'x', go: { label: "See what's new", href: '/settings/news' } }, true, '/settings/news')).toBeNull();
    expect(goFor({ text: 'x' }, true)).toBeNull();
  });
});
