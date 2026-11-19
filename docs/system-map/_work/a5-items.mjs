// Makes the A5 (journeys) work items. Plain Node, seconds, exits. Run from the repo root:
//   node docs/system-map/_work/a5-items.mjs --list          print every item id and its size, write nothing
//   node docs/system-map/_work/a5-items.mjs --only <id>     make ONE item (the pilot)
//   node docs/system-map/_work/a5-items.mjs --all           make every other item (features already in an A5 items file are left out)
// For each item it writes: _work/items/<id>.txt (one line per feature: id | name | first entry),
// _work/briefs/<id>.md (through _tools/mkbrief.mjs, template _briefs/A5.md) and _work/a5-add/<id>.json.
// It does NOT touch work-items.jsonl. The coordinator adds an item with:
//   node docs/system-map/_tools/state.mjs add @docs/system-map/_work/a5-add/<id>.json
// (--all also writes _work/a5-add/_all.json, a list of every item it made, for one "add".)
// After a helper reports:  node docs/system-map/_tools/merge.mjs <id> --blind <file> --a5cover <id>.txt
//                    then:  node docs/system-map/_tools/expand.mjs <id>   and   merge.mjs <id>-gen --blind <file>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const N = 10; // features per helper. Change after the pilot (6 to 10).
const NEEDS = []; // work item ids every A5 item must wait for (they must exist in work-items.jsonl)
const WORD_LIMIT = 1200;

const root = 'docs/system-map';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const all = args.includes('--all');
const listOnly = args.includes('--list');
if ((only ? 1 : 0) + (all ? 1 : 0) + (listOnly ? 1 : 0) !== 1) { console.error('use: a5-items.mjs --list | --only <item id> | --all'); process.exit(2); }

const features = JSON.parse(fs.readFileSync(`${root}/features.json`, 'utf8')).filter((f) => f.status !== 'not-a-feature');
const first = (f) => (f.entry || [])[0] || 'unknown';
const entryKey = (f) => { const m = first(f).match(/^(.+?):(\d+)/); return m ? [m[1], Number(m[2])] : [first(f), 0]; };
const byEntry = (a, b) => { const [fa, la] = entryKey(a); const [fb, lb] = entryKey(b); return fa < fb ? -1 : fa > fb ? 1 : la - lb || (a.id < b.id ? -1 : 1); };
const short = (area) => String(area).split('/').pop().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

// features already given to an A5 item (an items file exists): --all leaves them out
const itemsDir = `${root}/_work/items`;
const taken = new Set();
const highest = new Map(); // "A5-<surface>-<area>" -> highest <n> in use
if (fs.existsSync(itemsDir)) for (const f of fs.readdirSync(itemsDir)) {
  const m = f.match(/^(A5-.+)-(\d+)\.txt$/);
  if (!m) continue;
  highest.set(m[1], Math.max(highest.get(m[1]) || 0, Number(m[2])));
  for (const l of fs.readFileSync(`${itemsDir}/${f}`, 'utf8').split(/\r?\n/)) { const id = l.split('|')[0].trim(); if (id) taken.add(id); }
}

// groups: surface + area; areas with fewer than N features are pooled into "<surface>-small"
const bySA = new Map();
for (const f of features) { const k = `${f.surface}|${f.area}`; if (!bySA.has(k)) bySA.set(k, []); bySA.get(k).push(f); }
const groups = new Map(); // prefix -> { label, feats }
for (const [k, feats] of [...bySA].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const [surface, area] = k.split('|');
  const small = feats.length < N;
  const prefix = `A5-${surface}-${small ? 'small' : short(area)}`;
  if (!groups.has(prefix)) groups.set(prefix, { label: small ? `${surface} / small areas` : `${surface} / ${area}`, feats: [] });
  groups.get(prefix).feats.push(...feats);
}
function chunk(feats) { // even chunks of at most N
  const k = Math.ceil(feats.length / N);
  const out = [];
  let at = 0;
  for (let i = 0; i < k; i++) { const size = Math.ceil((feats.length - at) / (k - i)); out.push(feats.slice(at, at + size)); at += size; }
  return out;
}
const items = [];
for (const [prefix, g] of groups) {
  const feats = (all ? g.feats.filter((f) => !taken.has(f.id)) : g.feats).sort(byEntry);
  if (!feats.length) continue;
  const start = all ? (highest.get(prefix) || 0) : 0;
  chunk(feats).forEach((c, i) => items.push({ id: `${prefix}-${start + i + 1}`, label: g.label, feats: c }));
}

if (listOnly) {
  for (const it of items) console.log(`${it.id}\t${it.feats.length} features\t${it.feats.reduce((s, f) => s + f.roles.length, 0)} feature x role pairs\t${it.label}`);
  console.log(`${items.length} items, ${items.reduce((s, it) => s + it.feats.length, 0)} features, N = ${N}`);
  process.exit(0);
}
const todo = only ? items.filter((it) => it.id === only) : items;
if (only && !todo.length) { console.error(`no such item: ${only} (see --list)`); process.exit(1); }

fs.mkdirSync(itemsDir, { recursive: true });
fs.mkdirSync(`${root}/_work/a5-add`, { recursive: true });
const inputs = 'docs/system-map/features.json, entities.json and promises.json (search only, never read whole); docs/system-map/journey-templates.json (read it whole: 42 short lines); docs/system-map/_briefs/rows.md (only for a finding row); the code at each entry point.';
const added = [];
let bad = 0;
for (const it of todo) {
  const pairs = it.feats.reduce((s, f) => s + f.roles.length, 0);
  fs.writeFileSync(`${itemsDir}/${it.id}.txt`, it.feats.map((f) => `${f.id} | ${f.name} | ${first(f)}`).join('\n') + '\n');
  const text = `The ${it.feats.length} features (${pairs} feature x role pairs) listed in docs/system-map/_work/items/${it.id}.txt, one per line: feature id | name | first entry point. Area: ${it.label}. Do them in the order of the file.`;
  const res = execFileSync('node', [`${root}/_tools/mkbrief.mjs`, 'A5', it.id, text, inputs]).toString().trim();
  const words = Number((res.match(/ (\d+) words$/) || [])[1]);
  if (!(words <= WORD_LIMIT)) { bad++; console.log(`TOO LONG ${res}`); } else console.log(res);
  const j = { id: it.id, step: 'A5', item: `journeys: ${it.feats.length} features (${pairs} feature x role pairs) of ${it.label}; list in _work/items/${it.id}.txt`, needs: NEEDS, checkpoint: `_work/${it.id}.md`, out_file: `_work/out/${it.id}.jsonl` };
  fs.writeFileSync(`${root}/_work/a5-add/${it.id}.json`, JSON.stringify(j) + '\n');
  added.push(j);
}
if (all) fs.writeFileSync(`${root}/_work/a5-add/_all.json`, JSON.stringify(added) + '\n');
console.log(`${todo.length} item(s) made, ${todo.reduce((s, it) => s + it.feats.length, 0)} features. Add each with: node ${root}/_tools/state.mjs add @${root}/_work/a5-add/<id>.json`);
if (bad) { console.log(`${bad} brief(s) over ${WORD_LIMIT} words: shorten _briefs/A5.md and run again`); process.exit(1); }
