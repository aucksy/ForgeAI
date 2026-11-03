// node --test scripts/backup  (CI: ci.yml "Panel Worker tests"). The restore file maker, 3 Nov 2026.
// The real round trip against a database is scripts/backup/ci_drill.sh (CI "database" job).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quoteTag, readCopy, restoreSql, summary } from './restore.mjs';

const copy = { format: 'mettleup-backup-1', takenAt: '2026-11-04T03:00:00Z', counts: { gyms: 1, shop_orders: 0 },
  authUsers: [{ id: 'u1' }], authIdentities: [], tables: { gyms: [{ gym_id: 'g1', name: "Ram's $$ gym" }], shop_orders: [] } };

test('parts join back into one copy; a missing part or a wrong file is refused in plain words', () => {
  const text = JSON.stringify(copy);
  const cut = Math.floor(text.length / 2);
  const { snap } = readCopy([Buffer.from(text.slice(0, cut)), Buffer.from(text.slice(cut))]);
  assert.equal(snap.tables.gyms[0].name, "Ram's $$ gym");
  assert.throws(() => readCopy([Buffer.from(text.slice(0, cut))]), /not a whole backup copy/);
  assert.throws(() => readCopy([Buffer.from('{"format":"other"}')]), /Not a MettleUp backup/);
  assert.throws(() => readCopy([Buffer.from(JSON.stringify({ ...copy, counts: { gyms: 2, shop_orders: 0 } }))]), /gyms: 1 rows but the copy says 2/);
  assert.match(summary(snap), /2 tables, 1 rows, 1 sign-in accounts/);
});

test('the SQL carries the copy byte for byte, in one transaction, under a tag that is not in the data', () => {
  const text = JSON.stringify(copy);
  let i = 0;
  const tag = quoteTag(`x $muaaa$ y`, () => ['aaa', 'bbb'][i++]);
  assert.equal(tag, '$mubbb$');
  const sql = restoreSql(text, '$mutest$');
  assert.ok(sql.includes(`$mutest$${text}$mutest$::jsonb`));
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.match(sql, /set local session_replication_role = replica/);
  assert.match(sql, /already has rows/);
  assert.match(sql, /RESTORE FAILED, nothing kept/);
});
