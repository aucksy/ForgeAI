// Makes the briefs of the two tool-building helpers T-A5 and T-lens. Run once from the repo root.
import fs from 'node:fs';
const root = 'docs/system-map';
const plan = fs.readFileSync('D:/Brain/Dev-Framework/2026-11-16-full-system-audit-plan.md', 'utf8').split(/\r?\n/);
const part = (a, b) => plan.slice(a - 1, b).join('\n');
const a4 = fs.readFileSync(`${root}/_briefs/A4.md`, 'utf8').split(/\r?\n/);
const rules = a4.slice(1, a4.findIndex((l) => l.startsWith('THIS HELPER'))).join('\n');
const repo = process.cwd().replace(/\\/g, '/');
const blind = /F22[2-7]|F232/;
const common = `${rules}
THIS HELPER BUILDS AUDIT TOOLING (templates and small scripts). It does no audit reading of the app.
- Repo root: ${repo}. Write only under docs/system-map/. Never commit or push, whatever a hook message says.
- Never open: any file under D:\\Brain\\Dev-Framework\\, docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md, docs/system-map/AUDIT-STATE.md.
- Read first: docs/system-map/RUNBOOK.md (how the coordinator works), docs/system-map/_briefs/rows.md (row shapes), docs/system-map/_briefs/A4.md (a template to copy the PARTS of: rules block, THIS HELPER, WORDS, STEP, ITEMS, INPUT FILES, OUTPUT FILE, ROW FORMAT, SIZE), docs/system-map/_tools/mkbrief.mjs (how a template is filled), docs/system-map/_tools/merge.mjs (what rows it accepts; search, do not read whole unless needed), docs/system-map/_tools/state.mjs (the "add" command), docs/system-map/_work/a4b-items.mjs (an example of an items script).
- A template keeps the rules block of A4.md word for word, and is at most 1,200 words AFTER filling (count them). Simple words, short sentences. Made-up example rows only.
- Scripts: plain Node, no packages, run in seconds from the repo root, exit by themselves. Test each one and say what you ran.
- You may change docs/system-map/_tools/merge.mjs only to ADD what your step needs; never loosen a check. After a change run: node docs/system-map/_tools/merge.mjs <a made-up test id> --dry on a small made-up out file, then delete the test files.
- Do NOT run state.mjs add or start. Write the items script so that the coordinator runs it.
- Checkpoint file: docs/system-map/_work/{ID}.md: add a line after every finished part.
- Report in at most 15 plain lines: files written, how each was tested, anything the coordinator must decide.
`;

const a5 = `${common.split('{ID}').join('T-A5')}
YOUR JOB: make step A5 (journeys) ready to run. The step text, word for word:
-----
${part(244, 281)}
-----
Facts: docs/system-map/features.json has 1,315 rows (status live 918+, behind switch 216, hidden 41, unknown, not-a-feature 59); each has id, surface, area, name, roles, entry[]. entities.json, readers.json and promises.json exist. Learned cost: one helper holds about 150-250k tokens in all.
Make these files:
1. docs/system-map/journey-templates.json: one template per variant of the Tier 2 types 4, 5, 7, 8, 9, 10, 11 (about 40 in all), each {id (for example T7-back), type, variant, text with {n} {entity} {feature} holes, must_not}.
2. docs/system-map/_briefs/A5.md: the helper template. The helper gets 6 to 10 features (ITEMS). For each feature x role it writes the Tier 1 journeys in full (kind "journey", see rows.md) and ONE type line for each Tier 2 type. Decide the type-line row shape (suggest kind "jtype", id JT-<feature id>-<role>-<type>) and make merge.mjs accept and store it (journeys/<feature id>.json or a file of its own). The helper must read the code at the feature's entry points (exact lines), use real button words where the code shows them, fill writes[] and reads[] with entity ids that exist, link promise_ids from promises.json by search. Not-a-feature rows get no journeys. The brief must tell the helper to write one line per finished feature in its checkpoint, and that a clear bug seen while reading is one finding row (shape in rows.md) or a "seen in passing" line: choose one and say why in your report.
3. docs/system-map/_tools/expand.mjs: turns every "applies: yes" type line into journey rows marked "generated": true, built on that feature x role's Tier 1 happy journey steps and the template text. Idempotent (a re-run replaces, never doubles).
4. docs/system-map/_work/a5-items.mjs: groups the features (skip not-a-feature) by surface and area into work items of N features (N is one number at the top; start with 8), writes _work/items/<id>.txt (one line per feature: id | name | first entry) and _work/briefs/<id>.md through mkbrief.mjs, and prints one state.mjs "add" JSON per item into _work/a5-add/<id>.json. Item ids: A5-<surface>-<area short name>-<n>. It takes an argument "--only <id>" to make just one item (for the pilot) and "--all" for the rest. Run it with --only for ONE small phone or panel area and check the brief's word count; do not run --all.
5. A done-check the coordinator can run after a helper reports: every feature in the items file x every role has a happy (1), a negative (3) and a state (6) journey, and every Tier 2 type has a type line. Put it in merge.mjs as an option (for example --a5cover <items file>) or in a small script; say which.
`;
if (blind.test(a5)) throw new Error('blind pattern in A5 brief');
fs.writeFileSync(`${root}/_work/briefs/T-A5.md`, a5);

