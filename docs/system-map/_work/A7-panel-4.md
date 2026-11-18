# A7-panel-4 checkpoint

Candidates: promises.txt lines 837-847 (11). All done.

- 837 done: row P-A7-panel-4-01 (kept)
- 838 not a promise: apps/dashboard/src/crm/ui/screens/WorkoutPlans.tsx:671, hint under an optional "+ kg added" box saying what a blank box means; no commitment
- 839 not a promise: deploy/panel/phoneCode.js:382, the reason text goes only to console.warn (refused(), phoneCode.js:173-176); the user gets WRONG_CODE, never this sentence
- 840 not a promise: deploy/panel/voice.js:107, error message for an empty voice clip ("We heard nothing. Try again, closer to the phone."); says what went wrong, promises nothing
- 841 not a promise: deploy/panel/voice.js:157, same error message when the speech-to-text answer is empty
- 842 done: row P-A7-panel-4-02 (kept)
- 843 done: row P-A7-panel-4-03 (unknown: code only, no test opened for the expiry row)
- 844 done: row P-A7-panel-4-04 (kept)
- 845 done: row P-A7-panel-4-05 (kept)
- 846 done: row P-A7-panel-4-06 (partly: wording replaced by 0089; which is live is unknown)
- 847 done: row P-A7-panel-4-07 (kept)

Could not check
- Which alert wording is live (0088 or 0089): needs the live function text; no database reads in this step.
- Whether the panel's AI wallet screen shows the ledger note text (843, 844): screen file not opened (size limit).
- Whether the panel's "online" flag matches the server's GYM_NOT_ONLINE test (837): not opened.
- Which screen shows the "Not recorded" sentence itself (847): not opened.

Lines read: about 390. Rows written: 7. No temp files made outside the repo.
