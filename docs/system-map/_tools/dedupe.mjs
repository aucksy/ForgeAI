// H1 dedupe: group findings.jsonl into finding-groups.jsonl (plan 3H, H1).
// Plain Node, no packages. Run from anywhere: node docs/system-map/_tools/dedupe.mjs [--spot]
// Rule (a): equal root_cause_key (generic keys ignored). Rule (b): an evidence pointer of one finding names the same
// file as one of the other's, within 30 lines. Union-find; a join by rule (b) alone is refused when the merged group
// would pass CAP members. Every finding lands in exactly one group.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.resolve(HERE, '..');
const IN = path.join(MAP, 'findings.jsonl');
const OUT = path.join(MAP, 'finding-groups.jsonl');
const QUEUE = path.join(MAP, '_work', 'verify-queue.json');
const NEAR = 30;
const CAP = 25;
const GENERIC_MIN = 16; // a key shared by more than 15 findings across different surfaces is generic
// Decided by hand after reading the top-20 list: catch-all keys that name a kind of gap, not one fault.
const GENERIC_BY_HAND = new Set(['backlog-item-not-built-yet', 'unknown', 'none', 'n/a', 'todo', 'misc', 'other']);
const SEV = { S1: 1, S2: 2, S3: 3, S4: 4 };

