# A2-phone-onboarding-db checkpoint

- [x] 1. Source list read (81 lines)
- [x] 2. Code opened for each item (file headers, export lists, the storage-key lines; about 1,600 code lines read)
- [x] 3. Switches and plan gates noted
- [x] 4. Items grouped into features
- [x] 5. Feature rows written: docs/system-map/_work/out/A2-phone-onboarding-db.jsonl (32 rows, F-phone-1600 to F-phone-1631)
- [x] 6. Not-a-feature rows written (4: F-phone-1628 to 1631)
- Self-check: 81 of 81 source lines named in a row; every entry path and line exists; 32 unique ids. DONE.

## Switches met
- PHONE_SIGN_IN_ON = true (apps/mobile/src/onboarding/phoneSignIn.ts:32): phone number first, other ways under "Try another way".
- welcomeGoogleShown (apps/mobile/src/onboarding/components/WelcomeGoogle.tsx:64): Google button hidden when the build cannot sign in to Google.
- FEATURES = { coach: false, nutrition: false, gymSync: false } (apps/mobile/src/lib/features.ts:6): coach chat, food log and old gym sync hidden.
- QA-only stand-ins: qaStandIns 'phoneSignIn' and 'watchIntro' (phoneSignIn.ts:39, qaIntro.ts:15).
- No "Plus only" gate met in this area.

## Could not check
- F-phone-1620 (active workout plan, planRepo): status unknown; whether a live screen still reads it is outside this area.
- F-phone-1624 (Google Drive backup): status unknown; a comment (backupStore.ts:48, eraseWords.ts R-320) says Drive backup is no longer offered, the Settings screen is outside this area.
- F-phone-1626 tier unknown: whether gym branding is a paid gym-plan feature is decided outside this area.
- eraseDevice.ts and introSlides.ts, straightInNote.ts, welcomeResume.ts, lookChoice.ts, themeMirror.ts, settingsStore.ts, backupStore.ts, index.ts, memberSchema.ts, BootErrorScreen.tsx, WelcomeScreen.tsx are in the list only by their storage-key or screen lines, not as "file" lines; covered through those lines.

## Seen in passing
- apps/mobile/src/onboarding/eraseDevice.ts:246: erase removes the offer keys through a loop variable (source list shows "k (value unknown)"); the real keys are OFFER_STORAGE_KEYS in shop/offer, not checked here.
- apps/mobile/src/store/settingsStore.ts:14-65: "language" and the AI provider/model/voice settings are still saved though the coach is hidden (FEATURES.coach off) and a comment in lib/features.ts:28 says language changes nothing a member can see. Dead settings, not a visible bug.
- No clear bug seen.
