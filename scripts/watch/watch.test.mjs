// node --test scripts/watch  (CI: ci.yml "Panel Worker tests"). #34 alerts, 28 Oct 2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fenceSafe, issueFor, main as crashMain, newKinds, sigOfTitle } from './crashes.mjs';
import { CHECKS, main as outageMain, plan, reportBody, runCheck, titleFor } from './outage.mjs';

const quiet = { tries: 2, gapMs: 0, timeoutMs: 1000, wait: async () => undefined };

/** A fake internet: the sites answer as told; GitHub keeps issues in memory. */
function world({ downUrls = [], issues = [], d1Rows = [] } = {}) {
  const calls = [];
  const state = { issues: issues.map((i) => ({ ...i })), next: 100, labels: new Set() };
  const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url.startsWith('https://api.github.com/repos/o/r')) {
      assert.equal(init.headers.Authorization, 'Bearer gh-token');
      const path = url.slice('https://api.github.com/repos/o/r'.length);
      const body = init.body ? JSON.parse(init.body) : null;
      if (path.startsWith('/issues?')) {
        const q = new URL(`https://x${path}`).searchParams;
        return json(200, state.issues.filter((i) => i.labels.includes(q.get('labels')) && (q.get('state') === 'all' || i.state === q.get('state'))));
      }
      if (path.startsWith('/labels/')) return state.labels.has(decodeURIComponent(path.slice(8))) ? json(200, {}) : json(404, { message: 'Not Found' });
      if (path === '/labels') return state.labels.add(body.name), json(201, body);
      if (path === '/issues' && method === 'POST') {
        const issue = { number: state.next++, state: 'open', title: body.title, body: body.body, labels: body.labels, comments: [] };
        state.issues.push(issue);
        return json(201, issue);
      }
      const m = /^\/issues\/(\d+)(\/comments)?$/.exec(path);
      const issue = m && state.issues.find((i) => i.number === Number(m[1]));
      if (issue && m[2]) return issue.comments.push(body.body), json(201, {});
      if (issue && method === 'PATCH') return Object.assign(issue, body), json(200, issue);
      return json(404, {});
    }
    if (url.startsWith('https://api.cloudflare.com/')) {
      assert.equal(init.headers.Authorization, 'Bearer cf-token');
      assert.match(JSON.parse(init.body).sql, /^SELECT /);
      return json(200, { success: true, result: [{ results: d1Rows }] });
    }
    if (downUrls.includes(url)) return new Response('Bad gateway', { status: 502 });
    if (url.includes('/rest/v1/')) return new Response('[]', { status: 200 });
    return new Response('<html><div id="root"></div></html>', { status: 200 });
  };
  return { fetchImpl, state, calls };
}

const env = { GITHUB_TOKEN: 'gh-token', GITHUB_REPOSITORY: 'o/r' };

test('a check is retried before it counts as down, and says why', async () => {
  let n = 0;
  const flaky = async () => (++n === 1 ? new Response('', { status: 503 }) : new Response('[]', { status: 200 }));
  assert.equal(await runCheck(CHECKS[3], { fetchImpl: flaky, ...quiet }), null);
  const down = async () => new Response('', { status: 502 });
  assert.equal(await runCheck(CHECKS[0], { fetchImpl: down, ...quiet }), 'answered 502');
  const dead = async () => {
    throw new TypeError('fetch failed');
  };
  const quietLog = console.log;
  console.log = () => {};
  try {
    assert.match(await runCheck(CHECKS[0], { fetchImpl: dead, ...quiet }), /could not connect/);
  } finally {
    console.log = quietLog;
  }
});

