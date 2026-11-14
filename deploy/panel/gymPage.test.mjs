// node --test deploy/panel. F207 gym page (R-519, 14 Nov 2026): the page drawn from the gym server's answer, its
// forms, and the host. Made-up "Example" gyms and fake numbers only (90000 0xxxx).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HIGHLIGHTS,
  gymJsonLd,
  gymSlug,
  inkOn,
  lengthWords,
  mapsLinkOk,
  mapsLinks,
  pageFrom,
  perMonthWords,
  photoOk,
  renderGymPage,
  rupees,
  scriptJson,
  slugOk,
  timingRows,
  whatsappShare,
} from './gymPage.js';
import { ASK_PER_DAY, checkAsk, checkReport, handleGymPageHost, mobileOf, notHerePage, sendAnswer } from './gymPageServe.js';
import { routeFor } from './hosts.js';
import { sqliteD1 } from './sqliteD1.mjs';

const PHOTO = 'https://join.mettleup.fit/p/abc/1.webp';
const R = (open, close) => ({ open, close });
const H = (...r) => ({ kind: 'hours', ranges: r });
const ms = H(R('05:30', '11:00'), R('16:00', '22:00'));
const HOURS = { week: { mon: ms, tue: ms, wed: ms, thu: ms, fri: ms, sat: ms, sun: H(R('07:00', '11:00')) }, special: [], note: '' };
const RAW = {
  slug: 'example-fitness-sector-12',
  gymName: 'Example Fitness',
  area: 'Sector 12',
  city: 'Example City',
  joinCode: 'EXMPL1',
  brand: { accent: '#e8590c' },
  about: 'A friendly gym.',
  highlights: ['ac', 'women', 'made-up'],
  photos: [{ url: PHOTO, alt: 'The floor' }, { url: 'https://evil.example/x.jpg', alt: 'no' }],
  plans: [
    { id: 'a', name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 50000 },
    { id: 'b', name: 'Quarterly', durationUnit: 'month', durationCount: 3, priceP: 400000 },
    { id: 'x', name: 'Broken', durationUnit: 'year', durationCount: 1, priceP: 1 },
  ],
  hours: HOURS,
  address: 'Example Plaza, Sector 12',
  contact: { phone: '9000000001', whatsapp: true },
  joinOnline: true,
  indexable: false,
};
// Thursday 19 Nov 2026, 7:10 pm in India.
const THU_EVENING = Date.parse('2026-11-19T19:10:00+05:30');

function quiet(fn) {
  return async () => {
    const { warn, error, log } = console;
    console.warn = () => {};
    console.error = () => {};
    console.log = () => {};
    try {
      await fn();
    } finally {
      Object.assign(console, { warn, error, log });
    }
  };
}

test('slug: name and area in small letters, never a reserved word, falls back to the gym code', () => {
  assert.equal(gymSlug('Example Fitness', 'Sector 12'), 'example-fitness-sector-12');
  assert.equal(gymSlug('Power & Café  Gym!!', ''), 'power-and-cafe-gym');
  assert.equal(gymSlug('शक्ति जिम', '', 'EXMPL1'), 'gym-exmpl1');
  assert.equal(gymSlug('Admin', '', 'EXMPL1'), 'gym-exmpl1');
  assert.ok(gymSlug('A'.repeat(80), 'B').length <= 48);
  assert.ok(slugOk('example-fitness'));
  for (const bad of ['api', 'ab', 'Example', 'a--b', '-ab', 'ab-', 'x'.repeat(49), 'privacy']) assert.equal(slugOk(bad), false, bad);
});

