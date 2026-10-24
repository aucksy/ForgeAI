import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hqAccessFromRow, actionLine } from '../../src/crm/auth/hqAccess';
import { MANIFEST_HREF, setInstallOffer, type ManifestDoc, type ManifestLink } from '../../src/crm/install';
import {
  isStartLink,
  PLANS_URL,
  START_PROMISE,
  trialBanner,
  trialDaysLeft,
  trialFromRow,
  type GymTrial,
} from '../../src/crm/logic/trial';

// 24 Oct 2026, 11:30 India time.
const NOW = Date.parse('2026-10-24T06:00:00Z');
const trial = (extra: Partial<GymTrial> = {}): GymTrial => ({
  startsAt: '2026-10-24T05:00:00Z',
  endsAt: '2026-12-04T05:00:00Z',
  plan: null,
  billing: null,
  paidUntil: null,
  ...extra,
});

describe('the free-trial banner (R-97, 0030)', () => {
  it('reads the server answer field by field; nothing usable means no banner', () => {
    expect(trialFromRow({ startsAt: '2026-10-24T05:00:00Z', endsAt: '2027-01-24T05:00:00Z', plan: 'pro', billing: 'yearly', paidUntil: null })).toEqual({
      startsAt: '2026-10-24T05:00:00Z', endsAt: '2027-01-24T05:00:00Z', plan: 'pro', billing: 'yearly', paidUntil: null,
    });
    expect(trialFromRow({ endsAt: '2027-01-24T05:00:00Z', plan: 'gold', billing: 'weekly' })?.plan).toBeNull();
    expect(trialFromRow({ endsAt: 'soon' })).toBeNull();
    expect(trialFromRow(null)).toBeNull();
    expect(trialFromRow([])).toBeNull();
    // Before 0030 the owner's answer has no "trial" at all.
    expect(hqAccessFromRow({ status: 'active', grants: [], actions: [] }).trial).toBeNull();
    expect(hqAccessFromRow({ status: 'active', trial: { endsAt: '2027-01-24T05:00:00Z' } }).trial?.endsAt).toBe('2027-01-24T05:00:00Z');
  });

  it('calm while there is time', () => {
    expect(trialBanner(trial(), NOW)).toEqual({ tone: 'calm', text: 'Free trial: 41 days left (ends 4 Dec 2026)', showPlans: false });
  });

  it('stronger in the last 14 days, with See prices', () => {
    const w = trialBanner(trial({ endsAt: '2026-11-07T05:00:00Z' }), NOW);
    expect(w).toEqual({ tone: 'strong', text: 'Free trial: 14 days left (ends 7 Nov 2026). Pick a ForgeAI pack to keep going after that.', showPlans: true });
    expect(trialBanner(trial({ endsAt: '2026-11-08T05:00:00Z' }), NOW)?.tone).toBe('calm');
    expect(trialBanner(trial({ endsAt: '2026-10-25T05:00:00Z' }), NOW)?.text).toMatch(/^Free trial: 1 day left/);
    // Ends at 22:00 India time today.
    expect(trialBanner(trial({ endsAt: '2026-10-24T16:30:00Z' }), NOW)?.text).toMatch(/^Free trial: last day today \(ends 24 Oct 2026\)/);
  });

  it('after the end: ended on the day, pick a plan, the members’ app keeps working', () => {
    expect(trialBanner(trial({ endsAt: '2026-10-20T05:00:00Z' }), NOW)).toEqual({
      tone: 'ended',
      text: 'Your free trial ended on 20 Oct 2026. Pick a ForgeAI pack to keep going. Your members’ app keeps working.',
      showPlans: true,
    });
  });

  it('no banner with a plan, or when nothing is known', () => {
    expect(trialBanner(trial({ plan: 'pro', billing: 'yearly', paidUntil: '2027-10-24T05:00:00Z' }), NOW)).toBeNull();
    expect(trialBanner(trial({ endsAt: '2026-10-01T05:00:00Z', plan: 'ai', billing: 'lifetime' }), NOW)).toBeNull();
    expect(trialBanner(null, NOW)).toBeNull();
  });

  it('days are India calendar days', () => {
    // 23:59 India time on 24 Oct vs 00:01 on 25 Oct: one day apart.
    expect(trialDaysLeft('2026-10-24T18:31:00Z', Date.parse('2026-10-24T18:29:00Z'))).toBe(1);
    expect(trialDaysLeft('2026-10-24T18:00:00Z', NOW)).toBe(0);
  });

  it('See prices goes to the price list on the landing page', () => {
    expect(PLANS_URL).toBe('https://forgeai.aakashpahuja.in/home/#pricing');
  });

  it('the owner’s ForgeAI access list names a trial or plan change in words', () => {
    expect(actionLine({ at: '2026-10-24T06:00:00Z', action: 'set_trial', reason: 'Moving 300 members' })).toBe(
      '24 Oct, 11:30: ForgeAI changed the end of your free trial. Reason: Moving 300 members',
    );
    expect(actionLine({ at: '2026-10-24T06:00:00Z', action: 'set_plan', reason: null })).toBe('24 Oct, 11:30: ForgeAI updated your plan.');
  });
});

describe('the direct sign-up link (/start)', () => {
  it('opens "Start my gym" first only on /start', () => {
    expect(isStartLink('/start')).toBe(true);
    expect(isStartLink('/start/')).toBe(true);
    expect(isStartLink('/Start')).toBe(true);
    expect(isStartLink('/')).toBe(false);
    expect(isStartLink('/starter')).toBe(false);
    expect(isStartLink('/home/start')).toBe(false);
    expect(START_PROMISE).toBe('Free for 3 months. No card. Your members’ app is free, always.');
  });

  it('the panel Worker serves the app at /start (single-page fallback, not a 404)', () => {
    const wrangler = readFileSync(new URL('../../../../deploy/panel/wrangler.jsonc', import.meta.url), 'utf8');
    expect(wrangler).toMatch(/"not_found_handling": "single-page-application"/);
    const first = /"run_worker_first": \[([^\]]*)\]/.exec(wrangler)?.[1] ?? '';
    expect(first).not.toMatch(/start/);
  });
});

describe('install the admin app: only once signed in (R-97)', () => {
  function fakeDoc() {
    const links: ManifestLink[] = [];
    const doc: ManifestDoc = {
      head: { appendChild: (el) => links.push(el) },
      querySelector: () => links.find((l) => l.rel === 'manifest') ?? null,
      createElement: () => {
        const l: ManifestLink = { rel: '', href: '', remove: () => links.splice(links.indexOf(l), 1) };
        return l;
      },
    };
    return { doc, links };
  }

  it('the page itself links no manifest, so Chrome offers nothing on the sign-in page', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/<link[^>]+rel="manifest"/);
  });

  it('signed in adds one manifest link; signing out takes it away', () => {
    const { doc, links } = fakeDoc();
    setInstallOffer(false, doc);
    expect(links).toHaveLength(0);
    setInstallOffer(true, doc);
    setInstallOffer(true, doc);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ rel: 'manifest', href: MANIFEST_HREF });
    setInstallOffer(false, doc);
    expect(links).toHaveLength(0);
    expect(() => setInstallOffer(true, null)).not.toThrow();
  });
});
