#!/usr/bin/env node
// Splits the 20 lenses and the 10 gap hunts into numbered checklist items. Plain Node, seconds, exits.
//   node docs/system-map/_tools/lens-items.mjs            (run from the repo root; writes lens-items.json)
//   node docs/system-map/_tools/lens-items.mjs --check    (writes nothing; exit 1 if the file would change)
// Reads  docs/system-map/_work/lens-source.txt  (the lens and hunt text, word for word).
// Writes docs/system-map/lens-items.json: {bundles, names, items: [{id, lens, text}]}.
//   id:   L<lens>.<n> for a lens, H<hunt>.<n> for a hunt.   lens: "3" for a lens, "gap-5" for a hunt.
// Split rule: every ";" and every sentence end (". " or "? " before a capital letter), but never inside
// brackets or quotes. The "Four added checklist items" lines become items of their lens.
// AN ITEM ID NEVER CHANGES: if lens-items.json exists, an item with the same text keeps its id; a new text
// gets the next free number of its lens; a text that is gone stays in the file with "retired": true.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(MAP, '_work', 'lens-source.txt');
const OUT = path.join(MAP, 'lens-items.json');
const check = process.argv.includes('--check');
function die(m) { console.error('lens-items.mjs: ' + m); process.exit(2); }
if (!fs.existsSync(SRC)) die('missing ' + SRC);
const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

const clean = (s) => s.replace(/\[tightened[^\]]*\]/g, '').replace(/\*\*/g, '').replace(/`/g, '')
  .replace(/\(Seed pairs:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();

// Split at ";" and at sentence ends, outside (...) and "...".
function split(text) {
  const out = [];
  let cur = '';
  let depth = 0;
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quote = !quote;
    else if (!quote && c === '(') depth++;
    else if (!quote && c === ')' && depth > 0) depth--;
    const open = depth > 0 || quote;
    if (!open && c === ';') { out.push(cur); cur = ''; continue; }
    if (!open && (c === '.' || c === '?') && /^\s+["(]?[A-Z]/.test(text.slice(i + 1, i + 5)) && !/\b(e\.g|i\.e|etc|vs)$/.test(cur)) {
      out.push(cur + (c === '?' ? '?' : '')); cur = ''; continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '').trim()).filter((s) => s.length > 2);
}

const names = {};
const cells = []; // {lens, prefix, text}
// 1. the lens table
for (const l of lines) {
  const m = l.match(/^\|\s*(\d+)\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*$/);
  if (m) { names[m[1]] = m[2]; cells.push({ lens: m[1], prefix: 'L' + m[1], text: clean(m[3]) }); }
}
// 2. the added checklist lines: "- Lens 2 also checks <text>"
for (const l of lines) {
  const m = l.match(/^- Lens (\d+) also checks (.+)$/);
  if (!m) continue;
  const t = clean(m[2]);
  // Keep the lead ("AI answers (...):") on every piece, so each item can be read alone.
  const lead = t.includes(';') && /^[^;]*?\)?:\s/.test(t) ? t.slice(0, t.indexOf(': ') + 2) : '';
  const parts = split(lead ? t.slice(lead.length) : t).map((p) => (lead ? lead + p : p));
  cells.push({ lens: m[1], prefix: 'L' + m[1], parts: parts.map((p) => 'Also: ' + p) });
}
// 3. the hunts: "1. **Title.** text" up to the next number or the "**Calibration" line
const h0 = lines.findIndex((l) => /^## 3D\. Gap hunts/.test(l));
const h1 = lines.findIndex((l) => /^\*\*Calibration/.test(l));
if (h0 < 0 || h1 < 0) die('the gap hunt part was not found in the source text');
let cur = null;
for (const l of lines.slice(h0, h1)) {
  const m = l.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
  if (m) { cur = { lens: 'gap-' + m[1], prefix: 'H' + m[1], text: m[3] }; names['gap-' + m[1]] = m[2].replace(/\.$/, ''); cells.push(cur); }
  else if (cur && l.trim()) cur.text += ' ' + l.trim();
  else if (cur && !l.trim()) cur = null;
}
for (const c of cells) if (c.text !== undefined) { c.text = clean(c.text); c.parts = split(c.text); }
if (Object.keys(names).filter((k) => /^\d+$/.test(k)).length !== 20) die('expected 20 lenses in the source text');
if (Object.keys(names).filter((k) => /^gap-/.test(k)).length !== 10) die('expected 10 hunts in the source text');

// 4. stable ids
let old = [];
if (fs.existsSync(OUT)) { try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || []; } catch (e) { die('lens-items.json does not parse: ' + e.message); } }
const oldId = new Map(old.map((o) => [o.lens + '|' + o.text, o.id]));
const maxN = new Map();
for (const o of old) { const [p, n] = o.id.split('.'); maxN.set(p, Math.max(maxN.get(p) || 0, Number(n))); }
const items = [];
const seen = new Set();
for (const c of cells) {
  for (const text of c.parts) {
    const key = c.lens + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    let id = oldId.get(key);
    if (!id) { const n = (maxN.get(c.prefix) || 0) + 1; maxN.set(c.prefix, n); id = `${c.prefix}.${n}`; }
    items.push({ id, lens: c.lens, text });
  }
}
for (const o of old) if (!seen.has(o.lens + '|' + o.text)) items.push({ ...o, retired: true });
const order = (id) => { const m = id.match(/^([LH])(\d+)\.(\d+)$/); return (m[1] === 'L' ? 0 : 1e6) + Number(m[2]) * 1000 + Number(m[3]); };
items.sort((a, b) => order(a.id) - order(b.id));

const bundles = {
  'B-sec': ['3', '19'], 'B-run': ['6', '15', 'gap-8'], 'B-truth': ['2', '17', 'gap-9'], 'B-alerts': ['11', 'gap-2', 'gap-3', 'gap-4'],
  'B-words': ['10', 'gap-10'], 'B-time': ['13', '20', 'gap-7'], 'B-switch': ['gap-1', 'gap-6'],
};
const doc = {
  _note: 'Made by _tools/lens-items.mjs from _work/lens-source.txt. Do not edit by hand. An item id never changes. Lenses 4, 5, 7, 8, 9, 12, 14, 16 and hunt 5 run alone; lens 1 is the journeys (Phase A/B); lens 18 runs last.',
  bundles, names, items,
};
const body = '{\n' + ` "_note": ${JSON.stringify(doc._note)},\n "bundles": ${JSON.stringify(bundles)},\n "names": ${JSON.stringify(names)},\n "items": [\n`
  + items.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n ]\n}\n';
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const live = items.filter((i) => !i.retired);
const per = {};
for (const i of live) per[i.lens] = (per[i.lens] || 0) + 1;
console.log(`${live.length} items (${items.length - live.length} retired): ` + Object.entries(per).map(([k, v]) => `${k}=${v}`).join(' '));
if (check) { if (before !== body) { console.log('lens-items.json WOULD CHANGE'); process.exit(1); } console.log('lens-items.json is up to date'); process.exit(0); }
if (before !== body) { fs.writeFileSync(OUT + '.tmp', body); fs.renameSync(OUT + '.tmp', OUT); console.log('written: ' + OUT); } else console.log('no change');
