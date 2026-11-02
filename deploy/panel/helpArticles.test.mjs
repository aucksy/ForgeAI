// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). The AI help answers read only these articles.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HELP_ARTICLES } from './helpArticles.js';

const WHO = new Set(['member', 'owner', 'both']);
const MAX_WORDS = 120;
const MAX_TOTAL_CHARS = 12000;
// Member words: never these, as whole words, in any case.
const BANNED = ['volume', 'PR', 'session'];

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

test('12 to 15 articles, each with an id, who, title and text', () => {
  assert.ok(HELP_ARTICLES.length >= 12 && HELP_ARTICLES.length <= 15, `${HELP_ARTICLES.length} articles`);
  for (const a of HELP_ARTICLES) {
    assert.deepEqual(Object.keys(a).sort(), ['id', 'text', 'title', 'who'], a.id);
    for (const k of ['id', 'title', 'text']) assert.ok(typeof a[k] === 'string' && a[k].trim().length > 0, `${a.id}: ${k}`);
  }
});

test('ids are unique kebab-case', () => {
  const ids = HELP_ARTICLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
});

test('who is member, owner or both', () => {
  for (const a of HELP_ARTICLES) assert.ok(WHO.has(a.who), `${a.id}: ${a.who}`);
  assert.ok(HELP_ARTICLES.some((a) => a.who !== 'owner'), 'no member article');
  assert.ok(HELP_ARTICLES.some((a) => a.who !== 'member'), 'no owner article');
});

test(`each text is at most ${MAX_WORDS} words`, () => {
  for (const a of HELP_ARTICLES) assert.ok(words(a.text) <= MAX_WORDS, `${a.id}: ${words(a.text)} words`);
});

test('no banned member words, whole word and any case', () => {
  for (const a of HELP_ARTICLES) {
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
  const total = HELP_ARTICLES.reduce((n, a) => n + a.text.length, 0);
  assert.ok(total < MAX_TOTAL_CHARS, `${total} characters`);
});

test('no personal data: no phone numbers or email addresses', () => {
  for (const a of HELP_ARTICLES) {
    assert.ok(!/\b\d{10}\b|\b\d{5}\s\d{5}\b/.test(a.text), `${a.id} has a phone number`);
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(a.text), `${a.id} has an email`);
  }
});
