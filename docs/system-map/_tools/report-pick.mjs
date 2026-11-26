// report-pick: node _tools/report-pick.mjs   (run in docs/system-map after post-verify --write)
// Plan 4B. Picks which problems (groups) get a full card: every Serious one (S1, S2) and the 40 Medium (S3) with
// the widest reach, Medium taken only from groups a second helper confirmed. Writes:
//   _work/report/cards.json        ordered card list (group, sev word, reach, member ids)
//   _work/report/cards-NN.txt      20 groups per writing batch
//   _work/report/lines.md          one plain line for every other problem, grouped by app part
//   _work/report/ideas.md          the improvement ideas page, grouped by app part
// Plain Node, seconds.
import fs from 'node:fs';
const readL = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const F = new Map(readL('findings.jsonl').map((f) => [f.id, f]));
const V = new Map(readL('verify-results.jsonl').map((r) => [r.group, r]));
const G = readL('finding-groups.jsonl').filter((g) => V.get(g.group)?.verified !== 'false');
const order = ['S1', 'S2', 'S3', 'S4'];
const word = { S1: 'Serious', S2: 'Serious', S3: 'Medium', S4: 'Small' };
const part = { phone: 'Member app (phone)', watch: 'Watch app', panel: 'Owner and desk panel', hq: 'MettleUp HQ (our own admin)', web: 'Websites and web pages', server: 'Server, data and messages' };
const whoS = (w) => /member/i.test(w) ? 3 : /owner|desk|staff|trainer/i.test(w) ? 2 : 0;
const oftenS = (o) => /every (time|day|workout)|always/i.test(o) ? 3 : /sometimes|often/i.test(o) ? 1.5 : /release/i.test(o) ? 1 : 0;
const rows = G.map((g) => {
  const ms = g.members.map((m) => F.get(m)).filter(Boolean);
  if (!ms.length) return null;
  const sev = ms.map((m) => m.severity).filter((s) => order.includes(s)).sort()[0] || 'S4';
  const top = ms.find((m) => m.severity === sev) || ms[0];
  const reach = ms.length * 3 + (g.lenses?.length || 1) + whoS(top.who) + oftenS(top.how_often);
  return { group: g.group, sev, word: word[sev], reach, verified: V.get(g.group)?.verified || 'not re-checked', surface: g.surface || top.surface, area: top.area, title: top.title, fix_size: top.fix_size, top: top.id, members: g.members };
}).filter(Boolean);
const bySevReach = (a, b) => order.indexOf(a.sev) - order.indexOf(b.sev) || b.reach - a.reach;
const serious = rows.filter((r) => r.sev === 'S1' || r.sev === 'S2').sort(bySevReach);
const medium = rows.filter((r) => r.sev === 'S3' && (r.verified === 'true' || r.verified === 'unsure')).sort(bySevReach).slice(0, 40);
const cards = [...serious, ...medium];
const cardSet = new Set(cards.map((c) => c.group));
fs.mkdirSync('_work/report', { recursive: true });
fs.writeFileSync('_work/report/cards.json', JSON.stringify(cards, null, 1) + '\n');
for (let i = 0; i * 20 < cards.length; i++) fs.writeFileSync(`_work/report/cards-${String(i + 1).padStart(2, '0')}.txt`, cards.slice(i * 20, i * 20 + 20).map((c) => c.group).join('\n') + '\n');
// one plain line for every other problem
const rest = rows.filter((r) => !cardSet.has(r.group)).sort(bySevReach);
let md = '';
for (const [k, name] of Object.entries(part)) {
  const rs = rest.filter((r) => r.surface === k); if (!rs.length) continue;
  md += `\n### ${name} (${rs.length})\n\n`;
  for (const r of rs) md += `- ${r.title.replace(/\s+/g, ' ').trim()} (${r.word}, ${r.fix_size === 'unknown' ? 'fix size not known' : r.fix_size + ' fix'}, ${r.top})\n`;
}
const other = rest.filter((r) => !part[r.surface]);
if (other.length) { md += `\n### Other (${other.length})\n\n`; for (const r of other) md += `- ${r.title} (${r.word}, ${r.fix_size} fix, ${r.top})\n`; }
fs.writeFileSync('_work/report/lines.md', md);
// improvement ideas page
const I = readL('improvements.jsonl');
const impW = { high: 'big gain', med: 'medium gain', low: 'small gain' };
let im = '';
for (const [k, name] of Object.entries(part)) {
  const rs = I.filter((r) => r.surface === k).sort((a, b) => ['high', 'med', 'low'].indexOf(a.impact) - ['high', 'med', 'low'].indexOf(b.impact)); if (!rs.length) continue;
  im += `\n### ${name} (${rs.length})\n\n`;
  for (const r of rs) im += `- ${String(r.what).replace(/\s+/g, ' ').trim()} (${impW[r.impact] || r.impact}, ${r.effort || 'size not known'} job, ${r.id})\n`;
}
fs.writeFileSync('_work/report/ideas.md', im);
console.log({ problems: rows.length, serious: serious.length, s1: serious.filter((r) => r.sev === 'S1').length, mediumCards: medium.length, cards: cards.length, batches: Math.ceil(cards.length / 20), lines: rest.length, ideas: I.length });
