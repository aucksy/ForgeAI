# A7-legal-2 checkpoint

Source: docs/system-map/_sources/promises.txt lines 121-240 (legal, part 2). Output: docs/system-map/_work/out/A7-legal-2.jsonl

## Finished units
- unit 1 DONE: promises.txt 121-209 (privacy.html:130-474) -> rows P-A7-legal-2-01 to -72
- unit 2 DONE: promises.txt 210-238 (refund.html) -> rows P-A7-legal-2-73 to -93
- unit 3 DONE: promises.txt 239-240 (terms.html) -> row P-A7-legal-2-94
- ALL 120 candidates handled: 94 rows + 26 "not a promise" lines below. Nothing left.

## Not a promise
- not a promise: apps/dashboard/public/privacy.html:160, table cell fragment ("Everything we keep on our server"), says what Supabase holds, no act promised
- not a promise: apps/dashboard/public/privacy.html:166, table cell fragment ("Our private bug list")
- not a promise: apps/dashboard/public/privacy.html:171, heading ("How long we keep it")
- not a promise: apps/dashboard/public/privacy.html:192, table row label ("Records of support looks and gym deletion requests")
- not a promise: apps/dashboard/public/privacy.html:199, heading ("Delete your data")
- not a promise: apps/dashboard/public/privacy.html:215 ("Tell us the Google email or mobile number..."), an instruction to the reader
- not a promise: apps/dashboard/public/privacy.html:215 ("...you can complain to the Data Protection Board of India"), a legal right outside the product
- not a promise: apps/dashboard/public/privacy.html:222, heading ("How we protect it")
- not a promise: apps/dashboard/public/privacy.html:237 ("The law lets us use your data only for a reason it accepts"), a statement about the law
- not a promise: apps/dashboard/public/privacy.html:239 ("Contract: we need the data..."), a definition
- not a promise: apps/dashboard/public/privacy.html:244, table header ("What we do")
- not a promise: apps/dashboard/public/privacy.html:248, table row label ("What always goes to your gym...")
- not a promise: apps/dashboard/public/privacy.html:275 ("This does not change what we did with your consent before"), a statement about the law
- not a promise: apps/dashboard/public/privacy.html:282 ("the table in section 6 applies to you too"), a pointer; the section 6 rows are their own candidates
- not a promise: apps/dashboard/public/privacy.html:290 ("Earlier the same day: MettleUp is now on Google Play in the EU..."), change log
- not a promise: apps/dashboard/public/privacy.html:290 ("It says who is responsible for your data..."), change log describing the notice
- not a promise: apps/dashboard/public/privacy.html:291 ("10 Nov 2026: we rewrote the whole notice..."), change log
- not a promise: apps/dashboard/public/refund.html:2, page title
- not a promise: apps/dashboard/public/refund.html:14, heading
- not a promise: apps/dashboard/public/refund.html:15 ("Your membership fees and refunds at your gym are between you and your gym"), a disclaimer
- not a promise: apps/dashboard/public/refund.html:17, heading ("The free trial")
- not a promise: apps/dashboard/public/refund.html:20, heading ("We never charge you automatically"); the body sentences on line 21 are rows 76 and 77
- not a promise: apps/dashboard/public/refund.html:23, heading ("Payments are not refunded"); the body sentence on line 24 is row 79
- not a promise: apps/dashboard/public/refund.html:24 ("Please use the 3 free months to try MettleUp before you pay"), a request to the reader
- not a promise: apps/dashboard/public/refund.html:35, heading ("How a refund is paid")
- not a promise: apps/dashboard/public/terms.html:21 ("The exercise pictures and animations are only a guide"), a disclaimer

## Could not check
- Whether migration 0097 (direct-read record) is live: its header says NOT APPLIED LIVE; this step has no database reads.
- Whether the secret SARVAM_API_KEY is set on the live Worker (decides if spoken AI Assistant requests go to Sarvam).
- Human processes (answer in 30 days, leak notices, refunds, under-18 deletion, call-back-only use of demo leads): no written process in the files this step may open; searching docs/ was not allowed.
- Tests were mostly cited by line, not opened in full; no CI run id read. Rows say so where it matters.
- Not read: deploy/panel/pay.js, joinPay.js, 0060, 0062, 0063, the Health Connect code, the app half of "delete an item".
