#!/usr/bin/env node
// Makes the work items of ONE lens, hunt or bundle. Plain Node, seconds, exits. Run from the repo root.
//   node docs/system-map/_work/lens-items-make.mjs <lens> [--surface <id>] [--dry]
//     <lens>: a lens number (4), a hunt (gap-5) or a bundle (B-sec, B-run, B-truth, B-alerts, B-words, B-time, B-switch)
//     --surface: only this surface (web | phone | panel | server | hq | watch). Without it: every surface.
//     --dry: print what would be made, write nothing.
//     --needs <id,id>: the work item ids every item made must wait for (written into the lens-add files).
// One work item per surface for web, hq, watch; one per AREA for phone, panel, server.
// For each work item it writes:
//   _work/items/<id>.txt       the numbered items and the input lists of that area (one row per line)
//   _work/briefs/<id>.md       the brief, through _tools/mkbrief.mjs (template _briefs/lens.md, limit 1,200 words)
//   _work/lens-add/<id>.json   the JSON for:  node docs/system-map/_tools/state.mjs add @docs/system-map/_work/lens-add/<id>.json
// IT DOES NOT RUN state.mjs. The coordinator adds the items, after A4 and A7 are done.
// A surface whose applies.json cell says "no: <reason>" gets no helper: its grid row (every item
// "does-not-apply") is written to _work/lens-add/<prefix>-<surface>-na.grid.jsonl for the coordinator to merge.
// A bundle whose brief would pass 1,200 words is split by lens into two or more work items (-a, -b) on the same area.
// After a helper reports: node docs/system-map/_tools/lens-cover.mjs <id>   (exit 1 = an item id has no grid entry).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = 'docs/system-map';
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const si = argv.indexOf('--surface');
const onlySurface = si >= 0 ? argv[si + 1] : null;
const ni = argv.indexOf('--needs');
const NEEDS_ARG = ni >= 0 ? argv[ni + 1].split(',').filter(Boolean) : [];
const arg = argv.find((a, i) => !a.startsWith('--') && (si < 0 || i !== si + 1) && (ni < 0 || i !== ni + 1));
function die(m) { console.error('lens-items-make.mjs: ' + m); process.exit(2); }
if (!fs.existsSync(`${root}/_briefs/lens.md`)) die('run me from the repo root');
const J = (f) => JSON.parse(fs.readFileSync(`${root}/${f}`, 'utf8'));
const LI = J('lens-items.json');
const APPLIES = J('applies.json').surfaces;
const AREAS = J('_sources/areas.json').areas;
const SURFACES = ['web', 'phone', 'panel', 'server', 'hq', 'watch'];
const BIG = ['phone', 'panel', 'server'];
const LIMIT = 1200;
const PROMISE_CAP = 60; // promises one helper checks; more = extra work items (-p2, -p3) holding only the promise item

if (!arg) die('use: lens-items-make.mjs <lens number | gap-<n> | bundle name> [--surface <id>] [--dry]');
const isBundle = Object.prototype.hasOwnProperty.call(LI.bundles, arg);
const lenses = isBundle ? LI.bundles[arg] : [arg];
for (const l of lenses) if (!LI.names[l]) die(`unknown lens or hunt: ${l}`);
if (lenses.includes('1')) die('lens 1 is the journeys (Phase A/B); it has no lens helper');
if (onlySurface && !SURFACES.includes(onlySurface)) die('unknown surface: ' + onlySurface);
const prefix = isBundle ? arg : (arg.startsWith('gap-') ? 'H' + arg.slice(4) : 'L' + arg);
const itemsOf = (l) => LI.items.filter((i) => i.lens === l && !i.retired);
const wc = (s) => s.split(/\s+/).filter(Boolean).length;

