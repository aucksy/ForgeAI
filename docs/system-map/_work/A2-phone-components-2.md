# A2-phone-components-2 checkpoint

Status: DONE (all 60 source lines covered, 33 rows F-phone-1400 to F-phone-1432).

## Finished units
- [x] 1. Source list read (60 lines).
- [x] 2. Code opened per item (header comments, exports, gates; about 900 code lines read).
- [x] 3. Switches and gates noted (see below).
- [x] 4. Items grouped into features.
- [x] 5. Rows written: feedback (1400-1404), confirm/notice/save banner (1405-1407), settings cards (1408-1426), shared ui (1427-1432).
- [x] 6. Not-a-feature rows: 1430 (ui kit), 1431 (old TabBar), 1432 (stats/parts).

## Switches and gates met
- useFeedbackButton.enabled (member's own on/off for the floating button) - FeedbackButton.tsx:56,87
- accountOffered (cloud/accountGate.ts) - AccountCard.tsx:45
- build parts aiCoach / voice - settingsLines.ts:101, app/settings/index.tsx:219
- build part gymSync + isCloudConfigured() - app/settings/gym.tsx:45, CloudCard.tsx:75
- FEATURES.nutrition - ProfileCard.tsx:503
- MEMBER_PLAN_GATE_ON (MettleUp Plus row) - settingsLines.ts:96
- iphone build - settingsLines.ts:100,125
- canAddGymShortcut (gym has a logo) - GymSettings.tsx:66
- member switches gymRemindersOn / gymMessagesOn - GymSettings.tsx:94,131

## Seen in passing (not verified, no fix made)
- ui/Logo.tsx:12 still describes and draws a "FORGE" + "AI" wordmark; the app is MettleUp now. Not checked where it is still drawn.
- GymSettings.tsx:90-93: the "Reminders from my gym" comment sits on GymMessagesSwitch, not GymRemindersSwitch; the Reminders page shows both switches (notifications.tsx:16-17). Worth checking the two are clearly different to a member.
- GymSettings.tsx console warnings and a comment still say "ForgeAI" (internal only).
- ui/TabBar.tsx is exported from the kit but nothing draws it (only its type is imported by TrackerTabBar).
- BackupCard PhoneBackupCard + PhotoBackupCard live on /settings/phone-backup, a page no row links to.

## Could not check
- Whether each build part (gymSync, aiCoach, voice, nutrition, MEMBER_PLAN_GATE_ON) is on in the shipped build: the switch definitions are outside this area.
- Tier (free or Pro) for gym logo, cloud sync, AI coach, targets, Plus: no plan gate is in this area's code; written "unknown".
