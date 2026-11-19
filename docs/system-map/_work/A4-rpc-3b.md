# A4-rpc-3b checkpoint

Finished: all 43 left-out candidates (units 1-10, 11-20, 21-30, 31-40, 41-43) have a reader row.
Written to docs/system-map/_work/out/A4-rpc-3b.jsonl: 43 reader rows (not-a-reader 30, list 5, count 1, screen 6, export 1). No entity rows: all 27 entities already exist in entities.json.
Nothing left.

## seen in passing
- none

## could not check
- Reader kinds come from the panel wrapper at the candidate line and the database function it calls; the screens that call each wrapper were not read line by line.
- Function bodies read for 9 of the functions (test alert, friend summary, member progress, receipt, report file, pay MettleUp, HQ access, entry machines, photo slot); the other save/remove/decide functions were classed as writers from their name and the wrapper's own comment.
- Demo stand-in rows (demoServer.ts) are marked not-a-reader, the same way the earlier helpers marked them.
