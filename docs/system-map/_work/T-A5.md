# T-A5 checkpoint (tooling for step A5)
- part 1 done: journey-templates.json, 42 templates (types 4,5,7,8,9,10,11); parses.
- part 2 done: merge.mjs accepts kind jtype (journey-types/<feature id>.json) and has --a5cover <items file>; _briefs/A5.md written.
- part 3 done: _tools/expand.mjs. Tested on made-up rows (ZZ-test-a5): 6 yes lines -> 9 generated journeys, re-run gives the same file, merge --dry passes; a real merge twice into a scratch copy of the map: 9 added, then 9 replaced.
- part 4 done: _work/a5-items.mjs (--list, --only, --all). Ran --only A5-phone-components-1-1: 7 features, brief 1167 words. --all tested only in a scratch copy: 174 more items, every feature in exactly one item, longest brief 1168 words.
- part 5 done: done-check = merge.mjs --a5cover <items file>. Tested good file (0 gaps) and bad file (6 rejects with clear reasons).
- test files deleted (ZZ-test-a5*). merge.mjs was only ever run with --dry in the repo.
