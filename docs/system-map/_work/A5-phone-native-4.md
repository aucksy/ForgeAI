# A5-phone-native-4 checkpoint

F-phone-1224: 6 journeys, 7 type lines
F-phone-1226: 5 journeys, 7 type lines
F-phone-1227: 5 journeys, 7 type lines
F-phone-1235: 5 journeys, 7 type lines
F-phone-1234: 5 journeys, 7 type lines
F-phone-1218: 10 journeys, 14 type lines (member + the system)
F-phone-1228: 5 journeys, 7 type lines
F-phone-1221: 5 journeys, 7 type lines

Done: all 8 features (9 feature x role pairs). Output: _work/out/A5-phone-native-4.jsonl (110 rows: 46 journeys, 63 type lines, 1 finding).

## Entities
No entity in entities.json covers phone-only storage (body_weight table, phone prefs in AsyncStorage, scheduled
notifications, widget key, Health Connect records). Journeys of 1224, 1226, 1227, 1218, 1228, 1221 carry no
writes/reads for that reason. Used only: E-gym-mate-profiles, E-gym-progress-summaries (1235), E-member-items (1234 account delete).

## Seen in passing (not sure enough for a finding)
- Health Connect "Send past workouts": the busy guard is set only after the confirm, so a fast double tap while the
  count loads can open two questions (PhoneCard.tsx:136-158).
- Phone prefs default "Share which machines I use" to ON (phonePrefs.ts:166) while every other sharing switch is off.
- Erase resets the gym sharing switches on the phone (name on leaderboard, gym mates, trainers) without marking a
  pending push; if "Erase this phone only" does not also leave the gym, the server may keep sharing while the phone shows Off.
- member_summary (E-member-summary) has a weight_kg column visible to owner and trainer, while promises say body weight
  is never shared; not checked whether the phone fills it.

## Could not check
- Did not run merge.mjs (needs the blind file); ids, entities and promises checked by script against the json files.
- Exact sleep-hours wording (sleepWords) and the Data card button words beyond the two erase choices: not read.