// ---------- which area holds a repo path ----------
// The website files inside deploy/panel are named in _tools/sources.mjs (WEB_FILES); read them from there.
const srcTool = fs.readFileSync(`${root}/_tools/sources.mjs`, 'utf8');
const wm = srcTool.match(/const WEB_FILES = \[([^\]]+)\]/);
if (!wm) die('WEB_FILES not found in _tools/sources.mjs');
const WEB_FILES = new Set([...wm[1].matchAll(/'([^']+)'/g)].map((m) => 'deploy/panel/' + m[1]));
const pathOf = (w) => String(w ?? '').replace(/:\d+(-\d+)?$/, '');
function areaOf(p) {
  if (!p) return null;
  if (WEB_FILES.has(p)) return 'web/pages';
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  let best = null; let score = -1;
  for (const a of AREAS) {
    if (a.id === 'web/pages' && p.startsWith('deploy/panel/')) continue;
    for (const f of a.folders) {
      if (dir !== f && !dir.startsWith(f + '/')) continue;
      const s = f.length * 2 + (p >= a.firstFile && p <= a.lastFile ? 1 : 0);
      if (s > score) { score = s; best = a.id; }
    }
  }
  return best;
}

// ---------- inputs per lens ----------
const PRIVACY = /\b(data|delet|eras|remov|privacy|private|consent|agree|share|shar(ed|ing)|sell|sold|record|log|number|phone|whatsapp|email|address|kept|keep|store[ds]?|saved?|backup|never|only you|who can see|see your|access|health|heart|weight|photo|picture|camera|location|age|child|minor|birthday|ai\b|google|fitbit|analytics|track|third|outside|permission|secure|encrypt|pin\b|password)/i;
const MONEY = /price|plan|trial|pay|refund|receipt|credit|billing/i;
const rank = { GAP: 0, partly: 1, unknown: 2, kept: 3 };
const short = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

function inputsFor(lens, surface, areaIds) {
  // Returns {sections: [[title, rows[]]], counts text, hint, files text, promises (for the cap)}
  const inArea = (p) => areaIds.includes(areaOf(pathOf(p)));
  // the features of the area: listed in every items file (lens 5: only the money ones)
  const F = J('features.json').filter((f) => f.surface === surface && f.status !== 'not-a-feature' && areaIds.includes(areaOf(pathOf((f.entry || [])[0])) || f.area));
  const featRows = (list) => list.map((f) => `${f.id} | ${f.status} | ${short(f.name, 120)} | ${(f.entry || [])[0] || 'unknown'}`);
  const FEAT = ['FEATURES OF THIS AREA (id | status | name | first entry)', featRows(F)];
  if (lens === '4') {
    const P = J('promises.json').filter((p) => inArea(p.where));
    const open = P.filter((p) => p.status !== 'kept');
    const take = open.filter((p) => p.status === 'GAP' || PRIVACY.test(p.text + ' ' + p.page)).sort((a, b) => rank[a.status] - rank[b.status] || (a.id < b.id ? -1 : 1));
    const left = open.length - take.length;
    const R = J('readers.json');
    const E = J('entities.json').filter((e) => e.personal !== 'no');
    const whole = !BIG.includes(surface);
    const myReaders = R.filter((r) => r.reader_kind !== 'not-a-reader' && (inArea(r.where) || (whole && r.surface === surface)));
    const eIds = new Set(myReaders.map((r) => r.entity));
    const myE = E.filter((e) => eIds.has(e.id) || (e.evidence || []).some(inArea));
    const keep = new Set(myE.map((e) => e.id));
    const rd = myReaders.filter((r) => keep.has(r.entity));
    return {
      promises: take.map((p) => `${p.id} | ${p.status} | ${p.where} | ${short(p.text)}`),
      sections: [
        ['ENTITIES WITH PERSONAL DATA (id | personal | kept how long | where stored)', myE.map((e) => `${e.id} | ${e.personal} | ${short(e.retention, 80)} | ${short((e.stored || []).join(', '), 100)}`)],
        ['READERS OF THOSE ENTITIES IN THIS AREA (id | entity | kind | where)', rd.map((r) => `${r.id} | ${r.entity} | ${r.reader_kind} | ${r.where}`)],
        FEAT,
        ['NOT LISTED', [`${left} open promises of this area are not about personal data or law by their words (script filter); they are left to hunt 10 and lens 10.`, `${P.length - open.length} promises of this area already have the status kept.`]],
      ],
      counts: `${take.length} promises, ${myE.length} entities with personal data, ${rd.length} readers`,
      hint: 'L4.1: check each listed promise in the code; one that is broken or cannot be kept = a finding with the promise id in refs. Other items: follow each listed entity through its readers and writers in your area.' + (whole ? ' A listed reader outside your folders is the server call behind this surface: read it at its file:line.' : ''),
      files: 'docs/system-map/promises.json, entities.json, readers.json, findings.jsonl (search by id, never read whole); apps/dashboard/public/privacy.html and terms.html (search, then read the part you need); the code at each "where".',
    };
  }
  if (lens === '3') {
    const srv = fs.readFileSync(`${root}/_sources/server.txt`, 'utf8').split(/\r?\n/);
    const rows = [];
    srv.forEach((l, i) => { if (!l.trim()) return; const p = pathOf(l.split(' | ').pop().trim()); if (inArea(p)) rows.push(`server.txt#${i + 1} | ${l}`); });
    const mdir = `${root}/_sources/machine`;
    const hitsFile = `${mdir}/secrets-hits.txt`;
    const hits = fs.existsSync(hitsFile) ? fs.readFileSync(hitsFile, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && inArea(l.split(' | ')[0])) : [];
    const machine = ['db-security.json', 'cve.json', 'secrets-hits.txt'].map((f) => `${f}: ${fs.existsSync(`${mdir}/${f}`) ? 'ready' : 'MISSING (items that need it = could-not-check)'}`);
    const dbArea = areaIds.some((a) => a.startsWith('server/database'));
    const tests = dbArea && fs.existsSync('supabase/tests') ? fs.readdirSync('supabase/tests').sort().map((f) => 'supabase/tests/' + f) : [];
    return {
      sections: [
        ['SERVER ROUTES AND DATABASE FUNCTIONS IN THIS AREA (line of _sources/server.txt | kind | name | file:line)', rows],
        ['KEY PATTERN HITS IN THIS AREA (file:line | pattern; never the value)', hits],
        ['DATABASE TEST FILES', tests],
        ['MACHINE FILES (docs/system-map/_sources/machine/)', machine],
        FEAT,
      ],
      counts: `${rows.length} server list lines, ${hits.length} key pattern hits${tests.length ? ', ' + tests.length + ' database test files' : ''}`,
      hint: 'L3.2, L3.3: for each table your area touches, name the test in supabase/tests that proves another gym is refused.',
      files: 'docs/system-map/_sources/machine/db-security.json, cve.json, secrets-hits.txt; docs/system-map/findings.jsonl (search only); supabase/migrations and supabase/tests (search, then read at most 100 lines); the code at each file:line.',
      missingMachine: machine.filter((m) => m.includes('MISSING')).length,
    };
  }
  if (lens !== '5') return otherInputs(lens, surface, areaIds, inArea, F, featRows);
  const mine = lens === '5' ? F.filter((f) => MONEY.test(f.name) || MONEY.test(f.area)) : F;
  return {
    sections: [[lens === '5' ? 'FEATURES ABOUT PRICE, PLAN, TRIAL, PAY, REFUND, RECEIPT, CREDITS, BILLING (id | status | name | first entry)' : 'FEATURES OF THIS AREA (id | status | name | first entry)',
      featRows(mine)]],
    counts: `${mine.length} ${lens === '5' ? 'money ' : ''}features`,
    featureCount: mine.length,
    hint: lens === '5' ? 'Follow every amount from where it is typed to every place that shows it.' : '',
    files: 'docs/system-map/features.json, promises.json, findings.jsonl (search by id or word, never read whole); the code at each entry file:line' + (lens === '5' ? '; apps/dashboard/public/refund.html (search, then read the part you need).' : '.'),
  };
}

// ---------- inputs for every lens and hunt other than 3, 4, 5 (added 21 Nov 2026) ----------
// Machine files per lens (plan, "Machine pass"); a MISSING file = the items that need it are could-not-check.
const MACHINE = { '7': ['db-perf.json', 'pagespeed.json'], '8': ['limits.json'], '9': ['a11y.json'], '12': ['play-report.md'], '16': ['code-health.csv'], 'gap-2': ['field-fill.csv'], 'gap-6': ['field-fill.csv'], 'gap-5': ['live-state.csv'] };
// Map files a lens reads beside the features (search by id, never read whole).
const MAPS = {
  '2': 'entities.json, readers.json, impact.json', '17': 'entities.json, readers.json, impact.json', 'gap-9': 'entities.json, readers.json, impact.json',
  'gap-1': 'entities.json, readers.json, impact.json', 'gap-4': 'readers.json, impact.json', 'gap-3': 'entities.json, readers.json',
  '6': 'entities.json, readers.json', '11': 'entities.json, readers.json', '20': 'entities.json', 'gap-2': 'entities.json', 'gap-6': 'entities.json',
  '10': 'promises.json', 'gap-10': 'promises.json', '14': 'promises.json', '12': 'promises.json', '18': 'improvements.jsonl',
  '13': 'journey-types/<feature id>.json (types 7, 8, 10)', 'gap-7': 'journey-types/<feature id>.json (types 7, 8, 10)',
};
const HINTS = {
  'gap-8': 'H8: read ONLY the silent catch rows and the fallback rows listed in your items file; every other silent.csv row of your area is counted as "filtered by script, N rows, not read" (N is in your items file).',
  '16': 'L16: start from the code-health rows of your area; orphan tests: docs/system-map/_sources/orphan-tests.txt (rows of your area).',
  'gap-1': 'H1: list each setting, switch, plan gate, status and automation of your area first (the features list), then search for every reader that should change with it.',
  'gap-2': 'H2: Crispy Curves reach counts come from field-fill.csv; never count another gym.',
  'gap-6': 'H6: fill counts come from field-fill.csv (Crispy Curves only); never count another gym.',
  '18': 'L18: write improvement rows ("My view:"), not findings, unless something is broken.',
};
const RISKY = /pay|credit|ledger|receipt|order|message|alert|talk|push|notif|session|signin|staff-pin|owner-key|phone-code|phone-proof|sync|backup/;
let SILENT = null;
function otherInputs(lens, surface, areaIds, inArea, F, featRows) {
  const mdir = `${root}/_sources/machine`;
  const mfiles = MACHINE[lens] || [];
  const machine = mfiles.map((f) => `${f}: ${fs.existsSync(`${mdir}/${f}`) ? 'ready' : 'MISSING (items that need it = could-not-check)'}`);
  const sections = [['FEATURES OF THIS AREA (id | status | name | first entry)', featRows(F)]];
  let counts = `${F.length} features`;
  if (machine.length) sections.push(['MACHINE FILES (docs/system-map/_sources/machine/)', machine]);
  if (lens === '16' && fs.existsSync(`${mdir}/code-health.csv`)) {
    const rows = fs.readFileSync(`${mdir}/code-health.csv`, 'utf8').split(/\r?\n/).slice(1).filter((l) => l && inArea(l.split(',')[1]));
    sections.push(['CODE HEALTH ROWS OF THIS AREA (kind,path,line,note)', rows]);
    counts += `, ${rows.length} code-health rows`;
  }
  if (lens === 'gap-8') {
    if (!SILENT) SILENT = fs.existsSync(`${root}/_sources/silent.csv`) ? fs.readFileSync(`${root}/_sources/silent.csv`, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',')) : [];
    const mine = SILENT.filter((r) => inArea(r[1]));
    // fallback rows are read only in files named in a journey that writes money, messages, alerts, sign-in or sync:
    // the entry files of features whose journeys write such an entity
    const riskyFiles = new Set();
    for (const f of F) {
      let js = [];
      try { js = JSON.parse(fs.readFileSync(`${root}/journeys/${f.id}.json`, 'utf8')); } catch { /* no journeys: feature not live */ }
      if (js.some((j) => (j.writes || []).some((e) => RISKY.test(e)))) for (const e of f.entry || []) riskyFiles.add(pathOf(e));
    }
    const silentRows = mine.filter((r) => r[0] === 'catch' && r[3] === 'no' && r[4] === 'no' && r[5] === 'no');
    const fb = mine.filter((r) => r[0] === 'fallback' && riskyFiles.has(r[1]));
    const filtered = mine.length - silentRows.length - fb.length;
    sections.push(['SILENT CATCH ROWS TO READ (kind,file,line,logs,tells_user,rethrows,text)', silentRows.map((r) => r.join(','))]);
    sections.push(['FALLBACK ROWS TO READ (files that write money, messages, alerts, sign-in or sync)', fb.map((r) => r.join(','))]);
    sections.push(['FILTERED BY SCRIPT', [`${filtered} other rows of _sources/silent.csv in this area: not read (write this number in the H8 evidence)`]]);
    counts += `, ${silentRows.length} silent catch rows, ${fb.length} fallback rows`;
  }
  const files = `docs/system-map/features.json${MAPS[lens] ? ', ' + MAPS[lens] : ''}, findings.jsonl (search by id or word, never read whole)`
    + (machine.length ? `; docs/system-map/_sources/machine/${mfiles.join(', ')}` : '')
    + (lens === 'gap-8' ? '; docs/system-map/_sources/silent.csv (only your rows)' : '') + '; the code at each entry file:line.';
  return { sections, counts, hint: HINTS[lens] || '', files, missingMachine: machine.filter((m) => m.includes('MISSING')).length };
}

