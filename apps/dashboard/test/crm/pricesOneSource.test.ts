/**
 * Billing step 1 (R-385): the prices live in ONE place, packages/theme/src/plans.ts (PACK_PRICES,
 * FOUNDING_OFFER). This test fails when any other place that shows or charges a price disagrees:
 * the website's price cards, Pay MettleUp in the admin app, HQ's branch prices and the server's
 * price function. It also checks the server's plan -> features table matches PACK_FEATURES, and that
 * the admin app's lapse rule matches the server's (7 + 30 days). Files are read as text from the repo.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PLAN_BASIC_DAYS,
  FOUNDING_OFFER,
  PLAN_GRACE_DAYS,
  GYM_PACKS,
  PACK_FEATURES,
  PACK_PRICES,
  PACKS_FOR_SALE,
  gymStateAt,
} from '@forgeai/theme';

import { PRICES } from '../../src/crm/logic/payMettleUp';

const repo = (p: string) => resolve(__dirname, '../../../..', p);
const text = (p: string) => readFileSync(repo(p), 'utf8');
const rupees = (s: string) => Number(s.replace(/[₹,\s]/g, ''));
const shown = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The last migration (by file name) that defines a function: the one the server runs. */
function lastDefinition(fn: string): string {
  const dir = repo('supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let body = '';
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), 'utf8');
    const at = sql.lastIndexOf(`create or replace function public.${fn}(`);
    if (at >= 0) body = sql.slice(at, sql.indexOf('$$;', sql.indexOf('$$', at) + 2));
  }
  return body;
}

describe('prices: one list, every place agrees', () => {
  it('the list is the approved one', () => {
    expect(PACK_PRICES).toEqual({
      starter: { monthly: 999, yearly: 9990 },
      pro: { monthly: 1499, yearly: 14990 },
      ai: { monthly: 2499, yearly: 24990 },
    });
    expect(PACKS_FOR_SALE).toEqual(['starter', 'pro']);
    expect(FOUNDING_OFFER).toEqual({ rupees: 29999, gyms: 25, lastDay: '2027-03-31' });
  });

  it('the website price cards show the same prices', () => {
    const html = text('apps/dashboard/public/home/index.html');
    const section = html.slice(html.indexOf('id="pricing"'), html.indexOf('</section>', html.indexOf('id="pricing"')));
    const cards = section.split(/<div class="card[ "]/).slice(1);
    const names: Record<string, (typeof GYM_PACKS)[number]> = { Starter: 'starter', Pro: 'pro', 'Pro + AI': 'ai' };
    const seen: string[] = [];
    for (const card of cards) {
      const name = /<h3[^>]*>([^<]+)/.exec(card)?.[1]?.trim() ?? '';
      const pack = names[name];
      expect(pack, `unknown card "${name}"`).toBeDefined();
      const m = /class="pm"><b>([^<]+)<\/b>/.exec(card)?.[1] ?? '';
      const y = /class="py"><b>([^<]+)<\/b>/.exec(card)?.[1] ?? '';
      expect(rupees(m), `${name} monthly`).toBe(PACK_PRICES[pack!].monthly);
      expect(rupees(y), `${name} yearly`).toBe(PACK_PRICES[pack!].yearly);
      seen.push(pack!);
    }
    expect(seen.sort()).toEqual([...GYM_PACKS].sort());
    // Pro + AI is marked "Coming" (not for sale).
    const ai = cards.find((c) => /<h3>Pro \+ AI/.test(c)) ?? '';
    expect(ai).toContain('Coming');
    // The founding offer: price (in the text and the big number), 25 gyms, the last day.
    const found = section.slice(section.indexOf('class="found'));
    expect(found).toContain(`Pay ${shown(FOUNDING_OFFER.rupees)} once`);
    expect(found).toContain(`<div class="big">${shown(FOUNDING_OFFER.rupees)}`);
    expect(found).toContain(`first ${FOUNDING_OFFER.gyms} gyms`);
    expect(found).toContain('31 March 2027');
  });

  it('Pay MettleUp charges the same prices and types none of its own', () => {
    for (const p of PACKS_FOR_SALE) {
      const plan = p as keyof typeof PRICES;
      expect(PRICES[plan].monthly).toBe(PACK_PRICES[p].monthly * 100);
      expect(PRICES[plan].yearly).toBe(PACK_PRICES[p].yearly * 100);
    }
    const src = text('apps/dashboard/src/crm/logic/payMettleUp.ts');
    expect(src).not.toMatch(/\b(99_?900|999_?000|149_?900|1_?499_?000)\b/);
  });

  it("HQ's branch prices are the monthly prices", () => {
    const js = text('apps/hq/public/logic.js');
    const m = /BRANCH_PRICES\s*=\s*\{\s*starter:\s*(\d+),\s*pro:\s*(\d+)\s*\}/.exec(js);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(PACK_PRICES.starter.monthly);
    expect(Number(m![2])).toBe(PACK_PRICES.pro.monthly);
  });

  it("the server's price function charges the same prices, in paise, and nothing for Pro + AI", () => {
    const fn = lastDefinition('_mettleup_price');
    expect(fn).not.toBe('');
    const rows = [...fn.matchAll(/when '([a-z]+)\/([a-z]+)'\s+then\s+(\d+)/g)].map((x) => [x[1], x[2], Number(x[3])] as const);
    const want = PACKS_FOR_SALE.flatMap((p) => [
      [p, 'monthly', PACK_PRICES[p].monthly * 100],
      [p, 'yearly', PACK_PRICES[p].yearly * 100],
    ]);
    expect(rows).toEqual(want);
  });

  it("the server's founding offer (0063) has the same price, places and last day", () => {
    const start = lastDefinition('hq_billing_checkout_start');
    expect(start).toContain(`amt := ${FOUNDING_OFFER.rupees * 100};`);
    expect(start).toContain(`>= ${FOUNDING_OFFER.gyms} then raise exception 'FOUNDING_FULL'`);
    expect(lastDefinition('_founding_open')).toContain(`date '${FOUNDING_OFFER.lastDay}'`);
    expect(lastDefinition('owner_billing')).toContain(`taken < ${FOUNDING_OFFER.gyms}`);
  });
});

