# Training progress over 12 months (R-535, R-537, R-551)

Owner, 14 Nov 2026: one week of data says nothing. The gym must see lines that show whether a member is
progressing, over "at least last one year since they joined the app".

## Where it stands

| Part | State |
|---|---|
| Admin panel: lines, tags, every workout (Step 1) | Built. Reads whatever the phone shares. Today that is 3 months (at most 30 workouts). |
| Admin panel reads 12 months when it is there | Built (reads up to 400 workouts). |
| Server: take 12 months (`supabase/migrations/0084_progress_year.sql`) | **Live** (owner's yes, 14 Nov 2026; R-551). |
| Phone: send 12 months, only since joining this gym (`apps/mobile/src/shop/trainerRecent.ts`, `trainerSync.ts`) | **On** (`SHARE_A_YEAR = true`), with the approved words. Reaches members with the next app release. |
| Member words for the sharing switch | **Approved by the owner, 14 Nov 2026** (below), in the app. |

Owner's answers, 14 Nov 2026: "since joining" / "Yes to the 12-month words" / "yes to the 12-month database change".

## What the gym sees (Step 1, panel only)

- **List** ("Training progress"): each member's line of workouts per week (12 weeks), "24 workouts in 12 weeks",
  and one tag: "Getting stronger", "Steady", "Dropping" or "Not enough data yet", with the main exercise behind it
  ("Bench press: strength score 72.8 → 82.3 kg"). The old "This week: 3 workouts · 8,490 kg lifted" line is gone.
- **One member** (tap the card): the range shown ("Shared from the member's app: 26 workouts, 21 Jul 2026 to
  16 Oct 2026."), an Overall tag, a line of workouts per week, a strength line for each of the 6 most-done
  exercises with its own tag, and every shared workout with each exercise's best set and sets. The member's own
  page shows the same.
- **Strength score** = the member app's own "Estimated 1-rep max", worked out the same way (Epley:
  kg × (1 + reps / 30), a single is itself, reps above 12 count as 12), from each day's heaviest set. A test reads
  the app's file so the two can never drift apart. A body-weight move (pull-ups) is drawn as its most reps.
- **Tag rule** (said on screen): the best strength score of the last 6 weeks against the 6 weeks before.
  3% or more higher: "Getting stronger". 3% or more lower: "Dropping". In between: "Steady". Fewer than 3 workouts
  with it in those 12 weeks, or none in one half: "Not enough data yet". Overall: more main exercises up than down.
- Light on a phone: the list reads a member's workouts only when the card scrolls into view, 3 at a time, once.

## What it takes to show 12 months (Step 2)

### Phone

- Reads the last 366 days of working sets (warm-ups left out) once per share, and sends per workout: the day, the
  workout's name, and per exercise its heaviest set and how many sets. The same fields as today; only more days.
- Up to 400 workouts, kept under 280,000 characters (the oldest drop off first).
- Tries `member_trainer_share3` (0084). A server without it answers "no such function": the phone then cuts the
  same list to 3 months and sends it the old way. Older phones keep sending 3 months. Nothing breaks either way.
- Switched on by one line (`SHARE_A_YEAR = true`) in the same change as the approved words. A test fails if the
  phone would send a year while the Settings words still say 3 months.

### Server (0084)

- One new function the phone calls (`member_trainer_share3`) and one checker. No new table, no new column, no
  change to any existing function. Same row as today (`gym_progress_summaries.recent`), replaced on every share.
- Limits: 400 workouts, 366 days, 20 exercises a workout, 300,000 characters. Anything else is refused; notes or
  any unknown field are dropped.
- Who reads it: unchanged. The owner, and the trainer the member is assigned to. Nobody else.
- Deleting: unchanged. At once when the member switches sharing off, at once when they leave the gym, and when
  nothing new came for 90 days.

### Size

| A member's year | Text sent and kept |
|---|---|
| 3 workouts a week, 5 exercises | about 44 KB |
| 4 a week, 6 exercises (typical) | about 71 KB |
| 6 a week, 10 exercises (heavy) | about 169 KB |
| Today (30 workouts) | about 10 KB |

Postgres compresses this text to roughly a third on disk. One row per member, replaced each time, so it never
grows past a year. 200 sharing members at a gym: about 14 MB of text (about 5 MB on disk). The phone sends it
after each saved workout and at most every 6 hours on opening the app: about 71 KB each time on mobile data.

**Every set instead of the best set?** Not worth it now. The lines use only the best set per exercise per day.
Every set would make the row about 2 to 3 times bigger (about 160 KB for the typical year) and shows the gym more
than it needs. Revisit only if trainers ask to see each set.

### Release

1. Done 14 Nov 2026: the owner said yes to the member words and to 0084.
2. Done 14 Nov 2026: 0084 applied on the live server.
3. Done (R-551): `SHARE_A_YEAR = true`, the approved caption, and "since joining" (below), in one change.
4. Next app release (version bump, only after he says "release"). Until members update, the panel keeps showing
   3 months for them, and says so ("Shared from the member's app: ... to ...").
5. The panel needs no new release for this: it already reads 12 months.

## Member words (approved by the owner, 14 Nov 2026, exactly as written)

Shown in the MettleUp app: Settings, under the switch "Share my workouts with my trainers" (the switch's name stays).

> Your phone sends your gym your workouts since you joined, up to the last 12 months. For each workout, it sends the
> day, the workout's name, and, for each exercise, your heaviest set and how many sets you did. Your gym and your
> trainers see this as charts, to check that you are getting stronger. They never see your body weight, photos or
> notes. If you switch this off or leave the gym, the gym deletes it at once.

Join screen line (unchanged, already approved): "Your gym and your trainer see your workouts, so they can help you
progress."

## Since joining (R-551)

The owner chose "since joining": the phone sends only workouts on or after the day the member joined THIS gym, never
an earlier gym's, and never more than the last 12 months. The weekly summary follows the same day.

Which day the phone uses:

1. The day this phone joined the gym in the app. The app has kept it for every join since R-86 (23 Oct 2026), per
   member (`gymReminders.ts` noteAppJoin).
2. A phone that joined before 23 Oct 2026 kept no day, and the server does not tell the phone its join date. Then the
   first day this version shares is kept and used: nothing older than that day is sent. The gym sees those members'
   lines grow from that day on (their 3 months already shared is replaced by the next share).

Not used: the gym's own "joined on" date from its member list (0029). It can be years old and is typed by the desk;
the link day is the safe one.
