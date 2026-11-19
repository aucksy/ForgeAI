# A7-templates-2 checkpoint

Candidates: promises.txt lines 1560-1631 (72). Output: docs/system-map/_work/out/A7-templates-2.jsonl

## Finished units
- unit 1 done: promises.txt 1560-1565 (whatsapp.ts) -> rows 01-04; 2 not promises
- unit 2 done: promises.txt 1566-1591 (messages.ts) -> rows 05-20; 10 not promises
- unit 3 done: promises.txt 1592-1605 (autoReminders.ts, gymReminders.ts) -> rows 21-34
- unit 4 done: promises.txt 1606-1617 (noticeAlertWords.ts, workoutAlerts.ts) -> rows 35-42; 4 not promises
- unit 5 done: promises.txt 1618-1631 (panelPush.js, push.js, phoneInbound.js, 0089) -> rows 43-50; 6 not promises
- ALL DONE: 50 rows + 22 not promises = 72 candidates

## Not a promise
- not a promise: apps/dashboard/src/crm/logic/whatsapp.ts:247, a piece of the sentence at :250 (row 01)
- not a promise: apps/dashboard/src/crm/logic/whatsapp.ts:249, a piece of the sentence at :250 (row 01)
- not a promise: apps/dashboard/src/crm/shop/messages.ts:39, a draft title with [blanks] the owner fills in; it cannot be sent unfilled (messages.ts:116)
- not a promise: apps/dashboard/src/crm/shop/messages.ts:42, a draft with [blanks] the owner fills in
- not a promise: apps/dashboard/src/crm/shop/messages.ts:51, a draft title
- not a promise: apps/dashboard/src/crm/shop/messages.ts:54, a draft with [blanks] the owner fills in
- not a promise: apps/dashboard/src/crm/shop/messages.ts:78, a draft with [blanks] the owner fills in
- not a promise: apps/dashboard/src/crm/shop/messages.ts:112, a form prompt ("Write a title.")
- not a promise: apps/dashboard/src/crm/shop/messages.ts:183, a piece of the sentences at :188, :189, :193 (rows 11-13); says what members do, not what the product does
- not a promise: apps/dashboard/src/crm/shop/messages.ts:185, a piece of the sentences at :188 and :189
- not a promise: apps/dashboard/src/crm/shop/messages.ts:273, a form prompt ("Pick a day and a time.")
- not a promise: apps/dashboard/src/crm/shop/messages.ts:304, advice after an unknown error ("Check the Sent list below")
- not a promise: apps/mobile/src/shop/noticeAlertWords.ts:8, a notification channel's name
- not a promise: apps/mobile/src/shop/noticeAlertWords.ts:11, a switch's title
- not a promise: apps/mobile/src/shop/noticeAlertWords.ts:12, the heading of the row at :13 (row 36)
- not a promise: apps/mobile/src/tracker/services/workoutAlerts.ts:123, a notification channel's name
- not a promise: deploy/hq/panelPush.js:89, a piece of a sentence swapped into an alert line
- not a promise: deploy/hq/panelPush.js:96, a fallback pop-up title
- not a promise: deploy/panel/phoneInbound.js:47, an instruction inside the message the person sends themselves
- not a promise: deploy/panel/phoneInbound.js:48, the same instruction in Hinglish
- not a promise: deploy/panel/phoneInbound.js:60, the same instruction for the member app
- not a promise: deploy/panel/phoneInbound.js:61, the same instruction for the member app in Hinglish

## Could not check
- Rows 49, 50 (supabase/migrations/0089): a comment at deploy/hq/panelPush.js:76 says 0089 is NOT LIVE; this step has no database reads, so whether the live server writes these words is unknown.
- Row 26: that the member's plan and the gym's news screens exist in the app was not opened.
- Row 27: the server step that adds the extra days was not opened; the phone only repeats the server's answer.
- Row 35: the lines that post a pop-up on the "Messages from your gym" channel were not read.
- Row 38: what a tap on the "N new messages" pop-up opens was not read.
- Row 37: "a few minutes" needs a real phone and a real send; not measured.
- Whether migration 0042 (10 a day, quiet from the 3rd message) is live: not checked, no database reads in this step.
