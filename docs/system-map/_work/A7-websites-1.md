# A7-websites-1 checkpoint

Candidates: promises.txt lines 291-408 (118). Output: docs/system-map/_work/out/A7-websites-1.jsonl (58 rows).
Rule used for repeats: a promise gets ONE row per page; the same sentence again on the same page (title tag,
share-preview tag, Hindi copy, a second button) is listed below as "repeat of <row id>".

## Finished units
- about.html (291-304): done, rows 01-13.
- contact.html (305-308): done, rows 14-15.
- friend.html (309): done, row 16.
- get-app.html (310-313): done, row 17.
- home/home.js (314): done, row 18.
- home/index.html (315-364): done, rows 19-42.
- join-online.html (365-383): done, rows 43-48.
- member-site (384-398): done, rows 49-54.
- deploy/panel/gymPage.js (399-402): done, rows 55-58.
- deploy/panel/pageChat.js (403-408): done, no rows.
ALL UNITS DONE. 0 items left.

## Not a promise
- not a promise: apps/dashboard/public/about.html:56 "Refunds and cancelling: see refunds and cancellation", a link to another page.
- not a promise: apps/dashboard/public/contact.html:15, an invitation to write in.
- not a promise: apps/dashboard/public/contact.html:26, a tip for the person writing in.
- not a promise: apps/dashboard/public/home/index.html:562, menu buttons "Sign in / Start free".
- not a promise: apps/dashboard/public/home/index.html:587, a form label "Or we call you:".
- not a promise: apps/dashboard/public/home/index.html:824, made-up numbers in a picture of the app.
- not a promise: apps/dashboard/public/home/index.html:841, a sample message in a picture of the app.
- not a promise: apps/dashboard/public/home/index.html:899, a made-up file name in a picture of the app.
- not a promise: apps/dashboard/public/home/index.html:1052 "Start your free 3 months first, and tell us before they end.", an instruction to the reader.
- not a promise: apps/dashboard/public/home/index.html:1081 "What happens after the 3 free months?", a question heading.
- not a promise: apps/dashboard/public/home/index.html:1100, a question heading.
- not a promise: apps/dashboard/public/home/index.html:1127, footer links.
- not a promise: apps/dashboard/public/join-online.html:261, error message.
- not a promise: apps/dashboard/public/join-online.html:302, error message.
- not a promise: apps/dashboard/public/join-online.html:307, error message.
- not a promise: apps/dashboard/public/join-online.html:337, error message.
- not a promise: apps/dashboard/public/join-online.html:371, a button.
- not a promise: apps/dashboard/public/join-online.html:375, error message when the gym switched trials off.
- not a promise: apps/dashboard/public/member-site/index.html:461, footer links.
- not a promise: deploy/panel/gymPage.js:605, a code comment.
- not a promise: deploy/panel/pageChat.js:143, an instruction to the AI model, never shown to a person.
- not a promise: deploy/panel/pageChat.js:145, an instruction to the AI model (two candidates).
- not a promise: deploy/panel/pageChat.js:150, an instruction to the AI model.
- not a promise: deploy/panel/pageChat.js:164, an instruction to the AI model.

## Repeats on the same page (no own row)
- get-app.html:7, :9 (search and share-preview tags), :64 (Hindi copy): repeat of P-A7-websites-1-17.
- home/index.html:10, :13 (two candidates), :575, :1017: repeat of P-A7-websites-1-20.
- home/index.html:13 "Free for 3 months.", :577, :1015, :1033, :1094, :1096: repeat of P-A7-websites-1-19.
- home/index.html:783, :1080: repeat of P-A7-websites-1-22 (783 also of 23).
- home/index.html:733, :1021: repeat of P-A7-websites-1-29.
- home/index.html:1014, :1032: repeat of P-A7-websites-1-26. Not checked: that these two lines show only when "Yearly" is picked.
- home/index.html:1081 "We confirm the payment and your plan starts.": repeat of P-A7-websites-1-34.
- join-online.html:292 (two candidates): repeat of P-A7-websites-1-43 and -44.
- join-online.html:363 (the "1 day" form), :364 (two candidates), :368, :372: repeat of P-A7-websites-1-46.
- member-site/index.html:13, :14, :18, :270, :274, :407, :471: repeat of P-A7-websites-1-49.
- member-site/index.html:327: repeat of P-A7-websites-1-50.

## Could not check
- Whether migrations 0060 / 0063 / 0071 are live (no database reads in this step).
- Whether the nightly lead clean-up (deploy/hq/web.js:390) is really scheduled.
- MettleUp support access to "only the gym sees" data (rows 16, 45, 55, 56): not read.
- Test bodies not opened: supabase/tests/0071_ai_assistant.sql, supabase/tests/0094_page_chat.sql, deploy/panel/friend.test.mjs.
- Human processes with no code: free set-up, free training, complaint times, call-backs (rows 10, 11, 14, 18, 21, 39).
- Size: about 1,300 of 1,500 lines read; stopped opening new files there.
