// Live-features-first (his choice, 19 Nov 2026). Run from the repo root:
//   node docs/system-map/_work/a5-live.mjs            count live / not-live features in every A5 item not yet in work-items.jsonl
//   node docs/system-map/_work/a5-live.mjs --clear    delete the items, briefs and add files of those items (so a5-items.mjs --all can make them again, live only)
import fs from 'node:fs';
const root = 'docs/system-map';
const feats = new Map(JSON.parse(fs.readFileSync(`${root}/features.json`, 'utf8')).map((f) => [f.id, f]));
const inState = new Set(fs.readFileSync(`${root}/work-items.jsonl`, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).id));
const clear = process.argv.includes('--clear');
let live = 0, other = 0, n = 0; const by = {};
for (const f of fs.readdirSync(`${root}/_work/items`).sort()) {
  const m = f.match(/^(A5-.+)\.txt$/); if (!m || inState.has(m[1])) continue;
  n++;
  let l = 0, o = 0;
  for (const line of fs.readFileSync(`${root}/_work/items/${f}`, 'utf8').split(/\r?\n/)) {
    const id = line.split('|')[0].trim(); if (!id) continue;
    const s = (feats.get(id) || {}).status || 'missing';
    if (s === 'live') l++; else { o++; by[s] = (by[s] || 0) + 1; }
  }
  live += l; other += o;
  if (!clear && o) console.log(`${m[1]}\tlive ${l}\tnot live ${o}`);
  if (clear) for (const p of [`${root}/_work/items/${f}`, `${root}/_work/briefs/${m[1]}.md`, `${root}/_work/a5-add/${m[1]}.json`]) if (fs.existsSync(p)) fs.unlinkSync(p);
}
console.log(`${n} items not in state: ${live} live features, ${other} not live ${JSON.stringify(by)}${clear ? ' : CLEARED' : ''}`);
