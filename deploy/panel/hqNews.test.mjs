// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). R-243, 31 Oct 2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_AGE_DAYS, SHOWN, handleHqNews } from './hqNews.js';
import { sqliteD1 } from './sqliteD1.mjs';

const NOW = new Date('2026-10-31T10:00:00Z');
const get = () => new Request('https://app.mettleup.fit/api/hq-news');

function add(db, at, title, extra = {}) {
  db.sqlite.prepare('INSERT INTO hq_messages (at, title, body, link, label, removed_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(at, title, extra.body ?? 'Body', extra.link ?? '', extra.label ?? '', extra.removed ?? null);
}

test('lists the newest messages, not removed, not too old', async () => {
  const db = sqliteD1();
  add(db, '2026-05-01T00:00:00Z', 'Too old');
  add(db, '2026-10-30T00:00:00Z', 'Taken back', { removed: '2026-10-30T01:00:00Z' });
  add(db, '2026-10-30T02:00:00Z', 'Older', { link: '/plans', label: 'Open plans' });
  add(db, '2026-10-31T02:00:00Z', 'Newest');
  const res = await handleHqNews(get(), { WEB: db }, NOW);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /max-age=60/);
  const { messages } = await res.json();
  assert.deepEqual(messages.map((m) => m.title), ['Newest', 'Older']);
  assert.deepEqual(messages[1], { id: 3, at: '2026-10-30T02:00:00Z', title: 'Older', body: 'Body', link: '/plans', label: 'Open plans' });
  assert.ok(MAX_AGE_DAYS >= 90);
});

test('at most SHOWN messages', async () => {
  const db = sqliteD1();
  for (let i = 0; i < SHOWN + 5; i++) add(db, `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, `M${i}`);
  const { messages } = await (await handleHqNews(get(), { WEB: db }, NOW)).json();
  assert.equal(messages.length, SHOWN);
  assert.equal(messages[0].title, `M${SHOWN + 4}`);
});

test('no table yet, or no database: an empty list, not an error', async () => {
  const db = sqliteD1();
  db.sqlite.exec('DROP TABLE hq_messages');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const res = await handleHqNews(get(), { WEB: db }, NOW);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { messages: [] });
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(await (await handleHqNews(get(), {}, NOW)).json(), { messages: [] });
});

test('only GET', async () => {
  const res = await handleHqNews(new Request('https://x/api/hq-news', { method: 'POST', body: '{}' }), {}, NOW);
  assert.equal(res.status, 405);
});
