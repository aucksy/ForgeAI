# B-alerts-phone-tracker-lib-a checkpoint
- Area grep (notification, push, sound, haptic, watch, timers, share): the three folders send nothing themselves. Only alert-linked paths: gym plans arriving as folders (pop-up sent by the server, folder made on Workout tab open), In use screen (on-screen, opens after a set, waits for the record pop-up, drops when rest ends), resume-on-tap rule, watch-worded In use lines. Share pictures go only where the member picks.
- L11.1 done: findings 01 (changed-plan pop-up leads nowhere after a deleted folder), 02 (pop-up tap can show the old plan for 10 min).
- H2.1 done. Gym plan folder reaches a member only if: app installed and linked to the gym (proven number), gym has the trainerPlans feature, plan assigned to the member, member never deleted that plan's folder, Workout tab opened, last ask over 10 min ago, online. The pop-up also needs notifications allowed and phone maker rules.
- H2.2 done: owner cannot see per member reach (reused FN-B-alerts-panel-screens-1-a-01, -1-b-02).
- H2.3 done: 01.
- H2.4 done: Crispy Curves (field-fill.csv): app link 0 of 2, trainer 0 of 2, so gym plan folders and their pop-ups reach 0 of 2 members.
- H2.5 done: needs a real-phone check: on OPPO/Xiaomi with the app killed and battery saver on, send a plan change; check the pop-up shows and sounds, the tap opens the Workout tab, and the new plan is there (not the old one). In use lines match the watch rest screen: check on a paired watch.
- lens-cover ok; merge --dry 4 of 4 passed.
