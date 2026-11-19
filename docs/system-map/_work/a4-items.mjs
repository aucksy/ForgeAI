// Makes the other A4 work items (run once, from the repo root): node docs/system-map/_work/a4-items.mjs [--write]
// Splits _sources/readers-raw.txt on group borders into items of about 100 candidates.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const SRC = 'docs/system-map/_sources/readers-raw.txt';
const write = process.argv.includes('--write');
const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const groups = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^## (\S+) (.*)$/);
  if (m) groups.push({ type: m[1], name: m[2], start: i + 1, end: i + 1, n: 0 });
  else if (groups.length && lines[i].trim()) { const g = groups[groups.length - 1]; g.end = i + 1; g.n++; }
}
const items = [];
const d1 = groups.filter((g) => g.type === 'd1' && g.start >= 124);
items.push({ id: 'A4-d1-2', kind: 'd1', from: d1[0].start, to: d1[d1.length - 1].end, n: d1.reduce((a, g) => a + g.n, 0), names: d1.map((g) => g.name) });
const rest = groups.filter((g) => ['rpc', 'storage', 'table'].includes(g.type));
let cur = null; let k = 0;
for (const g of rest) {
  if (!cur || cur.n + g.n > 100) { cur = { id: `A4-rpc-${++k}`, kind: 'rpc', from: g.start, to: g.end, n: 0, groups: 0 }; items.push(cur); }
  cur.to = g.end; cur.n += g.n; cur.groups++;
}
const nc = groups.find((g) => g.type === 'database');
const per = Math.ceil(nc.n / 3);
for (let j = 0; j < 3; j++) {
  const from = nc.start + 1 + j * per; const to = Math.min(nc.end, from + per - 1);
  items.push({ id: `A4-nocaller-${j + 1}`, kind: 'nocaller', from, to, n: to - from + 1 });
}
const ENT = 'Entity ids are E-<table name, with dashes for underscores> (for example E-pay-gyms). Before you write an entity row, search docs/system-map/entities.json for that id: if it is there, do not write it again; still use it in your reader rows.';
for (const it of items) {
  let text; let what;
  if (it.kind === 'd1') {
    what = `entities and readers: ${it.names.length} d1 tables, lines ${it.from}-${it.to} of _sources/readers-raw.txt`;
    text = `Your ${it.names.length} tables (store "d1", the small database of the Workers): ${it.names.join(', ')}. Their reader candidates: lines ${it.from} to ${it.to} of docs/system-map/_sources/readers-raw.txt (${it.n} candidates). Each line is: type | name | file:line | how it was found. ${ENT}`;
  } else if (it.kind === 'rpc') {
    what = `entities and readers: ${it.groups} database-function groups, lines ${it.from}-${it.to} of _sources/readers-raw.txt`;
    text = `Your groups: lines ${it.from} to ${it.to} of docs/system-map/_sources/readers-raw.txt (${it.groups} groups, ${it.n} candidates). Each line is: type | name | file:line | how it was found. Most groups are "rpc": the name is a database function, and the file:line is code that calls it. For an rpc group, first find the function's newest definition (search supabase/migrations for the function name; read at most 100 lines of its body) and note the main table it reads or writes: that table is the entity. A function that only writes makes its callers not-a-reader. "storage" and "table" groups: the name is the bucket or table itself. Write ONE reader row for EACH candidate line; "where" is the candidate's own file:line. ${ENT} At most 12 NEW entity rows: when more tables need one, list the rest in your checkpoint under "entity rows still to write", leave those reader rows out and count them in your report (never write entity "unknown").`;
  } else {
    what = `entities and readers: database functions with no caller found, lines ${it.from}-${it.to} of _sources/readers-raw.txt`;
    text = `Your candidates: lines ${it.from} to ${it.to} of docs/system-map/_sources/readers-raw.txt (${it.n} lines). Each line is: no-caller | function name | file:line of its newest definition | newest definition. No app or Worker code calls these database functions. For EACH one: read its definition at the file:line (at most 100 lines), then search supabase/migrations for its name to see what calls it (a trigger, a timed job, another function, a policy). Write ONE reader row: entity = the main table it reads; reader_kind = job, notification, count, digest or export when something really runs it and it shows or sends data to a person; else not-a-reader with a reason in plain words (for example: trigger that only writes; helper used by a policy; nothing calls it: looks dead). "where" is the candidate's own file:line. A function that nothing at all calls: add one line under "seen in passing" in your checkpoint. ${ENT} At most 12 NEW entity rows: when more tables need one, list the rest in your checkpoint under "entity rows still to write", leave those reader rows out and count them in your report.`;
  }
  const inputs = `docs/system-map/_sources/readers-raw.txt (lines ${it.from}-${it.to} only); the code at each file:line; supabase/migrations and deploy/ (search, then read at most 100 lines); docs/system-map/entities.json (search only).`;
  console.log(`${it.id} | lines ${it.from}-${it.to} | ${it.n} candidates`);
  if (write) {
    console.log(execFileSync('node', ['docs/system-map/_tools/mkbrief.mjs', 'A4', it.id, text, inputs]).toString().trim());
    console.log(execFileSync('node', ['docs/system-map/_tools/state.mjs', 'add', JSON.stringify({ id: it.id, step: 'A4', item: what, needs: [], checkpoint: `_work/${it.id}.md`, out_file: `_work/out/${it.id}.jsonl` })]).toString().trim());
  }
}
