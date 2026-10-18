# Workout plans from the gym or trainer (OWNER-INBOX #6, item 2)

Decided 18 Oct 2026 (owner: "build the useful features from the list"; rule #18: I choose the
experience and order). Plan drafted by a planning agent, checked against the code.

## Idea
A gym plan IS a routine file (`forgeai-routines` v1, apps/mobile/src/tracker/plans/routineFile.ts)
the gym sends. The member app already imports routine files by catalogue key, name, else a custom
exercise (`importRoutineFile`, plansService.ts) and re-imports without losing the member's edits
(`saveImportedFolder`, routineMerge.ts).

## Data
- `crm_records` kind `'workout_plan'` (versioned sync, gym isolation, cross-gym tests for free):
  `{name, note, routines: SharedRoutine[], assign: {memberIds[], planIds[]}, withdrawn, createdAt,
  updatedAt, createdBy, createdByName}`. Withdraw = `withdrawn: true` (no deletes).
- Exercise id = catalogue `key` (never reused/renamed). A slim `packages/exercises` (key, name,
  aliases, equipment, primary, type) generated with the mobile catalogue, plus a parity test.
- Weights in kg; the phone shows the member's unit.

## Server: 0024_workout_plans.sql (live apply needs the owner's yes)
1. kind check + `crm_push` (copied forward from 0021) allows the kind, refuses its deletes, checks
   the shape (`_workout_plan_ok`: <= 14 routines x 30 exercises, sane numbers, 20 KB cap) and
   stamps `createdBy` like 0019's `soldBy`. Staff (trainers) may write.
2. `member_gym_plans(p_key)`: 0023's identity steps (NO_PHONE / GYM_NOT_ONLINE / NOT_ON_ROSTER /
   SHARED_NUMBER / NAME_MISMATCH) via a shared helper; returns plans not withdrawn whose
   `memberIds` hold the roster id, or whose `planIds` hold a plan the member has today.
3. Grants, `security.sql` anon_ok, `supabase/tests/0024_workout_plans.sql`.

## Admin app
`/workouts` screen (list; builder sheet with exercise search incl. Hindi aliases; assign sheet:
members + plans); "Send a plan" on Member detail. Pure logic in `crm/logic/workoutPlans.ts`.

## Member app
`apiGymPlans` (missing function = "not yet"), parser via `parseRoutineFile`; fetch on Shop and
Workout focus, at most every 10 min; one folder per plan marked `fromGym`, label "From <gym> ·
<trainer>", a "<trainer> sent you a plan · Start" card; never auto-follow. Editable; trainer edits
merge in, member edits kept. Withdrawn / gone: folder kept (workouts point at it), relabelled, no
more updates. Offline: nothing changes.

## Phases
1. Package + 0024 + admin list/build/assign-to-members + mobile fetch/folder/merge/offline.
2. Send to everyone on a plan (UI), ready-program templates in the admin app, withdraw, "use the
   gym's version again", trainer-made custom exercises.
Fieldwork question to add: "Do trainers write plans for members today (paper, WhatsApp)?"
