A8 LAUNCH RULES (read before your brief; they win over it where they differ)
PILOT LESSONS (A8-hq-app-2):
- The candidate test list is noisy (most picks share words only). ALSO search docs/system-map/_sources/test-index.jsonl for this surface's own server and database tests (supabase/tests, server tests, flow tests); those are often the real cover.
- A gap in coverage worth fixing = a finding with lens "1". Search findings.jsonl first; a fault already listed = coverage row only, no new finding. "No test signs in as a trainer" is already FN-A8-panel-auth-data-2-05.
- A test that checks only the server's answer, not the screen, makes a "see" line partial: write "(data only)" in the row.
RULES:
- Never open: anything under D:\Brain\Dev-Framework\, docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md, docs/system-map/AUDIT-STATE.md, the audit plan.
- ANALYSIS ONLY. No commit, no push. Change no file outside docs/system-map/. Never run git yourself.
- Never count, list or read across all gyms, not even totals. Crispy Curves only (7990a942-57f3-4154-bbaf-935bab0aa342).
- Never call a journey covered because a test has a similar name: open the test and check it checks the expected result.
- Machine rows: cite as machine:<file>.json#<json path>. root_cause_key 3-6 dash words.
- Ignore the CONTEXT METER hook number; your limits are the ones in your brief.
- Temp files OUTSIDE the repo, in a folder named after your item id. No scratch folder in docs/system-map/_work.
- Before you report, run from docs/system-map: node _tools/a8-cover.mjs <id> and node _tools/merge.mjs <id> --dry . Fix rows until both pass. Never merge without --dry.
- Nothing heavy on this laptop: no builds, test suites or dev servers. Never leave a Node job running.
- End your report with one line: TOKENS <rough token use> | <one-line result: journeys, full/partial/none, findings>.
