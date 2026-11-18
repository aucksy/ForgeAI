# Checkpoint: A2-phone-tracker-services-2

Status: DONE. 73 of 73 source lines placed in 40 rows (F-phone-600 to F-phone-639). Output: docs/system-map/_work/out/A2-phone-tracker-services-2.jsonl

## Finished units
- [x] 1. Read the source list (73 lines).
- [x] 2. Opened the code: the opening comment of all 51 "file" items, and the exact lines of the 22 channel / storage-key / notification items (about 1,300 code lines read of the 2,500 allowed).
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Items grouped into features in user words.
- [x] 5. Feature rows written (38 features).
- [x] 6. Not-a-feature rows written (2: F-phone-608 one-time record repairs, F-phone-634 test-only watch stand-in).

## Switches and plan gates met
- No "Pro only" rule and no per-gym switch anywhere in this area (searched the area's files for Pro / premium / paywall / feature flags: nothing).
- Member settings that turn a feature on or off: "Workout sounds" (workoutAlerts.ts:181, workoutPresence.ts:284), "Ring through Do Not Disturb" (workoutPresence.ts:315), "Open MettleUp on my watch" (watchOpen.ts:37), "Include photos in my backup" (progressPhotos.ts:8), rest-over sound choice (restSounds.ts:16).
- Phone settings that decide the rest alert: Android notifications permission and "Alarms & reminders" (restAlertAccess.ts:5-9).
- Code constant: WATCH_APP_ON_PLAY = true (watchInstall.ts:161) decides whether "Install on watch" is offered.
- Demo data: the watch install cards never show while the welcome demo's sample workouts are loaded (watchInstall.ts:65, :220). No "demo copy" source line in this area.

## Could not check
- Whether "Watch your trainer" links depend on a gym-side switch: the code that writes them (gymPlansSync.ts, gymWodSync.ts) is outside this area, so that row's switch is "unknown".
- Roles: every row says "member"; whether pass members also reach these screens is decided outside this area.
- Only each file's opening comment and the item lines were read, not every function, to stay inside the reading limit.

## Seen in passing
- watchUpdate.ts:3-4 says "no screen uses it yet", while watchUpdateCard.ts:4 names the screen that uses it (components/WatchUpdatePrompt.tsx). A stale comment, not a behaviour bug.
- restAlertAccess.ts:11 and several other comments still say "ForgeAI" where the product is now MettleUp; comments only as far as read (visible wording not checked in this step).
