/**
 * F201 (12 Nov 2026, 03-design.md section 8): the old third pack, plan word 'ai', is retired. The AI Assistant is sold
 * as AI credits on every plan instead. The word stays valid (old rows, old migrations) and means Pro, but NOTHING a
 * gym owner, a visitor or HQ sees may still name that pack or offer it. This test reads the shipped files as text.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GYM_PACKS, PACK_PRICES, PACKS_FOR_SALE, packName, shownPack } from '@forgeai/theme';

import { PLAN_NAMES, PRICES, planLabel, priceOf } from '../../src/crm/logic/payMettleUp';

const repo = (p: string) => resolve(__dirname, '../../../..', p);
const text = (p: string) => readFileSync(repo(p), 'utf8');

/** Every shipped text file under a folder (tests, build output and dependencies left out). */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|m?js|html|json|css|md)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(p);
    }
  };
  walk(repo(dir));
  return out;
}

/** The old pack's name, however it is spaced or cased. */
const OLD_NAME = /pro\s*\+\s*ai\b/i;

/** The last migration (by file name) that defines a function: the one the server runs. */
function lastDefinition(fn: string): string {
  const dir = repo('supabase/migrations');
  let body = '';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(dir, f), 'utf8');
    const at = sql.lastIndexOf(`create or replace function public.${fn}(`);
    if (at >= 0) body = sql.slice(at, sql.indexOf('$$;', sql.indexOf('$$', at) + 2));
  }
  return body;
}

describe("nothing shown or sold still names the retired 'ai' pack", () => {
  it('no shipped file says the old name', () => {
    const shipped = [
      ...files('apps/dashboard/public'),
      ...files('apps/dashboard/src'),
      ...files('apps/hq/public'),
      ...files('apps/mobile/src'),
      ...files('packages/theme/src'),
      ...files('deploy/hq'),
      ...files('deploy/panel'),
    ];
    expect(shipped.length).toBeGreaterThan(100);
    const hits = shipped.filter((f) => OLD_NAME.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the website has no old price and no old card', () => {
    const html = text('apps/dashboard/public/home/index.html');
    expect(html).not.toContain('₹24,990');
    expect(html).not.toContain('AI coach for members');
    expect(html).not.toContain('The AI pack is extra');
  });

  it('the AI Assistant section says "Coming soon", has its three examples and no dated festival', () => {
    const html = text('apps/dashboard/public/home/index.html');
    const at = html.indexOf('<section class="sec" id="assistant"');
    expect(at).toBeGreaterThan(0);
    const section = html.slice(at, html.indexOf('</section>', at));
    expect(section).toContain('Coming soon');
    expect(section).toContain('it is not in the app yet');
    for (const said of ['Kisne paise nahi diye?', 'Kal gym band rahega, sabko batao', 'Rahul ka plan 3 mahine renew karo, 4500 cash']) {
      expect(section).toContain(said);
    }
    expect(section).toContain('14 members owe ₹38,500');
    expect(section).toContain('Remind them politely');
    expect(section).toContain('Speak in Hindi or English. Asking is free.');
    expect(section).not.toMatch(/\b(diwali|holi|navratri|eid|christmas)\b|new year|दिवाली|होली/i);
    // Its words have their Hindi copies (data-hi), like the rest of the page: the header, the heading, the line under
    // it, three titles, three lines, the "Speak in Hindi or English" line and the footnote.
    expect((section.match(/data-hi=/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });

  it("no list or picker offers the 'ai' pack", () => {
    expect(GYM_PACKS).toContain('ai'); // still a valid word, for old rows
    expect(PACKS_FOR_SALE).not.toContain('ai');
    expect(Object.keys(PACK_PRICES)).not.toContain('ai');
    expect(Object.keys(PRICES)).not.toContain('ai');
    expect(Object.keys(PLAN_NAMES)).not.toContain('ai');
    expect(priceOf('ai', 'monthly')).toBeNull();
    const hq = text('apps/hq/public/logic.js');
    const choices = /PLAN_CHOICES\s*=\s*(\[[^\n]*\]);/.exec(hq)?.[1] ?? '';
    expect(choices).toContain("'pro'");
    expect(choices).not.toContain("'ai'");
    expect(/const PLANS = \[([^\]]*)\]/.exec(text('deploy/hq/api.js'))?.[1]).toBe("'starter', 'pro'");
    expect(/const PLANS = new Set\(\[([^\]]*)\]\)/.exec(text('deploy/hq/billing.js'))?.[1]).toBe("'starter', 'pro'");
  });

  it("a gym already on 'ai' keeps working and reads as Pro", () => {
    expect(shownPack('ai')).toBe('pro');
    expect(packName('ai')).toBe('Pro');
    expect(planLabel('ai', 'lifetime')).toBe('Pro, lifetime');
    expect(text('apps/hq/public/logic.js')).toMatch(/PLAN_WORDS = \{[^}]*ai: 'Pro'/);
  });

  it("the server names it Pro on receipts (0072) and never prices it", () => {
    const word = lastDefinition('_plan_word');
    expect(word).toContain("when 'ai' then 'Pro'");
    expect(word).not.toMatch(OLD_NAME);
    expect(lastDefinition('_mettleup_price')).not.toContain("'ai/");
  });
});
