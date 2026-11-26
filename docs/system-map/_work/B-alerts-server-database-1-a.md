# B-alerts-server-database-1-a checkpoint

## Items
- L11.1 done: in 0001-0033 the server sends nothing itself. Paths: gym messages = inbox only, read when the app opens (push came later, outside this area); timed messages need no scheduler; withdrawn ones leave the inbox (done means gone ok). Automatic reminders = switches only, each phone schedules its own. Sign-in codes handed over by hand on WhatsApp. Emergency support access writes a list row, no notice. Findings 01, 02; reused FN-B-alerts-phone-shop-1-a-01/-02.
- H2.1 done. Automatic reminders reach a member only if: app installed and joined with the gym code, gym keeps records online, number proven at a QR check-in, first name matches the list, number not shared, date filled (birthday/joined/plan), "we miss you" switched on, phone has read the gym since the last change, notifications allowed, member's own gym-reminder switch on, phone maker rules, app version's default for untouched switches. Messages: app member, not left, joined no later than 14 days after the message, opens the app. Findings 03, 04.
- H2.2 done: server gives the owner switches only, no per-member reach; reused FN-B-alerts-panel-logic-1-a-01, FN-B-alerts-panel-logic-1-b-02.
- H2.3 done: reused FN-B-alerts-panel-logic-1-a-01, 04, FN-B-alerts-phone-native-a-03.
- H2.4 done (field-fill.csv, Crispy Curves): 2 roster members, 2 app members; proven check-in number 1 of 2; birthday filled 1 of 2; app link 0 of 2; 1 membership with plan end. So birthday wish, welcome, anniversary, plan reminders reach at most 1 of 2 app members (birthday only if the same member has both); a message to everyone reaches 2 of 2 app members only when they open the app.
- H2.5 done: needs a real-phone check: plan-ending and birthday reminders set by the phone itself, on OPPO/Xiaomi/Samsung with battery saver on and screen off: does it ring and show; after the owner switches a reminder off, does a phone that has not opened the app still fire it.
- Tools: see report.
