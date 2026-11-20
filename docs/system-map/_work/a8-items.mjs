#!/usr/bin/env node
// Makes the A8 (coverage) work items. Plain Node, seconds, exits. Run from the repo root, AFTER _tools/test-index.mjs:
//   node docs/system-map/_work/a8-items.mjs --list     print every item and its size, write nothing
//   node docs/system-map/_work/a8-items.mjs --all      write every item
// Groups: the A5 items of one surface, in area order, joined while the group stays at most MAX_J Tier 1 journeys and
// MAX_CHECKS see/not lines (A5 made journeys for LIVE features only: his choice, "live features first").
// For each item it writes: _work/items/<id>.txt (candidate tests per feature, then every journey with its lines),
// _work/briefs/<id>.md (through _tools/mkbrief.mjs, template _briefs/A8.md) and _work/a8-add/<id>.json.
// It does NOT touch work-items.jsonl. Candidate tests are LEADS: the helper opens each one.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_J = 110; const MAX_CHECKS = 650; const CAND = 12;
const root = 'docs/system-map';
const args = process.argv.slice(2);
const all = args.includes('--all');
if (!all && !args.includes('--list')) { console.error('use: a8-items.mjs --list | --all'); process.exit(2); }
if (!fs.existsSync(`${root}/_sources/test-index.jsonl`)) { console.error('run _tools/test-index.mjs first'); process.exit(2); }

