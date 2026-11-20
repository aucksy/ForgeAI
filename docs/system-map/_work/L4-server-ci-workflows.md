# L4-server-ci-workflows checkpoint
- 2026-11-20 L4.1 done: does-not-apply (0 promises listed).
- 2026-11-20 L4.2 done: checked; finding 01 (real-looking mobile numbers stored on the live server by tests without consent). No breach alarm in CI, only an outage alarm; crash reports moved to a private repo.
- 2026-11-20 L4.3 done: checked; no finding. CI holds no service-role key (secrets: Razorpay test, WhatsApp, Test Lab, signing, App Store, Cloudflare); tests reach the live server only with the app's public key and their own gym sessions.
- 2026-11-20 L4.4 done: checked; finding 01 (test gyms and their people rows stay on the live server for ever). Artifacts kept 1-30 days; repo is public but artifacts hold test gyms only.
- 2026-11-20 L4.5 done: checked; no finding. Outside services: Meta (owner's own phone from a secret), Firebase Test Lab (released app, switch off), Razorpay test mode, live AI import with made-up rows, synthetic voices only.
- 2026-11-20 L4.6 done: checked; finding 01 (no delete path for test-made gyms; clean-up only signs out).
- ALL ITEMS DONE. Output: docs/system-map/_work/out/L4-server-ci-workflows.jsonl (1 finding, 1 grid row). About 450 code lines read.
- Could not check: how many QA gyms are on the live server now (would need a count across other gyms); whether 98765 00001 / 00002 belong to real people.