// ---------- brief text ----------
const template = (() => { const t = fs.readFileSync(`${root}/_briefs/lens.md`, 'utf8'); return t.slice(t.indexOf('\n') + 1); })();
const repo = process.cwd().replace(/\\/g, '/');
function briefWords(id, items, inputs) {
  let t = template;
  const fill = { '{WORK ITEM ID}': id, '{CRISPY CURVES ID}': '00000000-0000-0000-0000-000000000000', '{CHECKPOINT FILE}': `${root}/_work/${id}.md`, '{ITEMS}': items, '{INPUT FILES}': `${inputs} Repo root: ${repo}`, '{OUTPUT FILE}': `${root}/_work/out/${id}.jsonl` };
  for (const [k, v] of Object.entries(fill)) t = t.split(k).join(v);
  return wc(t);
}
function texts(id, surface, areaLabel, areas, group, inp, onlyItems) {
  const folders = [...new Set(areas.flatMap((a) => a.folders))];
  const range = areas.length === 1 && /-\d+$/.test(areas[0].id) ? ` (files ${areas[0].firstFile.split('/').pop()} to ${areas[0].lastFile.split('/').pop()}, sorted by name)` : '';
  const lines = [`Surface: ${surface}. Area: ${areaLabel} (write exactly these two in every row). Folders: ${folders.join(', ')}${range}.`];
  const ids = [];
  for (const l of group) {
    const its = itemsOf(l).filter((i) => !onlyItems || onlyItems.includes(i.id));
    if (!its.length) continue;
    lines.push(`${l.startsWith('gap-') ? 'Hunt ' + l.slice(4) : 'Lens ' + l}, ${LI.names[l]}: write "lens":"${l}".`);
    for (const i of its) { lines.push(`${i.id} ${i.text}`); ids.push(i.id); }
  }
  const uniq = (a) => [...new Set(a)];
  lines.push(`Your lists (${uniq(inp.map((x) => x.counts)).join('; ')}): ${root}/_work/items/${id}.txt. ${uniq(inp.map((x) => x.hint)).join(' ')}`);
  const files = `${root}/_work/items/${id}.txt (read it whole first); ` + [...new Set(inp.map((x) => x.files))].join(' ');
  return { items: lines.join('\n'), inputs: files, ids };
}

