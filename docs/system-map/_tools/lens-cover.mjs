#!/usr/bin/env node
// Lens cover check: fails a lens work item when one of its item ids has no grid entry.
// Plain Node, no dependencies, seconds, exits. Reads only; writes nothing.
//   node docs/system-map/_tools/lens-cover.mjs <work item id> [--map <dir>]
// Run it next to merge.mjs (before `state.mjs done`): merge.mjs checks the SHAPE of every grid row;
// this checks that the helper's grid rows hold EVERY item id the work item was given.
// The item ids come from <map>/_work/lens-add/<id>.json ("lens_items", written by _work/lens-items-make.mjs),
// or, if that file is gone, from the item's row in work-items.jsonl.
// The grid rows come from <map>/_work/out/<id>.jsonl (the last row per surface|area|lens wins, as in merge.mjs).
// Exit 0: every item id has one entry, in a grid row of the right surface, area and lens.
// Exit 1: an item id is missing, sits in a row of another surface, area or lens, or is listed twice.
// Exit 2: wrong use, or a file is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const mi = argv.indexOf('--map');
const MAP = path.resolve(mi >= 0 ? argv.splice(mi, 2)[1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const WI = argv[0];
function die(m) { console.error('lens-cover.mjs: ' + m); process.exit(2); }
if (!WI || !/^[A-Za-z0-9._-]+$/.test(WI)) die('use: node lens-cover.mjs <work item id> [--map <dir>]');

let spec = null;
const addFile = path.join(MAP, '_work', 'lens-add', WI + '.json');
if (fs.existsSync(addFile)) { try { spec = JSON.parse(fs.readFileSync(addFile, 'utf8')); } catch (e) { die('lens-add file does not parse: ' + e.message); } }
else {
  const wi = path.join(MAP, 'work-items.jsonl');
  if (fs.existsSync(wi)) for (const l of fs.readFileSync(wi, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (o.id === WI) spec = o; } catch { /* state.mjs reports a bad line */ } }
}
if (!spec) die(`no lens-add file and no work item row for ${WI}`);
if (!Array.isArray(spec.lens_items) || !spec.lens_items.length) die(`${WI} has no "lens_items" list: it is not a lens work item`);

// which lens does each item id belong to
let lensOf = new Map();
try { for (const i of JSON.parse(fs.readFileSync(path.join(MAP, 'lens-items.json'), 'utf8')).items) lensOf.set(i.id, i.lens); } catch (e) { die('lens-items.json is missing or does not parse: ' + e.message); }
for (const id of spec.lens_items) if (!lensOf.has(id)) die(`item id not in lens-items.json: ${id}`);

const OUT = path.join(MAP, '_work', 'out', WI + '.jsonl');
if (!fs.existsSync(OUT)) die('no out file: ' + OUT);
const rows = new Map();
fs.readFileSync(OUT, 'utf8').split(/\r?\n/).forEach((line) => {
  if (!line.trim()) return;
  let o; try { o = JSON.parse(line); } catch { return; } // merge.mjs rejects a line that does not parse
  if (o && o.kind === 'grid') rows.set(`${o.surface}|${o.area}|${o.lens}`, o);
});

const bare = (s) => String(s ?? '').replace(/^S-/, '');
const problems = [];
const seen = new Map();
for (const g of rows.values()) {
  const right = bare(g.surface) === bare(spec.surface) && g.area === spec.area;
  for (const it of Array.isArray(g.items) ? g.items : []) {
    if (!it || typeof it.item !== 'string') continue;
    if (!spec.lens_items.includes(it.item)) { problems.push(`grid row ${g.surface} | ${g.area} | lens ${g.lens} holds an item this work item was not given: ${it.item}`); continue; }
    if (!right) { problems.push(`${it.item} sits in a row for ${g.surface} | ${g.area}; this work item is ${spec.surface} | ${spec.area}`); continue; }
    if (String(g.lens) !== lensOf.get(it.item)) { problems.push(`${it.item} sits in a row of lens ${g.lens}; it belongs to lens ${lensOf.get(it.item)}`); continue; }
    seen.set(it.item, (seen.get(it.item) || 0) + 1);
  }
}
const missing = spec.lens_items.filter((id) => !seen.has(id));
for (const id of missing) problems.push(`no grid entry for item ${id}`);
for (const [id, n] of seen) if (n > 1) problems.push(`item ${id} has ${n} entries; it needs one`);

console.log(`${WI}: ${spec.lens_items.length} item ids given, ${seen.size} have a grid entry, ${rows.size} grid row(s) in the out file`);
if (problems.length) {
  for (const p of problems) console.log('MISSING OR WRONG: ' + p);
  console.log('The lens work item is NOT done.');
  process.exit(1);
}
console.log('lens cover: ok');
