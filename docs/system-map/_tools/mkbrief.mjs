#!/usr/bin/env node
// Builds one helper brief from a template. Run from the repo root.
//   node docs/system-map/_tools/mkbrief.mjs <step> <work item id> "<items text>" "<input files text>"
// Writes docs/system-map/_work/briefs/<id>.md and prints its word count (limit: 1,200 words).
import fs from 'node:fs';
import path from 'node:path';

const [step, id, items, inputs] = process.argv.slice(2);
if (!step || !id || !items || !inputs) {
  console.error('use: mkbrief.mjs <step> <id> "<items>" "<input files>"');
  process.exit(2);
}
const root = 'docs/system-map';
const CRISPY = '7990a942-57f3-4154-bbaf-935bab0aa342';
const repo = process.cwd().replace(/\\/g, '/');
let t = fs.readFileSync(path.join(root, '_briefs', step + '.md'), 'utf8');
t = t.slice(t.indexOf('\n') + 1);
const fill = {
  '{WORK ITEM ID}': id,
  '{CRISPY CURVES ID}': CRISPY,
  '{CHECKPOINT FILE}': `${root}/_work/${id}.md`,
  '{ITEMS}': items,
  '{INPUT FILES}': `${inputs} Repo root: ${repo}`,
  '{OUTPUT FILE}': `${root}/_work/out/${id}.jsonl`,
};
for (const [k, v] of Object.entries(fill)) t = t.split(k).join(v);
const left = t.match(/\{[A-Z ]+\}/g);
if (left) { console.error('placeholder left: ' + left.join(' ')); process.exit(1); }
const out = path.join(root, '_work', 'briefs', id + '.md');
fs.writeFileSync(out, t);
console.log(`${out} ${t.split(/\s+/).filter(Boolean).length} words`);
