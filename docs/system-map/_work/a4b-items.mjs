// Makes the A4b template, the two A4b items, their item lists and briefs. Run once from the repo root.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = 'docs/system-map';
const a4 = fs.readFileSync(`${root}/_briefs/A4.md`, 'utf8').split(/\r?\n/);
const cut = a4.findIndex((l) => l.startsWith('WORDS'));
const head = a4.slice(0, cut);
head[0] = '<!-- Template for step A4b (built vs live). The coordinator fills every {PLACEHOLDER} and pastes the text below this line. -->';
const body = `WORDS
- Feature: one thing the product does, in the user's words (a row of features.json). Surface: one thing a person uses (web, phone, panel, server, hq, watch).
- Status of a feature: live (real users can reach it today) | behind switch (in the live build, but off unless a switch is on) | hidden (in the code, no way in for a user) | not-a-feature | unknown.
- Migration: one database change file. "Applied" = the live database has run it.
- Facts file: docs/system-map/_sources/live-state-facts.md. It says what the live systems really run.

STEP A4b: BUILT VS LIVE
Goal: no feature row keeps the status "unknown" or a wrong status only because nobody looked at the live system.
1. FACTS (only when ITEMS says "write the facts file"; else read it). Write the facts file with these parts:
   a. Database: call the Supabase tool list_migrations ONCE (catalog read; never execute_sql, never a write). Compare its list with the files in supabase/migrations. Write every file that is NOT applied live, and every file whose first lines say NOT APPLIED but that IS applied live.
   b. deploy/panel/migrations (the second database): no live read is allowed here; write "live state unknown" and what each file's first lines say.
   c. Live version labels: open the public pages only (no login): the gym panel sign-in page, the HQ sign-in page, the website. Write the version label each one shows, and the version in the code on main (search for where the label is set). Play app: write the version in the code; live Play version = "unknown" unless a public page shows it.
   Every fact carries its source (tool name + date, a url, or path:line).
2. For EACH feature in ITEMS: read its row in docs/system-map/features.json (search by id). Open its entry file:line (at most 100 lines). Decide the status from evidence: the route or screen is reachable, the switch and its default, the migration it needs is applied (facts file). Write ONE patch row. If the evidence does not settle it, keep "unknown" and say what is missing in the checkpoint.
3. A feature that public words (What's new, help, website) call live, but that is not live: write ONE finding row (severity S2 when a user is told it exists; else S3). First search docs/system-map/findings.jsonl for the same fault; if it is there, write no second finding.
Done when: every id in ITEMS has a patch row in your output file.

ITEMS
{ITEMS}

INPUT FILES
{INPUT FILES}

OUTPUT FILE
{OUTPUT FILE}

ROW FORMAT (one JSON object per line; MADE-UP examples, copy the shape only)
{"kind":"feature","id":"F-panel-014","patch":true,"status":"behind switch","switch":"pay_dues_v2"}
{"kind":"finding","id":"FN-{WORK ITEM ID}-01","date":"2026-11-19","lens":"gap-5","surface":"panel","area":"panel/pay","refs":["F-panel-014"],"severity":"S2","title":"The update note says a thing is ready, but owners cannot open it","what":"Plain words: what a person is told and what they really get.","expected":"Plain words.","evidence":["supabase/migrations/20260101000000_payments.sql:1-3"],"proof":"code-read","root_cause_key":"migration-not-applied-live","who":"owners","how_often":"every time","fix_line":"Plain words, one line","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
A patch row holds only kind, id, "patch": true and the fields you change (status, and switch when you learn its name). status: live | behind switch | hidden | not-a-feature | unknown. Finding rules: every field required; title, what, expected, who, how_often, fix_line in plain words with no file or function names; root_cause_key = 3 to 6 lower-case words joined by dashes (at most 6 words); fix_size = the whole word small | medium | large | unknown; evidence = real repo path:line. Write the reason for each patch as one line in your checkpoint: "<id>: <status>: <why, with path:line>".

SIZE: your ITEMS only. Read at most 2,500 code lines. Write at most 60 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
`;
fs.writeFileSync(`${root}/_briefs/A4b.md`, head.join('\n') + '\n' + body);

const f = JSON.parse(fs.readFileSync(`${root}/features.json`, 'utf8'));
const all = Array.isArray(f) ? f : f.features || Object.values(f);
const unk = all.filter((x) => x.status === 'unknown');
const line = (x) => `${x.id} | ${x.name} | ${(x.entry || [])[0] || 'unknown'}`;
const g1 = unk.filter((x) => ['server', 'web', 'hq'].includes(x.surface));
const g2 = unk.filter((x) => ['phone', 'panel', 'watch'].includes(x.surface));
const extra = ['F-watch-106', 'F-phone-334', 'F-phone-401'].map((id) => all.find((x) => x.id === id)).filter((x) => x && x.status !== 'unknown');
fs.mkdirSync(`${root}/_work/items`, { recursive: true });
fs.writeFileSync(`${root}/_work/items/A4b-1.txt`, g1.map(line).join('\n') + '\n');
fs.writeFileSync(`${root}/_work/items/A4b-2.txt`, [...g2, ...extra].map(line).join('\n') + '\n');

const inputs = 'docs/system-map/features.json and docs/system-map/findings.jsonl (search only, never read whole); docs/system-map/_sources/live-state-facts.md; the code at each entry file:line; supabase/migrations and deploy/panel/migrations (search, then read at most 100 lines).';
const items = [
  ['A4b-1', [], `WRITE THE FACTS FILE FIRST (step 1), then do step 2 for the ${g1.length} features listed in docs/system-map/_work/items/A4b-1.txt (one per line: id | name | first entry point). They are the server, website and HQ rows whose status is unknown. Many are unknown because a database change file says NOT APPLIED in its first lines: the facts file settles those. Write your checkpoint and append rows after every 10 features.`],
  ['A4b-2', ['A4b-1'], `Do NOT write the facts file: it exists; read it first. Do step 2 for the ${g2.length + extra.length} features listed in docs/system-map/_work/items/A4b-2.txt (one per line: id | name | first entry point). They are the phone, panel and watch rows whose status is unknown, plus rows that other helpers said look wrong: F-watch-106 is marked behind switch, but the phone may always send that switch on; F-phone-334 and F-phone-401 may be the same thing with two different statuses. For those rows write a patch row that either corrects the status or repeats the current one, with the reason in the checkpoint. Also search docs/system-map/findings.jsonl for the id prefix FN-A3-whats-new-phone: one finding names three feature rows marked live that were switched off on 5 Nov; check each in the code and write a patch row for each. Write your checkpoint and append rows after every 10 features.`],
];
for (const [id, needs, text] of items) {
  const j = { id, step: 'A4b', item: text.slice(0, 110), needs, checkpoint: `_work/${id}.md`, out_file: `_work/out/${id}.jsonl` };
  fs.writeFileSync(`${root}/_work/add-${id}.json`, JSON.stringify(j));
  console.log(execFileSync('node', [`${root}/_tools/state.mjs`, 'add', `@${root}/_work/add-${id}.json`]).toString().trim());
  console.log(execFileSync('node', [`${root}/_tools/mkbrief.mjs`, 'A4b', id, text, inputs]).toString().trim());
  fs.unlinkSync(`${root}/_work/add-${id}.json`);
}
console.log('items', g1.length, g2.length + extra.length);
