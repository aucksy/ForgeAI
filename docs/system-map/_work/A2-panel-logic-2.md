# A2-panel-logic-2 checkpoint

- [x] 1 read the 96 source lines
- [x] 2 opened each item's code (file header + the named line; about 1,200 code lines read)
- [x] 3 switches and plan gates noted in the rows
- [x] 4 grouped into features
- [x] 5 feature rows written: 39 rows F-panel-700 to F-panel-738 in docs/system-map/_work/out/A2-panel-logic-2.jsonl
- [x] 6 not-a-feature row: F-panel-708 (money, payments, plural, visiblePoll helpers)
- Coverage self-check: 96 of 96 source lines named; every entry line exists.

DONE. All units finished.

## could not check
- tier (free / Pro) for every row: these are pure rule files with no plan gate inside; the gate, if any, sits in the screens (other areas). Written as unknown.
- status 'live' means: the file is imported by a screen and names no switch. Not checked on a real screen.
- 'behind switch' rows rest on the file's own header comment about a server change not being live (0069/0096, 0060, 0065, 0088, 0091, 0079); the database was not read in this step, so the comment may be out of date.

## seen in passing
- none proven. Possible stale comments only: payMettleUp.ts:2 says 0060 NOT APPLIED, trainerSchedule.ts:3 says 0065 NOT APPLIED, memberMessages.ts:4 says 0069 not live; worth checking against the live migration list.