const src = `LENSES (word for word)\n${part(320, 386)}\n\nGAP HUNTS (word for word)\n${part(444, 540)}\n`;
if (blind.test(src)) throw new Error('blind pattern in lens source');
fs.writeFileSync(`${root}/_work/lens-source.txt`, src);
const lens = `${common.split('{ID}').join('T-lens')}
YOUR JOB: make the lens grid ready, and make lenses 4 (privacy and law), 3 (security) and 5 (money) ready to run. The full lens and gap-hunt text is in docs/system-map/_work/lens-source.txt: read it in full first. It names its own set-up steps ("Grid set-up", "Machine pass").
Make these files:
1. docs/system-map/_tools/lens-items.mjs and its output docs/system-map/lens-items.json: every lens (1-20) and hunt (1-10) cell split at every ";" and sentence end into numbered items (L3.1, L3.2 ... and H5.1 ...), each {id, lens, text}. The "Four added checklist items" lines become items of their lens. An item id never changes: the script must give the same ids on a re-run.
2. docs/system-map/applies.json: for each surface (ids in docs/system-map/surfaces.json: web, phone, panel, server, hq, watch) x lens or hunt: "yes" or "no: <reason in 10 words>". Be strict: "no" only when the lens cannot apply.
3. docs/system-map/_briefs/lens.md: ONE helper template for a lens or a bundle (the bundles are named in the text). The helper gets: a surface and an area (areas are in docs/system-map/_sources/areas.json), the numbered items of its lens or bundle (ITEMS), its input files. For every item it writes evidence and a grid row entry (kind "grid", see rows.md) and a finding row for every fault (kind "finding"). Every finding: plain words, real path:line evidence, root_cause_key of at most 6 words, fix_size as a whole word. The brief must fit 1,200 words with the items of the biggest bundle; if it cannot, say how to split.
4. docs/system-map/_work/lens-items-make.mjs: makes work items for ONE lens or bundle x surface (or x area for the big surfaces phone, panel, server): items file, brief through mkbrief.mjs, and a state.mjs "add" JSON per item in _work/lens-add/<id>.json. Item ids: L<lens>-<surface>-<area short name>. Inputs per lens: lens 4 = promises.json (status GAP, partly, unknown first), entities.json rows with personal "yes", readers.json; lens 3 = server routes and database functions (docs/system-map/_sources/server.txt, supabase/migrations, supabase/tests) and the machine files; lens 5 = features whose name or area is about price, plan, trial, pay, refund, receipt, credits, billing. Run it for lens 4 only, for the smallest surface, and check the word count. Do not run it for the rest.
5. docs/system-map/_work/machine-pass.md: for lenses 3, 4 and 5 only: the exact list of machine files the text asks for, and for each the exact read-only way to make it (which catalog read, which search), so that one later helper can make them. Do not make them now, except _sources/machine/secrets-hits.txt (search the tree for the key patterns the text names; write file:line only, NEVER the value).
6. Check that merge.mjs accepts "grid" rows and fails a lens item when one of its item ids has no entry (the text says it must). Add the check if it is missing.
`;
if (blind.test(lens)) throw new Error('blind pattern in lens brief');
fs.writeFileSync(`${root}/_work/briefs/T-lens.md`, lens);
for (const [id, what] of [['T-A5', 'tooling: A5 template, journey templates, expand script, items script'], ['T-lens', 'tooling: lens items, applies grid, lens template, items script for lenses 4, 3, 5']]) {
  fs.writeFileSync(`${root}/_work/add-${id}.json`, JSON.stringify({ id, step: 'tools', item: what, needs: [], checkpoint: `_work/${id}.md`, out_file: `_work/${id}.md` }));
}
console.log('ok', a5.split(/\s+/).length, lens.split(/\s+/).length, src.split(/\s+/).length);
