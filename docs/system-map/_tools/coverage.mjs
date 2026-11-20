#!/usr/bin/env node
// A8 report (script): COVERAGE.md and the orphan test list. Plain Node, one process, seconds, exits. Run from the repo root
// AFTER every A8 item is merged (and A8-tier2 if it ran):
//   node docs/system-map/_tools/coverage.mjs
// Writes docs/system-map/COVERAGE.md: counts per surface and per journey type, Tier 1 and Tier 2 apart, and the list of
//   Tier 1 "none" journeys sorted by impact (most secondary journeys first, from impact.json).
// Writes docs/system-map/_sources/orphan-tests.txt: every test file in _sources/test-index.jsonl that no journey's
//   tests[] names (a feature the map missed, or a dead test: lens 16 reads this list).
import fs from 'node:fs';

const M = 'docs/system-map';
if (!fs.existsSync(`${M}/impact.json`) || !fs.existsSync(`${M}/_sources/test-index.jsonl`)) { console.error('needs impact.json and _sources/test-index.jsonl; run from the repo root'); process.exit(2); }
const J = [];
for (const f of fs.readdirSync(`${M}/journeys`).sort()) for (const j of JSON.parse(fs.readFileSync(`${M}/journeys/${f}`, 'utf8'))) if (j.kind === 'journey') J.push(j);
const F = new Map(JSON.parse(fs.readFileSync(`${M}/features.json`, 'utf8')).map((f) => [f.id, f]));
const imp = JSON.parse(fs.readFileSync(`${M}/impact.json`, 'utf8')).journeys;
const VALUES = ['full', 'partial', 'none', 'manual-only', 'unknown'];
const table = (key) => {
  const m = new Map();
  for (const j of J) {
    const k = key(j); if (!m.has(k)) m.set(k, Object.fromEntries(VALUES.map((v) => [v, 0])));
    m.get(k)[VALUES.includes(j.coverage) ? j.coverage : 'unknown']++;
  }
  const rows = [...m].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  return ['| group | ' + VALUES.join(' | ') + ' | full % |', '|---|' + VALUES.map(() => '---|').join('') + '---|',
    ...rows.map(([k, c]) => { const n = VALUES.reduce((s, v) => s + c[v], 0); return `| ${k} | ${VALUES.map((v) => c[v]).join(' | ')} | ${n ? Math.round((100 * c.full) / n) : 0}% |`; })];
};
const tier = (j) => (j.generated ? 'Tier 2' : 'Tier 1');
const none = J.filter((j) => !j.generated && j.coverage === 'none').map((j) => [j, (imp[j.id] || [])[2] || 0]).sort((a, b) => b[1] - a[1] || (a[0].id < b[0].id ? -1 : 1));
const md = ['# Coverage (made by _tools/coverage.mjs; never edit by hand)', '',
  `${J.length} journeys: ${J.filter((j) => !j.generated).length} Tier 1 (checked by A8 helpers), ${J.filter((j) => j.generated).length} Tier 2 (by template rule).`, '',
  '## Per surface and tier', ...table((j) => `${(F.get(j.feature) || {}).surface || 'unknown'} / ${tier(j)}`), '',
  '## Per journey type and tier', ...table((j) => `type ${String(j.type).padStart(2, '0')} / ${tier(j)}`), '',
  `## Tier 1 journeys with coverage "none", most secondary journeys first (${none.length})`, '| journey | feature | secondary journeys |', '|---|---|---|',
  ...none.map(([j, n]) => `| ${j.id} | ${(F.get(j.feature) || {}).name ? String(F.get(j.feature).name).replace(/\|/g, '/').slice(0, 80) : j.feature} | ${n} |`)];
fs.writeFileSync(`${M}/COVERAGE.md`, md.join('\n') + '\n');
const named = new Set(J.flatMap((j) => (j.tests || []).map((t) => t.path)));
const idx = fs.readFileSync(`${M}/_sources/test-index.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const orphans = idx.filter((t) => !named.has(t.path));
fs.writeFileSync(`${M}/_sources/orphan-tests.txt`, ['# Test files no journey names in tests[] (made by _tools/coverage.mjs). path | kind | first title', ...orphans.map((t) => `${t.path} | ${t.kind} | ${(t.title[0] || '').slice(0, 100)}`)].join('\n') + '\n');
console.log(`COVERAGE.md written; ${none.length} Tier 1 journeys with none; ${orphans.length} of ${idx.length} test files named by no journey (_sources/orphan-tests.txt)`);
