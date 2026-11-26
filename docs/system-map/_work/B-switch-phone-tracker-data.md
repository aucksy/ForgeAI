# B-switch-phone-tracker-data checkpoint (gap-1 + gap-6, phone/tracker-data)

## Done
- 2026-11-26 H1.1-H1.4 (gap-1) checked. Switches: tracker prefs (RPE, coach note, sounds, weekly goal, Previous values, body-weight from any workout, share gym, stuck choice), hidden exercises, start records fresh, kg each/as one, demo data. Machine steps/plates/rest/muscle tips/targets were covered by components-1-a.
- New findings: 01 (trainer and mate kg ignore 'kg each'), 02 (trainer new bests ignore 'Start records fresh'). Reused FN-B-switch-phone-screens-1-a-04 (hidden exercise in swap and plan builder).
- No-fault reads: Previous values scope (live workout, Today targets, notes), coach note gate, weekly goal (Workout tab, week card, widget refresh), backup carries all prefs, demo data kept off server.
- 2026-11-26 H6.1-H6.5 (gap-6) checked: no gym-member field read here (H6.1 does-not-apply); body weight asked on finish screen; no autofill box in this area.
- lens-cover ok; merge --dry 4/4 passed. FINISHED.