test('photos only from our own addresses; maps links only from Google', () => {
  assert.ok(photoOk(PHOTO));
  assert.equal(photoOk('https://evil.example/x.jpg'), false);
  assert.equal(photoOk('https://join.mettleup.fit/p/x".jpg'), false);
  assert.ok(mapsLinkOk('https://maps.app.goo.gl/AbCd123'));
  assert.ok(mapsLinkOk('https://www.google.com/maps/place/Example'));
  assert.equal(mapsLinkOk('https://maps.app.goo.gl.evil.example/x'), false);
  assert.equal(mapsLinkOk('javascript:alert(1)'), false);
  const l = mapsLinks({ mapsUrl: null, lat: 26.9, lng: 75.8, address: 'x', gymName: 'Example' });
  assert.equal(l.open, 'https://www.google.com/maps/search/?api=1&query=26.9%2C75.8');
  assert.equal(l.directions, 'https://www.google.com/maps/dir/?api=1&destination=26.9%2C75.8');
  assert.equal(mapsLinks({ mapsUrl: null, lat: null, lng: null, address: '', gymName: '' }), null);
  assert.match(whatsappShare('Example Fitness', 'https://join.mettleup.fit/example'), /^https:\/\/wa\.me\/\?text=Example%20Fitness/);
});

test('money words: rupees from paise, per month only when it helps', () => {
  assert.equal(rupees(150000), '₹1,500');
  assert.equal(rupees(1200000), '₹12,000');
  assert.equal(rupees(10000000), '₹1,00,000');
  assert.equal(lengthWords('month', 1), '1 month');
  assert.equal(lengthWords('day', 15), '15 days');
  assert.equal(perMonthWords({ durationUnit: 'month', durationCount: 12, priceP: 1200000 }), '₹1,000 a month');
  assert.equal(perMonthWords({ durationUnit: 'month', durationCount: 3, priceP: 400000 }), 'about ₹1,333 a month');
  assert.equal(perMonthWords({ durationUnit: 'month', durationCount: 1, priceP: 150000 }), null);
  assert.equal(perMonthWords({ durationUnit: 'day', durationCount: 30, priceP: 150000 }), null);
});

test('letters on the gym colour: black on a light colour, white on a dark one', () => {
  assert.equal(inkOn('#FACC15'), '#14110F');
  assert.equal(inkOn('#1D4ED8'), '#FFFFFF');
});

test('the gym server answer is checked: bad photos, plans and highlights are dropped', () => {
  const p = pageFrom(RAW);
  assert.equal(p.accent, '#E8590C');
  assert.deepEqual(p.photos.map((x) => x.url), [PHOTO]);
  assert.deepEqual(p.plans.map((x) => x.name), ['Monthly', 'Quarterly']);
  assert.deepEqual(p.highlights, ['ac', 'women']);
  assert.equal(p.whatsapp, true);
  assert.equal(p.aiHelper, true);
  assert.equal(pageFrom({ ...RAW, aiHelper: false }).aiHelper, false);
  assert.equal(pageFrom({ ...RAW, slug: 'API' }), null);
  assert.equal(pageFrom({ ...RAW, gymName: ' ' }), null);
  assert.equal(pageFrom(null), null);
  assert.equal(pageFrom({ ...RAW, brand: { accent: 'red;}' } }).accent, '#E8590C');
  assert.equal(pageFrom({ ...RAW, contact: { phone: '12345', whatsapp: true } }).whatsapp, false);
  assert.equal(pageFrom({ ...RAW, joinCode: null }).joinOnline, false);
  assert.ok(Object.keys(HIGHLIGHTS).length >= 10);
});

test('timings: days with the same hours share a row, today marked', () => {
  const rows = timingRows([
    ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, i) => ({ name, lines: ['5:30 am to 11:00 am'], today: i === 3, special: null })),
    { name: 'Sunday', lines: ['Closed'], today: false, special: null },
  ]);
  assert.deepEqual(rows.map((r) => [r.days, r.today]), [['Monday to Saturday', true], ['Sunday', false]]);
  const withHoliday = timingRows([
    { name: 'Monday', lines: ['a'], today: true, special: null },
    { name: 'Tuesday', lines: ['Closed'], today: false, special: { note: 'Holiday' } },
    { name: 'Wednesday', lines: ['a'], today: false, special: null },
    { name: 'Thursday', lines: ['a'], today: false, special: null },
  ]);
  assert.deepEqual(withHoliday.map((r) => r.days), ['Monday', 'Tuesday', 'Wednesday and Thursday']);
  assert.equal(withHoliday[1].note, 'Holiday');
});

