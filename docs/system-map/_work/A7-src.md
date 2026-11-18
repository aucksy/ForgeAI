# A7-src checkpoint (candidate promise list, by script)

- unit 1 DONE: found the source groups (folder lists only).
- unit 2 DONE: wrote docs/system-map/_tools/promises.mjs (plain Node, ~3 s, exits).
- unit 3 DONE: wrote docs/system-map/_sources/promises.txt, 1556 rows (`node docs/system-map/_tools/promises.mjs --write`).
- unit 4 DONE: 30-row by-eye check. unit 5 DONE: table below. STEP FINISHED.

## Where each group is read from
| group | places |
|---|---|
| legal | apps/dashboard/public/{privacy,terms,data-agreement,refund,delivery,delete-account}.html (the served pages; docs/legal/*.body.html are their sources and are not scanned twice) |
| websites | every other .html/.js under apps/dashboard/public (about, contact, home, member-site, gym-page, join, join-online, friend, get-app, checkin) + deploy/panel/{gymPage,gymPageServe,friend,selfJoin,joinPay,appLink,pageChat,leads}.js |
| store | branding/mettleup/store/{listing-draft.txt,captions.json,templates/slots.json} |
| help | deploy/panel/helpArticles.js, helpPages.js |
| panel | apps/dashboard/src (ts, tsx), apps/dashboard/index.html, the rest of deploy/panel/*.js, supabase/migrations/*.sql (answers the server gives) |
| phone-watch | apps/mobile/src, apps/mobile/android/wear/src/main (kt, xml), android app strings.xml, apps/mobile/modules, apps/mobile/app.json |
| whats-new | apps/dashboard/src/crm/logic/whatsNew.ts, apps/mobile/src/lib/whatsNew.ts (every line); hqNews.ts and deploy/panel/whatsNewFeed.js (trigger words only) |
| templates | dashboard messageTemplates.ts, whatsapp.ts, shop/messages.ts; mobile autoReminders, gymReminders, noticeAlertWords, pushPlan, helpReplyAlert, workoutAlerts; deploy/panel/phoneInbound.js; deploy/hq/push.js, panelPush.js (every string); supabase/migrations named push/message/alert/notice/remind (trigger words only) |

## 30-row by-eye check (second run, after the first tightening)
Rows checked (promises.txt line numbers at that run): 58 64 220 230 353 354 487 594 745 748 771 793 804 815 1061 1151 1176 1184 1218 1278 1280 1290 1308 1318 1411 1412 1451 1489 1522 1566.
Each file:line was opened. 28 of 30 are text a user reads. 2 are not good candidates:
- apps/dashboard/src/crm/ui/screens/Enquiries.tsx:440 "Free trial online:" is a prefix the code compares against, not a sentence on screen.
- apps/dashboard/src/crm/ui/screens/WorkoutPlans.tsx:409 "Note for {only} (optional)": the trigger "only" was a variable name inside a placeholder. FIXED in the script (placeholders are ignored for triggers).
Weak but readable: terms.html:13 was the row of page links ("Delete your account"). FIXED: <nav> blocks are skipped.
Result: 2 of 30 not user-readable (limit 6) = PASS.
First run (before tightening) had 2 of 30 bad plus known noise (web links, MIME types, "[push]" log lines, server reason codes, AI prompt files); all removed: 1774 -> 1556 rows.

## Table (promises.txt line numbers)
source group | first line | last line | count
legal | 1 | 262 | 262
  legal part 1/3 | 1 | 120 | 120
  legal part 2/3 | 121 | 240 | 120
  legal part 3/3 | 241 | 262 | 22
websites | 263 | 376 | 114
store | 377 | 378 | 2
help | 379 | 440 | 62
panel | 441 | 804 | 364
  panel part 1/4 | 441 | 560 | 120
  panel part 2/4 | 561 | 680 | 120
  panel part 3/4 | 681 | 800 | 120
  panel part 4/4 | 801 | 804 | 4
phone-watch | 805 | 1051 | 247
  phone-watch part 1/3 | 805 | 924 | 120
  phone-watch part 2/3 | 925 | 1044 | 120
  phone-watch part 3/3 | 1045 | 1051 | 7
whats-new | 1052 | 1364 | 313
  whats-new part 1/3 | 1052 | 1171 | 120
  whats-new part 2/3 | 1172 | 1291 | 120
  whats-new part 3/3 | 1292 | 1364 | 73
templates | 1365 | 1556 | 192
  templates part 1/2 | 1365 | 1484 | 120
  templates part 2/2 | 1485 | 1556 | 72
TOTAL | 1 | 1556 | 1556

## Could not check / known gaps
- Whole words only, as the brief says: "deleted", "refunds", "guaranteed", "securely", "privately" are NOT matched. `--inflections` adds them: 1631 rows (75 more). Not written to promises.txt.
- Hindi and Hinglish text: trigger words are English, so a Hindi promise is listed only where every line is listed (templates). The Hindi privacy notice inside privacy.html is mostly not listed.
- Store screenshot text: only captions.json and slots.json are text; words painted inside the PNG pictures cannot be read by a script. Store group has only 2 rows.
- WhatsApp sign-in code message: its words live in Meta's template, not in the repo (deploy/panel/phoneCode.js only names it).
- AI prompt files left out as not user-readable: apps/mobile/src/ai/system.ts, ai/tools.ts, deploy/panel/help.js, assist*.js, aiMatch.js. AI answers themselves are not in the repo.
- Not scanned (drafts or not one of the 8 groups): docs/launch, docs/legal sources, docs/gym-page, docs/marketing, marketing/ (ads), apps/hq and the rest of deploy/hq (owner's own tool), scripts/legal_pages.py.
- JSX text that follows a {value} on the same line (e.g. `{count} members only`) can be missed; a string cut by an apostrophe in JSX text is limited to its own line.
- hinglish.ts: an English line already listed from its screen is dropped; 56 rows remain (Hinglish lines with an English trigger word, or English lines found nowhere else).
- supabase/migrations: an older migration's sentence may have been replaced by a later one; both are listed.
- Git HEAD (c3bfc41b) holds a mid-run copy of both output files (1566 rows, before the last two fixes). The working tree has the final 1556-row version; it still needs the coordinator's commit.
