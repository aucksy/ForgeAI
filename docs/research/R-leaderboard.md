# R-133 — Gym leaderboard and challenge (spec, 26 Oct 2026)

Owner's picks (26 Oct): counts = workouts logged AND kg lifted, last 30 days; prize = everyone who hits the
goal; names = first name + initial, opt-in (off by default). Tracker row: "Monthly gym challenge with a
ranking" (#58 idea 1). Map: docs/ux/MEMBER-APP-MAP.md §3.4 (Gym → card; Settings → "What my gym can see").
Research warning (R1, R-offers-notices): rankings put off the bottom → everyone who hits the goal wins; the
list shows the top 10 and YOUR place only, never the bottom.

Build pattern: exactly as R-124 gym timings (server 0036 + supabase/tests/0036 + admin page + member app,
hidden until the server answers). Server change 0037 is NOT applied live until the owner says yes.

## Data that leaves the phone (privacy)
Only for a phone that joined a gym (member key of the app's Join, 0002). Per day, for the last 31 days:
`{"d":"YYYY-MM-DD","w":<workouts that day>,"kg":<kg lifted that day>}` (days with no workout left out), and
`showName` (the member's switch). No exercise, set, weight per lift, body weight, photo or note. kg is the
app's ONE volume rule (tracker/engine/volume.ts, same as Progress). Sample/demo data is never sent.

## Server 0037_leaderboard.sql (additive, re-runnable; RLS on, no policies, no grants; RPCs only)
Tables
- `gym_member_days (gym_id, member_id → gym_members, day date, workouts int, kg numeric, primary key
  (gym_id, member_id, day))`. A push REPLACES that member's rows for the 31 days it covers. Days older than
  62 days are deleted on every push (nightly clean-up not needed).
- `gym_member_board (gym_id, member_id, show_name bool default false, hidden bool default false (the gym
  hid them), hidden_by, updated_at)`.
- `gym_challenges (id uuid, gym_id, title text <= 60, measure 'workouts'|'kg', goal numeric > 0,
  starts_on date, ends_on date (ends_on - starts_on between 6 and 30 → 7 to 31 days), prize_days int 0..60,
  created_by, created_by_name, created_at, cancelled_at)`. At most one not-cancelled challenge whose dates
  overlap another per gym (OVERLAP). Can start today or later (not in the past), at most 60 days ahead.
- Suspended-gym trigger `_gym_not_suspended` on all three (as 0036).
Plausibility (server, on push; also the phone never sends them): a day with workouts > 3 or kg > 60000 is
dropped (counted 0); kg < 0 → 0; dates outside [today-31, today+1] dropped. At most 40 day rows per push.

RPCs (member key, as `member_gym_timings`)
- `member_board_push(p_key text, p_days jsonb, p_show_name boolean)` → `{ok:true}` | BAD_KEY | INVALID.
- `member_board(p_key text)` → `{ok, gymName, members: n (members with any day in the window),
  workouts: {top:[{rank, name, value, me}], me:{rank, value} | null},
  kg: {top:[...], me:{...} | null},
  challenge: null | {id, title, measure, goal, startsOn, endsOn, prizeDays, myValue, hit, hitters: n}}`.
  Window = the last 30 days ending today (gym's date: Asia/Kolkata). Top 10 by value desc, ties share a
  rank (1,2,2,4), members with value 0 left out. `name` = "Rahul S." (first word of gym_members.name +
  first letter of the last word + '.') when show_name, else 'A member'; `me` true on your row. Hidden
  members never appear in anyone's top 10 (they still see their own number). The challenge = the one
  running today, else the most recent ended within 7 days, else null; `myValue` = your total inside its
  dates; `hit` = myValue >= goal.

RPCs (owner/desk session key, as `owner_gym_timings`)
- `owner_challenges(p_key)` → `{canEdit, challenges:[{..., hitters:[{memberId, name (full name), phone,
  value}] , entrants: n}]}` newest first, last 12 months. Owner or desk (the desk hands out the free days).
- `owner_save_challenge(p_key, p_challenge jsonb)` → `{id}`; insert, or update when `id` given and it has not
  started. Owner only (OWNER_ONLY). INVALID / OVERLAP.
- `owner_cancel_challenge(p_key, p_id uuid)` → `{ok}` owner only.
- `owner_board(p_key)` → the same two top-10 lists as members see but with full names and a `hidden` flag,
  plus `hiddenMembers:[{memberId, name}]`. Owner or desk.
- `owner_hide_on_board(p_key, p_member uuid, p_hidden boolean)` → `{ok}` owner only.

Tests `supabase/tests/0037_leaderboard.sql` in the 0036 style (PGlite in CI): push replace, plausibility drops,
ties, top 10, names opt-in and 'A member', hidden, window edges, challenge overlap / dates / owner-only /
desk read, hitters, suspended gym read-only, BAD_KEY for a left member, old days deleted.

## Admin app (apps/dashboard)
Page "Challenges" (sidebar + More, near "Gym timings"): the running challenge with a progress list (who hit
the goal, with phone + "Give free days" using the existing workout reward / free-days tools if one fits, else
a plain list to copy), "New challenge" (title, Workouts or Kg lifted, goal, start, 7 to 31 days, free days),
past challenges, and a "Leaderboard" panel (two top-10s with full names, "Hide from the leaderboard").
Desk: read-only except nothing to edit. Words in plain English (member-words rules).

## Member app (apps/mobile)
- Push: after a workout is saved, on app start, and on Gym tab focus (at most once per 10 minutes), for
  phones in a gym only, not demo data. Day totals from the same reads as Progress (volumeService).
- Gym tab card "Leaderboard · last 30 days": tabs Workouts | Kg lifted (units-aware: lb shows lb), top 10,
  your row highlighted, "You: 7th · 12 workouts" when outside the top 10; the challenge on top when there is
  one: title, "12 of 16 workouts · ends 30 Nov", progress bar, "Hit the goal: 7 free days. Show this at the
  desk." when hit. Hidden until the server answers (0037 not live = no card, no error).
- Settings → "What my gym can see" → "Show my name on my gym's leaderboard" (off by default). Off = 'A member'.
- Banned member words: volume, session, PR, sync.
