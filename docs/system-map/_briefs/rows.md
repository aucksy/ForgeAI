# Row formats: one example per kind

EVERY ROW BELOW IS MADE UP. They are not real findings, features or files. Copy the shape, never the content.

A helper writes one JSON object per line into `docs/system-map/_work/out/<work item id>.jsonl`.
`_tools/merge.mjs` checks every line. A line that fails goes to `_work/rejects/<work item id>.txt` and the item is not done.

Rules for every row:
- Every field shown is required. An unknown value is the word "unknown". Never empty, never a guess.
- Evidence forms: `path:line` or `path:line-line` (repo path, checked: the file and the line must exist),
  `run:<CI run id>`, `pic:<repo path>` or `pic:run:<run id>/<file>`, `data:<count and what was counted>`,
  `machine:<file under _sources/machine>#<row>`, `url:<address>`, or `unknown`.
- An id a row points to must exist already, or be in the same file.
- Ids of reader, promise, finding and improvement rows carry the work item id (`<WI>` below), so two helpers never clash.
- To change a row another work item wrote, send only `kind`, `id`, `"patch": true` and the fields to change.
- `title`, `what`, `who`, `how_often`, `fix_line` are plain words for the report card: no file or function names.

## feature (id F-<surface>-<nnn>; `sources` = lines of an _sources file, `<file>#<line>`)
```
{"kind":"feature","id":"F-panel-014","surface":"panel","area":"panel/pay","name":"Collect dues","roles":["owner","staff"],"switch":"none","tier":"free","entry":["apps/dashboard/src/crm/pay/DuesSheet.tsx:41"],"status":"live","sources":["panel.txt#212","panel.txt#213"]}
```
status: live | behind switch | hidden | unknown | not-a-feature (a source line that is no feature; say why in `name`).

## entity (id E-<name>)
```
{"kind":"entity","id":"E-payment","name":"Payment","stored":["table payments","phone local storage key lastReceipt"],"fields":["amount","paid_on","member_id","mode"],"visible_to":["owner","staff","member (own only)"],"personal":"yes","retention":"unknown","evidence":["supabase/migrations/20260101000000_payments.sql:12-30"]}
```
personal: yes | no | unknown.

## reader (id RD-<WI>-<nn>)
```
{"kind":"reader","id":"RD-A4-panel-01-07","entity":"E-payment","reader_kind":"count","where":"apps/dashboard/src/crm/today/TodayCards.tsx:88","surface":"panel"}
```
reader_kind: screen | list | badge | count | digest | notification | export | job | ai-answer | not-a-reader
(not-a-reader also needs `"reason":"..."`).

## journey (id J-<feature id>-<nn>)
```
{"kind":"journey","id":"J-F-panel-014-01","feature":"F-panel-014","role":"staff","type":1,"generated":false,"start":"Members list, member with dues","steps":[{"n":1,"action":"Tap the member, tap Collect","user_sees":["Sheet titled 'Collect dues'"],"must_not":["Amount is empty or zero by default when dues exist"]}],"writes":["E-payment","E-membership"],"reads":["E-member"],"promise_ids":[],"tests":[],"coverage":"unknown","last_result":null}
```
type: 1-12. coverage: full | partial | none | manual-only | unknown. tests: `{"path":"<test file>","checks":"<what it really checks>"}`.
Every step needs at least one `user_sees` and one `must_not` line.

## promise (id P-<WI>-<nn>)
```
{"kind":"promise","id":"P-A7-legal-01-03","text":"We never share your phone number with other gyms.","page":"Privacy page, section 4","where":"scripts/legal_pages.py:210","kept_by":["unknown"],"proof":"unknown","status":"unknown"}
```
text = the exact sentence. kept_by: journey ids, `path:line`, or the name of a written process. status: kept | partly | GAP | unknown.

## finding (id FN-<WI>-<nn>)
```
{"kind":"finding","id":"FN-L3-server-02-07","date":"2026-11-20","lens":"3","surface":"server","area":"server/pay","refs":["J-F-panel-014-01"],"severity":"S1","title":"A staff login can change another gym's dues","what":"A desk login from one gym can save a payment against a member of another gym.","expected":"The save is refused unless the member belongs to the caller's gym.","evidence":["deploy/panel/joinPay.js:118-131"],"proof":"code-read","root_cause_key":"dues-rpc-no-gym-check","who":"owners","how_often":"every time","fix_line":"Check the caller's gym inside the save","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
```
severity: S1 money wrong, personal data against a promise or the law, data lost, legal promise broken, locked out |
S2 a journey cannot be finished or a screen shows wrong facts | S3 confusing, misleading, extra taps, wrong words,
layout cut off | S4 polish and ideas. proof: driven | code-read | data-count | machine.
root_cause_key: 3-6 lower-case words joined by dashes, naming the cause. fix_size: small | medium | large | unknown.
verified: "pending" (the verify step changes it). status: open | his call | fixed in R-<n>. lens: a lens number or "gap-<n>".

## improvement (id IM-<WI>-<nn>)
```
{"kind":"improvement","id":"IM-X1-panel-designer-04","expert":"Product designer","surface":"panel","what":"Show the amount due on the member row, so staff need not open the sheet","why":"Desk staff open every member to see who owes money","evidence":["pic:run:1234567890/members-list.png"],"impact":"high","impact_why":"Used at every rush hour by every desk","effort":"S","type":"quick win","my_view":"My view: do it; one line on a list that already loads the number."}
```
impact: high | med | low. effort: S | M | L. type: quick win | feature | redesign | remove.

## grid (one row per surface x area x lens; no id needed)
```
{"kind":"grid","surface":"server","area":"server/pay","lens":"3","checked_on":"2026-11-20","items":[{"item":"L3.1","status":"checked","evidence":["deploy/panel/joinPay.js:118-131"],"finding_ids":["FN-L3-server-02-07"]},{"item":"L3.6","status":"does-not-apply","reason":"no uploads in this area","evidence":[],"finding_ids":[]}]}
```
item status: checked (needs evidence) | does-not-apply | could-not-check (both need `reason`).
Every item id the brief lists must have one entry.
