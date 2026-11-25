# B-alerts-panel-shop-b checkpoint
## Items
- started 26 Nov 2026
- read lens rules, pilot lessons, brief, items list; about 900 code lines read.
- Automatic actions here: automatic reminders (no record: reuse logic-1-b-02), workout offer auto-give (record: given line, ok), timed in-app message (Sent list + seen count; reuse assistant-b-03), alerts with the app closed (only test alert has a record: reuse logic-2-b-01), new-order toast (the order itself is the record, ok).
- H3.1/H3.2 done. No new finding.
- H4.1-H4.8 done: marks: news seen on Today = this browser (reuse logic-1-b-01); Member messages last read = this browser, questions = page memory (only used when the server done list 0098 is missing; with 0098 the server decides); bell read/opened/X = server; shop counts agree (bell, Shop card, toast all on 'ordered'); server marks orders, messages, questions, requests, links, enquiries done by itself. Reuse logic-1-b-03, forms-b-02, logic-2-b-02.
- Not confirmed: whether 0098 is applied on the live server (no catalog read done; fallback path is browser-only).
- Output: 0 new findings, 2 grid rows.
- lens-cover ok; merge --dry 2 of 2 passed. DONE.
