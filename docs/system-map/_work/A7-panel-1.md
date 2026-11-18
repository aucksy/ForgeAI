# A7-panel-1 checkpoint

Source: docs/system-map/_sources/promises.txt lines 477-596 (120 candidates). Output: docs/system-map/_work/out/A7-panel-1.jsonl

## Finished units
- unit 1 done: assistant (promises.txt 477-500) -> rows 01-18
- unit 2 done: auth (501-529) -> rows 19-36
- unit 3 done: branches, brand, data, demo (530-557) -> rows 37-49
- unit 4 done: lang/hinglish.ts (558-596) -> rows 50-73
- ALL DONE: 120 of 120 candidates handled. 73 rows (72 candidates; 530 gave 2 rows), 48 "not a promise".

## Counts
kept 16, partly 20, GAP 0, unknown 37.

## Not a promise
- apps/dashboard/src/crm/assistant/answer.ts:325 (2 candidates), a follow-up button label and the request text it sends
- apps/dashboard/src/crm/assistant/suggestions.ts:154, a button label
- apps/dashboard/src/crm/assistant/suggestions.ts:155, the request text the button sends
- apps/dashboard/src/crm/assistant/ui/CreditsSheet.tsx:48, a label for one line of the credits history
- apps/dashboard/src/crm/assistant/ui/CreditsSheet.tsx:50, a label for one line of the credits history
- apps/dashboard/src/crm/auth/WhatsAppVerify.tsx:188, an error message
- apps/dashboard/src/crm/auth/WhatsAppVerify.tsx:192, an error message
- apps/dashboard/src/crm/auth/WhatsAppVerify.tsx:345, a waiting status line
- apps/dashboard/src/crm/auth/WhatsAppVerify.tsx:346, a waiting status line
- apps/dashboard/src/crm/auth/hqAccess.ts:145, a notice title about a change already made
- apps/dashboard/src/crm/auth/phoneCode.ts:67, an error message
- apps/dashboard/src/crm/auth/signin.ts:210, an instruction to the user ("Keep it private.")
- apps/dashboard/src/crm/auth/signin.ts:411, an error message
- apps/dashboard/src/crm/auth/signin.ts:443, an error message
- apps/dashboard/src/crm/auth/signin.ts:494, a generic refusal line for the OWNER_ONLY code (the rule itself is rows 25-26)
- apps/dashboard/src/crm/auth/signin.ts:504, a status line
- apps/dashboard/src/crm/brand/BrandingScreen.tsx:768, a status line after the logo was changed
- apps/dashboard/src/crm/brand/brandLogic.ts:143, an error message
- apps/dashboard/src/crm/brand/brandLogic.ts:144, an explanation of this logo, not of the product
- apps/dashboard/src/crm/brand/brandLogic.ts:158, an error message
- apps/dashboard/src/crm/brand/brandLogic.ts:184, a status line about one colour
- apps/dashboard/src/crm/data/adapter.ts:237, an error with an instruction
- apps/dashboard/src/crm/data/adapter.ts:274, an error message
- apps/dashboard/src/crm/data/cloud.ts:371, an error with an instruction
- apps/dashboard/src/crm/demo/demoServer.ts:176, made-up demo chat text
- apps/dashboard/src/crm/demo/demoServer.ts:177, made-up demo chat text
- apps/dashboard/src/crm/demo/demoServer.ts:179, made-up demo chat text
- apps/dashboard/src/crm/demo/demoServer.ts:187, made-up demo gym message
- apps/dashboard/src/crm/demo/demoServer.ts:188 (2 candidates), made-up demo gym offer
- apps/dashboard/src/crm/demo/demoServer.ts:190, made-up demo gym message
- apps/dashboard/src/crm/demo/demoServer.ts:200, made-up demo gym offer title
- apps/dashboard/src/crm/lang/hinglish.ts:45, a heading
- apps/dashboard/src/crm/lang/hinglish.ts:295, a heading
- apps/dashboard/src/crm/lang/hinglish.ts:670, a field label
- apps/dashboard/src/crm/lang/hinglish.ts:688, a form check message
- apps/dashboard/src/crm/lang/hinglish.ts:690, an option label
- apps/dashboard/src/crm/lang/hinglish.ts:692, an option label
- apps/dashboard/src/crm/lang/hinglish.ts:721, a status line for one member
- apps/dashboard/src/crm/lang/hinglish.ts:725, a button label
- apps/dashboard/src/crm/lang/hinglish.ts:726, a status line for one member
- apps/dashboard/src/crm/lang/hinglish.ts:754, an error with an instruction
- apps/dashboard/src/crm/lang/hinglish.ts:774, a warning about one challenge being removed
- apps/dashboard/src/crm/lang/hinglish.ts:798, an instruction to the owner
- apps/dashboard/src/crm/lang/hinglish.ts:1039, an instruction to the owner
- apps/dashboard/src/crm/lang/hinglish.ts:1269, a label for one line of the credits history
- apps/dashboard/src/crm/lang/hinglish.ts:1270, a label for one line of the credits history

## Notes
- promises.txt line 531 points at BranchesCard.tsx:185; the trial sentence really stands on line 186 (row 39 uses 186).
- promises.txt line 530 is several list items joined; rows 37 and 38 are the two promises in it (lines 181 and 183).
- hinglish.ts lines 747 and 749 were not read in place (only their text in promises.txt).

## Could not check
- Whether the server really adds, uses first and ends the monthly free AI credits (supabase 0071 not read): rows 16-18, 68.
- That a task takes credits only on Send or Save (the spend function was not read): rows 10, 13.
- WhatsApp sign-in checks: what is sent, how fast, and "free": rows 19-21, 27-31, 52-53.
- "Kept only in this browser / on this page" for the demo gym and a browser-only gym: rows 22-24, 49.
- Branch rules on the server (staff at one branch, owners of every branch, receipt codes, shared trial end, plan for one branch): rows 32, 37-41.
- The 3-month free trial, no card, member app always free, free gym web page: rows 50-51, 54-56, 63.
- Challenge free days and refunded online payments: rows 57-62, 64-65.
- Reading limit reached (about 1,300 of 1,500 lines), so these stayed "unknown" rather than guessed.
