# Training progress over 12 months (R-535, R-537)

Owner, 14 Nov 2026: one week of data says nothing. The gym must see lines that show whether a member is
progressing, over "at least last one year since they joined the app".

## Where it stands

| Part | State |
|---|---|
| Admin panel: lines, tags, every workout (Step 1) | Built. Reads whatever the phone shares. Today that is 3 months (at most 30 workouts). |
| Admin panel reads 12 months when it is there | Built (reads up to 400 workouts). |
| Server: take 12 months (`supabase/migrations/0084_progress_year.sql`) | Built, tested in CI. **NOT LIVE: needs the owner's yes.** |
| Phone: send 12 months (`apps/mobile/src/shop/trainerRecent.ts`, `trainerSync.ts`) | Built, **switched off** (`SHARE_A_YEAR = false`) until the owner approves the member words below. |
| Member words for the sharing switch | **Draft below. Needs the owner's yes.** Not in the app yet. |

Today nothing changes for members: the phone sends exactly what it sent before.

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

1. The owner says yes to the member words below (and to 0084 going live).
2. Apply 0084 on the live server (its CI test passes: `supabase/tests/0084_progress_year.sql`).
3. Phone: set `SHARE_A_YEAR = true` and replace the Settings caption with the approved words, in one change.
4. Next app release (version bump, only after he says "release"). Until members update, the panel keeps showing
   3 months for them, and says so ("Shared from the member's app: ... to ...").
5. The panel needs no new release for this: it already reads 12 months.

## Draft member words (NEED THE OWNER'S YES)

Shown in the MettleUp app: Settings, under the switch "Share my workouts with my trainers" (the switch's name stays).
They replace today's caption: "Your gym and your trainer see your kg lifted each week, your best lifts, and up to
30 workouts from the last 3 months with each exercise's best set. Never your body weight, photos or notes. Off:
the gym deletes it at once."

> Your phone sends your gym your workouts from the last 12 months: the day, the workout's name, and for each
> exercise your heaviest set and how many sets you did. Your gym and your trainer see it as charts, to see if you
> are getting stronger. They never see your body weight, photos or notes. The gym deletes it at once if you switch
> this off or leave the gym.

(Checked with the member-words rules and a Gemini second opinion, 14 Nov 2026; Gemini's shorter sentences kept.)

Join screen line (unchanged, already approved): "Your gym and your trainer see your workouts, so they can help you
progress."

One decision for the owner: "12 months in the app" includes workouts from before the member joined this gym (for
example at an earlier gym). He asked for "since they joined the app". The words above say "the last 12 months" so
the member knows. If he prefers "since you joined this gym", the phone can start from the join day instead.
