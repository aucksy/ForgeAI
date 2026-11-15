// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). R-595: the owner login's direct reads, from Supabase's log
// (pgaudit AUDIT lines) to the gym server (readLog.js, supabase 0097). The Management API and the gym server are
// stand-ins.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { auditSql, csvFields, LIMIT, logTime, looksFromRows, parseAuditLine, projectRef, readLogDue, resetReadLog, runReadLog } from './readLog.js';

const GYM = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-11-16T06:03:20.000Z');
const ENV = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_HQ_KEY: 'hq-key', SUPABASE_LOGS_TOKEN: 'logs-token' };

beforeEach(() => resetReadLog());

const line = (stmt, sub, cls, cmd, obj, text) =>
  `AUDIT: SESSION,${stmt},${sub},${cls},${cmd},${obj ? 'TABLE' : ''},${obj},"${text.replace(/"/g, '""')}",<not logged>`;

test('a pgaudit line is read field by field, quotes and commas inside the query included', () => {
  assert.deepEqual(csvFields('1,"a,""b""",c'), ['1', 'a,"b"', 'c']);
  const a = parseAuditLine(line(7, 1, 'READ', 'SELECT', 'public.crm_records', 'select "data", 1 from crm_records'));
  assert.deepEqual(a, { statementId: '7', cls: 'READ', command: 'SELECT', objectName: 'public.crm_records', text: 'select "data", 1 from crm_records' });
  assert.equal(parseAuditLine('connection authorized: user=postgres'), null);
  assert.equal(parseAuditLine('AUDIT: SESSION,x,1,READ'), null);
});

test('one item per statement, its tables together; catalog reads and "select 1" are left out', () => {
  const text = `-- source: dashboard\n-- user: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\nselect * from crm_records r join gym_staff s using (gym_id) where r.gym_id = '${GYM.toUpperCase()}'`;
  const rows = [
    { id: 'l1', timestamp: '2026-11-16 05:40:00.123456', event_message: line(3, 1, 'READ', 'SELECT', 'public.crm_records', text), user_name: 'postgres', session_id: '6553f1a2.1b3c' },
    { id: 'l2', timestamp: '2026-11-16 05:40:00.123500', event_message: line(3, 1, 'READ', 'SELECT', 'public.gym_staff', text), user_name: 'postgres', session_id: '6553f1a2.1b3c' },
    { id: 'l3', timestamp: '2026-11-16 05:41:00.000000', event_message: line(4, 1, 'READ', 'SELECT', 'information_schema.tables', 'select * from information_schema.tables'), user_name: 'postgres', session_id: '6553f1a2.1b3c' },
    { id: 'l4', timestamp: '2026-11-16 05:42:00.000000', event_message: line(5, 1, 'READ', 'SELECT', '', 'select 1'), user_name: 'postgres', session_id: '6553f1a2.1b3c' },
    { id: 'l5', timestamp: 1794807780000000, event_message: line(9, 1, 'WRITE', 'UPDATE', 'auth.users', 'update auth.users set phone = phone'), user_name: 'postgres', session_id: '6553f1a2.2222' },
    { id: 'l6', timestamp: '2026-11-16 05:44:00', event_message: line(10, 1, 'MISC', 'SET', '', 'set pgaudit.log = none'), user_name: 'postgres', session_id: '6553f1a2.2222' },
    { id: 'l7', timestamp: '2026-11-16 05:45:00', event_message: line(11, 1, 'MISC', 'SET', '', 'set statement_timeout = 0'), user_name: 'postgres', session_id: '6553f1a2.2222' },
  ];
  const items = looksFromRows(rows);
  assert.equal(items.length, 3);
  const [a, b, c] = items;
  assert.equal(a.id, '6553f1a2.1b3c:3');
  assert.equal(a.at, '2026-11-16T05:40:00.123Z');
  assert.deepEqual(a.objects, ['public.crm_records', 'public.gym_staff']);
  assert.ok(a.uuids.includes(GYM));
  assert.equal(a.source, 'dashboard');
  assert.equal(a.who, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(a.kind, 'read');
  assert.equal(b.kind, 'change');
  assert.deepEqual(b.objects, ['auth.users']);
  assert.equal(b.source, 'direct');
  assert.equal(c.kind, 'audit_change');
});

test('the query text is cut to 2,000 characters but every gym id in it still counts', () => {
  const long = `select * from crm_records where note = '${'x'.repeat(5000)}' and gym_id = '${GYM}'`;
  const [it] = looksFromRows([{ id: 'l', timestamp: '2026-11-16 05:40:00', event_message: line(1, 1, 'READ', 'SELECT', 'public.crm_records', long), session_id: 's.1' }]);
  assert.equal(it.text.length, 2000);
  assert.deepEqual(it.uuids, [GYM]);
});

test('times from both log stores; the project from the address; runs on :03, :13, ...', () => {
  assert.equal(logTime('2026-11-16 05:40:00.123456'), Date.parse('2026-11-16T05:40:00.123Z'));
  assert.equal(logTime(1794807600123456), 1794807600123);
  assert.equal(logTime('2026-11-16T05:40:00Z'), Date.parse('2026-11-16T05:40:00Z'));
  assert.equal(projectRef('https://hdxzqbdiokjklnypfisq.supabase.co'), 'hdxzqbdiokjklnypfisq');
  assert.equal(projectRef('https://evil.example.com'), '');
  assert.equal(readLogDue(Date.parse('2026-11-16T06:13:59Z')), true);
  assert.equal(readLogDue(Date.parse('2026-11-16T06:14:00Z')), false);
  assert.match(auditSql(0, 60000), /from logs where source = 'postgres_logs'/);
  assert.match(auditSql(0, 60000, 'bigquery'), /from postgres_logs cross join unnest\(metadata\)/);
});

function stand(logAnswers, { covered = '2026-11-16T05:30:00.000Z', ready = true } = {}) {
  const calls = { logs: [], ingest: [], cursor: 0 };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.supabase.com') {
      assert.equal(u.pathname, '/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/logs');
      assert.equal(init.headers.Authorization, 'Bearer logs-token');
      calls.logs.push(Object.fromEntries(u.searchParams));
      const a = logAnswers.shift();
      return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
    }
    assert.equal(init.headers.apikey, 'hq-key');
    assert.equal(JSON.stringify(init).includes('logs-token'), false);
    if (u.pathname === '/rest/v1/rpc/hq_db_reads_cursor') {
      calls.cursor += 1;
      if (!ready) return new Response(JSON.stringify({ code: 'PGRST202', message: 'not found' }), { status: 404 });
      return new Response(JSON.stringify({ coveredTo: covered }), { status: 200 });
    }
    if (u.pathname === '/rest/v1/rpc/hq_db_reads_ingest') {
      calls.ingest.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ added: 1, dropped: 0, auditOn: true }), { status: 200 });
    }
    throw new Error(`unexpected call ${u}`);
  };
  return { fetchImpl, calls };
}

