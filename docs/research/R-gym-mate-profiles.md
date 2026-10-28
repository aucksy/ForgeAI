# Gym mate profiles: research (R-164, 28 Oct 2026)

**Owner's ask:** tap a name on the gym leaderboard to see that member's profile "like we see our own", only inside
the gym. Owner's pick: a separate switch, "Let my gym mates see my workouts", off by default.

## How Hevy does it
- Every profile is **public by default**: anyone can open it and see the workouts, the media and the numbers.
  A **private profile** only means others must send a follow request and be accepted
  ([Hevy help: social guide](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts),
  [Hevy: user profiles](https://www.hevyapp.com/features/user-profiles/)).
- Single workouts can be hidden even on a shared profile; workout photos follow the profile's setting
  ([Hevy: social features](https://www.hevyapp.com/features/social-features/)).
- The Discover feed shows workouts of people you do not follow
  ([Hevy: discovery feed](https://www.hevyapp.com/features/discovery-feed/)); Hevy's pages do not say whether private
  profiles are left out of it.

## What people dislike (from the pattern above and the usual complaints about public fitness feeds)
- Sharing that is **on unless you find the switch** (public by default), and strangers seeing your body photos
  and body weight.
- Not knowing **who exactly** can see what, and data that **stays** after you stop sharing.

## Our version (better for a gym)
1. **Off by default**, one plain switch that says exactly what is shared; showing the name alone shares nothing more.
2. **Only people in your own gym**, only from the leaderboard, and only while your name shows and the gym has not
   hidden you. The gym's staff get no screen for it.
3. **Small and safe:** a summary per workout (name, date, time, kg lifted, best set of up to 8 exercises), the last
   60 days and at most 30 workouts. Never sets, body weight, photos, notes or the phone number. Switching off or
   leaving the gym deletes it at once.
4. No photo store on the server: profiles show initials (a shared display picture would need a new member-photo
   store; there is none today).
