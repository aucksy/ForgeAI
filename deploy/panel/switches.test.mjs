// node --test deploy/panel/switches.test.mjs (CI: ci.yml "Panel Worker tests").
// F207 (coordinator, 14 Nov 2026, the owner's hard rule "show a feature only when it is on"): the gym web page's
// assistant page and help article are hidden while GYM_PAGES is off and shown as soon as it is "live", with no
// release. The admin app's own parts (menu row, Set up step, enquiry label) are proved in
// apps/dashboard/e2e/webpage-uat.spec.mjs (WEBPAGE-0), against the answer of GET /api/switches tested here.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assistSystem, cleanAction, readActions } from './assist.js';
import { AI_PAGE_IDS, aiPageIdsFor, pageShown, pageById, toolsForClaude } from './assistCatalogue.js';
import { helpSystem } from './help.js';
import { ALL_HELP_ARTICLES, HELP_ARTICLES, helpArticlesFor } from './helpArticles.js';
import { matchPages } from './helpPages.js';
import { aiChargeOn, gymPagesOpen, joinPayOpen, switchOn, switchesAnswer } from './switches.js';
import worker, { selfJoinDesc } from './worker.js';
import { readFileSync } from 'node:fs';

const OFF = [undefined, null, {}, { GYM_PAGES: '' }, { GYM_PAGES: 'off' }, { GYM_PAGES: 'LIVE' }, { GYM_PAGES: true }];
const ON = { GYM_PAGES: 'live' };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const openPageEnum = (env) => toolsForClaude(env).find((t) => t.name === 'open_page').input_schema.properties.page.enum;
const article = ALL_HELP_ARTICLES.find((a) => a.id === 'gym-web-page');

test('only GYM_PAGES = "live" opens gym web pages', () => {
  for (const env of OFF) assert.equal(gymPagesOpen(env), false, JSON.stringify(env));
  assert.equal(gymPagesOpen(ON), true);
  assert.equal(switchOn(ON, 'SOMETHING_ELSE'), false);
});

const NONE_ON = { gymPages: false, joinPay: false, aiCharge: false };

test('GET /api/switches says gymPages false while off and true once on, never cached', async () => {
  for (const env of [{}, { GYM_PAGES: 'off' }]) {
    const r = await worker.fetch(new Request('https://app.mettleup.fit/api/switches'), env, ctx);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Content-Type') ?? '', /json/);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await r.json(), NONE_ON);
  }
  const on = await worker.fetch(new Request('https://app.mettleup.fit/api/switches'), ON, ctx);
  assert.deepEqual(await on.json(), { ...NONE_ON, gymPages: true });
  assert.deepEqual(await switchesAnswer(ON).json(), { ...NONE_ON, gymPages: true });
});

// R-555: join payments (held by the owner) and AI credits charging, each told to the admin app on its own.
test('JOIN_PAY only "live" and AI_CREDITS_CHARGE only "on": GET /api/switches says each one alone', async () => {
  for (const v of [undefined, '', 'off', 'on', 'LIVE', true]) assert.equal(joinPayOpen({ JOIN_PAY: v }), false, String(v));
  assert.equal(joinPayOpen({ JOIN_PAY: 'live' }), true);
  for (const v of [undefined, '', 'off', 'live', 'ON', true]) assert.equal(aiChargeOn({ AI_CREDITS_CHARGE: v }), false, String(v));
  assert.equal(aiChargeOn({ AI_CREDITS_CHARGE: 'on' }), true);
  assert.equal(joinPayOpen(undefined), false);
  assert.equal(aiChargeOn(null), false);
  const ask = async (env) => (await worker.fetch(new Request('https://app.mettleup.fit/api/switches'), env, ctx)).json();
  assert.deepEqual(await ask({ JOIN_PAY: 'live' }), { ...NONE_ON, joinPay: true });
  assert.deepEqual(await ask({ AI_CREDITS_CHARGE: 'on' }), { ...NONE_ON, aiCharge: true });
  assert.deepEqual(await ask({ JOIN_PAY: 'off', AI_CREDITS_CHARGE: 'on', GYM_PAGES: 'off' }), { ...NONE_ON, aiCharge: true });
});

test('the join page preview says "Pay at the gym desk." only while join payments are off', () => {
  const g = { gymName: 'Shakti Gym' };
  for (const env of [undefined, {}, { JOIN_PAY: 'off' }]) {
    assert.equal(selfJoinDesc(g, env), 'Pick a plan and send your details to Shakti Gym. Pay at the gym desk.');
  }
  assert.equal(selfJoinDesc(g, { JOIN_PAY: 'live' }), 'Pick a plan and send your details to Shakti Gym.');
  assert.equal(selfJoinDesc({ ...g, closed: true }, {}), 'Shakti Gym is not taking sign-ups online right now.');
});

test('F210: the join page preview names the free trial only when the owner switched it on (0088)', () => {
  const g = { gymName: 'Shakti Gym' };
  assert.equal(selfJoinDesc({ ...g, trial: null }, {}), 'Pick a plan and send your details to Shakti Gym. Pay at the gym desk.');
  assert.equal(selfJoinDesc({ ...g, trial: { days: 3, feeP: 0 } }, {}), 'Try Shakti Gym free for 3 days, or pick a plan and send your details. Pay at the gym desk.');
  assert.equal(selfJoinDesc({ ...g, trial: { days: 1, feeP: 0 } }, { JOIN_PAY: 'live' }), 'Try Shakti Gym free for 1 day, or pick a plan and send your details.');
  assert.equal(selfJoinDesc({ ...g, closed: true, trial: { days: 3 } }, {}), 'Shakti Gym is not taking sign-ups online right now.');
});

