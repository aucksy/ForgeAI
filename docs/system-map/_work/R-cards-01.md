## LESSONS (pilot, for the next 8 helpers)
- Pull your groups' rows in one go: copy report/rc01_extract.py (rename to your own id), it prints card row + check + member findings, no evidence lists. ~45 KB for 20 groups; one read, no repeated searches.
- The check's "why" often narrows the finding (S1 to S2, "the caption already says so", "may already be fixed since"). Put that narrowing in "How bad" or "Who it hurts"; it was the main source of nuance.
- "verified: unsure" rows are usually release/live-state questions: say "may already be fixed" and make the Proof step a Google Play Console look, never a guess.
- Titles over 12 words were the commonest slip: count words with a script before saving.
- Hardest to say plainly: background copy/sync and sign-in mechanics. Describe what the member taps and sees ("taps Undo, the workouts reappear"), never how the copy works.
- Swap code-ish words in findings too: "push address" = "allows notifications", "flag/key on the server" = "a Sarvam key saved on our server".
- Decision = Yes for any privacy wording, money, member promise or release; needs_him in the row is only a hint (G-0011, G-0111 were Yes though needs_him false).
- Keep numbers from rows, but date-stamp counts that the check did not re-run ("at the last count").

## Status
Done: all 20 groups in report/cards-01.txt, written to report/cards-01.md in order.
G-0013, G-0010, G-0015, G-0006, G-0011, G-0019, G-0002, G-0004, G-0007, G-0009,
G-0021, G-0031, G-0042, G-0061, G-0065, G-0097, G-0102, G-0111, G-0147, G-0149.
Checked: 20 titles, 20 decisions, 20 Finding lines; code-word scan clean.
Scripts: report/rc01_extract.py, report/rc01_titles.py.
