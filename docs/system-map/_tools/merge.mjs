#!/usr/bin/env node
// Merge one helper's rows into the system map. Plain Node, no dependencies, seconds, exits.
// Audit tooling only: reads the repo, writes only under docs/system-map/.
//
//   node merge.mjs <work item id> --blind <file> [--allow-rejects] [--dry]
//                  [--cover <sources file>#<from>-<to>] [--repo <root>] [--map <dir>]
//
// Reads  <map>/_work/out/<work item id>.jsonl  (one JSON object per line, with a "kind").
// The six checks:
//   1. every line parses and has the required fields for its kind (shapes: _briefs/rows.md);
//   2. every id a row points to exists (feature, entity, journey, promise, finding, surface);
//   3. every evidence "file:line" exists in the repo and the line is inside the file;
//   4. upsert by id: a re-run of the same work item replaces its rows, never doubles them;
//   5. writes features.json, entities.json, readers.json, promises.json, journeys/<feature id>.json,
//      findings.jsonl, improvements.jsonl, LENS-GRID.json;
//   6. writes rejected lines to _work/rejects/<work item id>.txt. Any reject = the item is not done:
//      nothing is merged (unless --allow-rejects) and the exit code is 1.
// Blind check: --blind names a file OUTSIDE the helpers' reach. Any row that matches a pattern from it is
// rejected, its text is never printed, and the item is listed in _work/blind-touched.txt.
//   The blind file: lines "pattern: <regular expression>" are used as they are. If there is no such line,
//   every id-shaped token in the file (letters then digits, e.g. AB123, and ranges AB123-AB127) is used.
// A row with "patch": true changes fields of a row that already exists (written by any work item):
//   only "kind", "id" and the fields to change are needed.
// --cover: fails the item if a line of that _sources file range is named by no feature's "sources".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
function opt(name, hasValue = true) {
  const i = argv.indexOf(name);
  if (i < 0) return hasValue ? null : false;
  const v = hasValue ? argv[i + 1] : true;
  argv.splice(i, hasValue ? 2 : 1);
  return v;
}
const here = path.dirname(fileURLToPath(import.meta.url));
const blindFile = opt('--blind');
const allowRejects = opt('--allow-rejects', false);
const dry = opt('--dry', false);
const cover = opt('--cover');
const MAP = path.resolve(opt('--map') || path.join(here, '..'));
const REPO = path.resolve(opt('--repo') || path.join(MAP, '..', '..'));
const WI = argv[0];
function die(m) { console.error('merge.mjs: ' + m); process.exit(2); }
if (!WI || !/^[A-Za-z0-9._-]+$/.test(WI)) die('use: node merge.mjs <work item id> --blind <file> [--allow-rejects] [--dry] [--cover <file>#<from>-<to>]');
const OUT = path.join(MAP, '_work', 'out', WI + '.jsonl');
if (!fs.existsSync(OUT)) die('no out file: ' + OUT);

// ---------- blind patterns (never printed) ----------
let blind = [];
if (blindFile) {
  if (!fs.existsSync(blindFile)) die('--blind file not found');
  const text = fs.readFileSync(blindFile, 'utf8');
  const pats = text.split(/\r?\n/).map((l) => l.match(/^\s*pattern:\s*(.+?)\s*$/)).filter(Boolean).map((m) => m[1]);
  if (pats.length) blind = pats.map((p) => new RegExp(p, 'i'));
  else {
    const ids = new Set();
    for (const m of text.matchAll(/\b([A-Z]{1,3})-?(\d{2,5})(?:\s*(?:-|to|–)\s*\1?-?(\d{2,5}))?\b/g)) {
      const a = Number(m[2]); const b = m[3] ? Number(m[3]) : a;
      if (b >= a && b - a <= 200) for (let n = a; n <= b; n++) ids.add(m[1] + '-?0*' + n);
    }
    blind = [...ids].map((p) => new RegExp('(^|[^A-Za-z0-9])' + p + '(?![0-9])'));
  }
  if (!blind.length) die('--blind file gave no pattern');
} else {
  console.log('WARNING: no --blind file given: the blind check did NOT run on this merge.');
}

