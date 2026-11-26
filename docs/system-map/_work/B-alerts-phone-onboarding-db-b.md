# Checkpoint B-alerts-phone-onboarding-db-b (gap-3 + gap-4, phone/onboarding-db), 26 Nov 2026
- Read lens rules, pilot lessons, items list (28 features). Grepped area for timers, AppState, WhatsApp, reminders, backup, copy.
- Automatic actions in area: start-up one-time repairs, erase telling the gym the member left (kept and retried), erase/demo turning reminders off, sign-in starting the cloud copy, number link after a straight-in join. Drive backup is manual only (no caller of backupNow runs on its own).
- H3.1/H3.2 done: NEW 01 (number link after join fails silently, never retried); reuse FN-L16-phone-onboarding-db-03 (repairs), FN-L14-phone-onboarding-db-02 (start-up failure), FN-B-run-phone-cloud-backup-ai-a-04 (copy). Erase leave: kept until the gym confirms, confirm screen says "told when online": fine.
- H4.1/H4.2 done: pairs = phone-number vs Google account (reuse FN-B-alerts-phone-cloud-backup-ai-b-01); Drive restore / import undo vs cloud copy (reuse FN-B-truth-phone-cloud-backup-ai-a-01/-02); erase leave vs gym's reminders (both cleared together).
- H4.3-H4.5 done: marks = straight-in note (database meta, this phone, one-time courtesy note), pending-leave list (phone, cleared when gym confirms), intro and resume (phone, by design). No second place counts them.
- H4.6-H4.8 done: to-act items = pending leave (retried each start, leaves when confirmed), Undo restore/import (leave when used). No item that cannot learn it was handled.
- Code lines read: about 650 of 3,000.
- Output written (1 new finding, 2 grid rows). lens-cover ok; merge --dry 3 of 3 passed. Step done.
