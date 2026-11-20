#!/bin/bash
# lens finish: lf.sh <id> <tokens> "<line>"
set -o pipefail
cd "/c/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit/docs/system-map" || exit 1
id=$1
node _tools/lens-cover.mjs $id | tail -1 || exit 1
node _tools/merge.mjs $id --blind "C:/Users/Aakash Pahuja/.claude/audit-blind-patterns.txt" | tail -2 || { echo REJECT; cat _work/rejects/$id.txt | head -5; exit 1; }
node _tools/state.mjs done $id $2 "$3" && node _tools/state.mjs summary >/dev/null
cd ../.. && git add docs/system-map && git commit -q -m "Audit: $id merged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" 2>/dev/null
for i in 1 2 3; do git pull -q --rebase origin main 2>/dev/null; git push -q origin HEAD:main 2>/dev/null && break; done
git log --oneline -1
