import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const S = 'docs/system-map/_sources';
const A3 = [
  ['A3-help', 'help articles', 'deploy/panel/helpArticles.js (1,029 lines: read it in 100-line slices, top to bottom) and deploy/panel/helpPages.js', 3000, []],
  ['A3-whats-new-panel', "the panel What's new history", 'apps/dashboard/src/crm/logic/whatsNew.ts (709 lines: read it in 100-line slices, top to bottom)', 3100, ['A3-help']],
  ['A3-whats-new-phone', "the phone app What's new history", 'apps/mobile/src/lib/whatsNew.ts (743 lines: read it in 100-line slices, top to bottom)', 3200, ['A3-help']],
  ['A3-website-1', 'the website home pages and the Play listing draft', 'apps/dashboard/public/home/index.html (1,146 lines: read the words a visitor sees, in 100-line slices; skip style and script blocks), apps/dashboard/public/about.html, apps/dashboard/public/contact.html, apps/dashboard/public/get-app.html and branding/mettleup/store/listing-draft.txt', 3300, ['A3-help']],
  ['A3-website-2', 'the join-online page, the friend page and the member website', 'apps/dashboard/public/join-online.html (1,086 lines: read the words a visitor sees, in 100-line slices; skip style and script blocks), apps/dashboard/public/friend.html and apps/dashboard/public/member-site/index.html', 3400, ['A3-help']],
  ['A3-notes-claude-1', 'redacted notes copy, part 1', `${S}/claude-notes-redacted-part01.md (read it in 100-line slices, top to bottom)`, 3500, ['A3-help']],
  ['A3-notes-claude-2', 'redacted notes copy, parts 2 and 3', `${S}/claude-notes-redacted-part02.md and ${S}/claude-notes-redacted-part03.md (read them in 100-line slices, top to bottom)`, 3600, ['A3-help']],
  ['A3-inbox-1', 'redacted backlog copy, part 1', `${S}/owner-inbox-redacted-part01.md (read it in 100-line slices, top to bottom)`, 3700, ['A3-help']],
  ['A3-inbox-2', 'redacted backlog copy, part 2', `${S}/owner-inbox-redacted-part02.md (read it in 100-line slices, top to bottom)`, 3800, ['A3-help']],
  ['A3-inbox-3', 'redacted backlog copy, part 3', `${S}/owner-inbox-redacted-part03.md (read it in 100-line slices, top to bottom)`, 3900, ['A3-help']],
  ['A3-inbox-4', 'redacted backlog copy, parts 4 and 5', `${S}/owner-inbox-redacted-part04.md and ${S}/owner-inbox-redacted-part05.md (read them in 100-line slices, top to bottom)`, 4000, ['A3-help']],
];
const add = [];
for (const [id, what, files, n, needs] of A3) {
  const items = `Your one source: ${what}. New feature rows use the id F-<surface word>-<number> with a number from ${n} to ${n + 59} only. Surface words (use exactly one of): panel, phone, watch, web, hq, server. Search features.json with a search tool (it is one long file: never read it whole).`;
  const inputs = `${files}; docs/system-map/features.json (search only); the code a feature row points at.`;
  console.log(execFileSync('node', ['docs/system-map/_tools/mkbrief.mjs', 'A3', id, items, inputs]).toString().trim());
  add.push({ id, step: 'A3', item: `human side: ${what}`, needs, checkpoint: `_work/${id}.md`, out_file: `_work/out/${id}.jsonl` });
}
{
  const id = 'A4-d1-1';
  const items = 'Your 12 tables (store "d1", the small database of the Workers): ai_limits, ai_usage, assist_limits, assist_usage, feedback, friend_asks, help_usage, hq_messages, leads, pay_connections, pay_events, pay_gyms. Their reader candidates: lines 4 to 122 of docs/system-map/_sources/readers-raw.txt (95 candidates). Each line is: type | name | file:line | how it was found.';
  const inputs = 'docs/system-map/_sources/readers-raw.txt (lines 4-122 only); the code at each file:line; the files that create these tables (search deploy/ for "CREATE TABLE"); docs/system-map/entities.json if it exists.';
  console.log(execFileSync('node', ['docs/system-map/_tools/mkbrief.mjs', 'A4', id, items, inputs]).toString().trim());
  add.push({ id, step: 'A4', item: 'entities and readers: 12 d1 tables, lines 4-122 of _sources/readers-raw.txt', needs: [], checkpoint: `_work/${id}.md`, out_file: `_work/out/${id}.jsonl` });
}
fs.writeFileSync('docs/system-map/_work/a3a4-add.json', JSON.stringify(add));