const rows = fs.readFileSync(IN, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const n = rows.length;

// ---- keys
const keyCount = new Map();
rows.forEach((r) => {
  const k = String(r.root_cause_key || '').trim().toLowerCase();
  if (!k) return;
  const e = keyCount.get(k) || { n: 0, surfaces: new Set() };
  e.n++; e.surfaces.add(r.surface); keyCount.set(k, e);
});
const top = [...keyCount.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
const generic = new Set(GENERIC_BY_HAND);
for (const [k, v] of keyCount) if (v.n >= GENERIC_MIN && v.surfaces.size > 1) generic.add(k);

// ---- union-find
const parent = rows.map((_, i) => i);
const size = rows.map(() => 1);
const reasons = rows.map(() => new Set());
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const joinedBy = { a: 0, b: 0, bRefusedByCap: 0 };
function union(x, y, rule) {
  let rx = find(x), ry = find(y);
  if (rx === ry) return false;
  if (rule === 'b' && size[rx] + size[ry] > CAP) { joinedBy.bRefusedByCap++; return false; }
  if (size[rx] < size[ry]) [rx, ry] = [ry, rx];
  parent[ry] = rx; size[rx] += size[ry];
  for (const s of reasons[ry]) reasons[rx].add(s);
  reasons[rx].add(rule);
  joinedBy[rule]++;
  return true;
}

// rule (a)
const byKey = new Map();
rows.forEach((r, i) => {
  const k = String(r.root_cause_key || '').trim().toLowerCase();
  if (!k || generic.has(k)) return;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(i);
});
for (const ids of byKey.values()) for (let j = 1; j < ids.length; j++) union(ids[0], ids[j], 'a');

// rule (b): parse "path:12" / "path:12-40"; pointers with no line number cannot be measured and are skipped.
function parseEv(e) {
  if (typeof e !== 'string') return null;
  const m = e.trim().match(/^(.+?):(\d+)(?:\s*[-–]\s*(\d+))?(?:\b.*)?$/);
  if (!m) return null;
  const file = m[1].replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  if (!/\.[a-z0-9]+$/.test(file) || file.includes(' ')) return null;
  const a = +m[2], b = m[3] ? +m[3] : a;
  return { file, start: Math.min(a, b), end: Math.max(a, b) };
}
const byFile = new Map();
rows.forEach((r, i) => {
  const ev = Array.isArray(r.evidence) ? r.evidence : [r.evidence];
  for (const e of ev) {
    const p = parseEv(e);
    if (!p) continue;
    // audit source notes (backlog lists, inbox copies) are not code: many unrelated items sit on neighbouring lines
    if (p.file.startsWith("docs/system-map/")) continue;
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push({ i, start: p.start, end: p.end });
  }
});
// Collect candidate pairs, nearest first, so the cap keeps the tightest matches.
const pairs = [];
for (const [file, list] of [...byFile.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
  list.sort((x, y) => x.start - y.start || x.i - y.i);
  for (let p = 0; p < list.length; p++) {
    for (let q = p + 1; q < list.length; q++) {
      const A = list[p], B = list[q];
      if (A.i === B.i) continue;
      const gap = Math.max(0, B.start - A.end, A.start - B.end);
      if (gap <= NEAR) pairs.push({ x: A.i, y: B.i, gap, file });
    }
  }
}
// Tightened after the first spot-check (8 of 10 groups mixed different faults): rule (b) is COMPLETE-LINK, not a
// chain. Two groups join on rule (b) only when EVERY cross pair of members points within 30 lines of each other in
// some file AND their titles share real words (mean word overlap >= TITLE_MIN). Shared code alone is not a shared fault.
const TITLE_MIN = Number(process.env.TITLE_MIN || 0.35);
const STOP = new Set('the and for with that this from when what never only does have into their than then they them there will would been being after before about also some your more most over every other which while where shows says said just same each gets cannot still without member members owner owners screen phone panel tested test tests check checks checked'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const words = rows.map((r) => new Set(String(r.title || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/s+/).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem)));
const sim = (x, y) => { const A = words[x], B = words[y]; if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / (A.size + B.size - k); };
const near = new Set(pairs.map((p) => p.x < p.y ? p.x + '|' + p.y : p.y + '|' + p.x));
const isNear = (x, y) => near.has(x < y ? x + '|' + y : y + '|' + x);
const membersOf = new Map(rows.map((_, i) => [i, [i]]));
const memb = (r) => membersOf.get(r);
const ua = union; // keep membership lists in step with union-find
function unionTracked(x, y, rule) {
  const rx = find(x), ry = find(y); if (rx === ry) return false;
  const mx = memb(rx), my = memb(ry);
  if (!ua(x, y, rule)) return false;
  const r = find(x); membersOf.set(r, mx.concat(my)); if (r !== rx) membersOf.delete(rx); if (r !== ry) membersOf.delete(ry);
  return true;
}
// re-wire rule (a) memberships (rule (a) already ran on plain union): rebuild lists from union-find
membersOf.clear(); rows.forEach((_, i) => { const r = find(i); if (!membersOf.has(r)) membersOf.set(r, []); membersOf.get(r).push(i); });
let bRefusedLink = 0;
pairs.sort((u, v) => u.gap - v.gap || u.file.localeCompare(v.file) || u.x - v.x || u.y - v.y);
for (const pr of pairs) {
  const rx = find(pr.x), ry = find(pr.y); if (rx === ry) continue;
  const X = memb(rx), Y = memb(ry);
  if (X.length + Y.length > CAP) { joinedBy.bRefusedByCap++; continue; }
  let ok = true, tot = 0, cnt = 0;
  for (const a of X) { for (const b of Y) { if (!isNear(a, b)) { ok = false; break; } tot += sim(a, b); cnt++; } if (!ok) break; }
  if (!ok || tot / cnt < TITLE_MIN) { bRefusedLink++; continue; }
  unionTracked(pr.x, pr.y, 'b');
}
joinedBy.bRefusedLink = bRefusedLink;

// ---- build groups
const groups = new Map();
rows.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
const sevOf = (r) => SEV[r.severity] || 9;
const uniq = (a) => [...new Set(a.filter((v) => v !== undefined && v !== null && v !== ''))];
let out = [...groups.entries()].map(([root, ids]) => {
  ids.sort((x, y) => sevOf(rows[x]) - sevOf(rows[y]) || String(rows[x].id).localeCompare(String(rows[y].id)));
  const w = rows[ids[0]];
  const rs = reasons[root];
  const reason = ids.length === 1 ? 'single' :
    [rs.has('a') ? 'same root_cause_key' : null, rs.has('b') ? 'same file within 30 lines' : null].filter(Boolean).join(' + ');
  return {
    group: '', members: ids.map((i) => rows[i].id), lenses: uniq(ids.map((i) => String(rows[i].lens))),
    worst: w.severity, surface: uniq(ids.map((i) => rows[i].surface)).join('+'),
    areas: uniq(ids.map((i) => rows[i].area)), title: w.title, root_cause_key: w.root_cause_key, reason,
  };
});
out.sort((x, y) => (SEV[x.worst] || 9) - (SEV[y.worst] || 9) || y.members.length - x.members.length || String(x.members[0]).localeCompare(String(y.members[0])));
out.forEach((g, k) => { g.group = 'G-' + String(k + 1).padStart(4, '0'); });

const total = out.reduce((s, g) => s + g.members.length, 0);
if (total !== n || new Set(out.flatMap((g) => g.members)).size !== n) throw new Error('membership mismatch');
fs.writeFileSync(OUT, out.map((g) => JSON.stringify(g)).join('\n') + '\n');

// ---- verify queue: every S1/S2 group + every 5th S3 group in file order
const s12 = out.filter((g) => g.worst === 'S1' || g.worst === 'S2').map((g) => g.group);
const s3all = out.filter((g) => g.worst === 'S3');
const s3 = s3all.filter((_, k) => k % 5 === 4).map((g) => g.group);
fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
fs.writeFileSync(QUEUE, JSON.stringify({ rule: 'every group with worst S1 or S2, plus every 5th S3 group in finding-groups.jsonl order', s1_s2: s12.length, s3_sample: s3.length, s3_groups_total: s3all.length, groups: [...s12, ...s3] }, null, 2) + '\n');

// ---- report
const t = (s, k = 90) => String(s || '').replace(/\s+/g, ' ').slice(0, k);
console.log('findings', n, 'distinct keys', keyCount.size);
console.log('top 20 keys:'); top.forEach(([k, v]) => console.log(`  ${v.n} [${[...v.surfaces].join('/')}] ${k}${generic.has(k) ? '  (generic)' : ''}`));
console.log('generic keys ignored:', [...generic].filter((k) => keyCount.has(k)).join(', ') || 'none');
console.log('groups', out.length, 'multi-member', out.filter((g) => g.members.length > 1).length, 'findings in multi-member groups', out.filter((g) => g.members.length > 1).reduce((s, g) => s + g.members.length, 0));
const per = {}; out.forEach((g) => { per[g.worst] = (per[g.worst] || 0) + 1; }); console.log('groups per worst', JSON.stringify(per));
console.log('joins: rule a', joinedBy.a, 'rule b', joinedBy.b, 'rule-b refused by cap', joinedBy.bRefusedByCap, 'refused (not every pair near, or titles differ)', joinedBy.bRefusedLink, 'candidate b pairs', pairs.length);
console.log('10 biggest:'); [...out].sort((x, y) => y.members.length - x.members.length).slice(0, 10).forEach((g) => console.log(`  ${g.group} ${g.members.length} ${g.worst} ${t(g.title, 80)}`));
console.log('queue: S1/S2', s12.length, 'S3 sample', s3.length, 'of', s3all.length, 'total', s12.length + s3.length);
if (process.argv.includes('--spot')) {
  const multi = out.filter((g) => g.members.length > 1);
  const step = Math.max(1, Math.floor(multi.length / 10));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (let k = 0; k < 10 && k * step < multi.length; k++) {
    const g = multi[k * step];
    console.log(`\n${g.group} (${g.members.length}, ${g.reason})`);
    g.members.slice(0, 6).forEach((id) => { const r = byId.get(id); console.log(`   ${r.severity} ${t(r.title, 110)} | ${t((r.evidence || [])[0], 50)}`); });
  }
}