// ---------- stores ----------
const STORES = {
  feature: { file: 'features.json', fmt: 'json' },
  entity: { file: 'entities.json', fmt: 'json' },
  reader: { file: 'readers.json', fmt: 'json' },
  promise: { file: 'promises.json', fmt: 'json' },
  finding: { file: 'findings.jsonl', fmt: 'jsonl' },
  improvement: { file: 'improvements.jsonl', fmt: 'jsonl' },
  grid: { file: 'LENS-GRID.json', fmt: 'json' },
  journey: { dir: 'journeys' },
};
function readRows(file, fmt) {
  if (!fs.existsSync(file)) return [];
  const t = fs.readFileSync(file, 'utf8').trim();
  if (!t) return [];
  try {
    return fmt === 'jsonl' ? t.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(t);
  } catch (e) { die(`kept file does not parse: ${file}: ${e.message}`); }
}
const store = {};
for (const [kind, s] of Object.entries(STORES)) {
  store[kind] = new Map();
  if (s.dir) {
    const d = path.join(MAP, s.dir);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) for (const r of readRows(path.join(d, f), 'json')) store[kind].set(r.id, r);
  } else for (const r of readRows(path.join(MAP, s.file), s.fmt)) store[kind].set(r.id, r);
}
let surfaces = new Set();
try {
  for (const s of JSON.parse(fs.readFileSync(path.join(MAP, 'surfaces.json'), 'utf8')).surfaces) { surfaces.add(s.id); surfaces.add(s.id.replace(/^S-/, '')); }
} catch { die('surfaces.json is missing or does not parse'); }

