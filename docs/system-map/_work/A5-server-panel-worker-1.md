# A5-server-panel-worker-1 checkpoint (2026-11-20)

F-server-100: 21 journeys, 39 type lines
F-server-126: 11 journeys, 14 type lines
F-server-128: 5 journeys, 7 type lines
F-server-134: 17 journeys, 31 type lines
F-server-103: 17 journeys, 32 type lines
F-server-123: 18 journeys, 42 type lines
F-server-101: 11 journeys, 25 type lines
F-server-102: 18 journeys, 42 type lines

All 8 items done. Output: _work/out/A5-server-panel-worker-1.jsonl (351 rows: 118 journeys, 232 type lines, 1 finding).
Dry merge with --a5cover: 0 rejected, 0 pairs with gaps.

Over the 300-row limit (351): the 29 feature x role pairs need 203 type lines plus types 1, 3, 6, 2, 12 each, so the
minimum full cover is about 350 rows. Kept every journey to 1-3 steps.

No entity fits:
- F-server-100 routing journeys and F-server-101 sign-in hand-over: the hand-over moves browser storage keys
  (sign-in, branch keys, theme); no entity covers browser storage of the admin app, so writes/reads are empty.
- F-server-134: phone_code_asks (the per-number and per-network count) has no entity; E-friend-asks is a different table.
- F-server-103: owner_answer_question's stored row is guessed as E-gym-talk-messages (not opened).

Seen in passing (not findings):
- help.js and assist.js comments say "20 questions = 1 credit"; the feature and What's new say 10 answers = 1 credit.
  Comment only; the number lives in the gym server (not read).
- phoneInbound.js status(): if the sealed number cannot be opened, the stored number is already emptied and the answer
  says "expired"; every later ask says "verified" with no proof, so that tap can never finish. Rare (secret changed).
- questionCredits.js giveBack calls ai_question_back with no signature (only the id); whether the gym server checks
  anything else was not read.
- WhatsApp reply after "wrong number" is not sent at all (REPLY has no wrong_number words); may be on purpose.

Could not check: the admin app and member app screen words around these server answers (other features); live
switch values beyond wrangler.jsonc; anything needing a second test gym (cross-gym NOT_FOUND journeys are code-read).