test('the help article "Let new people pay online when they join" is in the live help only while JOIN_PAY is live', () => {
  const pay = ALL_HELP_ARTICLES.find((a) => a.id === 'join-pay-online-admin');
  assert.equal(pay.onlyWhen, 'JOIN_PAY');
  assert.equal(pay.unreleased, undefined);
  for (const env of OFF.concat([{ JOIN_PAY: 'on' }, { GYM_PAGES: 'live' }])) assert.ok(!helpArticlesFor(env).includes(pay), JSON.stringify(env));
  assert.ok(helpArticlesFor({ JOIN_PAY: 'live' }).includes(pay));
  assert.ok(!HELP_ARTICLES.includes(pay));
  // Live with this deploy (R-555): Join online and the AI Assistant are in the live help, switch or no switch.
  for (const id of ['join-online-admin', 'ai-assistant']) {
    const a = ALL_HELP_ARTICLES.find((x) => x.id === id);
    assert.equal(a.unreleased, undefined, id);
    assert.equal(a.onlyWhen, undefined, id);
    assert.ok(HELP_ARTICLES.includes(a), id);
  }
});

// R-555: no keep_vars, so every deploy sets the Worker's vars to exactly this file's list. Each switch is written here.
test('wrangler.jsonc names every switch with its value today, and has no keep_vars', () => {
  const raw = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /"keep_vars"/);
  assert.match(raw, /SWITCHES CHANGE IN THIS FILE, NOT IN THE CLOUDFLARE DASHBOARD/);
  const vars = JSON.parse(/"vars": (\{[^}]*\})/.exec(raw)[1]);
  assert.equal(vars.JOIN_PAY, 'off', 'join payments stay held until the owner says the payment sweep passed');
  assert.equal(vars.GYM_PAGES, 'off');
  assert.equal(vars.PAY_LIVE, 'off');
  assert.equal(vars.PAY_OAUTH_RAZORPAY, 'off');
  assert.equal(vars.PAY_OAUTH_CASHFREE, 'off');
  assert.equal(vars.AI_CREDITS_CHARGE, 'on');
  assert.equal(vars.JOIN_HOST, '');
  assert.equal(vars.MOVE, 'on');
  assert.equal(vars.LANDING, 'live');
  // What the admin app is told with exactly these vars: nothing held is shown; members' AI answers are charged.
  assert.deepEqual(JSON.parse(JSON.stringify({ gymPages: gymPagesOpen(vars), joinPay: joinPayOpen(vars), aiCharge: aiChargeOn(vars) })), { gymPages: false, joinPay: false, aiCharge: true });
  // No secret is ever a plain var.
  for (const k of Object.keys(vars)) assert.doesNotMatch(k, /KEY|SECRET|TOKEN/, k);
});

test('the assistant cannot name "Your web page" while gym web pages are off, and can once they are on', () => {
  const page = pageById('web-page');
  assert.equal(page.onlyWhen, 'GYM_PAGES');
  assert.ok(AI_PAGE_IDS.includes('web-page'), 'still in the full list (the menu check needs it)');
  const call = { page: 'web-page', steps: ['Tick Show my page'], why: 'Your page' };
  for (const env of OFF) {
    assert.equal(pageShown(page, env), false);
    assert.ok(!aiPageIdsFor(env).includes('web-page'));
    assert.ok(!openPageEnum(env).includes('web-page'), 'open_page list');
    assert.ok(!assistSystem(env).includes('- web-page:'), 'the prompt');
    assert.equal(cleanAction('open_page', call, env), null, 'an answer naming it is dropped');
  }
  assert.ok(aiPageIdsFor(ON).includes('web-page'));
  assert.ok(openPageEnum(ON).includes('web-page'));
  assert.ok(assistSystem(ON).includes('- web-page: Your web page.'));
  assert.equal(cleanAction('open_page', call, ON)?.input.page, 'web-page');
  assert.equal(readActions([{ type: 'tool_use', name: 'open_page', input: call }], ON).actions.length, 1);
  assert.equal(readActions([{ type: 'tool_use', name: 'open_page', input: call }], {}).actions.length, 0);
  // Every other page is the same either way.
  assert.deepEqual(aiPageIdsFor({}), AI_PAGE_IDS.filter((id) => id !== 'web-page'));
  assert.deepEqual(aiPageIdsFor(ON), [...AI_PAGE_IDS]);
});

test('the help article "Make your free gym web page" is in the live help only while gym web pages are on', () => {
  assert.ok(article, 'article gym-web-page');
  assert.equal(article.onlyWhen, 'GYM_PAGES');
  assert.equal(article.unreleased, undefined);
  assert.ok(!HELP_ARTICLES.includes(article), 'the switch-off list');
  for (const env of OFF) {
    const live = helpArticlesFor(env);
    assert.ok(!live.includes(article));
    assert.ok(!helpSystem(live).includes(article.title), 'the AI help prompt');
    assert.ok(!matchPages('how do I make my gym web page', 'admin', live).some((p) => p.id === article.id), 'the help pages');
  }
  const live = helpArticlesFor(ON);
  assert.ok(live.includes(article));
  assert.ok(helpSystem(live).includes(article.title));
  assert.ok(matchPages('how do I make my gym web page', 'admin', live).some((p) => p.id === article.id), 'the help pages find it');
  assert.deepEqual(live.filter((a) => a !== article), HELP_ARTICLES, 'nothing else changes');
  // An unreleased article stays out whatever the switches say.
  for (const a of ALL_HELP_ARTICLES.filter((x) => x.unreleased)) assert.ok(!live.includes(a), a.id);
});
