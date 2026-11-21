# L16-hq-app checkpoint
- L16.1 done: 1 new finding (needs poll failure hidden); reused FN-L14-hq-app-06 (payments count null), FN-A8-hq-app-2-01 (screens not driven; pwa.js/sw.js untested). No dead code: every logic export used by app, logic or the server. Every action button has a message box. Date twin extendPaidUntil only a fallback (server sends extendsTo). Branch prices pinned by pricesOneSource test. All 28 tests assert.
- L16.2 done: tests use fixed clocks; e2e fixed waits only before screenshots. CI run history not read. No finding.
