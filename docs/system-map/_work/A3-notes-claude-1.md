# A3-notes-claude-1 checkpoint

Source: docs/system-map/_sources/claude-notes-redacted-part01.md (600 lines, read whole in 100-line slices).
Output: docs/system-map/_work/out/A3-notes-claude-1.jsonl (1 feature row, 7 finding rows).

## Unit 1 DONE: lines 1-600 read, every named feature listed and looked up (19 Nov 2026)

Not product features (no row): the audit itself, model/pacer notes, change-360 flow, CI and release run notes, test-only fixes (R-602), house writing style, Supabase MCP setup.

| Source line | Feature the notes name | Result |
|---|---|---|
| 31-35 | Terms: exercise pictures are only a guide | matched F-web-139 (text is in the repo terms page; notes say not live until the next panel deploy) |
| 49-57, 371-396 | Watch update pop-up on the phone (Later = 24 h, waits for an out-of-reach watch) | matched F-phone-1312, F-phone-633, F-watch-118; finding 07 |
| 57 | Watch cards only with a connected Wear OS watch (intro slide, start card, after-workout card, Settings row) | matched F-phone-1601, F-phone-821, F-phone-1311, F-phone-632, F-phone-218; finding 06 |
| 382 | Test stand-in link for the watch update pop-up | matched F-phone-634 (not a feature) |
| 87-143 | Automatic birthday wish on the member's phone at 9:30 am | matched F-phone-408, F-phone-335, F-server-330 |
| 108-143 | AI Assistant / Today count only birthdays with no automatic wish; "See who" | matched F-panel-610, F-panel-911, F-panel-912; finding 02 |
| 132-134 | Birthdays today tile; Messages > Birthday wish | matched F-panel-635, F-panel-608 |
| 145-221 | Bell = to-do list (done, read per person, History, X, Undo, 99+) | matched F-panel-604, F-panel-505, F-server-535; finding 05 |
| 153-155, 213, 317, 485 | Admin What's new, pending entries, help articles | matched F-panel-1109, F-panel-506, F-panel-218 |
| 167-186 | Admin alerts with the app closed: icon and one-colour badge | matched F-panel-836, F-panel-734 |
| 189-190 | Summary push "N new updates from your members" (daily / weekly) | matched F-panel-505, F-panel-734 |
| 285-309 | HQ read-log warning, key reminder, public status route, outage email | matched F-hq-103, F-server-234, F-server-600, F-server-208 |
| 398-424 | Direct-read record of owner-login reads | matched F-server-534, F-server-234 |
| 423 | Owner's list of direct looks in the admin app (notes: not built) | NOT FOUND: new row F-panel-3500; finding 01 |
| 423 | HQ page for the direct-read list (notes: not built) | inside plan only, nobody is told it exists: no row |
| 317-319, 343, 354 | "Who should read it?" picker; panel "To:" line; trainer note | matched F-server-509, F-phone-320, F-phone-424, F-panel-522 |
| 320, 486-497 | AI ideas: not seen 10+ days, joined N days ago, names, See who | matched F-panel-911, F-panel-912 |
| 323-326 | "Coming from Hevy or Strong?" card, "Everything stays on this phone." only when not signed in | matched F-phone-811, F-phone-1113 |
| 343, 355 | Today's target always beats previous, "i" says why | matched F-phone-1116 |
| 344, 358 | New / Edit exercise as one card of rows | matched F-phone-834, F-phone-1003 |
| 344-345, 356, 501-564 | App rings itself on phones that strip the sound (gym messages, Rest is over) | matched F-phone-1202, F-phone-324; finding 03 |
| 549-556 | Rest sound choice, Workout sounds, Ring through Do Not Disturb | matched F-phone-1203, F-phone-1205, F-phone-1204 |
| 345, 357 | A tapped notification opens its page | matched F-phone-1727, F-phone-831 |
| 345-346, 447-452 | Welcome screens + phone-first sign-in, WhatsApp check | matched F-phone-1600, F-phone-402 |
| 346 | 10-digit mobile boxes | matched F-panel-3100 (panel); phone side sits in F-phone-1600 / F-phone-1602 forms, not opened |
| 346 | No "new" dots on a first install | matched F-phone-1709, F-phone-1306 |
| 348, 359 | Watch keeps big numbers at the largest text size | matched F-watch-3200 (row exists, status unknown) |
| 348 | Watch app tells the phone its version | matched F-watch-118 |
| 350-353 | Phone What's new, update screen notes, Play notes | matched F-phone-1313, F-server-110, F-server-611 |
| 226-259 | Drag an exercise in a live workout | matched F-phone-710, F-phone-638; finding 04 |
| 454-476 | Today keeps only what still needs the owner; bell history says Done | matched F-panel-605, F-panel-325 |
| 466-471 | Alert kinds (questions, plan request, number to confirm, shop order, referral, online join, paid online, report, AI credits) | matched F-server-516, F-server-513 |
| 472 | "Seen by your gym" on member messages | matched F-server-508 (not opened) |
| 537-539 | Gym message pop-ups: push, 15-minute check, trainer reply, team reply, quiet copy in a workout | matched F-phone-407, F-phone-322, F-phone-1717, F-server-230 |
| 396, 523, 545 | Feedback device line; Add my watch's screen log | matched F-phone-1713, F-phone-1718, F-watch-115 |
| 575, 581 | Send a test alert | matched F-server-518, F-panel-836 |
| 592 | Watch screen dims instead of going black | matched F-watch-114 |
| 599 | Feature switches route | matched F-server-139, F-web-116 |
| 599-600 | Smart app link, iPhone coming soon, Get the app page, privacy pages | matched F-server-109, F-web-105, F-web-139 |
| 210, 131 | Hinglish in the admin app | matched F-panel-501 |
| 40-41 | Backlog F228 (copy rewrite), F229 (longer rest raises the next target) | planned only, not claimed as existing: no row (F-phone-919 today does the opposite of F229) |
| 55, 450-452 | Backlog: watch lasting dot; Yes / No on the gym welcome; remove one welcome screen | planned only: no row |

Counts: 41 named (38 product features + 3 planned-only groups), 37 matched, 1 new feature row, 7 findings (S2: 4, S3: 3).

## Could not check
- Whether the logs key is saved in HQ today (the notes say "off" on 16 Nov): that is a live secret, not readable here.
- Whether migrations 0097 and 0098 are really live: taken from the notes; no live catalog query was run.
- The ring on a real OPPO, the drag fault on a real phone, the watch pop-up on a real watch: need his devices.
- Whether the new terms paragraph is on the live site: nothing live was opened.
- Matches marked "not opened" rest on the row's name only.
- Nothing was driven on a screen; every check is a code read or the notes' own CI run ids.
