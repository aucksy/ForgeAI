# L16-server-hq-gate-workers checkpoint
- started 2026-11-24; inputs read
- L16.1 done: 3 new findings + reused FN-L16-server-ci-workflows-06 (gate no test). No dead exports (only test reset hooks); all 24 bare catches read, one reports healthy.
- L16.2 done: clock-using tests read (leads order ties sort by row in the index, push lock uses 200 s offset); none flaky by code; no CI history read.
