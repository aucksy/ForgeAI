# Checkpoint: A2-server-database-1

Status: DONE. 231 of 231 source lines covered, 0 left. 39 feature rows (F-server-300 to F-server-338) in
docs/system-map/_work/out/A2-server-database-1.jsonl. A coverage check (every item id in at least one
"sources", every "entry" a real file and line, every line parses as JSON) passed.

## Finished units
- [x] 1. Source list read (231 lines: 168 functions, 35 tables, 22 triggers, 6 whole files).
- [x] 2. Code read: the opening comment of all 33 migration files, plus the comment blocks above the
      helpers whose name did not explain them (about 800 code lines of the 2,500 allowed). Function
      bodies were mostly NOT read line by line; rows rest on the files' own header comments and the
      comment above each function.
- [x] 3. Switches and plan gates noted (below).
- [x] 4-6. Items grouped into 37 features + 2 not-a-feature rows; rows written.

## Switches and plan gates met
- gym_auto_reminders.settings: one on/off per reminder case, per gym, owner only
  (supabase/migrations/0029_auto_reminders.sql:13).
- app_config 'free_limits' {"on": false, routines 4, customExercises 7, chartMonths 3}: one switch for the
  member app's free-plan limits, shipped off (supabase/migrations/0032_member_cloud.sql:108).
- Per-offer choice: days counted by the member or given by the desk (0025 header, R-82). A per-offer
  setting, not a per-gym switch.
- Plan gate: NONE in this area. gyms.plan ('starter' | 'pro' | 'ai') is only stored and shown; a search of
  0001-0033 found no function that refuses anything by plan, and 0030 says "NOTHING LOCKS WHEN A TRIAL
  ENDS" (supabase/migrations/0030_plans_and_trials.sql:14). So every row has tier "free".
- gyms.status 'suspended' (HQ pause) makes a gym read-only through triggers (0027). Written as its own
  feature (F-server-324), not as a switch.

## Status notes
- 0031 (branches), 0032 (member cloud copy, free limits), 0033 (terms) each open with "NOT APPLIED. Needs
  the owner's yes". Their rows have status "unknown": this step reads no database, so whether they were
  applied since is not checked.
- F-server-300 (0001's account design: profiles, member_summary, create_gym, join_gym_by_code,
  delete_my_cloud_data) has status "unknown": 0012 limits it to signed-in users, and whether any app still
  calls it was not checked in this area.

## Could not check
- Whether each function is really called by an app or Worker (outside this area's folders).
- Functions named in the file headers but not in my item list (for example member_check_in, gym_create_online,
  owner_send_message, member_membership, owner_hq_access): their newest definition lies in another area's
  migration range, so they are not in these rows.

## Seen in passing
- supabase/migrations/0027_hq_actions.sql:79 and supabase/migrations/0031_branches.sql:168 both create a
  trigger named gym_staff_not_suspended on gym_staff (0031 with a different function,
  _gym_staff_not_suspended). Looks like a deliberate replacement, but worth a check that 0031 drops the
  0027 one first and the two rules do not both need to run.
- 0030's comment says a new branch copies the first branch's trial and plan (0031 header line 40): one
  business, one trial. HQ's hq_set_trial / hq_set_plan (0030) act on ONE gym row; not checked whether they
  keep branches of a group in step.
