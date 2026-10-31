// node --test deploy/panel. Launch I3, 21 Oct 2026: the landing page's demo form.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DatabaseSync } from 'node:sqlite';

import { ALL_PER_DAY, PER_DAY, SOURCES, checkLead, handleLead } from './leads.js';
import { sqliteD1 } from './sqliteD1.mjs';

function fakeD1() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async first() {
              const [ip, since] = a;
              const day = rows.filter((r) => r.at > since);
              return { n: day.length, ip: day.filter((r) => r.ip_hash === ip).length };
            },
            async run() {
              assert.match(sql, /^INSERT INTO leads/);
              const [at, phone, gym, city, size, today, lang, ip_hash, source] = a;
              rows.push({ at, phone, gym, city, size, today, lang, ip_hash, source });
            },
          };
        },
      };
    },
  };
}
const env = (WEB) => ({ WEB, FEEDBACK_SALT: 'salt' });
const post = (b, ip = '1.1.1.1') => new Request('https://x/api/lead', { method: 'POST', body: JSON.stringify(b), headers: { 'CF-Connecting-IP': ip } });
const good = { phone: '+91 98290 12345', gym: '  Shakti   Gym ', city: 'Jaipur', size: '100-300', today: 'software' };

test('a good lead: 10 digits, tidy text, known choices only', () => {
  assert.deepEqual(checkLead(good).value, { phone: '9829012345', gym: 'Shakti Gym', city: 'Jaipur', size: '100-300', today: 'software', lang: 'en', source: '' });
  assert.equal(checkLead({ ...good, size: '<script>', today: 'drop' }).value.size, '');
  assert.ok(checkLead({ ...good, phone: '12345' }).error);
  assert.ok(checkLead({ ...good, phone: '1234567890' }).error); // Indian mobiles start 6-9
  assert.equal(checkLead({ ...good, city: undefined }).value.city, ''); // the top form sends no city
});

// 25 Oct 2026, the owner's own demo request: the top form ("Or we call you") has only a number box;
// with the coloured gym-name box empty the lead was refused and never reached HQ.
test('a number without a gym name is kept (the top form sends only the number)', async () => {
  assert.equal(checkLead({ phone: '98290 12345', gym: ' ' }).value.gym, '');
  assert.equal(checkLead({ phone: '98290 12345' }).value.gym, '');
  const WEB = fakeD1();
  const res = await handleLead(post({ phone: '98290 12345', gym: '', city: '', website: '', lang: 'hi' }), env(WEB));
  assert.equal(res.status, 201);
  assert.deepEqual(WEB.rows.map((r) => [r.phone, r.gym, r.lang]), [['9829012345', '', 'hi']]);
});

test('every refusal and every dropped lead is logged, without the number', async () => {
  const lines = [];
  const warn = console.warn;
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    const WEB = fakeD1();
    assert.equal((await handleLead(post({ ...good, phone: '12345' }), env(WEB))).status, 400);
    assert.equal((await handleLead(new Request('https://x/api/lead', { method: 'POST', body: 'nope' }), env(WEB))).status, 400);
    assert.equal((await handleLead(post({ ...good, website: 'x' }), env(WEB))).status, 201);
    for (let i = 0; i < PER_DAY; i++) await handleLead(post(good), env(WEB));
    assert.equal((await handleLead(post(good), env(WEB))).status, 429);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(lines.map((l) => /^\[lead\] (refused \d+|dropped)/.exec(l)?.[1]), ['refused 400', 'refused 400', 'dropped', 'refused 429']);
  assert.ok(!lines.join(' ').includes('9829012345'));
});

test('saved once; a filled hidden box (a bot) is answered 201 and never kept', async () => {
  const WEB = fakeD1();
  assert.equal((await handleLead(post(good), env(WEB))).status, 201);
  assert.equal((await handleLead(post({ ...good, website: 'http://spam' }), env(WEB))).status, 201);
  assert.equal(WEB.rows.length, 1);
  assert.ok(!JSON.stringify(WEB.rows).includes('1.1.1.1'));
});

test(`limits: ${PER_DAY} a day per address, ${ALL_PER_DAY} in all`, async () => {
  const WEB = fakeD1();
  for (let i = 0; i < PER_DAY; i++) assert.equal((await handleLead(post(good), env(WEB))).status, 201);
  assert.equal((await handleLead(post(good), env(WEB))).status, 429);
  assert.equal((await handleLead(post(good, '2.2.2.2'), env(WEB))).status, 201);
  while (WEB.rows.length < ALL_PER_DAY) WEB.rows.push({ at: new Date().toISOString(), ip_hash: 'x' });
  assert.equal((await handleLead(post(good, '3.3.3.3'), env(WEB))).status, 429);
});

test('wrong method, not set up, too long', async () => {
  assert.equal((await handleLead(new Request('https://x/api/lead'), env(fakeD1()))).status, 405);
  assert.equal((await handleLead(post(good), { WEB: fakeD1() })).status, 503);
  assert.equal((await handleLead(post({ ...good, gym: 'x'.repeat(3000) }), env(fakeD1()))).status, 413);
});

// F184 (R-242): a demo request from the gym page opened through a member's shared link.
test('source: only member-referral is kept; anything else is empty', () => {
  assert.deepEqual(SOURCES, ['member-referral']);
  assert.equal(checkLead({ ...good, source: 'member-referral' }).value.source, 'member-referral');
  for (const bad of ['', 'Member-Referral', '<script>', 42, null, undefined]) assert.equal(checkLead({ ...good, source: bad }).value.source, '', String(bad));
});

test('source: saved into the real leads table built from the migrations', async () => {
  const WEB = sqliteD1();
  assert.equal((await handleLead(post({ ...good, source: 'member-referral' }), env(WEB))).status, 201);
  assert.equal((await handleLead(post({ ...good, source: 'spam' }), env(WEB))).status, 201);
  assert.equal((await handleLead(post(good), env(WEB))).status, 201);
  const rows = WEB.sqlite.prepare('SELECT phone, source FROM leads ORDER BY id').all();
  assert.deepEqual(rows.map((r) => r.source), ['member-referral', '', '']);
});

test('source: a live table without the column yet (0007 not applied) still keeps the lead', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0002_leads.sql', import.meta.url), 'utf8'));
  const WEB = {
    prepare: (sql) => ({
      bind: (...a) => ({
        first: async () => db.prepare(sql).get(...a) ?? null,
        run: async () => db.prepare(sql).run(...a),
      }),
    }),
  };
  const warn = console.warn;
  const lines = [];
  console.warn = (...a) => lines.push(a.join(' '));
  try {
    assert.equal((await handleLead(post({ ...good, source: 'member-referral' }), env(WEB))).status, 201);
  } finally {
    console.warn = warn;
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
  assert.match(lines.join(' '), /apply migration 0007/);
});
