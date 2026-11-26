# H5-server-ci-workflows checkpoint

## Done
- [ ] started 2026-11-26: read lens rules, pilot lessons, brief, items, live-state-facts
- [x] LIVE-STATE.md section added (lines 1509-1539). GitHub API reads: about 24 (public, no login).
- [x] H5.1 to H5.4 (one grid row, lens gap-5). Findings FN-H5-server-ci-workflows-01 to -04; reused FN-A5-server-ci-workflows-1-02.
- Code lines read: about 250. No database reads (no feature here touches the live database except the journeys test).
- [x] lens-cover ok; merge --dry 5 passed, 0 rejected.

## LESSONS
- For CI workflows, the repo is public: the GitHub API with no login (60 reads an hour) gives each run file's state
  (active/disabled) and its newest runs, the real "live" proof. About 24 reads were enough.
- A grep across docs/*.md surfaces lines of the forbidden notes files; search only the named folders.