const F = new Map(JSON.parse(fs.readFileSync(`${root}/features.json`, 'utf8')).map((f) => [f.id, f]));
const idx = fs.readFileSync(`${root}/_sources/test-index.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const lines = new Map();
const lineCount = (p) => { if (!lines.has(p)) { try { lines.set(p, fs.readFileSync(p, 'utf8').split('\n').length); } catch { lines.set(p, 0); } } return lines.get(p); };
const pathOf = (e) => String(e).replace(/:\d+(-\d+)?$/, '');
const quoted = (s) => [...String(s).matchAll(/['"‘“]([^'"’”]{6,80})['"’”]/g)].map((m) => m[1].toLowerCase());

const a5 = fs.readdirSync(`${root}/_work/a5-add`).filter((f) => /^A5-.+\.json$/.test(f)).map((f) => f.slice(0, -5))
  .filter((id) => fs.existsSync(`${root}/_work/items/${id}.txt`));
const areaOf = (id) => id.replace(/^A5-/, '').replace(/-\d+b?$/, '');
a5.sort((x, y) => (areaOf(x) < areaOf(y) ? -1 : areaOf(x) > areaOf(y) ? 1 : (x < y ? -1 : 1)));

function journeysOf(fid) {
  try { return JSON.parse(fs.readFileSync(`${root}/journeys/${fid}.json`, 'utf8')).filter((j) => j.kind === 'journey' && !j.generated); } catch { return []; }
}
function candidates(f, js) {
  const entry = new Set((f.entry || []).map(pathOf));
  const stems = [...entry].map((p) => path.basename(p).replace(/\.[^.]+$/, '').toLowerCase()).filter((s) => s.length > 3 && !/^(index|app|main|page|screen)$/.test(s));
  const phrases = [...new Set(js.flatMap((j) => j.steps.flatMap((s) => [...s.user_sees, ...s.must_not].flatMap(quoted))))];
  const scored = [];
  for (const t of idx) {
    const why = [];
    if (t.imports.some((i) => entry.has(i))) why.push('imports the code');
    if (stems.some((s) => t.path.toLowerCase().includes(s))) why.push('file name');
    const words = t.asserts.map((a) => a.toLowerCase()).filter((a) => a.length >= 6 && phrases.some((p) => p.includes(a) || a.includes(p)));
    if (words.length) why.push(`asserts ${words.length} journey phrase(s)`);
    if (why.length) scored.push([(why.includes('imports the code') ? 3 : 0) + (why.includes('file name') ? 2 : 0) + words.length, t, why]);
  }
  return scored.sort((a, b) => b[0] - a[0] || (a[1].path < b[1].path ? -1 : 1)).slice(0, CAND)
    .map(([, t, why]) => `${f.id} | ${t.path} | ${t.kind} | ${lineCount(t.path)} lines | ${why.join(', ')}`);
}

// group the A5 items of one area
const groups = [];
let cur = null;
for (const id of a5) {
  const fids = fs.readFileSync(`${root}/_work/items/${id}.txt`, 'utf8').split('\n').map((l) => l.split(' | ')[0].trim()).filter((x) => /^F-/.test(x));
  const js = fids.flatMap(journeysOf);
  const checks = js.reduce((s, j) => s + j.steps.reduce((t, st) => t + st.user_sees.length + st.must_not.length, 0), 0);
  const area = areaOf(id);
  if (cur && cur.area.split('-')[0] === area.split('-')[0] && cur.j + js.length <= MAX_J && cur.checks + checks <= MAX_CHECKS) { cur.fids.push(...fids); cur.j += js.length; cur.checks += checks; cur.from.push(id); }
  else { cur = { area, fids: [...fids], j: js.length, checks, from: [id] }; groups.push(cur); }
}
const perArea = {};
for (const g of groups) { perArea[g.area] = (perArea[g.area] || 0) + 1; g.id = `A8-${g.area}-${perArea[g.area]}`; }

let total = 0;
for (const g of groups) {
  total += g.j;
  if (!all) { console.log(`${g.id}: ${g.fids.length} features, ${g.j} journeys, ${g.checks} see/not lines (from ${g.from.join(', ')})`); continue; }
  const out = [`# ${g.id}: coverage of ${g.j} Tier 1 journeys (${g.fids.length} features, from ${g.from.join(', ')}). Made by _work/a8-items.mjs.`,
    '## CANDIDATE TESTS (feature | test file | kind | size | why the script picked it)'];
  const jl = ['## JOURNEYS (id | type | role | start; then one line per see / not)'];
  const jids = [];
  for (const fid of g.fids) {
    const f = F.get(fid); const js = journeysOf(fid);
    if (!f || !js.length) continue;
    const c = candidates(f, js);
    out.push(...(c.length ? c : [`${fid} | (no candidate found by the script)`]));
    for (const j of js) {
      jids.push(j.id);
      jl.push(`${j.id} | type ${j.type} | ${j.role} | ${String(j.start).replace(/\s+/g, ' ').slice(0, 140)}`);
      for (const s of j.steps) { for (const v of s.user_sees) jl.push(`  s${s.n} see: ${String(v).replace(/\s+/g, ' ')}`); for (const v of s.must_not) jl.push(`  s${s.n} not: ${String(v).replace(/\s+/g, ' ')}`); }
    }
  }
  for (const d of ['items', 'briefs', 'a8-add']) fs.mkdirSync(`${root}/_work/${d}`, { recursive: true });
  fs.writeFileSync(`${root}/_work/items/${g.id}.txt`, [...out, ...jl].join('\n') + '\n');
  const surface = g.area.split('-')[0];
  const add = { id: g.id, step: 'A8', item: `coverage: ${jids.length} Tier 1 journeys of ${g.fids.length} features, ${surface} / ${g.area}; list in _work/items/${g.id}.txt`, needs: ['A8-index'], checkpoint: `_work/${g.id}.md`, out_file: `_work/out/${g.id}.jsonl`, journeys: jids };
  fs.writeFileSync(`${root}/_work/a8-add/${g.id}.json`, JSON.stringify(add) + '\n');
  const items = `Surface: ${surface}. ${jids.length} journeys of ${g.fids.length} features: every one is in your items file, ${root}/_work/items/${g.id}.txt (journey ids, their see/not lines, and candidate tests per feature). Write one journey row for each.`;
  const inputs = `${root}/_work/items/${g.id}.txt (read it whole first); ${root}/_sources/test-index.jsonl (search only, one line per test file); ${root}/findings.jsonl (search only); each candidate test file (search, then read at most 100 lines).`;
  const r = execFileSync('node', [`${root}/_tools/mkbrief.mjs`, 'A8', g.id, items, inputs]).toString().trim();
  console.log(`made ${g.id}: ${jids.length} journeys, ${g.checks} lines; ${r.split(' ').slice(-2).join(' ')}`);
}
console.log(`${groups.length} A8 items, ${total} Tier 1 journeys`);
