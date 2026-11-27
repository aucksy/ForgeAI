# Owner observations (from his phone notes)

Source: the owner's notes in Vivo Mind Space, summarised twice by the phone's AI (each note, then the whole
collection "MettleUp Workout T..."), sent as 4 screenshots on 27 Nov 2026, plus his answers the same day (with a
screenshot of the active workout screen, Incline Dumbbell Curl). Nothing was missing above the first screenshot.
Each row joins a cause family in Phase C (No Gaps gate G0) together with the audit's findings; none is dropped.

| Id | Area | His observation | Status |
|---|---|---|---|
| O-01 | Watch | Warm-up set data (weight and reps) must sync reliably between the phone and the watch. | Open |
| O-02 | Watch | The completion tick on the watch must stay active for warm-up sets entered by hand. | Open |
| O-03 | Watch | Watch workout display: a step counter on the left and the heart rate on the right. | Open |
| O-04 | Watch | After the RPE (effort) of a main set, ask for the drop set values at once. | Open |
| O-05 | Watch | The active workout screen on the watch goes to the background by itself. | Open |
| O-06 | Workout | When replacing an exercise with a similar one, a simple option to carry over the old exercise's past data. | Open |
| O-07 | Workout | Active workout screen: show target body parts, timers and the date of the previous session under the exercise name. | Built; its row is redesigned in O-36 |
| O-08 | Workout | Suggestion "i" marks. When the app changes its usual suggestions (its own logic, not the normal one) for the WHOLE exercise, show only the one note at the top of the exercise, never an "i" on every set. Put an "i" on a set only when that one set alone is the exception. Today too many sets carry an "i". He does not like the look of the top note (the green "Previous set volume beaten!" box): it needs a new design. | Open (needs a design) |
| O-09 | Workout | The text behind the "i" is too long. Remove the part that lists the suggested sets and weights: the set list below already shows them. Keep this text only for exception messages that explain WHY the next suggestions differ from the usual ones. | Open |
| O-10 | Workout | The "i" (eye) button must clearly show whether it is open or closed, for example with a small animation or a changed look when pressed. | Open |
| O-11 | Workout | Rep suggestions for isolation exercises: high ranges like 15 are often wrong. | Open |
| O-12 | Workout | Remove repeated information lines in completed set cards. | Open |
| O-13 | Sign-in | Bring back phone number sign-in next to Google sign-in. | Done (phone sign-in, 0.80.0, in Google review) |
| O-14 | Sign-in | Link a person to their gym automatically when their phone number or updated email matches the gym's records. | Open (phone part built as F239 "A gym added you"; email part open) |
| O-15 | Sign-in | Rename "Check with WhatsApp" to "Verify with WhatsApp"; the result must say "verified", not "checked". | Open |
| O-16 | Sign-in | Explain why a first name is asked when someone signs up without a gym. | Open |
| O-17 | Sign-in | First name and last name: two separate fields, both required. | Open |
| O-18 | Gyms | Handle a person with active memberships in more than one gym at the same time. | Open |
| O-19 | Onboarding | Guided tours for new users: how to set up a routine and how the app works. | Open |
| O-20 | Gyms | Membership pause (vacation mode). The member app already offers a pause, but the gym owner must control it: in the admin panel the owner turns it on and sets the rules (for example, a yearly or 6-month plan may pause 2 or 3 times, up to a set number of days). The admin panel is told when a member starts a pause. Guardrails are needed. Open concern: a member who pauses but still trains; the gym's staff may have to spot them, as there may be no access machine or QR scan. The QR scan part of the old note is not related; he will check it. His decision (27 Nov 2026): the gym owner approves each pause. The member's request shows "waiting for your gym's OK" until then, so a member never believes they are paused before they are; the owner must not be able to forget it (reminders). | Open (needs design) |
| O-21 | Admin | Member search in the admin panel. | Open |
| O-22 | Admin | Money section: a count badge on the Dues tab itself, always shown, with the number of members who still owe money (7 members owe = "7"). | Open |
| O-23 | Admin | Member profile: show whether the member is active in the app, or has installed it. | Open |
| O-24 | Admin | Let the gym see a member's workout history and graphs, only when the member allows it. | Open |
| O-25 | Admin | The admin panel refreshes every three seconds. | Open |
| O-26 | Admin | Automatic payment reminders, with a frequency the gym can set. | Open |
| O-27 | HQ | HQ is notified of feedback and enquiries, with automatic replies. | Open |
| O-28 | Sharing | Shared links carry only the app link, not the gym code or other details. | Open |
| O-29 | Marketing | A watch screenshot on the Google Play listing. | Open |
| O-30 | Marketing | A 20 to 30 second lifestyle promo video about the app's benefits. | Open |
| O-31 | Splash | Splash screen: detect the background of an uploaded gym logo so it blends in. | Open |
| O-32 | Splash | After a gym is connected, show both the MettleUp logo and the gym logo at launch. | Open |
| O-33 | Research | Explore a link with calorie apps like Lose It, to see protein intake and sleep. | Idea |
| O-34 | - | (A note about another app, not MettleUp. Removed from this list on his word, 27 Nov 2026.) | Not MettleUp |
| O-35 | Research | Research TLA+ (a formal way to prove logic is correct) for finding bugs, balanced against its cost. | Idea |
| O-36 | Workout | Active workout screen, the second row under the exercise name (body part chip, rest timer "3:00", "5 Nov · Pull 1"). (a) Too much empty space on the left: move the body part chip further left, under the picture. (b) The rest timer does not look like a button, so members will not know they can tap it to change the rest time. (c) The date does not say what it is (the last time this exercise was done). Move it into the exercise's "..." menu as "Last done 5 Nov" or similar, out of this row. | Open (needs a design) |
| O-38 | Gyms | A member photo should be required (gyms cannot remember every face; it also helps spot a paused member who still trains). Self sign-up already lets the member take a picture: make it required, and require it before a pause request if the member has none. Idea: check that the picture really holds one face. His decision (27 Nov 2026): required for every gym member. Members can upload a better picture from the app (some gyms' desk webcams give unclear pictures). A correct picture must never be refused: the face check may only warn ("Use it anyway" / "Retake") and flag the picture for the gym, never block. Measure the check on real sample photos before shipping. | Open |
| O-37 | Sign-in | Idea to explore later: for people without a gym, start with Google sign-in only and hide the Gym tab. Turn the Gym tab on when a gym is found (WhatsApp check, or a gym adds them later). Keep "Connect to a gym" in Settings. Real gym members are brought in by their gym owner anyway. | Idea |
| O-39 | Gyms | One QR code on the entry door for everything (27 Nov 2026): a member with the app checks in; a person without the app is taken to install it. Today the check-in QR (app.mettleup.fit/c/CODE) already does this on Android: with the app it opens "Check in at <gym>"; without it, a page leads to Google Play, then says "join your gym in the app, then scan the poster again". Gaps to design: after install the app does not yet know which gym the person came from (a second scan is needed); the join QR is a separate poster; iPhone gets an "Android only" page; not yet proven on real phone cameras (Google Lens, Vivo camera). He also wants a nicer poster design, with the get-the-app part on it. | Open (needs design) |
