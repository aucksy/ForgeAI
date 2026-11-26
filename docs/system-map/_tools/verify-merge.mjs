// verify-merge: node _tools/verify-merge.mjs <H2 item id>
// Reads _work/out/<id>.jsonl (kind "verify" rows), sets "verified" on every member finding of each group in
// findings.jsonl, and appends the rows to verify-results.jsonl. False groups stay in findings.jsonl (verified
// "false") until the final step moves them to findings-rejected.jsonl. Plain Node, runs in seconds.
import fs from 'node:fs';
const id = process.argv[2];
if (!id) { console.error('usage: verify-merge.mjs <id>'); process.exit(1); }
const read = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const rows = read(`_work/out/${id}.jsonl`).filter((r) => r.kind === 'verify');
const groups = new Map(read('finding-groups.jsonl').map((g) => [g.group, g]));
const raw = fs.readFileSync('findings.jsonl', 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const findings = raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(findings.map((f) => [f.id, f]));
const ok = new Set(['true', 'false', 'unsure']);
let set = 0, bad = 0; const tally = { true: 0, false: 0, unsure: 0 };
for (const r of rows) {
  const g = groups.get(r.group);
  if (!g || !ok.has(String(r.verified))) { bad++; console.log('REJECT', r.group, r.verified); continue; }
  tally[r.verified]++;
  for (const m of g.members) { const f = byId.get(m); if (f) { f.verified = String(r.verified); set++; } }
}
fs.writeFileSync('findings.jsonl', findings.map((f) => JSON.stringify(f)).join(eol) + eol);
fs.appendFileSync('verify-results.jsonl', rows.map((r) => JSON.stringify({ ...r, item: id })).join('\n') + '\n');
console.log(`${id}: ${rows.length} rows, ${bad} rejected, ${set} findings set; true ${tally.true}, false ${tally.false}, unsure ${tally.unsure}`);
if (bad) process.exit(1);
