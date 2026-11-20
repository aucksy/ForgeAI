#!/usr/bin/env node
// A8 Tier 2: coverage of the generated journeys BY RULE from their template. Plain Node, one process, seconds, exits.
//   node docs/system-map/_tools/a8-tier2.mjs        (run from the repo root) writes docs/system-map/_work/out/A8-tier2.jsonl
// Then the coordinator merges it like any item:  node docs/system-map/_tools/merge.mjs A8-tier2 --blind <file>
// Reads docs/system-map/_work/a8-rules.json, written by the A8-rules helper: one rule per journey template id
//   {"template":"T9-...","coverage_default":"none","covered_when":{"entry_file_in":["apps/..."]},
//    "coverage_then":"full","tests":[{"path":"<gate file>","checks":"<what the gate really checks>"}],"evidence":["path:line"]}
//   coverage_default / coverage_then: full | partial | none | manual-only. "tests" is used only when the rule gives
//   full or partial. covered_when.entry_file_in: the files (screens) the gate list holds; a journey is covered when
//   its feature's entry list names one of them. No covered_when = every journey of that template gets coverage_default.
// A template with no rule = its journeys stay "unknown" (printed, so the coordinator sees the gap).
import fs from 'node:fs';

const M = 'docs/system-map';
const RULES = `${M}/_work/a8-rules.json`;
if (!fs.existsSync(RULES)) { console.error('no ' + RULES + ' yet (the A8-rules helper writes it); run from the repo root'); process.exit(2); }
const rules = new Map(JSON.parse(fs.readFileSync(RULES, 'utf8')).map((r) => [r.template, r]));
const F = new Map(JSON.parse(fs.readFileSync(`${M}/features.json`, 'utf8')).map((f) => [f.id, new Set((f.entry || []).map((e) => String(e).replace(/:\d+(-\d+)?$/, '')))]));
const OK = ['full', 'partial', 'none', 'manual-only'];
const out = []; const noRule = new Map(); const counts = {};
for (const f of fs.readdirSync(`${M}/journeys`).sort()) {
  for (const j of JSON.parse(fs.readFileSync(`${M}/journeys/${f}`, 'utf8'))) {
    if (j.kind !== 'journey' || !j.generated) continue;
    const r = rules.get(j.template);
    if (!r) { noRule.set(j.template, (noRule.get(j.template) || 0) + 1); continue; }
    const files = F.get(j.feature) || new Set();
    const hit = r.covered_when && Array.isArray(r.covered_when.entry_file_in) && r.covered_when.entry_file_in.some((x) => files.has(x));
    const cov = hit ? r.coverage_then : r.coverage_default;
    if (!OK.includes(cov)) { console.error(`rule ${r.template}: coverage "${cov}" is not allowed`); process.exit(1); }
    const tests = ['full', 'partial'].includes(cov) ? (r.tests || []) : [];
    if (['full', 'partial'].includes(cov) && !tests.length) { console.error(`rule ${r.template}: "${cov}" needs tests`); process.exit(1); }
    out.push(JSON.stringify({ kind: 'journey', id: j.id, patch: true, tests, coverage: cov }));
    counts[cov] = (counts[cov] || 0) + 1;
  }
}
fs.mkdirSync(`${M}/_work/out`, { recursive: true });
fs.writeFileSync(`${M}/_work/out/A8-tier2.jsonl`, out.join('\n') + '\n');
console.log(`_work/out/A8-tier2.jsonl: ${out.length} Tier 2 journeys ${JSON.stringify(counts)}`);
if (noRule.size) console.log(`NO RULE (journeys stay unknown): ${[...noRule].map(([t, n]) => `${t} ${n}`).join(', ')}`);
