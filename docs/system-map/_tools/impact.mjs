#!/usr/bin/env node
// Step A6: the impact map. Plain Node, no dependencies, one process, seconds, exits. Audit tooling only.
//   node docs/system-map/_tools/impact.mjs            writes docs/system-map/impact.json, prints the top 20 lists
//   node docs/system-map/_tools/impact.mjs --check    writes nothing; exit 1 if impact.json would change
// Reads journeys/<feature id>.json and features.json. Never typed by hand.
//
// Rule (plan A6): the secondary journeys of journey J = every journey whose "reads" holds an entity in J's
// "writes", plus every journey of a feature that shares a code file (feature "entry", path without line) with
// J's feature. J itself is never its own secondary.
//
// Size: listing every secondary per journey would be ~44 million pairs. impact.json is LOSSLESS but indexed:
//   readers_of[entity]          = every journey id that reads that entity (all tiers)
//   features_by_file[file]      = every feature whose entry list names that file (only files shared by 2+)
//   shared_code[feature id]     = the files of that feature's entry list that another feature also names
//   journeys[id] = [feature, tier (1 | 2), secondary_count, secondary_tier1_count, secondary_feature_count]
// To expand J: union of readers_of[e] for e in J's "writes" (in journeys/<feature>.json), plus every journey of
// features_by_file[f] for f in shared_code[J's feature]; minus J.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const J = [];
for (const f of fs.readdirSync(path.join(MAP, 'journeys')).sort()) {
  if (!f.endsWith('.json')) continue;
  const arr = JSON.parse(fs.readFileSync(path.join(MAP, 'journeys', f), 'utf8'));
  for (const j of Array.isArray(arr) ? arr : arr.journeys || []) if (j && j.kind === 'journey') J.push(j);
}
const F = JSON.parse(fs.readFileSync(path.join(MAP, 'features.json'), 'utf8'));
const featureFiles = new Map();
for (const f of F) {
  if (f.status === 'not-a-feature') continue;
  const files = [...new Set((f.entry || []).map((e) => String(e).replace(/:\d+(-\d+)?$/, '')).filter((e) => e && e !== 'unknown'))];
  featureFiles.set(f.id, files);
}
const byFile = new Map();
for (const [fid, files] of featureFiles) for (const file of files) { if (!byFile.has(file)) byFile.set(file, new Set()); byFile.get(file).add(fid); }
const sharedFiles = new Map([...byFile].filter(([, s]) => s.size > 1).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

const journeysOfFeature = new Map();
const tier1 = new Set();
for (const j of J) {
  if (!journeysOfFeature.has(j.feature)) journeysOfFeature.set(j.feature, []);
  journeysOfFeature.get(j.feature).push(j.id);
  if (!j.generated) tier1.add(j.id);
}
const readersOf = new Map();
for (const j of J) for (const e of new Set(j.reads || [])) { if (!readersOf.has(e)) readersOf.set(e, []); readersOf.get(e).push(j.id); }
const writersOf = new Map();
for (const j of J) for (const e of new Set(j.writes || [])) { if (!writersOf.has(e)) writersOf.set(e, []); writersOf.get(e).push(j.id); }
const featOf = new Map(J.map((j) => [j.id, j.feature]));

const out = {};
const counts = [];
for (const j of J) {
  const sec = new Set();
  for (const e of new Set(j.writes || [])) for (const r of readersOf.get(e) || []) sec.add(r);
  const shared = (featureFiles.get(j.feature) || []).filter((file) => sharedFiles.has(file));
  for (const file of shared) for (const fid of sharedFiles.get(file)) if (fid !== j.feature) for (const id of journeysOfFeature.get(fid) || []) sec.add(id);
  sec.delete(j.id);
  let t1 = 0;
  const feats = new Set();
  for (const id of sec) { if (tier1.has(id)) t1++; feats.add(featOf.get(id)); }
  out[j.id] = [j.feature, j.generated ? 2 : 1, sec.size, t1, feats.size];
  counts.push([j.id, sec.size, t1, j.generated ? 2 : 1]);
}
const sortObj = (m) => Object.fromEntries([...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, [...v].sort()]));
const result = {
  _note: 'Made by _tools/impact.mjs (step A6). Never edit by hand. journeys[id] = [feature, tier, secondary_count, secondary_tier1_count, secondary_feature_count]. Expand a journey: union of readers_of[e] for e in its writes (journeys/<feature>.json), plus every journey of features_by_file[f] for f in shared_code[its feature]; minus itself.',
  counts: { journeys: J.length, tier1: tier1.size, entities_read: readersOf.size, entities_written: writersOf.size, shared_files: sharedFiles.size },
  readers_of: sortObj(readersOf),
  features_by_file: sortObj(sharedFiles),
  shared_code: Object.fromEntries([...featureFiles].filter(([, files]) => files.some((f) => sharedFiles.has(f))).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([fid, files]) => [fid, files.filter((f) => sharedFiles.has(f))])),
  journeys: Object.fromEntries(Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
};
const text = JSON.stringify(result) + '\n';
const file = path.join(MAP, 'impact.json');
if (check) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (old !== text) { console.log('impact.json would change'); process.exit(1); }
  console.log('impact.json is up to date'); process.exit(0);
}
fs.writeFileSync(file, text);
console.log(`impact.json: ${J.length} journeys (${tier1.size} Tier 1), ${readersOf.size} entities read, ${sharedFiles.size} code files shared by 2+ features, ${(text.length / 1e6).toFixed(1)} MB`);
console.log('TOP 20 MOST CONNECTED ENTITIES (entity | writer journeys | reader journeys | product)');
[...new Set([...readersOf.keys(), ...writersOf.keys()])]
  .map((e) => [e, (writersOf.get(e) || []).length, (readersOf.get(e) || []).length])
  .sort((a, b) => b[1] * b[2] - a[1] * a[2]).slice(0, 20)
  .forEach(([e, w, r]) => console.log(`${e} | ${w} | ${r} | ${w * r}`));
console.log('TOP 20 MOST CONNECTED TIER 1 JOURNEYS (journey | secondary journeys | of them Tier 1)');
counts.filter((c) => c[3] === 1).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 20)
  .forEach(([id, n, t1]) => console.log(`${id} | ${n} | ${t1}`));
