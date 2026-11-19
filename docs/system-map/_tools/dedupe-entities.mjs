#!/usr/bin/env node
// Two helpers that run at the same time can both write the same entity row. merge.mjs rejects the second one.
// This removes from _work/out/<id>.jsonl every entity row whose id is already in entities.json,
// and keeps the removed rows in _work/out-dropped/<id>.jsonl (nothing is lost). Run from the repo root:
//   node docs/system-map/_tools/dedupe-entities.mjs <work item id>
import fs from 'node:fs';
const id = process.argv[2];
if (!id) { console.error('use: dedupe-entities.mjs <work item id>'); process.exit(2); }
const root = 'docs/system-map';
const out = `${root}/_work/out/${id}.jsonl`;
const have = new Set((JSON.parse(fs.readFileSync(`${root}/entities.json`, 'utf8'))).map((r) => r.id));
const keep = []; const drop = [];
for (const line of fs.readFileSync(out, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  let o; try { o = JSON.parse(line); } catch { keep.push(line); continue; }
  if (o.kind === 'entity' && !o.patch && have.has(o.id)) drop.push(line); else keep.push(line);
}
if (drop.length) {
  fs.mkdirSync(`${root}/_work/out-dropped`, { recursive: true });
  fs.writeFileSync(`${root}/_work/out-dropped/${id}.jsonl`, drop.join('\n') + '\n');
  fs.writeFileSync(out, keep.join('\n') + '\n');
}
console.log(`${id}: ${drop.length} repeated entity rows moved to _work/out-dropped, ${keep.length} rows kept`);
