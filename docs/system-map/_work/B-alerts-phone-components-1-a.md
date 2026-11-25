# B-alerts-phone-components-1-a checkpoint

- Started 26 Nov 2026. Area has no push/WhatsApp/email sender: in-app notices only (update pop-ups, watch cards, save banner, notices).
- L11.1 done: area sends no push/WhatsApp/email. In-app alerts: phone update full screen (first launch with update, then 7th / 3rd launch, only on main tabs, never in a workout), restart sheet, watch update pop-up (update-ready, connected watch, Later 24 h, waits for phone update), watch install card (first own workout, Wear OS says app missing), save-problem banner (until next good save), one Workout-tab notice at a time (backup moved, safekeep, What's new). No sound, no screen-off path. New 01 (S3); reused FN-A3-notes-claude-1-06, -07.
- H2.1 done: conditions written above; watch paths also need Wear OS to name the watch node and the watch Play Store.
- H2.2 done: these are the member's own phone notices; owner has no per-member view and needs none. Watch pop-up logs its reason to the watch log only.
- H2.3 done: 01 (watch pop-up silent while phone update put off).
- H2.4 done: no gym switch here; reach is per phone, not in gym rows. Crispy Curves app link 0 of 2 (field-fill.csv), so 0 of 2 members known to have the app; watches and app versions not stored, not countable.
- H2.5 done: needs a real-phone check: (a) Pixel/Samsung watch paired, older watch app: does the pop-up show, does "Update on watch" open the watch Play Store; (b) watch out of reach then back: pop-up within ~30 min; (c) Play in-app update on a Play install: full screen, download, restart sheet.
- lens-cover ok; merge --dry run (root_cause_key was 7 words, fixed).