// ---------- plan ----------
const made = [];
const skipped = [];
let over = 0;
for (const surface of SURFACES) {
  if (onlySurface && surface !== onlySurface) continue;
  const yes = lenses.filter((l) => APPLIES[surface][l] === 'yes');
  const no = lenses.filter((l) => APPLIES[surface][l] !== 'yes');
  const sAreas = AREAS.filter((a) => a.surface === surface);
  if (no.length) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = no.map((l) => { const reason = APPLIES[surface][l].replace(/^no:\s*/, ''); return JSON.stringify({ kind: 'grid', surface, area: surface + '/all', lens: l, checked_on: today, items: itemsOf(l).map((i) => ({ item: i.id, status: 'does-not-apply', reason, evidence: [], finding_ids: [] })) }); });
    const f = `${root}/_work/lens-add/${prefix}-${surface}-na.grid.jsonl`;
    if (!dry) { fs.mkdirSync(`${root}/_work/lens-add`, { recursive: true }); fs.writeFileSync(f, rows.join('\n') + '\n'); }
    skipped.push(`${surface} x ${no.join(', ')}: does not apply (${APPLIES[surface][no[0]]}); grid row in ${f}`);
  }
  if (!yes.length) continue;
  const targets = BIG.includes(surface) ? sAreas.map((a) => [a]) : [sAreas];
  for (const areas of targets) {
    const areaLabel = areas.length === 1 ? areas[0].id : surface + '/all';
    const shortName = areas.length === 1 ? areas[0].id.split('/')[1] : 'all';
    const areaIds = areas.map((a) => a.id);
    const base = `${prefix}-${surface}-${shortName}`;
    const inpOf = new Map(yes.map((l) => [l, inputsFor(l, surface, areaIds)]));
    if (yes.length === 1 && yes[0] === '5' && inpOf.get('5').featureCount === 0) { skipped.push(`${base}: no money feature in this area: no work item (coordinator: accept, or run it by hand)`); continue; }
    // split the lenses into groups whose brief fits the limit
    const groups = [];
    let cur = [];
    for (const l of yes) {
      const tryG = [...cur, l];
      const t = texts(base + '-a', surface, areaLabel, areas, tryG, tryG.map((x) => inpOf.get(x)));
      if (briefWords(base + '-a', t.items, t.inputs) > LIMIT && cur.length) { groups.push(cur); cur = [l]; } else cur = tryG;
    }
    groups.push(cur);
    groups.forEach((group, gi) => {
      const id = groups.length > 1 ? `${base}-${'abcdefgh'[gi]}` : base;
      const inp = group.map((x) => inpOf.get(x));
      // lens 4: the promise list, cut into parts of PROMISE_CAP
      const prom = group.includes('4') ? inpOf.get('4').promises : [];
      const parts = Math.max(1, Math.ceil(prom.length / PROMISE_CAP));
      for (let p = 0; p < parts; p++) {
        const pid = p === 0 ? id : `${id}-p${p + 1}`;
        const label = p === 0 ? areaLabel : `${areaLabel} part ${p + 1}`;
        const myProm = prom.slice(p * PROMISE_CAP, (p + 1) * PROMISE_CAP);
        const pinp = p === 0 ? inp.map((x) => (x.promises ? { ...x, counts: x.counts.replace(/^\d+ promises/, `${myProm.length} promises`) } : x))
          : [{ counts: `${myProm.length} promises`, hint: inpOf.get('4').hint.split(' Other items')[0], files: inpOf.get('4').files }];
        const t = texts(pid, surface, label, areas, p === 0 ? group : ['4'], pinp, p === 0 ? null : ['L4.1']);
        const words = briefWords(pid, t.items, t.inputs);
        const file = [`# ${pid}: ${group.join(' + ')} x ${surface} / ${label}. Made by _work/lens-items-make.mjs. One row per line.`, '## ITEMS (id | lens | text)',
          ...LI.items.filter((i) => t.ids.includes(i.id)).map((i) => `${i.id} | ${i.lens} | ${i.text}`)];
        if (group.includes('4')) file.push(`## PROMISES TO CHECK (id | status | where | text)${parts > 1 ? ` part ${p + 1} of ${parts}` : ''}`, ...(myProm.length ? myProm : ['(none)']));
        if (p === 0) for (const x of inp) for (const [title, rows] of x.sections) file.push('## ' + title, ...(rows.length ? rows : ['(none)']));
        const add = { id: pid, step: prefix, item: `${isBundle ? arg : (arg.startsWith('gap-') ? 'hunt ' + arg.slice(4) : 'lens ' + arg)} (${LI.names[group[0]]}${group.length > 1 ? ' + ' + (group.length - 1) + ' more' : ''}) x ${surface} / ${label}: ${t.ids.length} items`, needs: NEEDS_ARG, checkpoint: `_work/${pid}.md`, out_file: `_work/out/${pid}.jsonl`, surface, area: label, lenses: p === 0 ? group : ['4'], lens_items: t.ids };
        const missing = inp.reduce((s, x) => s + (x.missingMachine || 0), 0);
        made.push({ pid, words, items: t.ids.length, counts: [...new Set(pinp.map((x) => x.counts))].join('; '), missing });
        if (words > LIMIT) over++;
        if (dry) continue;
        for (const d of ['items', 'briefs', 'lens-add']) fs.mkdirSync(`${root}/_work/${d}`, { recursive: true });
        fs.writeFileSync(`${root}/_work/items/${pid}.txt`, file.join('\n') + '\n');
        fs.writeFileSync(`${root}/_work/lens-add/${pid}.json`, JSON.stringify(add) + '\n');
        const out = execFileSync('node', [`${root}/_tools/mkbrief.mjs`, 'lens', pid, t.items, t.inputs]).toString().trim();
        const m = out.match(/ (\d+) words$/);
        made[made.length - 1].words = m ? Number(m[1]) : words;
        if (m && Number(m[1]) > LIMIT) over++;
      }
    });
  }
}
for (const m of made) console.log(`${dry ? 'would make' : 'made'} ${m.pid}: ${m.items} items, brief ${m.words} words${m.words > LIMIT ? ' OVER THE LIMIT' : ''}; ${m.counts}${m.missing ? `; WARNING ${m.missing} machine file(s) missing: see _work/machine-pass.md` : ''}`);
for (const s of skipped) console.log('no helper: ' + s);
console.log(`${made.length} work item(s). Next, for each: node ${root}/_tools/state.mjs add @${root}/_work/lens-add/<id>.json`);
if (over) { console.log('A brief is over 1,200 words: one lens alone does not fit. Cut its items into two work items by hand.'); process.exit(1); }
