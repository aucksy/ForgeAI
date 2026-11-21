# A8-phone-tracker-lib-2 checkpoint

- 2026-11-21 cp1: 42 journeys done (1108, 1122, 1123, 1124, 1118, 1125, 1126, 1113, 1129). Rows in _work/out/A8-phone-tracker-lib-2.jsonl. Test lines read so far ~900.
  Findings planned: 01 step-back card journeys describe a removed feature (1118); 02 note first line silently cut when it matches the name (1129-05).
  Next: 1127, 1128, 1112, 1134, 1131, 1132, 1133, 1130.
- 2026-11-21 cp2 (final): all 87 journeys written (0 full, 76 partial, 11 none); 4 findings (FN-A8-phone-tracker-lib-2-01..04). Test lines read ~2,300.
  Reused existing findings (coverage rows only): FN-A8-phone-tracker-components-2-2-02 (superset), FN-A8-phone-tracker-components-2-3-01 (Workout tab save fails), FN-A8-phone-tracker-components-2-1-06 (share fails), FN-A8-phone-components-1-2-09 (last year's review row), FN-A5-phone-tracker-lib-4-02 (share line counts body weight).
  a8-cover ok; merge --dry 91 passed, 0 rejected.
