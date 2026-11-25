# B-alerts-panel-ui-shell-a checkpoint
- started 2026-11-26
- Alert paths in area: in-tab chime + browser notice (NeedsYou.tsx:112-160, 430-460), closed-app push switch + daily/weekly choice (AlertsCards.tsx:97-385), bell offer (AlertsCards.tsx:393), manual WhatsApp (WhatsAppSheet, SendQueueSheet, MemberCardSheet, NewGymReady). Bell/WhatsNew send nothing.
- Findings: 01 off-switch still rings open tab; 02 once-a-day ignored in open tab (default mode daily, 0076:45); 03 sound silent before first click (same as hq-a-02 but panel); 04 notice stays after done. Reuse logic-2-a-02 (devices not listed), logic-2-a-03 (no quiet hours), screens-1-b-04 (WhatsApp sent not shared).
- H2.4 Crispy Curves (SQL, gym filter): 2 push devices saved, 1 named person, mode daily, 2 staff rows; members: app link 0 of 2, birthday 1 of 2, check-in phone 1 of 2 (field-fill.csv).
- Output written, 6 rows (4 findings, 2 grid); lens-cover ok; merge --dry 6 of 6 passed.