test('what to do: open, change only when what is down changes, close when back', () => {
  const a = [{ name: 'Admin app (app.mettleup.fit)', why: 'answered 502' }];
  assert.deepEqual(plan([], null), { kind: 'none' });
  assert.equal(plan(a, null).kind, 'open');
  assert.equal(titleFor(a), 'Outage: Admin app not answering');
  assert.deepEqual(plan(a, { title: titleFor(a) }), { kind: 'none' });
  assert.equal(plan([...a, { name: 'HQ (hq.mettleup.fit)', why: 'x' }], { title: titleFor(a) }).kind, 'change');
  assert.deepEqual(plan([], { title: titleFor(a) }), { kind: 'close' });
  assert.match(reportBody(a, 'now', ''), /@aucksy/);
});

test('an outage opens one issue, stays quiet while the same, and closes itself when back', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    const w = world({ downUrls: ['https://app.mettleup.fit/'] });
    await outageMain({ env, fetchImpl: w.fetchImpl, checkOpts: quiet });
    assert.equal(w.state.issues.length, 1);
    assert.deepEqual(w.state.issues[0].labels, ['outage']);
    assert.match(w.state.issues[0].title, /Admin app/);
    await outageMain({ env, fetchImpl: w.fetchImpl, checkOpts: quiet });
    assert.equal(w.state.issues.length, 1);
    assert.equal(w.state.issues[0].comments.length, 0);
    const back = world({ issues: w.state.issues });
    await outageMain({ env, fetchImpl: back.fetchImpl, checkOpts: quiet });
    assert.equal(back.state.issues[0].state, 'closed');
    assert.match(back.state.issues[0].comments[0], /Everything answers again/);
    const fine = world();
    await outageMain({ env, fetchImpl: fine.fetchImpl, checkOpts: quiet });
    assert.ok(!fine.calls.some((c) => c.startsWith('POST')));
  } finally {
    console.log = log;
  }
});

test('crash kinds: signature from a title, safe text, only new kinds, at most 5', () => {
  assert.equal(sigOfTitle('Crash [0123456789ab] Admin app: x'), '0123456789ab');
  assert.equal(sigOfTitle('Outage'), null);
  assert.equal(fenceSafe('a ```b``` @someone'), "a '''b''' (at)someone");
  const rows = Array.from({ length: 8 }, (_, i) => ({ sig: `sig:${String(i).repeat(12)}`, source: 'member', n: 2, text: 'TypeError: x' }));
  const known = new Set(['000000000000']);
  const fresh = newKinds([...rows, { sig: 'sig:bad' }], known);
  assert.equal(fresh.length, 5);
  assert.equal(fresh[0].sig, '111111111111');
  const issue = issueFor({ ...fresh[0], app: '0.59.0', screen: 'screen', first: 'a', last: 'b', text: 'TypeError: x\n  at `A` @evil' });
  assert.match(issue.title, /^Crash \[111111111111\] Member app: TypeError: x$/);
  assert.ok(!issue.body.includes('@evil'));
  assert.match(issue.body, /@aucksy/);
});

test('crash alerts stay off without the Cloudflare token, and open issues for new kinds with it', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    const off = world();
    assert.deepEqual(await crashMain({ env, fetchImpl: off.fetchImpl }), { opened: 0, skipped: true });
    assert.equal(off.calls.length, 0);
    const rows = [
      { sig: 'sig:aaaaaaaaaaaa', source: 'admin', n: 3, first: 'f', last: 'l', app: '2026-10-28', screen: '/members', text: 'TypeError: a' },
      { sig: 'sig:bbbbbbbbbbbb', source: 'member', n: 1, first: 'f', last: 'l', app: '0.59.0', screen: 'app', text: 'Error: b' },
    ];
    const w = world({ d1Rows: rows, issues: [{ number: 1, state: 'closed', title: 'Crash [bbbbbbbbbbbb] Member app: Error: b', labels: ['crash'] }] });
    const r = await crashMain({ env: { ...env, CLOUDFLARE_API_TOKEN: 'cf-token', CLOUDFLARE_ACCOUNT_ID: 'acc' }, fetchImpl: w.fetchImpl });
    assert.equal(r.opened, 1);
    assert.match(w.state.issues.at(-1).title, /^Crash \[aaaaaaaaaaaa\] Admin app/);
  } finally {
    console.log = log;
  }
});
