#!/usr/bin/env node
// Step A5, Tier 2: turns every "applies": "yes" type line (kind jtype) into journey rows marked
// "generated": true. Plain Node, no packages, seconds, exits. Writes ONE file and nothing else.
//
//   node docs/system-map/_tools/expand.mjs <A5 work item id> [--from <out file>] [--map <dir>]
//
// Reads  _work/items/<id>.txt (one feature per line: "<feature id> | ..."), journey-types/<feature id>.json,
//        journeys/<feature id>.json, features.json, entities.json, journey-templates.json.
// Writes _work/out/<id>-gen.jsonl. Then the coordinator runs:  node _tools/merge.mjs <id>-gen --blind <file>
// Run it AFTER the helper's own rows are merged. --from <file> also reads rows from a helper's out file
// (for a look before the merge; rows of that file win over the map).
// Idempotent: ids are fixed (J-<feature id>-g-<role>-<template id>), the out file is written whole, and
// merge.mjs replaces the rows of <id>-gen, so a re-run never doubles.
// How a journey is built: template "place": "before" = one set-up step, then every step of the happy journey;
// "place": "at" = the happy steps up to at_step, then the template's step. writes, reads and promise_ids
// come from the happy journey.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
function opt(name) { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; }
const here = path.dirname(fileURLToPath(import.meta.url));
const from = opt('--from');
const MAP = path.resolve(opt('--map') || path.join(here, '..'));
const WI = argv[0];
function die(m) { console.error('expand.mjs: ' + m); process.exit(2); }
if (!WI || !/^[A-Za-z0-9._-]+$/.test(WI)) die('use: node expand.mjs <A5 work item id> [--from <out file>]');
const itemsFile = path.join(MAP, '_work', 'items', WI + '.txt');
if (!fs.existsSync(itemsFile)) die('no items file: ' + itemsFile);
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { die(`cannot read ${f}: ${e.message}`); } };
const features = new Map(json(path.join(MAP, 'features.json')).map((f) => [f.id, f]));
const entities = new Map(json(path.join(MAP, 'entities.json')).map((e) => [e.id, e]));
const templates = new Map(json(path.join(MAP, 'journey-templates.json')).map((t) => [t.id, t]));
const safe = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');
const perFeature = (dir, fid) => { const f = path.join(MAP, dir, safe(fid) + '.json'); return fs.existsSync(f) ? json(f) : []; };
const roleSlug = (r) => String(r).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const extra = { journey: new Map(), jtype: new Map() };
if (from) {
  if (!fs.existsSync(from)) die('--from file not found: ' + from);
  for (const l of fs.readFileSync(from, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o && extra[o.kind] && !o.patch) extra[o.kind].set(o.id, o);
  }
}
const rowsOf = (kind, dir, fid) => {
  const m = new Map(perFeature(dir, fid).map((r) => [r.id, r]));
  for (const r of extra[kind].values()) if (r.feature === fid) m.set(r.id, r);
  return [...m.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

const ids = fs.readFileSync(itemsFile, 'utf8').split(/\r?\n/).map((l) => l.split('|')[0].trim()).filter(Boolean);
const problems = [];
const notes = [];
const out = [];
let yes = 0;
for (const fid of ids) {
  const feat = features.get(fid);
  if (!feat) { problems.push(`${fid}: not in features.json`); continue; }
  if (feat.status === 'not-a-feature') continue;
  const journeys = rowsOf('journey', 'journeys', fid).filter((j) => j.generated === false);
  const lines = rowsOf('jtype', 'journey-types', fid).filter((t) => t.applies === 'yes');
  const fname = feat.name.split(/[:(]/)[0].trim().slice(0, 80);
  for (const t of lines) {
    yes++;
    const happy = journeys.find((j) => j.role === t.role && j.type === 1);
    if (!happy) { problems.push(`${t.id}: no full happy journey (type 1) for ${fid} x ${t.role}`); continue; }
    const ent = entities.get(t.entity);
    const ename = ent ? ent.name.split(' (')[0].trim() : 'saved data';
    let at = t.at_step;
    if (!(at >= 1) || at > happy.steps.length) { notes.push(`${t.id}: at_step ${t.at_step} is outside ${happy.id} (${happy.steps.length} steps); the last step is used`); at = happy.steps.length; }
    for (const v of t.variants || []) {
      const tpl = templates.get(v);
      if (!tpl) { problems.push(`${t.id}: unknown template ${v}`); continue; }
      const fill = (s) => String(s).split('{n}').join(String(at)).split('{entity}').join(ename).split('{feature}').join(`"${fname}"`);
      const extraStep = { action: fill(tpl.text), user_sees: [fill(tpl.sees || 'unknown')], must_not: [fill(tpl.must_not)] };
      const copy = (s) => ({ action: s.action, user_sees: [...s.user_sees], must_not: [...s.must_not] });
      let steps;
      if (tpl.place === 'at') steps = [...happy.steps.slice(0, at).map(copy), extraStep];
      else {
        steps = [extraStep, ...happy.steps.map(copy)];
        const last = steps[steps.length - 1];
        if (steps.length > 1) last.must_not = [...last.must_not, fill(tpl.must_not)];
      }
      steps = steps.map((s, i) => ({ n: i + 1, ...s }));
      out.push({
        kind: 'journey', id: `J-${fid}-g-${roleSlug(t.role)}-${v.toLowerCase()}`, feature: fid, role: t.role, type: tpl.type, generated: true,
        start: tpl.place === 'at' ? happy.start : `${happy.start}; set-up: ${tpl.variant}`, steps,
        writes: [...happy.writes], reads: [...happy.reads], promise_ids: [...happy.promise_ids], tests: [], coverage: 'unknown', last_result: null,
        template: v, based_on: happy.id, type_line: t.id, note: t.note || 'none',
      });
    }
  }
}
for (const n of notes) console.log('NOTE ' + n);
if (problems.length) {
  for (const p of problems) console.log('PROBLEM ' + p);
  console.log(`expand: ${problems.length} problem(s); nothing written. Fix the type lines or the happy journeys and run again.`);
  process.exit(1);
}
const seen = new Set();
const uniq = out.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
const outFile = path.join(MAP, '_work', 'out', WI + '-gen.jsonl');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, uniq.map((r) => JSON.stringify(r)).join('\n') + (uniq.length ? '\n' : ''));
console.log(`expand: ${ids.length} features, ${yes} "yes" type lines, ${uniq.length} generated journeys -> ${path.relative(process.cwd(), outFile).replace(/\\/g, '/')}`);
console.log(`next: node docs/system-map/_tools/merge.mjs ${WI}-gen --blind <blind pattern file>`);
