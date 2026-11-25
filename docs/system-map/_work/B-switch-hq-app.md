# B-switch-hq-app checkpoint

## LESSONS for the next B-switch helpers
- Read first: the items file, then `journeys/F-<area>-NNN.json` (gives the `writes` entities per feature; features.json has no writes field), then `readers.json` filtered by those entities (a quick node one-liner). That list is the should-read map in 2 minutes.
- readers.json misses readers that sit inside SQL functions (e.g. gym_page_off is read in 0090's gym_page_public but readers.json lists only HQ). Grep `supabase/migrations` for the table name before calling a reader missing.
- For SQL functions, always open the LATEST migration that redefines the function (`grep -ln "function public.<name>"`, take the highest number).
- "Should-read" for an HQ/admin area mostly means: other surfaces (panel, member app, public page, SQL) reading the switch. You will leave apps/hq/public; that is expected, keep reads small.
- H6.1 field-fill.csv only has member fields; an HQ-type area reads none of them. Say so, and count the area's own fields with one Crispy-Curves-filtered query (allowed).
- H6.4: the mobile rule is a shared, tested twin (logic.js); test it in seconds with `node --input-type=module -e "import {cleanMobile} from './apps/hq/public/logic.js'..."`. Spend the time on OTHER boxes with maxlength (IFSC, codes, account numbers).
- Skip: hunting in docs/, re-reading findings.jsonl whole (grep by feature id and by words), the dashboard UI files.
- Heredocs with quotes broke in Git Bash: write the row-maker script with the Write tool, run with node.
- merge --dry prints a "no --blind file" warning; it still passes.

## Done
- 2026-11-25 H1.1-H1.4 (gap-1) checked: 3 new findings (01-03), reused FN-L4-hq-app-05, FN-L14-hq-app-05.
- 2026-11-25 H6.1-H6.5 (gap-6) checked: 1 new finding (04). Crispy Curves gym row: trial dates filled, plan empty (on trial), 1 owner with phone.
- lens-cover ok; merge --dry 6/6 passed.
