# A2-phone-native checkpoint

Status: DONE (19 Nov 2026). Output: docs/system-map/_work/out/A2-phone-native.jsonl (39 rows, F-phone-1200 to F-phone-1238).
Self-check run: 103 of 103 source lines named in "sources"; every "entry" is a real file and a line inside it; every row parses.
Code read: about 1,600 lines (limit 2,500).

## Finished units
- [x] 1. Source list read (103 lines)
- [x] 2. Code opened per item: rest timer + notification cards (forge-rest), watch sync (forge-rest), widgets / shortcuts / Health Connect / share / Play update (forge-phone), Play Billing (forge-billing), app shell (android/app), src/tracker/phone
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Items grouped into features
- [x] 5. Feature rows written (36 features)
- [x] 6. Not-a-feature rows written (3: PopupBars helper, app shell, native.ts bridge)

## Switches and gates met
- MEMBER_PAYMENTS_LIVE: Play Billing (F-phone-1232) is only called while it is true (ForgeBillingModule.kt:24). The flag itself lives outside this area.
- Watch "free part" lock for MettleUp Plus (F-phone-1215): WearSync.kt:250-258. What turns it on is outside this area: status written "unknown".
- Member settings, all saved on the phone (phonePrefs.ts:148-181): Health Connect (off), workout reminders (off), weight from Health Connect (off), steps (off), sleep and workouts (off), reminders from my gym (on), messages from my gym (on), name on leaderboard (off), share workouts with gym mates (off), share machines I use (on), share with trainers (off).
- Gym-dependent, switch not visible in this area (written "unknown"): gym colour on cards and watch, "Gym right now" widget, gym home-screen shortcut, gym-branded start-up screen. phonePrefs.ts:68-76 says "Share which machines I use" shows only while the gym has Busy machines on, and "Share with trainers" only once the gym's server has the trainer view.
- No "Pro only" rule found in this area.

## Seen in passing (not verified as bugs)
- ForgeBillingModule.kt:30-31: a purchase is acknowledged on the phone as soon as Play reports it, and the comment says server-side checking of purchases "comes with payments live". If payments go live without it, a purchase is trusted from the phone alone.
- reminders.ts:369: the reminder channel's description says "at the time you chose in Profile", while PhoneCard.tsx:2 says the control now sits under Settings → Notifications. Possibly stale wording a member sees in Android's notification settings.
- RestCard.kt:1230/1243/1255: each rest sound picked creates three more Android notification channels ("Rest is over: Bell" etc.); a member who tries all sounds ends up with a long channel list in Android settings. Whether old ones are removed was not read.
- Shortcuts.kt:36 disables shortcut ids "today" and "weight" only when the list is empty; fine for Erase all data, not checked for a sign-out path.

## Could not check
- Whether watch diagnostics (F-phone-1217) and the watch lock (F-phone-1215) are reachable by a member: their screens are outside this area.
- Tier for the watch and gym-branding features: no plan rule is in this area's code.
- RestCard.kt (1,636 lines) and PhoneCard.tsx (1,148 lines) were read by function list plus targeted ranges, not whole (size rule).