test('the page: escaped, not listed by Google until the gym says so, prices and status in it', () => {
  const p = pageFrom({ ...RAW, gymName: 'Example <b>Gym</b>', about: '<script>alert(1)</script>' });
  const html = renderGymPage(p, { nowMs: THU_EVENING });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('Example &lt;b&gt;Gym&lt;/b&gt;'));
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /Open now · closes 10:00 pm/);
  assert.match(html, /₹1,500/);
  assert.match(html, /about ₹1,333 a month/);
  assert.match(html, /\+ ₹500 joining fee/);
  assert.match(html, /href="https:\/\/app\.mettleup\.fit\/m\/EXMPL1"/);
  assert.match(html, /Monday to Saturday/);
  assert.match(html, /tel:\+919000000001/);
  assert.match(html, /<script type="module" src="\/gym-page\/page\.js">/);
  // Only one script runs; the others are data.
  assert.equal((html.match(/<script(?![^>]*type="application\/(ld\+)?json")/g) || []).length, 1);
  const listed = renderGymPage(pageFrom({ ...RAW, indexable: true }), { nowMs: THU_EVENING });
  assert.match(listed, /<meta name="robots" content="index, follow">/);
});

test('R-528: "Become a member" says how they pay: online when the gym takes it there, else at the desk', () => {
  const desk = renderGymPage(pageFrom(RAW), { nowMs: THU_EVENING });
  assert.match(desk, /Become a member<small>Send your details\. Pay at the desk\.<\/small>/);
  const online = renderGymPage(pageFrom(RAW), { nowMs: THU_EVENING, payOnline: true });
  assert.match(online, /Become a member<small>Join and pay online<\/small>/);
  assert.ok(!online.includes('Pay at the desk.'));
});

test('the page without online joining asks a question instead; closed now shows on the shutter', () => {
  const late = Date.parse('2026-11-19T23:20:00+05:30');
  const html = renderGymPage(pageFrom({ ...RAW, joinOnline: false }), { nowMs: late });
  assert.ok(!html.includes('/m/EXMPL1'));
  assert.match(html, /class="btn tin" href="#ask">Ask a question/);
  assert.match(html, /floor is-closed/);
  assert.match(html, /Closed now · opens 5:30 am tomorrow/);
});

test('JSON in the page can never close its script tag', () => {
  assert.equal(scriptJson({ a: '</script><b>' }), '{"a":"\\u003c/script>\\u003cb>"}');
  const ld = gymJsonLd(pageFrom(RAW), 'https://join.mettleup.fit/example-fitness-sector-12');
  assert.equal(ld['@type'], 'ExerciseGym');
  assert.equal(ld.priceRange, '₹1,500 to ₹4,000');
  assert.equal(ld.openingHoursSpecification.length, 13);
});

test('the question form: tidy name, Indian mobile, no links, consent needed', () => {
  const good = { slug: 'example-fitness', name: '  Ravi  Kumar ', phone: '+91 90000 00002', question: 'Is there a ladies batch?', consent: true, website: '' };
  assert.deepEqual(checkAsk(good).value, { slug: 'example-fitness', name: 'Ravi Kumar', phone: '9000000002', question: 'Is there a ladies batch?' });
  assert.equal(checkAsk({ ...good, website: 'x' }).bot, true);
  assert.equal(checkAsk({ ...good, slug: 'API' }).error, 'NO_GYM');
  assert.equal(checkAsk({ ...good, phone: '12345' }).error, 'BAD_PHONE');
  assert.equal(checkAsk({ ...good, question: 'see www.spam.example' }).error, 'BAD_QUESTION');
  assert.equal(checkAsk({ ...good, consent: 'yes' }).error, 'NO_CONSENT');
  assert.equal(mobileOf('09000000002'), '9000000002');
  assert.equal(checkReport({ slug: 'example-fitness', reason: 'scam' }).value.reason, 'scam');
  assert.equal(checkReport({ slug: 'example-fitness', reason: 'other' }).error, 'BAD_REASON');
  assert.deepEqual(sendAnswer([{ ok: true }]), { status: 201, body: { ok: true } });
  assert.equal(sendAnswer({ error: 'TOO_MANY' }).body.error, 'LIMIT');
  assert.equal(sendAnswer({ error: 'weird' }).status, 503);
});

