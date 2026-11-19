import fs from 'fs';
export const rows = [];
const cnt = {};
export const J = (f, role, type, start, steps, writes = [], reads = [], pr = []) => {
  cnt[f] = (cnt[f] || 0) + 1;
  rows.push({ kind: 'journey', id: `J-${f}-${String(cnt[f]).padStart(2, '0')}`, feature: f, role, type, generated: false, start, steps: steps.map((s, i) => ({ n: i + 1, action: s[0], user_sees: s[1], must_not: s[2] })), writes, reads, promise_ids: pr, tests: [], coverage: 'unknown', last_result: null });
};
const slug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const Y = (f, role, type, variants, at, entity, note) => rows.push({ kind: 'jtype', id: `JT-${f}-${slug(role)}-${type}`, feature: f, role, type, applies: 'yes', why_not: 'none', variants, at_step: at, entity, note });
export const N = (f, role, type, why) => rows.push({ kind: 'jtype', id: `JT-${f}-${slug(role)}-${type}`, feature: f, role, type, applies: 'no', why_not: why, variants: [], at_step: 0, entity: 'none', note: 'none' });
export const F = (o) => rows.push(o);
export const flush = () => {
  for (const r of rows) for (const s of r.steps || []) if (!s.user_sees.length || !s.must_not.length) throw new Error('empty step ' + r.id);
  fs.appendFileSync(new URL('../out/A5-panel-logic-1-2.jsonl', import.meta.url), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const by = {};
  for (const r of rows) { const k = r.feature || 'finding'; by[k] = by[k] || [0, 0]; by[k][r.kind === 'journey' ? 0 : 1]++; }
  console.log(JSON.stringify(by));
};
