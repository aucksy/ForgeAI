# B-alerts-panel-screens-1-a checkpoint

## Items
- started 26 Nov 2026: read brief, items list, pilot lessons.
- L11.1 reading done: screens send nothing themselves; WhatsApp = owner taps (Attendance 941, Enquiries 523, MemberDetail 384/503). Auto pop-ups come from server triggers on diet plan, measurement, challenge, workout plan (0073).
- L11.1 done: this area sends nothing by itself. Manual WhatsApp (owner taps): Losing the habit, enquiry follow-up, app link, member WhatsApp sheet. Auto member pop-ups (server, 0073) on: diet plan sent/changed, workout plan sent/changed, measurement saved, new challenge (all live members with push). No quiet hours (04); every diet edit re-pings (03); repeats of the same note guarded by tag. Feedback reply: page polls while waiting, reply only in this browser (reused FN-L14-panel-logic-1-01).
- H2.1 done. Member pop-up conditions: app installed, joined gym in app, check-in mobile = list mobile, same first name, mobile not shared with another list member, 'Messages from my gym' on (push address kept), phone allows notifications, phone maker rules, pop-up under 6 hours old. Challenge: joined gym + push address only.
- H2.2 done: send sheet shows nothing per member (01); 'Using the app' tag uses a different rule (02).
- H2.3 done: 01.
- H2.4 done (field-fill.csv, Crispy Curves): 2 list members; mobile 2 of 2; app check-in mobile 1 of 2; app link 0 of 2 (so the 'Using the app' tag shows for 0 of 2); birthday 1 of 2. Diet/workout/measurement pop-up reach at most 1 of 2; challenge pop-up at most 1 app member. Push address count not in field-fill: not countable here.
- H2.5 done: needs a real-phone check: send a diet plan to a Crispy Curves member on OPPO/Xiaomi/Samsung with battery saver on and screen off; look for the pop-up, its sound, and that a tap opens the diet plan. No watch path in this area.
- Output written: 4 findings, 2 grid rows. lens-cover ok; merge --dry 6 of 6 passed.
