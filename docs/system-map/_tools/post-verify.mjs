// post-verify: node _tools/post-verify.mjs [--write]   (run in docs/system-map after every H2 batch is merged)
// Plan 3H steps after H2:
//  1. severity: each verify row's severity_should is applied to the group's members that carried the group's
//     worst severity (the one the verifier judged). Old value kept as severity_before. "none"/empty = left as is.
//  2. false groups: their findings move from findings.jsonl to findings-rejected.jsonl with the verifier's why.
//  3. H3: per source work item (finding.wi), the share of sampled S3 groups that came back false; over 1 in 4
//     (with at least 2 sampled) = that item's findings need a full verify. Printed, and saved to
//     _work/h3-items.json.
//  4. the count line for the report, saved to _work/count-line.txt.
// Without --write it only prints what it would do. Plain Node, seconds.
import fs from 'node:fs';
const write = process.argv.includes('--write');
const readL = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
const raw = fs.readFileSync('findings.jsonl', 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const findings = readL('findings.jsonl');
const byId = new Map(findings.map((f) => [f.id, f]));
const groups = readL('finding-groups.jsonl');
const gById = new Map(groups.map((g) => [g.group, g]));
const rows = readL('verify-results.jsonl');
const vByG = new Map(); for (const r of rows) vByG.set(r.group, r); // last row wins
const queue = JSON.parse(fs.readFileSync('_work/verify-queue.json', 'utf8'));
const sevOk = new Set(['S1', 'S2', 'S3', 'S4']);
const missing = queue.groups.filter((g) => !vByG.has(g));
if (missing.length) { console.log('NOT ALL VERIFIED, missing', missing.length, missing.slice(0, 10)); process.exit(1); }

// 1. severity
let sevChanged = 0;
for (const [gid, r] of vByG) {
  const g = gById.get(gid); if (!g) continue;
  const to = String(r.severity_should || '').toUpperCase();
  if (r.verified === 'false' || !sevOk.has(to) || to === g.worst) continue;
  for (const m of g.members) { const f = byId.get(m); if (f && f.severity === g.worst) { f.severity_before = f.severity; f.severity = to; sevChanged++; } }
}
// 2. false groups out
const falseG = [...vByG.values()].filter((r) => r.verified === 'false');
const rejIds = new Set(); const rejected = [];
for (const r of falseG) for (const m of gById.get(r.group)?.members || []) { const f = byId.get(m); if (f && !rejIds.has(m)) { rejIds.add(m); rejected.push({ ...f, status: 'rejected', rejected_why: r.why, rejected_by: r.item, group: r.group }); } }
const kept = findings.filter((f) => !rejIds.has(f.id));
// 3. H3 per source item, over sampled S3 groups
const s3Sampled = queue.groups.filter((g) => gById.get(g)?.worst === 'S3');
const per = {};
for (const gid of s3Sampled) {
  const g = gById.get(gid); const r = vByG.get(gid);
  const wis = new Set(g.members.map((m) => byId.get(m)?.wi).filter(Boolean));
  for (const wi of wis) { per[wi] ??= { sampled: 0, false: 0 }; per[wi].sampled++; if (r.verified === 'false') per[wi].false++; }
}
const h3 = Object.entries(per).filter(([, v]) => v.sampled >= 2 && v.false / v.sampled > 0.25).map(([wi, v]) => ({ wi, ...v, findings: kept.filter((f) => f.wi === wi).length }));
// 4. count line (groups = problems; a group is one problem)
const liveG = groups.filter((g) => !(vByG.get(g.group)?.verified === 'false'));
const conf = liveG.filter((g) => vByG.get(g.group)?.verified === 'true').length;
const uns = liveG.filter((g) => vByG.get(g.group)?.verified === 'unsure').length;
const notChecked = liveG.length - conf - uns;
const worstNow = (g) => { const order = ['S1', 'S2', 'S3', 'S4']; let w = 'S4'; for (const m of g.members) { const s = byId.get(m)?.severity; if (sevOk.has(s) && order.indexOf(s) < order.indexOf(w)) w = s; } return w; };
const bySev = {}; for (const g of liveG) { const s = worstNow(g); bySev[s] = (bySev[s] || 0) + 1; }
const line = `${liveG.length} problems found, ${conf} confirmed, ${uns} could not be confirmed (${notChecked} small ones were not re-checked one by one; ${falseG.length} more were checked and turned out wrong, so they are left out).`;
console.log({ verifyRows: vByG.size, sevChanged, falseGroups: falseG.length, rejectedFindings: rejected.length, keptFindings: kept.length, bySev });
console.log('H3 items needing a full verify:', h3.length ? h3 : 'none');
console.log(line);
if (write) {
  fs.writeFileSync('findings.jsonl', kept.map((f) => JSON.stringify(f)).join(eol) + eol);
  fs.appendFileSync('findings-rejected.jsonl', rejected.map((f) => JSON.stringify(f)).join('\n') + '\n');
  fs.writeFileSync('_work/h3-items.json', JSON.stringify(h3, null, 2) + '\n');
  fs.writeFileSync('_work/count-line.txt', line + '\n' + JSON.stringify(bySev) + '\n');
  console.log('written');
}
