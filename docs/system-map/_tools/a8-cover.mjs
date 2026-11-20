#!/usr/bin/env node
// A8 cover check: fails an A8 work item when one of its journeys has no coverage row. Plain Node, seconds, exits. Reads only.
//   node docs/system-map/_tools/a8-cover.mjs <work item id> [--map <dir>]
// The journey ids come from <map>/_work/a8-add/<id>.json ("journeys"). The rows come from <map>/_work/out/<id>.jsonl.
// A journey passes when the out file holds a row {"kind":"journey","id":<it>,"patch":true,"tests":[...],"coverage":<value>}
// with coverage full | partial | none | manual-only (or "unknown" only when the helper reported "limit reached"),
// "full" or "partial" with at least one test, and "none" with no test.
// Exit 0: every journey passes. Exit 1: a journey is missing, doubled, or its row breaks a rule. Exit 2: wrong use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const mi = argv.indexOf('--map');
const MAP = path.resolve(mi >= 0 ? argv.splice(mi, 2)[1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const WI = argv[0];
const die = (m) => { console.error('a8-cover.mjs: ' + m); process.exit(2); };
if (!WI || !/^[A-Za-z0-9._-]+$/.test(WI)) die('use: node a8-cover.mjs <work item id>');
const addFile = path.join(MAP, '_work', 'a8-add', WI + '.json');
if (!fs.existsSync(addFile)) die('no add file: ' + addFile);
const want = JSON.parse(fs.readFileSync(addFile, 'utf8')).journeys || [];
const outFile = path.join(MAP, '_work', 'out', WI + '.jsonl');
if (!fs.existsSync(outFile)) die('no out file: ' + outFile);
const seen = new Map(); const errs = [];
fs.readFileSync(outFile, 'utf8').split(/\r?\n/).forEach((l, i) => {
  if (!l.trim()) return;
  let o; try { o = JSON.parse(l); } catch { errs.push(`line ${i + 1}: does not parse`); return; }
  if (o.kind !== 'journey') return;
  if (seen.has(o.id)) errs.push(`${o.id}: two rows (lines ${seen.get(o.id).n} and ${i + 1})`);
  seen.set(o.id, { n: i + 1, o });
});
let unknown = 0;
for (const id of want) {
  const r = seen.get(id);
  if (!r) { errs.push(`${id}: no row`); continue; }
  const o = r.o;
  if (o.patch !== true) errs.push(`${id}: needs "patch": true`);
  if (!Array.isArray(o.tests)) errs.push(`${id}: "tests" must be a list`);
  if (!['full', 'partial', 'none', 'manual-only', 'unknown'].includes(o.coverage)) errs.push(`${id}: coverage "${o.coverage}" is not allowed`);
  if (o.coverage === 'unknown') unknown++;
  if (['full', 'partial'].includes(o.coverage) && !(o.tests || []).length) errs.push(`${id}: "${o.coverage}" needs at least one test`);
  if (o.coverage === 'none' && (o.tests || []).length) errs.push(`${id}: "none" with tests listed`);
  for (const k of Object.keys(o)) if (!['kind', 'id', 'patch', 'tests', 'coverage'].includes(k)) errs.push(`${id}: field "${k}" is not allowed in a coverage row`);
}
for (const id of seen.keys()) if (!want.includes(id)) errs.push(`${id}: not one of this item's journeys`);
if (errs.length) { console.log(`a8-cover ${WI}: FAIL, ${errs.length} problem(s)`); errs.slice(0, 40).forEach((e) => console.log('  ' + e)); process.exit(1); }
console.log(`a8-cover ${WI}: ok, ${want.length} journeys${unknown ? `, ${unknown} "unknown" (limit reached: make a new item for them)` : ''}`);
