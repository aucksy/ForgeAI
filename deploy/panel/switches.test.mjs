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
import { gymPagesOpen, switchOn, switchesAnswer } from './switches.js';
import worker from './worker.js';

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

test('GET /api/switches says gymPages false while off and true once on, never cached', async () => {
  for (const env of [{}, { GYM_PAGES: 'off' }]) {
    const r = await worker.fetch(new Request('https://app.mettleup.fit/api/switches'), env, ctx);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('Content-Type') ?? '', /json/);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await r.json(), { gymPages: false });
  }
  const on = await worker.fetch(new Request('https://app.mettleup.fit/api/switches'), ON, ctx);
  assert.deepEqual(await on.json(), { gymPages: true });
  assert.deepEqual(await switchesAnswer(ON).json(), { gymPages: true });
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
