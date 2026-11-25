# B-alerts-panel-logic-1-a checkpoint

## Items
- started 2026-11-26: read brief, lessons, items list. Alert files in area: autoReminders, autoWish, alertInbox, alertHandled, bellGroups, gymAlerts, hqNews, audience, askQuestions, enquiries, billing.
- L11.1 done: area alert paths = gym alerts bell list + browser notice (gymAlerts, alertInbox, alertHandled; done means gone handled by server 0098), automatic reminder switches (phone sets them 9:30 am, one a day), birthday wish reach guess (autoWish), message audience reach (audience), Member questions reply notice (02), MettleUp plan-end reminder on Today, HQ news in bell, enquiry WhatsApp (manual). Reused existing ids.
- H2.1 done: reminders/birthday reach a member only if: member app installed, mobile proven, number on exactly one list member, first names match, plan/birthday filled, switch on, phone opened once after a change, notifications allowed, Android (iPhone none), phone maker rules.
- H2.2 done: reminders page shows only "N of 11 on", no per-member reach (01). Messages reach counts in-app but not pop-up (reused).
- H2.3 done: 01; reused assistant-a-01, A3-notes-claude-1-02, L14-panel-logic-1-02.
- H2.4 done (field-fill.csv, Crispy Curves): 2 list members; proven check-in phone 1 of 2; app link 0 of 2; birthday 1 of 2; plan end 1 of 1 membership. Automatic reminders: on, reach at most 1 of 2. Birthday wish: on, reaches at most 1 of 2 (0 if the one with a birthday is not the proven-number member; CSV cannot tell). Reply notification: at most 1 of 2. Staff alerts: not countable (not member fields).
- H2.5: could-not-check, real-phone check named.
- lens-cover ok; merge --dry 4 of 4 passed. DONE.
