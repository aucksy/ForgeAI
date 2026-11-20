# A5-phone-native-1 checkpoint

F-phone-1233: 4 journeys, 8 type lines
F-phone-1223: 6 journeys, 7 type lines
F-phone-1225: 5 journeys, 7 type lines
F-phone-1231: 5 journeys, 8 type lines
F-phone-1230: 5 journeys, 8 type lines
F-phone-1222: 6 journeys, 7 type lines
F-phone-1219: 6 journeys, 7 type lines
F-phone-1220: 5 journeys, 7 type lines
F-phone-1202: 9 journeys, 17 type lines (2 roles)

All 9 features done. 128 rows, 1 finding (FN-A5-phone-native-1-01).

## No entity fits (left out on purpose)
- Phone-only data has no entity: today's plan, workouts and body weight on the phone (widgets, icon shortcuts),
  the shared export file in the app cache (share import), the app version (Play update), the start-up screen choice.
- Health Connect privacy page and the Play update touch no stored data.

## Seen in passing (not sure enough for a finding)
- Gym shortcut: when the gym loses its logo or drops to Starter (branding off) while the shortcut is pinned,
  nothing redraws or greys it out; it keeps the old logo (gymShortcut.ts watch: only "after" plans redraw).
- Share import: a file over 50 MB leaves its partial copy in the app cache until the next share.
- Icon shortcuts are only rewritten when the app runs; after midnight they can still offer yesterday's routine
  (the widget handles the date itself, the shortcut does not).
- Rest ring through Do Not Disturb as an alarm is still blocked when the phone is on vibrate or silent
  (plan checks ringer mode after the DND check); may be intended.
- Health Connect privacy link opens the English web page; no Hinglish.

## Could not check
- Whether ColorOS really marks the stripped gym-messages channel sound as "set by the user" (needs an OPPO phone);
  the finding is code-read only.
