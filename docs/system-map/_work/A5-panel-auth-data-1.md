# A5-panel-auth-data-1 checkpoint

Output: docs/system-map/_work/out/A5-panel-auth-data-1.jsonl (175 rows: 70 journeys, 102 type lines, 3 findings)

F-panel-1004: 9 journeys, 15 type lines
F-panel-1003: 10 journeys, 14 type lines
F-panel-1015: 5 journeys, 7 type lines
F-panel-1007: 10 journeys, 14 type lines
F-panel-1013: 12 journeys, 24 type lines
F-panel-1025: 5 journeys, 7 type lines
F-panel-1008: 7 journeys, 7 type lines
F-panel-1010: 6 journeys, 7 type lines
F-panel-1011: 6 journeys, 7 type lines

All 9 features (14 feature x role pairs) done. Code lines read: about 2,450 of 3,000.

## Findings written (3, the limit)
- FN-A5-panel-auth-data-1-01: new PIN saved, then sign-in fails; the retry says the check ran out.
- FN-A5-panel-auth-data-1-02: hidden anti-robot box value never sent in the send-a-code way.
- FN-A5-panel-auth-data-1-03: sign-out words ask for a new code even when the person has a PIN.

## Entities
- No entity fits two things kept only in the browser: the browser-only gym copy (and the copy "kept aside" after going online), and the typed job that waits in the browser on an older server. Left out of writes/reads.
- No entity for the device's box of unsent saves; E-crm-records was used as the nearest (the records those saves become).

## Seen in passing (not written as findings: not sure, or over the limit of 3)
- Other ways back in, line 1 tells every reader to tap "Make sign-in code" next to their name; a front desk person has no such button (line 2 does say staff must ask the owner). apps/dashboard/src/crm/auth/signin.ts:433
- Other ways back in, line 3 is cut around the email address; if the Hinglish line does not hold that exact address the mail link is not drawn. Hinglish file not opened. apps/dashboard/src/crm/auth/ForgotPin.tsx:75
- Put gym online: retiring the old way in can fail silently (the error is dropped), so the old key may keep opening the gym with no word to the owner. apps/dashboard/src/crm/auth/GoOnlineCard.tsx:173
- Put gym online: the browser copy is re-read at most 3 times; something saved in another tab after the third round is set aside with the old copy, not copied up. apps/dashboard/src/crm/auth/GoOnlineCard.tsx:166
- After going online (and after sign-out) the older browser copy stays in this browser under a "before-online" name; sign-out does not clear it. Shared-computer privacy question. apps/dashboard/src/crm/auth/AuthProvider.tsx:85
- Add a person as Trainer when the mark fails: the toast says "Tick Trainer on their row", but on a server without the trainer part the tick is hidden. apps/dashboard/src/crm/auth/PeopleScreen.tsx:393
- A person with a typed job who is also ticked Trainer shows only the job pill; the row never says Trainer. apps/dashboard/src/crm/logic/staffJobs.ts:71
- A trainer's own "You" card pill reads "Staff". apps/dashboard/src/crm/auth/PeopleScreen.tsx:273
- Trainer tick has no busy state: fast tick/untick sends two saves. apps/dashboard/src/crm/ui/TrainerParts.tsx:82
- Staff view: a failed PIN-status read is only logged, so with no internet the PIN line and button vanish with no word. apps/dashboard/src/crm/auth/PeopleScreen.tsx:208
- "Sign out other devices" clears the owner's own PIN; the sheet says so only when the server reports PINs. apps/dashboard/src/crm/auth/PeopleScreen.tsx:426
- Forgot-PIN reset sets the PIN for every staff row with that number and does not sign other devices out. supabase/migrations/0061_phone_codes.sql:129
- Most of Staff & sign-in, the code sheet, the confirm sheets and the Put-online card are plain English, not in the language file, while Add a person is: mixed languages in Hinglish.
- An owner can make a code for a staff person and sign in as them (and set their PIN within 15 minutes); receipts then carry the staff name. Whether the access log shows who made the code was not checked.

## Could not check
- The exact words of the link on Sign in that opens the forgot-PIN card, and the waiting-step words of "Verify with WhatsApp" (that file was not read; outside the entry points).
- Server rules not read: whether a second sign-in code cancels the first; whether a removed number can be added again; whether owners get a Trainer tick; what happens to a trainer's members when unticked; the too-many limits.
- How fast a signed-out or removed device notices (the polling code was not read).
- Nothing was run or driven: every journey is from code reading; coverage is "unknown" on every row and no test was opened.
- No database call was made.
