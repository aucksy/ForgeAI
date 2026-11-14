// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). F209: the help pages answer when the AI is not asked
// (helpPages.js), and how the gym server's answer about a question's credit is read (questionCredits.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HELP_ARTICLES } from './helpArticles.js';
import { MAX_PAGES_ANSWER, matchPages, pagesAnswer, whyLine, wordsOf } from './helpPages.js';
import { giveBack, keyOf, takeQuestion, takeResult } from './questionCredits.js';

const ARTS = [
  { title: 'Renew a membership', text: 'Open the member, tap Renew, pick the plan.', who: 'owner' },
  { title: 'Join your gym', text: 'Type the six-letter gym code from your gym.', who: 'member' },
  { title: 'Change the app language', text: 'Settings, then Language. Hindi or English.', who: 'both' },
];

test('wordsOf drops small and empty words, in English and Hinglish, and plurals', () => {
  assert.deepEqual(wordsOf('How do I renew the memberships?'), ['renew', 'membership']);
  assert.deepEqual(wordsOf('mera plan kaise renew kare'), ['plan', 'renew']);
  assert.deepEqual(wordsOf(''), []);
});

test('matchPages: owners see owner pages, members see member pages, both see both; no weak matches', () => {
  assert.deepEqual(matchPages('renew membership', 'admin', ARTS).map((a) => a.title), ['Renew a membership']);
  assert.deepEqual(matchPages('renew membership', 'member', ARTS), []);
  assert.deepEqual(matchPages('language change', 'member', ARTS).map((a) => a.title), ['Change the app language']);
  assert.deepEqual(matchPages('language change', 'admin', ARTS).map((a) => a.title), ['Change the app language']);
  assert.deepEqual(matchPages('pizza recipe', 'member', ARTS), []);
  // A longer form matches ("renewal" finds "Renew").
  assert.deepEqual(matchPages('renewal', 'admin', ARTS).map((a) => a.title), ['Renew a membership']);
});

test('pagesAnswer: why, then the page, then that the team reads every message; never longer than the limit', () => {
  const a = pagesAnswer('join gym code', 'member', 'AI answers are not on at your gym right now.', ARTS);
  assert.equal(a.pages, 1);
  assert.equal(
    a.text,
    'AI answers are not on at your gym right now.\n\nThis help page may answer your question:\n\nJoin your gym\nType the six-letter gym code from your gym.\n\nWe read every message and reply as soon as we can.',
  );
  const none = pagesAnswer('pizza', 'member', 'Why.', ARTS);
  assert.deepEqual(none, { text: 'Why. We read every message and reply as soon as we can.', pages: 0 });
  // The real articles: any question stays under the limit.
  for (const q of ['how do I add a member and renew a plan and take a payment', 'workout plan exercise sets reps']) {
    for (const src of ['admin', 'member']) assert.ok(pagesAnswer(q, src, whyLine('no_credits', src, 'owner'), HELP_ARTICLES).text.length <= MAX_PAGES_ANSWER);
  }
});

test('whyLine: members never read about credits; the owner and staff each read their own next step', () => {
  assert.equal(whyLine('no_credits', 'member', 'member'), 'AI answers are not on at your gym right now.');
  assert.equal(whyLine('gym_limit', 'member', 'member'), 'AI answers are not on at your gym right now.');
  assert.equal(whyLine('day_limit', 'member', 'member', 10), "You have used today's 10 AI answers. AI answers come back tomorrow.");
  assert.match(whyLine('no_credits', 'admin', 'owner'), /open AI Assistant and tap your credits at the top\.$/);
  assert.match(whyLine('no_credits', 'admin', 'staff'), /Ask your gym owner to get more AI credits\.$/);
  assert.match(whyLine('paused', 'admin', 'owner'), /^AI answers are paused for your gym\./);
  for (const r of ['no_credits', 'day_limit', 'gym_limit', 'paused']) assert.doesNotMatch(whyLine(r, 'member', 'member'), /credit/i);
});

test('keyOf and takeResult read keys and gym server answers safely', () => {
  assert.equal(keyOf('  abcdefghijklmnop  '), 'abcdefghijklmnop');
  assert.equal(keyOf('short'), '');
  assert.equal(keyOf('has a space in it ok'), '');
  assert.equal(keyOf(12345678901234567), '');
  assert.deepEqual(takeResult(200, { ok: true, id: 'q1', who: 'member' }), { state: 'ok', id: 'q1', who: 'member' });
  assert.deepEqual(takeResult(200, { ok: false, reason: 'day_limit', who: 'visitor', per_day: 3 }), { state: 'none', reason: 'day_limit', who: 'visitor', perDay: 3 });
  assert.equal(takeResult(200, { ok: false, reason: 'weird' }).state, 'skip');
  assert.deepEqual(takeResult(404, null, ''), { state: 'skip', why: 'no 0078' });
  assert.equal(takeResult(400, null, '{"message":"BAD_KEY"}').why, 'unknown key');
  assert.match(takeResult(400, null, '{"message":"BAD_SIG"}').why, /signature/);
  assert.equal(takeResult(500, null, 'boom').state, 'skip');
});

test('takeQuestion: unreachable gym server = not counted; giveBack never throws', async () => {
  const env = { PHONE_CODE_SECRET: 'test-secret-0123456789abcdef0123456789abcdef' };
  const boom = async () => {
    throw new TypeError('network');
  };
  const quiet = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await takeQuestion(env, 'member', 'member-key-abcdefghijklmnop', { fetchImpl: boom }), { state: 'skip', why: 'unreachable' });
    assert.equal(await giveBack('q1', { fetchImpl: boom }), false);
    assert.equal(await giveBack('', { fetchImpl: boom }), false);
  } finally {
    console.warn = quiet;
  }
});