test('a pull asks for the lines after the cursor up to 2 minutes ago and hands one item per statement', async () => {
  const row = { id: 'l1', timestamp: '2026-11-16 05:40:00.000000', event_message: line(3, 1, 'READ', 'SELECT', 'public.crm_records', 'select 1 from crm_records'), user_name: 'postgres', session_id: 'a.b' };
  const { fetchImpl, calls } = stand([{ body: { result: [row] } }]);
  const out = await runReadLog(ENV, { fetchImpl, now: NOW });
  assert.deepEqual(out, { calls: 3, lines: 1, added: 1, auditOn: true });
  assert.equal(calls.logs[0].iso_timestamp_start, '2026-11-16T05:29:00.000Z');
  assert.equal(calls.logs[0].iso_timestamp_end, '2026-11-16T06:01:00.000Z');
  assert.match(calls.logs[0].sql, /parseDateTime64BestEffort\('2026-11-16T05:30:00.000Z', 6\)/);
  assert.equal(calls.ingest[0].p_from, '2026-11-16T05:30:00.000Z');
  assert.equal(calls.ingest[0].p_covered_to, '2026-11-16T06:01:00.000Z');
  assert.deepEqual(calls.ingest[0].p_items.map((x) => x.id), ['a.b:3']);
});

test('the log reaches back only about a day: an old cursor starts there (the server writes the gap)', async () => {
  const { fetchImpl, calls } = stand([{ body: { result: [] } }], { covered: '2026-11-10T00:00:00.000Z' });
  await runReadLog(ENV, { fetchImpl, now: NOW });
  const from = Date.parse(calls.ingest[0].p_from);
  assert.ok(NOW - from <= 24 * 3600 * 1000 && NOW - from > 23 * 3600 * 1000);
});

test('a full answer covers only up to its last line, so the next pull goes on from there', async () => {
  const rows = Array.from({ length: LIMIT }, (_, i) => ({
    id: `l${i}`, timestamp: `2026-11-16 05:4${Math.floor(i / 100)}:00.000000`, session_id: 's.1',
    event_message: line(i + 1, 1, 'READ', 'SELECT', 'public.crm_records', 'select 1 from crm_records'),
  }));
  const { fetchImpl, calls } = stand([{ body: { result: rows } }]);
  await runReadLog(ENV, { fetchImpl, now: NOW });
  assert.equal(calls.ingest[0].p_covered_to, '2026-11-16T05:48:59.999Z');
  assert.equal(calls.ingest[0].p_items.length, LIMIT);
});

test('a refused query form is tried once in the older form; a refused key is noted on the server, never printed', async () => {
  const row = { id: 'l1', timestamp: 1794807600000000, event_message: line(3, 1, 'READ', 'SELECT', 'public.gyms', 'select name from gyms'), user_name: 'postgres', session_id: 'a.b' };
  let s = stand([{ body: { error: { message: 'Unknown identifier log_attributes' } } }, { body: { result: [row] } }]);
  let out = await runReadLog(ENV, { fetchImpl: s.fetchImpl, now: NOW });
  assert.equal(out.calls, 4);
  assert.match(s.calls.logs[1].sql, /from postgres_logs/);
  assert.equal(s.calls.ingest[0].p_items.length, 1);

  s = stand([{ status: 401, body: { message: 'Unauthorized' } }]);
  out = await runReadLog(ENV, { fetchImpl: s.fetchImpl, now: NOW });
  assert.equal(out.skipped, 'logs');
  assert.equal(s.calls.logs.length, 1);
  assert.equal(s.calls.ingest[0].p_error, 'logs API answered 401');
  assert.deepEqual(s.calls.ingest[0].p_items, []);
});

test('off without the token; quiet until 0097 is on the gym server', async () => {
  assert.deepEqual(await runReadLog({ ...ENV, SUPABASE_LOGS_TOKEN: '' }, { fetchImpl: () => assert.fail('no call'), now: NOW }), { calls: 0, skipped: 'off' });
  const { fetchImpl, calls } = stand([], { ready: false });
  assert.deepEqual(await runReadLog(ENV, { fetchImpl, now: NOW }), { calls: 1, skipped: 'not-ready' });
  assert.equal(calls.logs.length, 0);
});
