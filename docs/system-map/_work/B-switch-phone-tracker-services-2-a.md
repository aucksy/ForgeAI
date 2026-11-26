# B-switch-phone-tracker-services-2-a checkpoint

## Done
- 2026-11-26 started; read brief, items, lens rules, pilot lessons.
- 2026-11-26 H1.1-H1.4 (gap-1) checked: 3 new findings (01 warm-ups ignore machine step, 02 shared routine rep ranges differ from screen, 03 first reminder days ignore weekly goal); reused FN-B-words-phone-tracker-components-2-03, FN-A3-whats-new-phone-02, FN-B-switch-phone-tracker-components-1-a-01, FN-B-switch-phone-tracker-lib-02.
- lens-cover ok; merge --dry 4/4 passed. Item done.

## LESSONS
- Phone settings are not entities: readers.json does not help. Grep the two prefs stores (trackerPrefsStore, restAlertPrefsStore) and meta keys, then grep each key across src.
- machine: evidence must point into _sources/machine; use docs/system-map/features.json:<line> for feature rows instead.
