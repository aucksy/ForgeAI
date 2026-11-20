# A5-phone-native-3 checkpoint

F-phone-1209: 10 journeys, 15 type lines
F-phone-1200: 6 journeys, 7 type lines
F-phone-1207: 5 journeys, 7 type lines
F-phone-1201: 7 journeys, 7 type lines
F-phone-1213: 6 journeys, 7 type lines
F-phone-1212: 6 journeys, 7 type lines
F-phone-1208: 5 journeys, 7 type lines
F-phone-1229: 6 journeys, 7 type lines

All 8 features done (9 feature x role pairs). 115 rows in _work/out/A5-phone-native-3.jsonl. No findings.

## Entities
No entity fits any of these features: the rest, the Done tap, the live card words, the watch outbox and the
Health Connect switches all live in phone storage (SharedPreferences / phone prefs), and entities.json lists only
server tables. writes / reads are left empty on every journey.

## Seen in passing (not sure enough for a finding)
- Two wordings for the same note: native "Open MettleUp to save <set>" (RestCard.kt:819) vs JS "Open MettleUp to
  log <set>" (restDoneRun.ts:125, 133).
- Watch Done that the phone receiver later drops (no row, or OfflineTick refuses and pendingFrom returns null) is
  not answered with the "not logged" nack; only parse and broadcast failures are (WearActionService.kt:27-39,
  RestActionReceiver.kt:47-57). Could leave the watch thinking a set was saved.
- Watch button messages (Message API) are not queued; a tap while the watch is disconnected may be lost
  (WearActionService.kt). Phone-to-watch state uses a saved outbox with capped retries (WearSync.kt:723-779).
- recover() after a restart forgets an ended rest but does not tell the watch (RestCard.kt:665-669); the watch
  normally ended it itself.
- Rest card, "Rest is over", the note and the live card all use public lock-screen visibility, so the exercise
  and set name show on a locked phone (RestCard.kt:1443, 1586, 842; WorkoutCard.kt:240).

## Could not check
- Real device behaviour (lock screen, Doze, watch): read code only, no device run.
- Whether the app rejects a kept Done tap older than 10 minutes (DONE_MAX_AGE_MS used in JS, not opened).
- Watch-side screens and words (watch app code not in this item).
