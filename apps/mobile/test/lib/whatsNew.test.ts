import { describe, expect, it } from 'vitest';

import { isNewer } from '@/lib/appUpdate';
import { EARLIER_MAX, earlierUpdates, updatesUpTo, WHATS_NEW, WHATS_NEW_LOG, whatsNewToShow } from '@/lib/whatsNew';

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
    for (const e of WHATS_NEW_LOG) for (const l of e.lines) expect(l).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('R-56: earlier updates (owner: "up to 7 updates")', () => {
  it('the log is newest first, one entry per version, each with a date and lines', () => {
    for (let i = 1; i < WHATS_NEW_LOG.length; i++) expect(isNewer(WHATS_NEW_LOG[i - 1].version, WHATS_NEW_LOG[i].version)).toBe(true);
    for (const e of WHATS_NEW_LOG) {
      expect(e.date).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
      expect(e.lines.length).toBeGreaterThan(0);
    }
  });
  it('0.51.0 opens the 7 updates before it, newest first, never itself', () => {
    const list = earlierUpdates('0.51.0');
    expect(EARLIER_MAX).toBe(7);
    expect(list.map((e) => e.version)).toEqual(['0.50.0', '0.49.0', '0.48.0', '0.47.1', '0.47.0', '0.46.0', '0.45.0']);
  });
  it('fewer when fewer exist; none without a version', () => {
    expect(earlierUpdates('0.45.0').map((e) => e.version)).toEqual(['0.44.0']);
    expect(earlierUpdates('0.44.0')).toEqual([]);
    expect(earlierUpdates(null)).toEqual([]);
  });
  it('Settings → What\'s new: this version and everything before it, never a later one', () => {
    expect(updatesUpTo('0.50.0')[0].version).toBe('0.50.0');
    expect(updatesUpTo('0.50.0').some((e) => e.version === '0.51.0')).toBe(false);
    expect(updatesUpTo('0.51.0').some((e) => e.version === '0.52.0')).toBe(false);
    expect(updatesUpTo(WHATS_NEW_LOG[0].version)).toHaveLength(WHATS_NEW_LOG.length);
  });
  it('the release being built has its own lines (app.json and the log agree)', async () => {
    const app = (await import('../../app.json')).default as { expo: { version: string } };
    expect(WHATS_NEW[app.expo.version]?.length ?? 0).toBeGreaterThan(0);
  });
});
