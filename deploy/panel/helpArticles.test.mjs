// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). The AI help answers read only these articles.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coverageProblems, screensOnDisk } from '../../scripts/ci/help_coverage.mjs';
import { helpSystem } from './help.js';
import { ALL_HELP_ARTICLES, HELP_ARTICLES, NO_HELP_SCREENS } from './helpArticles.js';

const WHO = new Set(['member', 'owner', 'both']);
const MAX_WORDS = 120;
// The whole library goes into one cached prompt (help.js): keep it well under ~45,000 characters.
const MAX_TOTAL_CHARS = 45000;
// Member words: never these, as whole words, in any case.
const BANNED = ['volume', 'PR', 'session'];

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// R-319: the library grows with the app (every new screen gets an article or a reason). The real limit is the prompt
// size (MAX_TOTAL_CHARS below); this count is only a sanity bound. Raised 60 -> 80 for F56 (12 Nov 2026, 35,548 chars).
test('12 to 80 articles, each with an id, who, title and text (and optional screens)', () => {
  assert.ok(ALL_HELP_ARTICLES.length >= 12 && ALL_HELP_ARTICLES.length <= 80, `${ALL_HELP_ARTICLES.length} articles`);
  const allowed = new Set(['id', 'who', 'title', 'text', 'screens', 'unreleased']);
  for (const a of ALL_HELP_ARTICLES) {
    for (const k of Object.keys(a)) assert.ok(allowed.has(k), `${a.id}: unknown key ${k}`);
    for (const k of ['id', 'who', 'title', 'text']) assert.ok(k in a, `${a.id}: missing ${k}`);
    for (const k of ['id', 'title', 'text']) assert.ok(typeof a[k] === 'string' && a[k].trim().length > 0, `${a.id}: ${k}`);
    if ('unreleased' in a) assert.ok(typeof a.unreleased === 'string' && a.unreleased.trim().length >= 5 && !a.unreleased.includes('\n'), `${a.id}: unreleased needs a one-line reason`);
    if ('screens' in a) {
      assert.ok(Array.isArray(a.screens), `${a.id}: screens is not a list`);
      for (const p of a.screens) assert.ok(typeof p === 'string' && /^apps\/[^\\]+\.tsx$/.test(p), `${a.id}: bad screen path ${p}`);
    }
  }
});

// Coordinator, 12 Nov 2026: a built-but-switched-off feature's article must not reach the live AI help or the help
// library before its release (F56: prices, Find my gym, the owner's switch).
test('an unreleased article stays out of the live help and the AI help prompt; the rest are all there', () => {
  const hidden = ALL_HELP_ARTICLES.filter((a) => a.unreleased);
  assert.ok(hidden.length >= 1, 'no unreleased article to check');
  const prompt = helpSystem();
  for (const a of hidden) {
    assert.ok(!HELP_ARTICLES.includes(a), `${a.id} is in the live help`);
    assert.ok(!prompt.includes(a.title), `${a.id} is in the AI help prompt`);
  }
  assert.deepEqual(HELP_ARTICLES, ALL_HELP_ARTICLES.filter((a) => !a.unreleased));
  for (const a of HELP_ARTICLES) assert.ok(prompt.includes(a.title), `${a.id} is missing from the AI help prompt`);
});

test('every screen on disk has a help decision (help_coverage.mjs)', () => {
  assert.deepEqual(coverageProblems(screensOnDisk(), ALL_HELP_ARTICLES, NO_HELP_SCREENS), []);
});

test('every NO_HELP_SCREENS entry has a real one-line reason', () => {
  for (const [p, why] of Object.entries(NO_HELP_SCREENS)) {
    assert.ok(typeof why === 'string' && why.trim().length >= 5, `${p}: no reason`);
    assert.ok(!/\n/.test(why), `${p}: reason is more than one line`);
  }
});

test('ids are unique kebab-case', () => {
  const ids = ALL_HELP_ARTICLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
});

test('who is member, owner or both', () => {
  for (const a of ALL_HELP_ARTICLES) assert.ok(WHO.has(a.who), `${a.id}: ${a.who}`);
  assert.ok(ALL_HELP_ARTICLES.some((a) => a.who !== 'owner'), 'no member article');
  assert.ok(ALL_HELP_ARTICLES.some((a) => a.who !== 'member'), 'no owner article');
});

test(`each text is at most ${MAX_WORDS} words`, () => {
  for (const a of ALL_HELP_ARTICLES) assert.ok(words(a.text) <= MAX_WORDS, `${a.id}: ${words(a.text)} words`);
});

test('no banned member words, whole word and any case', () => {
  for (const a of ALL_HELP_ARTICLES) {
    for (const w of BANNED) {
      const re = new RegExp(`\\b${w}\\b`, 'i');
      assert.ok(!re.test(a.title), `${a.id} title has "${w}"`);
      assert.ok(!re.test(a.text), `${a.id} text has "${w}"`);
    }
  }
});

test('the banned-word check catches what it should, and only that', () => {
  const hit = (s) => BANNED.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));
  assert.ok(hit('A new pr today'));
  assert.ok(hit('Your Session ended'));
  assert.ok(!hit('Press the button. Sessions apart.'));
});

test(`all article text together is under ${MAX_TOTAL_CHARS} characters`, () => {
  const total = ALL_HELP_ARTICLES.reduce((n, a) => n + a.text.length, 0);
  assert.ok(total < MAX_TOTAL_CHARS, `${total} characters`);
});

test('no personal data: no phone numbers or email addresses', () => {
  for (const a of ALL_HELP_ARTICLES) {
    assert.ok(!/\b\d{10}\b|\b\d{5}\s\d{5}\b/.test(a.text), `${a.id} has a phone number`);
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(a.text), `${a.id} has an email`);
  }
});
