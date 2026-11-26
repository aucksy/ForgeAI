# Brief: R-cards-04 (audit plan 4B, the final report cards). Writing only, analysis only.

You write report cards for Aakash, who owns MettleUp (gym software: an owner and desk panel, a member phone app, a
watch app, websites). He is a product manager, not a coder. He will read these on his phone. His words: "The audit
report should be simple enough for me to also understand with enough context behind each finding."

Your groups: `docs/system-map/_work/report/cards-04.txt` (about 20 problem groups, in order). For each group, find
its row in `docs/system-map/_work/report/cards.json` (members, severity, top finding). Read each member finding in
`docs/system-map/findings.jsonl` and the group's check in `docs/system-map/verify-results.jsonl`, searching by id.
Never read either file whole. The check's "why" field is a second helper's reading of the code: where it corrects or
narrows the finding, the check wins. You may open a code file only to understand a step a member would take.

## Card format (Markdown), one per group, in the given order

```
### <plain title, at most 12 words, says what goes wrong>

**How bad:** Serious|Medium. <one line why: money, data lost, privacy, trust, or looks>
**What you would see:** <the screen and steps, as a gym owner, desk staff, trainer or member meets it; 2-4 sentences>
**Who it hurts and how often:** <owners / desk / trainers / members; every time, or only in one case (say which)>
**Proof:** <"Found by reading the code" or "Proven on screen" (only if a finding has a picture or a driven run)>. <the exact steps that would show it, in one or two sentences>
**Fix:** <one line>. Size: small|medium|large.
**Your decision:** No. | Yes. My view: <your pick and why, in one line>. <at most 2 options, each one line>
Finding: <top finding id>; also <other member ids, if any>
```

Use "Serious" for S1 and S2, "Medium" for S3. If a fix touches a product choice, legal or privacy wording, money or
what members are promised, the decision is Yes.

## Plain English rules (hard)
- No code words: no file names, paths, function, table, column or variable names, no "RPC", "API", "null",
  "migration", "endpoint", "flag", "cron", "token", "Worker", "RLS", "CI". Say what it means instead ("the nightly
  clean-up", "a setting switched off in the app", "the cloud tests").
- Short sentences, active voice, one idea per sentence. Name real things he knows: Today, Members, the bell, the
  check-in screen, Google Play, WhatsApp.
- Each card stands alone: no "see above", "as noted", "this group", "the finding".
- If a fault cannot happen today because a feature is switched off, say so in "Who it hurts".
- Numbers stay (counts, days, rupees). Never invent a number or a step that is not in the rows.
- Before saving, re-read each card as him: could he act on it with no other page open? If not, rewrite it.

## Output
- `docs/system-map/_work/report/cards-04.md`: the cards only, no header, in the given order.
- Checkpoint `docs/system-map/_work/R-cards-04.md` (which groups are done) every 5 cards.
- Any script you write must have "rc04" in its name; never a generic name. Before your final reply, check one card
  per group in your list.

## Rules
No git. Never open the audit plan, OWNER-INBOX, CLAUDE-NOTES or AUDIT-STATE. Change no file outside
`docs/system-map/_work/`. Nothing heavy on the laptop. No database, no network calls. Size: about 150k tokens; if
you near it, save and stop. Final reply, at most 8 lines: cards written, any group you could not write and why,
approximate tokens.
