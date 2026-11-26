# L18-hq-app checkpoint

## LESSONS for the next L18 helpers
1. Read the brief, then the items file; skip features.json. improvements.jsonl did not exist yet on 27 Nov: nothing to reuse there.
2. Before writing ideas, list your surface's findings titles with a 5-line node one-liner over findings.jsonl (id, severity, title). Your area may already hold 90+ findings; an idea that repeats a finding is a duplicate, skip it.
3. The feature list's first-entry line numbers can be stale (they pointed past the end of app.js). Grep function names to find the real lines.
4. Read only the screens that carry daily work (home/needs, lists, one record page, reply/contact cards): about 350 lines was enough for 10 ideas.
5. Improvement rows need no area/lens/refs: id, expert, surface, what, why, evidence (path:line, at least 1), impact high|med|low, impact_why, effort S|M|L, type, my_view starting "My view:".
6. The grid row holds both items (L18.1, L18.2) as "checked"; finding_ids stays [] unless something is actually broken. IM- ids never go in finding_ids.
7. Competitor features: name the product and say "as known by Jun 2026, not re-checked live"; web fetching them is not worth the tokens.
8. Write rows with a small node script (JSON.stringify), then lens-cover and merge --dry; the "no --blind file" warning is expected.
9. Store listing and website conversion belong to the store and website areas, not an internal screen; say so and move on.

## Progress
- 2026-11-27 L18.1 checked: 10 improvement rows (IM-L18-hq-app-01..10).
- 2026-11-27 L18.2 checked: every row is a "My view:" proposal, nothing built.
- lens-cover ok; merge --dry 11 read, 11 passed, 0 rejected. DONE.