test('join.mettleup.fit is its own host; every other host is unchanged', () => {
  assert.deepEqual(routeFor('join.mettleup.fit', '/example-fitness'), { kind: 'gympage' });
  assert.deepEqual(routeFor('JOIN.mettleup.fit', '/api/gym-page/ask', '', 'POST'), { kind: 'gympage' });
  assert.deepEqual(routeFor('app.mettleup.fit', '/example-fitness'), { kind: 'app' });
});

const OFF = { GYM_PAGES: undefined };
const ctx = { waitUntil() {} };
const get = (path, init) => new Request(`https://join.mettleup.fit${path}`, init);
const rpcOf = (reply) => {
  const calls = [];
  return { calls, rpc: async (fn, args) => (calls.push({ fn, args }), typeof reply === 'function' ? reply(fn, args) : reply) };
};

test('switched off: every address is the plain "not here" page and the gym server is never asked', async () => {
  const { calls, rpc } = rpcOf({ status: 200, data: RAW });
  for (const path of ['/example-fitness-sector-12', '/api/gym-page/ask', '/robots.txt']) {
    const r = await handleGymPageHost(get(path), OFF, ctx, new URL(`https://join.mettleup.fit${path}`), rpc);
    assert.equal(r.status, 404, path);
  }
  assert.equal(calls.length, 0);
  assert.ok(!notHerePage().includes('Example'));
});

test('switched on: a published page is drawn with strict headers; a missing function is "not here", 503', quiet(async () => {
  const env = { GYM_PAGES: 'live' };
  const { calls, rpc } = rpcOf({ status: 200, data: [RAW] });
  const url = new URL('https://join.mettleup.fit/example-fitness-sector-12');
  const r = await handleGymPageHost(get(url.pathname), env, ctx, url, rpc, { nowMs: THU_EVENING, cache: null });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex');
  assert.match(await r.text(), /Example Fitness/);
  assert.deepEqual(calls[0], { fn: 'gym_page_public', args: { p_slug: 'example-fitness-sector-12' } });

  const up = new URL('https://join.mettleup.fit/Example-Fitness-Sector-12/');
  const moved = await handleGymPageHost(get(up.pathname), env, ctx, up, rpc, { cache: null });
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('Location'), 'https://join.mettleup.fit/example-fitness-sector-12');

  const notLive = rpcOf({ status: 404, data: { code: 'PGRST202' } });
  const r2 = await handleGymPageHost(get(url.pathname), env, ctx, url, notLive.rpc, { cache: null });
  assert.equal(r2.status, 503);
  const none = rpcOf({ status: 200, data: null });
  assert.equal((await handleGymPageHost(get(url.pathname), env, ctx, url, none.rpc, { cache: null })).status, 404);
}));

test('the question form: sent once checked; NOT_READY before the gym server has it; a daily limit per address', quiet(async () => {
  const env = { GYM_PAGES: 'live', WEB: sqliteD1(), FEEDBACK_SALT: 'salt' };
  const body = { slug: 'example-fitness', name: 'Ravi', phone: '9000000002', question: 'Ladies batch?', consent: true, priceP: 1 };
  const ask = () => get('/api/gym-page/ask', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '1.1.1.1' } });
  const url = new URL('https://join.mettleup.fit/api/gym-page/ask');
  const { calls, rpc } = rpcOf({ status: 200, data: { ok: true } });
  const r = await handleGymPageHost(ask(), env, ctx, url, rpc);
  assert.equal(r.status, 201);
  assert.deepEqual(calls[0], { fn: 'gym_page_ask_send', args: { p_slug: 'example-fitness', p_name: 'Ravi', p_phone: '9000000002', p_question: 'Ladies batch?', p_consent: true } });

  const notLive = rpcOf({ status: 404, data: { code: 'PGRST202' } });
  assert.deepEqual(await (await handleGymPageHost(ask(), env, ctx, url, notLive.rpc)).json(), { error: 'NOT_READY' });

  for (let i = 2; i < ASK_PER_DAY; i++) await handleGymPageHost(ask(), env, ctx, url, rpc);
  const over = await handleGymPageHost(ask(), env, ctx, url, rpc);
  assert.equal(over.status, 429);
  assert.deepEqual(await over.json(), { error: 'LIMIT' });
}));
