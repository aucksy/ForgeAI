# A5-phone-lib-core-2 checkpoint

F-phone-1714: 5 journeys, 7 type lines
F-phone-1715: 5 journeys, 7 type lines
F-phone-1716: 5 journeys, 7 type lines
F-phone-1717: 5 journeys, 7 type lines
F-phone-1728: 4 journeys, 8 type lines
F-phone-1732: 4 journeys, 8 type lines
F-phone-1709: 4 journeys, 8 type lines
F-phone-1730: 5 journeys, 7 type lines

Done: all 8 items. Output: docs/system-map/_work/out/A5-phone-lib-core-2.jsonl (96 rows: 37 journeys, 59 type lines). Findings: 0.

## No entity fits
- Phone-only stores have no entity in entities.json: the feedback button switch and spot (meta table), the kept "Your questions" list on the phone (meta help_questions; E-feedback used for the server side), layout hint states (meta layout_hint_*), new-dot seen list (AsyncStorage), the pending-pick note and the progress photos themselves. Left out of writes/reads.

## Seen in passing (not sure enough for a finding)
- Shop "it moved" hint (apps/mobile/src/app/(tabs)/workout.tsx:91-93): settled once from the saved gym's cached product count; if the cached product list is empty at that first launch, the hint is stored 'done' and never shows to a member who did have the Shop tab.
- pendingPick.ts:66: a note saved with a target is still taken by a call with no target (only both-set mismatches are refused). All callers today pass a target where one exists, so no live effect seen.
- helpHistory.ts:323 repliesToTell skips reply index 0 of a pushed question; after more than 20 replies (REPLIES_KEEP slice) index 0 is no longer the first reply. Rare.
- newDotsStore.ts: the seen list is never pruned and it was not checked whether "Erase all data" clears it.

## Could not check
- Whether "Erase all data" clears the new-dots seen list (AsyncStorage key) and the pending-pick note: not read.
- Server side of voice limits (deploy/panel/voice.js) and help replies: outside this item.
