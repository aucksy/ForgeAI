# Checkpoint: A2-panel-auth-data

Status: DONE. 56 of 56 source lines placed; 26 feature rows (F-panel-1000 to F-panel-1025) in docs/system-map/_work/out/A2-panel-auth-data.jsonl. About 1,900 code lines read (limit 2,500).

## Finished units
- [x] 1. Source list read (56 lines).
- [x] 2. auth/api.ts (panel.txt#198-214): read whole.
- [x] 3. auth/PeopleScreen.tsx (panel.txt#71-73, #370): lines 1-60, 105-179, 490-519, 578-607, 652-676, plus a search for the call sites (229, 290, 353, 390, 403, 435, 436).
- [x] 4. auth/PinForms.tsx (panel.txt#74), auth/pinPrompt.ts.
- [x] 5. auth/hqAccess.ts (panel.txt#215-217), auth/terms.ts (#219-220), auth/TermsGate.tsx.
- [x] 6. auth/phoneCode.ts (#218, words.txt#4-6, #78), auth/WhatsAppVerify.tsx (words.txt#12-13), auth/ForgotPin.tsx (words.txt#1).
- [x] 7. auth/signin.ts (words.txt#7-11, #79), auth/permissions.ts (panel.txt#448-449), auth/OwnerOnly.tsx.
- [x] 8. auth/AuthProvider.tsx, auth/GoOnlineCard.tsx, auth/SignInForms.tsx (file lines; headers + export list).
- [x] 9. data/adapter.ts, cloud.ts, demo.ts, importPreview.ts, local.ts, outbox.ts, savedCopy.ts (file lines; headers + export list).
- [x] 10. Switches and gates noted (below). Rows written and checked (JSON parses, every source line named, every entry line exists).

## Switches and gates met
- phoneCodeMode: the Worker's /api/phone-code/status answers off | code | inbound (auth/phoneCode.ts:108; auth/ForgotPin.tsx:29). Gates "Verify with WhatsApp" and the WhatsApp way of "Forgot your PIN?".
- Role gate owner vs staff: auth/permissions.ts:68 (STAFF_MAY), :104 (canOpen), :139 (Money tabs), :156 (Shop tabs).
- Server-version gates (not a per-gym switch; the feature is silent when the gym server lacks the migration): PINs 0034 (auth/api.ts:167), job names 0079 (auth/api.ts:140), terms 0033 (auth/terms.ts:77), MettleUp access 0028 (auth/hqAccess.ts:161), phone proof 0061 (auth/api.ts:59).
- Trainer tick on Staff & sign-in: useTrainerSetup (auth/PeopleScreen.tsx:120), defined outside this area: switch unknown.
- No "Pro only" plan gate met anywhere in this area. Tier is "free" only for the doors every gym must pass (sign in, create gym, number check, forgot PIN, terms, demo); "unknown" elsewhere.

## Seen in passing (not findings; for a later step)
- auth/api.ts:57-70: "Create my gym" falls back to older call shapes when the server says "no such function". If the server lacks the phone-proof shape, the gym is made WITHOUT the WhatsApp number check, and the log line (api.ts:68) blames "no PIN / terms", not the missing number check. Whether the live server insists on the proof needs a server-side read.
- auth/permissions.ts:19-21: the code itself says the whole gym is pulled to every signed-in device, so a staff member with developer tools can add up the money totals the panel hides.
- auth/signin.ts:264-266: whatsAppToMobile builds "https://wa.me/?text=..." with no recipient when the mobile is not a valid 10 digits (WhatsApp opens with nobody chosen).
- auth/api.ts:99-105: signing out with no internet forgets the key on the device but the server session stays live until an owner signs the person out.
- auth/signin.ts:436 types the support email inside the sentence while ForgotPin.tsx:75 splits that sentence on the SUPPORT_EMAIL constant: if the two ever differ, the email link silently disappears.

## Could not check
- The middle of PeopleScreen.tsx (lines 180-490) was not read line by line; the call sites there were located by search only. The 'me-signout' sheet at line 290 was not confirmed to use ConfirmSheet, so panel.txt#73 is not listed under "Sign out of this device".
- Where the "MettleUp access" card is drawn (the screen that calls hqAccess.ts) is outside this area: the entry points given are the three calls.
- Bodies of data/cloud.ts (1,457 lines) and data/local.ts (1,257 lines) beyond their headers and export lists: over the 800-line whole-file limit and not needed to place the file lines.
- Tier for most rows: no plan gate is in this area's code, and the plan rules live elsewhere.
