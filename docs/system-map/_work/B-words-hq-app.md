# B-words-hq-app checkpoint

## LESSONS for the next B-words helpers (pilot, 25 Nov 2026)
1. Read first: the brief, then _work/items/<item>.txt (the item list is printed twice in the brief and the items file; the feature list repeats too - read once). Skip the long `ls` of _work: you need only out/, items/, briefs/.
2. Do not read UI files whole. Pull every user string out with a tiny script (regex over quoted strings, length >= 10 and containing a space) into a scratch file: ~300 lines for a 1,300-line file. Then check only the strings that PROMISE something (times, "every", "never", "kept N", "within a minute", "gets a pop-up").
3. Before writing a finding, list existing findings for your area: grep '"area":"<area>"' findings.jsonl and print id|severity|title only. About half of the word faults were already filed by earlier lenses (L4, L5, L14, B-alerts, B-truth); reuse their ids in finding_ids.
4. Following a promise end to end often leaves the area (server, database migrations, the other app). One grep per claim is enough; do not read those files wide.
5. Silent buttons: check the shared button helper once (what happens when it fails with no message box), then list the buttons built without one with a small script; do not eyeball every call.
6. Phone width: grep the CSS for nowrap, min-width and fixed widths first; then look for buttons with long or variable words (a gym name inside a button) outside the wrapping row rule.
7. Evidence format: a picture or a file with no line breaks (png, one-line svg) must be written "pic:<path>", not "path:1"; merge --dry rejects it otherwise, and --dry does NOT write the rejects file, so read evid() in merge.mjs for the allowed forms.
8. Unclear in the brief: the "Hindi read-aloud list" and "Hinglish" parts of L10.1 do not apply when the surface has no Hinglish (HQ is English only) - say so in the evidence. "Banned words": no list is given in the brief; no list was checked.
9. The extra row rules in the coordinator's message (sources, at_step) are for feature and journey-type rows, not finding or grid rows.

## Progress
- L10.1 done (lens 10): findings 07, 09; reused FN-L14-hq-app-05, FN-L5-hq-app-03.
- H10.1-H10.16 done (gap-10): findings 01-06, 08; reused FN-B-alerts-hq-app-a-01/-03/-04, FN-B-truth-hq-app-b-02, FN-L4-hq-app-02/-04, FN-L14-hq-app-02, FN-A3-website-1-01.
- lens-cover ok; merge --dry 11 rows, 0 rejected.
- Note for later: "Nothing is locked when the free trial ends" (app.js:446) is true only while the plan gate (migration 0062) is off; it goes false when the gate is switched on.
- Code lines read: about 900 (well under 3,000).
DONE.