describe('plan features: the server table matches the app map', () => {
  it('0062 plan_features rows = PACK_FEATURES', () => {
    const sql = text('supabase/migrations/0062_plan_features.sql');
    const ins = sql.slice(sql.indexOf('insert into public.plan_features'), sql.indexOf('on conflict do nothing', sql.indexOf('insert into public.plan_features')));
    const rows = [...ins.matchAll(/\('([a-z]+)',\s*'([A-Za-z]+)'\)/g)].map((x) => `${x[1]}:${x[2]}`).sort();
    const want = GYM_PACKS.flatMap((p) => PACK_FEATURES[p].map((f) => `${p}:${f}`)).sort();
    expect(rows).toEqual(want);
  });

  it('the lapse days match the server (7 days grace, then 30 days basic)', () => {
    const sql = text('supabase/migrations/0062_plan_features.sql');
    expect(sql).toContain(`ends + interval '${PLAN_GRACE_DAYS} days'`);
    expect(sql).toContain(`ends + interval '${PLAN_GRACE_DAYS + PLAN_BASIC_DAYS} days'`);
  });
});

describe('gymStateAt (the same rule as the server gym_state)', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-11-06T12:00:00Z');
  const at = (d: number) => new Date(now + d * day).toISOString();
  it('active, grace, basic, read-only from the later of paid-until and trial end', () => {
    expect(gymStateAt({ paidUntil: at(3), trialEndsAt: at(-100) }, now)).toBe('active');
    expect(gymStateAt({ paidUntil: null, trialEndsAt: at(10) }, now)).toBe('active');
    expect(gymStateAt({ paidUntil: at(-3) }, now)).toBe('grace');
    expect(gymStateAt({ paidUntil: at(-8) }, now)).toBe('basic');
    expect(gymStateAt({ paidUntil: at(-36) }, now)).toBe('basic');
    expect(gymStateAt({ paidUntil: at(-38) }, now)).toBe('read_only');
    expect(gymStateAt({ paidUntil: at(-60), trialEndsAt: at(2) }, now)).toBe('active');
  });
  it('lifetime and no dates are always active', () => {
    expect(gymStateAt({ billing: 'lifetime', paidUntil: at(-400) }, now)).toBe('active');
    expect(gymStateAt({}, now)).toBe('active');
  });
});