// ---------- evidence ----------
const lineCache = new Map();
function lineCount(abs) {
  if (!lineCache.has(abs)) {
    let n = -1;
    try { if (fs.statSync(abs).isFile()) { const t = fs.readFileSync(abs, 'utf8'); n = t.length ? t.split('\n').length - (t.endsWith('\n') ? 1 : 0) : 0; } } catch { n = -1; }
    lineCache.set(abs, n);
  }
  return lineCache.get(abs);
}
function inside(root, rel) {
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split(/[\\/]/).includes('..')) return null;
  return path.join(root, rel);
}
// Allowed forms: "path:line", "path:line-line" (checked), "run:<CI run id>...", "pic:<path or run file>",
// "data:<count and what was counted>", "machine:<file>#<row>", "url:<address>", or the word "unknown".
function evid(v) {
  if (typeof v !== 'string' || !v.trim()) return 'evidence is empty (write "unknown")';
  if (v === 'unknown' || /^(run|data|url):\S/.test(v)) return null;
  let m = v.match(/^machine:([^#]+)(?:#.*)?$/);
  if (m) { const p = inside(path.join(MAP, '_sources', 'machine'), m[1]); return p && fs.existsSync(p) ? null : `machine file not found: ${m[1]}`; }
  m = v.match(/^pic:(.+)$/);
  if (m) { if (/^run:/.test(m[1])) return null; const p = inside(REPO, m[1]); return p && fs.existsSync(p) ? null : `picture not found in the repo: ${m[1]} (for a CI picture write pic:run:<run id>/<file>)`; }
  m = v.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (!m) return `evidence form not recognised: "${v.slice(0, 80)}" (use path:line, run:, pic:, data:, machine:, url: or unknown)`;
  const p = inside(REPO, m[1]);
  if (!p) return `evidence path must be inside the repo, relative: ${m[1]}`;
  const n = lineCount(p);
  if (n < 0) return `evidence file does not exist: ${m[1]}`;
  const a = Number(m[2]); const b = m[3] ? Number(m[3]) : a;
  if (a < 1 || b < a || b > n) return `evidence line ${m[2]}${m[3] ? '-' + m[3] : ''} is outside ${m[1]} (${n} lines)`;
  return null;
}
function srcLine(v) { // "panel.txt#212" = line 212 of _sources/panel.txt
  if (v === 'unknown') return null;
  // "file#<repo path>" = a whole source file of the area (A2 item lists, added 18 Nov 2026 after the pilot)
  const f = typeof v === 'string' && v.match(/^file#(.+)$/);
  if (f) { const p = inside(REPO, f[1]); return p && fs.existsSync(p) ? null : `file# source not found in the repo: ${f[1]}`; }
  const m = typeof v === 'string' && v.match(/^([A-Za-z0-9._-]+)#(\d+)$/);
  if (!m) return `source form not recognised: "${String(v).slice(0, 60)}" (use <file>#<line>, a line of an _sources file)`;
  const n = lineCount(path.join(MAP, '_sources', m[1]));
  if (n < 0) return `_sources file does not exist: ${m[1]}`;
  return Number(m[2]) >= 1 && Number(m[2]) <= n ? null : `source line ${m[2]} is outside _sources/${m[1]} (${n} lines)`;
}

// ---------- field checks (each returns an error text or null) ----------
const batchIds = { feature: new Set(), entity: new Set(), reader: new Set(), promise: new Set(), finding: new Set(), improvement: new Set(), grid: new Set(), journey: new Set() };
const has = (kind, id) => store[kind].has(id) || batchIds[kind].has(id);
const PREFIX = [['J-', 'journey'], ['FN-', 'finding'], ['F-', 'feature'], ['E-', 'entity'], ['P-', 'promise'], ['RD-', 'reader'], ['IM-', 'improvement']];
function refAny(id) {
  if (id === 'unknown') return null;
  if (typeof id !== 'string') return 'an id must be text';
  const hit = PREFIX.find(([p]) => id.startsWith(p));
  if (!hit) return `id not recognised: ${id}`;
  return has(hit[1], id) ? null : `${hit[1]} id does not exist: ${id}`;
}
const str = (v) => (typeof v === 'string' && v.trim() ? null : 'must be text, not empty (write "unknown")');
const bool = (v) => (typeof v === 'boolean' ? null : 'must be true or false');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'must be a date like 2026-11-20');
const en = (...vals) => (v) => (vals.includes(v) ? null : `must be one of: ${vals.join(' | ')}`);
const list = (each, min = 0) => (v) => {
  if (!Array.isArray(v)) return 'must be a list';
  if (v.length < min) return `needs at least ${min} entr${min === 1 ? 'y' : 'ies'}`;
  for (const x of v) { const e = each(x); if (e) return e; }
  return null;
};
const ref = (kind) => (v) => (v === 'unknown' ? null : (typeof v === 'string' && has(kind, v) ? null : `${kind} id does not exist: ${v}`));
const surface = (v) => (surfaces.has(v) ? null : `surface not in surfaces.json: ${v}`);
const idLike = (re, hint) => (v) => (typeof v === 'string' && re.test(v) ? null : `id must look like ${hint}`);
const mine = (prefix) => (v) => (typeof v === 'string' && v.startsWith(`${prefix}-${WI}-`) && v.length > prefix.length + WI.length + 2 ? null : `id must start with ${prefix}-${WI}- (the work item id), so two helpers never clash`);
const steps = list((s) => {
  if (!s || typeof s !== 'object') return 'each step must be an object';
  if (!Number.isInteger(s.n)) return 'step.n must be a whole number';
  return str(s.action) && 'step.action ' + str(s.action) || list(str, 1)(s.user_sees) && 'step.user_sees ' + list(str, 1)(s.user_sees) || list(str, 1)(s.must_not) && 'step.must_not ' + list(str, 1)(s.must_not);
}, 1);
const tests = list((t) => (t && typeof t === 'object' ? (str(t.path) && 'tests.path ' + str(t.path)) || (str(t.checks) && 'tests.checks ' + str(t.checks)) || (t.path !== 'unknown' && !(inside(REPO, t.path) && fs.existsSync(inside(REPO, t.path))) ? `test file does not exist: ${t.path}` : null) : 'each test must be {path, checks}'));
const gridItems = list((it) => {
  if (!it || typeof it !== 'object') return 'each grid item must be an object';
  const e = (str(it.item) && 'item ' + str(it.item)) || (en('checked', 'does-not-apply', 'could-not-check')(it.status) && 'item status ' + en('checked', 'does-not-apply', 'could-not-check')(it.status))
    || (list(evid)(it.evidence) && 'item evidence: ' + list(evid)(it.evidence)) || (list(ref('finding'))(it.finding_ids) && 'item finding_ids: ' + list(ref('finding'))(it.finding_ids));
  if (e) return e;
  if (it.status === 'checked' && it.evidence.length === 0) return `item ${it.item}: "checked" needs a line of evidence`;
  if (it.status !== 'checked' && str(it.reason)) return `item ${it.item}: "${it.status}" needs a "reason"`;
  return null;
}, 1);

const SPEC = {
  feature: {
    id: idLike(/^F-[a-z]+-[A-Za-z0-9-]+$/, 'F-<surface>-<nnn>'), surface, area: str, name: str, roles: list(str, 1), switch: str, tier: str,
    entry: list(evid, 1), status: en('live', 'behind switch', 'hidden', 'unknown', 'not-a-feature'), sources: list(srcLine),
  },
  entity: {
    id: idLike(/^E-[a-z0-9-]+$/, 'E-<name>'), name: str, stored: list(str, 1), fields: list(str, 1), visible_to: list(str, 1),
    personal: en('yes', 'no', 'unknown'), retention: str, evidence: list(evid, 1),
  },
  reader: {
    id: mine('RD'), entity: ref('entity'), reader_kind: en('screen', 'list', 'badge', 'count', 'digest', 'notification', 'export', 'job', 'ai-answer', 'not-a-reader'),
    where: evid, surface,
  },
  journey: {
    id: idLike(/^J-F-.+-\d+[a-z0-9-]*$/, 'J-<feature id>-<nn>'), feature: ref('feature'), role: str,
    type: (v) => (Number.isInteger(v) && v >= 1 && v <= 12 ? null : 'must be a journey type number 1-12'), generated: bool, start: str, steps,
    writes: list(ref('entity')), reads: list(ref('entity')), promise_ids: list(ref('promise')), tests,
    coverage: en('full', 'partial', 'none', 'manual-only', 'unknown'), last_result: (v) => (v === null || (v && typeof v === 'object') ? null : 'must be null or {date, result, evidence}'),
  },
  promise: {
    id: mine('P'), text: str, page: str, where: evid, kept_by: list((v) => (/^(J-|F-|E-)/.test(v) ? refAny(v) : (/^[^\s:]+\.[A-Za-z0-9]+:\d+/.test(v) ? evid(v) : str(v)))),
    proof: str, status: en('kept', 'partly', 'GAP', 'unknown'),
  },
  finding: {
    id: mine('FN'), date, lens: str, surface, area: str, refs: list(refAny), severity: en('S1', 'S2', 'S3', 'S4'), title: str, what: str, expected: str,
    evidence: list(evid, 1), proof: en('driven', 'code-read', 'data-count', 'machine'),
    root_cause_key: (v) => (typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+){2,5}$/.test(v) ? null : 'must be 3-6 lower-case words joined by dashes'),
    who: str, how_often: str, fix_line: str, fix_size: en('small', 'medium', 'large', 'unknown'), needs_him: bool,
    verified: en('pending', 'true', 'false', 'unsure'), status: (v) => (v === 'open' || v === 'his call' || /^fixed in R-\d+/.test(v) ? null : 'must be open | his call | fixed in R-<n>'),
  },
  improvement: {
    id: mine('IM'), expert: str, surface, what: str, why: str, evidence: list(evid, 1), impact: en('high', 'med', 'low'), impact_why: str,
    effort: en('S', 'M', 'L'), type: en('quick win', 'feature', 'redesign', 'remove'), my_view: str,
  },
  grid: { surface, area: str, lens: str, checked_on: date, items: gridItems },
};
const PLAIN = { finding: ['title', 'what', 'who', 'how_often', 'fix_line'] };

// ---------- pass 1: parse, blind check, collect ids ----------
const rejects = [];
const warns = [];
let blindHit = false;
const rows = [];
let lineTotal = 0;
fs.readFileSync(OUT, 'utf8').split(/\r?\n/).forEach((line, i) => {
  const n = i + 1;
  if (!line.trim()) return;
  lineTotal++;
  if (blind.some((re) => re.test(line))) { blindHit = true; rejects.push(`line ${n}: blind check touched (row text withheld)`); return; }
  let o;
  try { o = JSON.parse(line); } catch (e) { rejects.push(`line ${n}: does not parse as JSON: ${e.message}`); return; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { rejects.push(`line ${n}: must be one JSON object`); return; }
  if (!SPEC[o.kind]) { rejects.push(`line ${n}: unknown "kind": ${JSON.stringify(o.kind)} (use ${Object.keys(SPEC).join(' | ')})`); return; }
  if (o.kind === 'grid' && !o.id) o.id = `G|${o.surface}|${o.area}|${o.lens}`;
  if (typeof o.id !== 'string' || !o.id.trim()) { rejects.push(`line ${n}: ${o.kind} has no "id"`); return; }
  if (/\b(insert\s+into|delete\s+from|update\s+\S+\s+set)\b/i.test(line) || (/\bselect\b[^"]*\bfrom\b/i.test(line) && !/gym_id/i.test(line))) warns.push(`line ${n}: holds SQL text that writes or has no gym filter: read it before going on`);
  rows.push({ n, o });
});
const lastOf = new Map(); // a later line with the same id replaces an earlier one (a helper restarted from its checkpoint)
for (const r of rows) if (!r.o.patch) lastOf.set(r.o.kind + '|' + r.o.id, r.n);
const live = rows.filter((r) => r.o.patch || lastOf.get(r.o.kind + '|' + r.o.id) === r.n);
for (const r of live) if (!r.o.patch) batchIds[r.o.kind].add(r.o.id);

// ---------- pass 2: fields, pointers, evidence ----------
const good = [];
for (const { n, o } of live) {
  const spec = SPEC[o.kind];
  const errs = [];
  const tag = `line ${n} [${o.kind} ${o.id}]`;
  if (o.patch === true) {
    if (!has(o.kind, o.id)) errs.push('patch: no row with this id exists yet');
    for (const [f, v] of Object.entries(o)) {
      if (['kind', 'id', 'patch'].includes(f)) continue;
      if (spec[f]) { const e = spec[f](v); if (e) errs.push(`"${f}" ${e}`); }
    }
  } else {
    for (const [f, check] of Object.entries(spec)) {
      if (!(f in o)) { errs.push(`missing field "${f}"`); continue; }
      const e = check(o[f]);
      if (e) errs.push(`"${f}" ${e}`);
    }
    for (const [f, v] of Object.entries(o)) if (v === '' && !spec[f]) errs.push(`"${f}" is empty (write "unknown")`);
    if (o.kind === 'reader' && o.reader_kind === 'not-a-reader' && str(o.reason)) errs.push('"not-a-reader" needs a "reason"');
    if (o.kind === 'journey' && typeof o.id === 'string' && typeof o.feature === 'string' && !o.id.startsWith('J-' + o.feature + '-')) errs.push('journey id must start with J-<its feature id>-');
    const prev = store[o.kind].get(o.id);
    if (prev && prev.wi && prev.wi !== WI) errs.push(`id already written by work item ${prev.wi}; pick a new id, or send "patch": true with only the fields to change`);
    for (const f of PLAIN[o.kind] || []) if (typeof o[f] === 'string' && /[\w-]+\.(tsx?|jsx?|mjs|sql|kt|py|json|ya?ml)\b|\w+\(\)/.test(o[f])) warns.push(`${tag}: "${f}" holds a file or function name; the report card needs plain words`);
  }
  if (errs.length) rejects.push(`${tag}: ${errs.join('; ')}`);
  else good.push(o);
}

// ---------- 4. upsert ----------
const dirty = new Set();
const dirtyFeatures = new Set();
const touch = (kind, row) => { dirty.add(kind); if (kind === 'journey' && row) dirtyFeatures.add(row.feature); };
const counts = { added: 0, replaced: 0, patched: 0, removed: 0 };
if (rejects.length === 0 || allowRejects) {
  const newIds = new Set(good.filter((o) => !o.patch).map((o) => o.kind + '|' + o.id));
  for (const [kind, m] of Object.entries(store)) for (const [id, r] of [...m]) if (r.wi === WI && !newIds.has(kind + '|' + id)) { touch(kind, r); m.delete(id); counts.removed++; }
  for (const o of good) {
    const m = store[o.kind];
    if (o.patch) {
      const cur = m.get(o.id);
      if (!cur) { rejects.push(`[${o.kind} ${o.id}]: patch target is missing after the merge`); continue; }
      const { patch, kind, id, ...fields } = o;
      Object.assign(cur, fields);
      cur.patch_fields = { ...(cur.patch_fields || {}), ...fields }; // kept, so a re-run of the row's own work item does not undo the patch
      cur.patched_by = [...new Set([...(cur.patched_by || []), WI])];
      touch(o.kind, cur); counts.patched++;
    } else {
      if (m.has(o.id)) { counts.replaced++; touch(o.kind, m.get(o.id)); } else counts.added++;
      const prev = m.get(o.id);
      const row = prev && prev.patch_fields ? { ...o, ...prev.patch_fields, wi: WI, patch_fields: prev.patch_fields, patched_by: prev.patched_by } : { ...o, wi: WI };
      m.set(o.id, row); touch(o.kind, row);
    }
  }
}

// ---------- --cover: every A1b line of the area has a feature ----------
if (cover) {
  const m = cover.match(/^([A-Za-z0-9._-]+)#(\d+)-(\d+)$/);
  if (!m) die('--cover must look like panel.txt#200-340');
  const named = new Set();
  for (const f of store.feature.values()) for (const s of f.sources || []) named.add(s);
  const miss = [];
  for (let n = Number(m[2]); n <= Number(m[3]); n++) if (!named.has(`${m[1]}#${n}`)) miss.push(n);
  if (miss.length) rejects.push(`cover: ${miss.length} line(s) of _sources/${m[1]} have no feature: ${miss.slice(0, 60).join(', ')}${miss.length > 60 ? ', ...' : ''}`);
}

// ---------- 6. rejects ----------
const failed = rejects.length > 0;
const rejFile = path.join(MAP, '_work', 'rejects', WI + '.txt');
if (!dry) {
  fs.mkdirSync(path.dirname(rejFile), { recursive: true });
  if (failed) fs.writeFileSync(rejFile, rejects.join('\n') + '\n');
  else if (fs.existsSync(rejFile)) fs.rmSync(rejFile);
  if (blindHit) {
    const bt = path.join(MAP, '_work', 'blind-touched.txt');
    const cur = fs.existsSync(bt) ? fs.readFileSync(bt, 'utf8').split(/\r?\n/).filter(Boolean) : [];
    if (!cur.includes(WI)) fs.writeFileSync(bt, [...cur, WI].join('\n') + '\n');
  }
}

// ---------- 5. write the kept files ----------
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function writeFile(file, rowsOut, fmt) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = fmt === 'jsonl' ? rowsOut.map((r) => JSON.stringify(r)).join('\n') + (rowsOut.length ? '\n' : '')
    : '[\n' + rowsOut.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n';
  fs.writeFileSync(file + '.tmp', body); fs.renameSync(file + '.tmp', file);
}
const willWrite = !dry && (!failed || allowRejects);
if (willWrite) {
  for (const kind of dirty) {
    const s = STORES[kind];
    if (s.dir) {
      for (const feat of dirtyFeatures) {
        const file = path.join(MAP, s.dir, String(feat).replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
        const rs = [...store.journey.values()].filter((r) => r.feature === feat).sort(byId);
        if (rs.length) writeFile(file, rs, 'json'); else if (fs.existsSync(file)) fs.rmSync(file);
      }
    } else writeFile(path.join(MAP, s.file), [...store[kind].values()].sort(byId), s.fmt);
  }
}

for (const w of warns) console.log('WARN ' + w);
console.log(`${WI}: ${lineTotal} rows read, ${good.length} passed, ${rejects.length} rejected` + (blindHit ? '; BLIND CHECK TOUCHED (score that finding as not blind)' : ''));
if (willWrite) console.log(`merged: ${counts.added} added, ${counts.replaced} replaced, ${counts.patched} patched, ${counts.removed} old rows of this item removed`);
else console.log(dry ? 'dry run: nothing written' : `NOT merged: fix the rejects and run again. See ${path.relative(REPO, rejFile).replace(/\\/g, '/')}`);
if (failed) { console.log('The work item is NOT done.'); process.exit(1); }
