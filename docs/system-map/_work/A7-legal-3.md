# A7-legal-3 checkpoint

Source group: legal pages, part 3 of 3. Candidates: lines 241 to 290 of docs/system-map/_sources/promises.txt (all in apps/dashboard/public/terms.html).
Output: docs/system-map/_work/out/A7-legal-3.jsonl (31 rows, P-A7-legal-3-01 to P-A7-legal-3-31).

## Finished units
- unit 1 DONE: terms.html "In short" + part A, for members (candidates 241-263) -> rows 01-14, 9 not a promise
- unit 2 DONE: terms.html part B, for gyms (candidates 264-287) -> rows 15-31, 7 not a promise
- unit 3 DONE: terms.html "What changed" line (candidates 288-290) -> 0 rows, 3 not a promise
- ALL 50 candidates handled: 31 rows + 19 not a promise. Nothing left.
- Status count: kept 8, partly 11, GAP 2, unknown 10.

## Not a promise
- not a promise: apps/dashboard/public/terms.html:27, names the two parties ("we"); a definition
- not a promise: apps/dashboard/public/terms.html:38, "We keep improving the app." A general line, nothing to keep or check
- not a promise: apps/dashboard/public/terms.html:42, "We may add, change or correct them at any time..." A right MettleUp keeps and a disclaimer, not something it must do
- not a promise: apps/dashboard/public/terms.html:60, a duty of the member ("Do not post another person's private details.")
- not a promise: apps/dashboard/public/terms.html:60, a duty of the member ("Only give a friend's details in "Bring a friend" if they agreed.")
- not a promise: apps/dashboard/public/terms.html:60, "We may remove anything that breaks these rules." A right MettleUp keeps
- not a promise: apps/dashboard/public/terms.html:69, "We may stop your access if you misuse the app..." A right MettleUp keeps
- not a promise: apps/dashboard/public/terms.html:72, "We work hard ... but we cannot promise it will never fail." A disclaimer; it says what is NOT promised
- not a promise: apps/dashboard/public/terms.html:72, "As far as the law allows, we are not responsible for indirect losses." A limit on responsibility
- not a promise: apps/dashboard/public/terms.html:88, "We may give a longer trial." A right MettleUp keeps (HQ can, up to 6 months: supabase/migrations/0030_plans_and_trials.sql:135)
- not a promise: apps/dashboard/public/terms.html:110, a duty of the gym ("Only add people who need access, and remove them when they leave.")
- not a promise: apps/dashboard/public/terms.html:111, a duty of the gym's staff ("Each person uses only their own sign-in and never shares a PIN or code.")
- not a promise: apps/dashboard/public/terms.html:112, a duty of the gym's staff ("Staff use members' details only for the gym's work...")
- not a promise: apps/dashboard/public/terms.html:113, a duty of the gym ("Never change a receipt to hide money.")
- not a promise: apps/dashboard/public/terms.html:131, "We work to keep the admin app running ... but we cannot promise it will never stop." A disclaimer
- not a promise: apps/dashboard/public/terms.html:134, "We are not responsible for lost profits or indirect losses." A limit on responsibility
- not a promise: apps/dashboard/public/terms.html:142, the "What changed" line (18 Nov 2026 entry): a record of an edit, it repeats section 4
- not a promise: apps/dashboard/public/terms.html:142, the "What changed" line (10 Nov 2026 entry, "we rewrote the terms in simpler words"): a record of an edit
- not a promise: apps/dashboard/public/terms.html:142, the "What changed" line ("New for gyms: the free trial, plans and payment..."): a list of sections, a record of an edit

## Could not check
- Whether migrations 0060 (Pay MettleUp), 0061 (one trial per phone number) and 0062 (plan gate) are live: this step has no database reads. Their headers say "NOT APPLIED" at the time they were written.
- Refunds, "we answer within 30 days", "30 days' notice", "delete within 30 days": done by hand; no code or log proves the time limit.
- Whether a member can join a gym with no sign-in at all (matters for row 05).
- Tests named in file headers (supabase/tests/0030, 0060, 0062; apps/dashboard/test/crm/legalPages.test.ts) were not opened, to stay inside the read limit. Only deploy/panel/pay.test.mjs:113-133 was opened.
- Cashfree, PayU and PhonePe adapters and the plain UPI request were not read (rows 08 and 25).

## Read count
About 900 lines read (limit 1,500). 31 rows written (limit 120).
