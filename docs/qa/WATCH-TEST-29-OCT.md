# Watch test, 29 Oct 2026 (Pixel Watch + Pixel phone)

What you are checking: the MettleUp watch app shows your heart rate, the rest countdown, and the
next set with last time's numbers, and it buzzes when the rest ends.

## Before you start

- Phone and watch must both have **MettleUp 0.60.0 or later** (the version with the watch changes).
- Get both from the **same place**. Best: both from Google Play (the phone from your tester link, the
  watch from the Play Store on the watch). If one comes from Play and the other from a GitHub file,
  they may not talk to each other.
- If the watch already has an older MettleUp (or ForgeAI) watch app from a file, uninstall it first:
  on the watch, press and hold the app icon, then Uninstall. Then install from the Play Store.

## Steps

1. **Install.** On the watch, open Play Store, search "MettleUp", install. You should see the
   MettleUp icon (not ForgeAI) in the watch's app list.
2. **First open.** Open MettleUp on the watch. Allow heart rate and notifications when asked. You
   should see "Start a workout in MettleUp on your phone". If you see an "Allow alarms" button, tap
   it and turn the switch on (this makes the buzz come exactly on time).
3. **Start a workout on the phone** with an exercise you have done before (for example Bench Press).
   Within a few seconds the watch should show: your heart rate (♥ and a number), the exercise name,
   "Set 1 of 5", **"Last"** with last time's weight × reps for set 1, and a **Complete set** button.
4. **Compare with the phone.** The "Last" numbers on the watch must match the PREVIOUS column for
   that set on the phone. If the phone has a target for today that differs, the watch also shows
   **"Today"** with those numbers (the same numbers the phone's live card shows).
5. **Tick the set on the phone.** The rest starts. The watch should show the countdown in an orange
   ring, "REST ♥ 132" at the top, and under the countdown "Set 2 of 5 · Bench Press" with last
   time's set 2 numbers.
6. **Wait for the end of the rest** with the watch on your wrist and the phone in your pocket. The
   watch should buzz when the countdown hits 0:00 and show "Rest is over".
7. **Complete set from the wrist.** Tap **Complete set** on the watch. On the phone, that set should
   tick itself and a new rest should start on both.
8. **Screen dimmed.** During a rest, lower your wrist until the watch dims. If your watch's
   always-on screen is on, MettleUp stays visible in grey and shows when the rest ends (for
   example "REST ENDS 4:12 PM") plus the next set. Raise your wrist: the live countdown is back.
9. **First-time exercise.** Add an exercise you have never done. The watch should say "No last
   time" and show the target in "Today" if there is one.
10. **Pounds.** On the phone, switch to pounds (Profile → kg, km / lb, miles). The watch's numbers
    should change to lb.
11. **Finish.** Finish the workout on the phone. The watch should go back to "Start a workout in
    MettleUp on your phone" and no buzz should come later.

## If something is wrong

- **The watch shows nothing from the phone:** check both are 0.60.0 or later and came from the same
  place (see "Before you start").
- **No buzz at the end of a rest:** on the watch open MettleUp and tap "Allow alarms" if you see it;
  also in the Pixel Watch app on the phone → Notifications, make sure MettleUp is on and "Mute while
  using phone" is off.
- Take a photo of the watch screen and tell me which step it was.
