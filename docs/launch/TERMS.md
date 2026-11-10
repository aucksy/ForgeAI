# Moved: the terms of use is no longer kept here

Since 10 Nov 2026 (R-445, owner: "all as recommended") the one source of the terms of use is
`docs/legal/terms.body.html`. `python scripts/legal_pages.py` builds the published page in
`apps/dashboard/public/` from it, and `apps/dashboard/test/crm/legalPages.test.ts` fails if the two differ.

Do not write legal text here: this file is never published. The old text (last version before the
rewrite) is in git history: `git show ec4e50e1:docs/launch/TERMS.md`.
