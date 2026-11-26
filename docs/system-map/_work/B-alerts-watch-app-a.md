# B-alerts-watch-app-a checkpoint

## Items
- started 26 Nov 2026
- L11.1 done: watch alerts = own end-of-rest buzz (exact alarm when allowed, else loose alarm; notification usage, alarm usage with Ring through DND), rest countdown card, "Rest is over" card (2 min), "Workout started" pop-up with one buzz, silent "Workout in progress" notice. Phone "Rest is over" never bridged; phone rest card bridged only when watch notifications are off. No WhatsApp, email or push from this area. Findings 01, 02, 03; reused FN-B-run-watch-app-a-01, FN-L9-watch-app-05.
- H2.1 done. Rest buzz on time: watch app installed (testers only, FN-H5-watch-app-01), paired phone with MettleUp sending rests, Alarms & reminders on (else late, FN-B-run-watch-app-a-01), DND/Bedtime off unless Ring through DND, watch on wrist and in range (rest arriving >5 s late does not buzz). Cards: also notifications allowed. Workout started: phone switch on (but backup ignores it, 01), app not on screen, background open refused, notifications allowed.
- H2.2 done: owner has no per-member view of who has the watch app or its permissions (member self-feature; HQ only sees the screen log). Member side: watch never shows notifications off again (02).
- H2.3 done: 01 (switch off still fires), 02 (on but silent with notifications off).
- H2.4 done: Crispy Curves (field-fill.csv): app link 0 of 2 members; watch install, pairing and permissions live on the device, not in gym rows, so watch reach is not countable; any watch alert reaches at most the members who installed the tester watch app (0 provable).
- H2.5 done: needs a real-watch check: (a) Pixel Watch / Galaxy Watch with Alarms & reminders off, screen off, another app open: does the end-of-rest buzz come on time; (b) DND and Bedtime on, Ring through DND off then on: buzz or not; (c) watch notifications refused: does the phone's copied rest card buzz at rest start, and does MettleUp stay up mid-workout without its notice; (d) phone switch off: does "Workout started" still pop up; (e) after a watch update, does the phone's "watch update ready" clear.
- lens-cover ok; merge --dry 5 of 5 passed. Done 26 Nov 2026 (about 1,100 code lines read).
