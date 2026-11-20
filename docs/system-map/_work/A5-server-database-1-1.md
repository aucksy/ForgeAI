# A5-server-database-1-1 checkpoint

Done (all 9 features, 19 feature x role pairs). Output: docs/system-map/_work/out/A5-server-database-1-1.jsonl (235 rows: 91 journeys, 143 type lines, 1 finding).

F-server-300: 13 journeys, 23 type lines
F-server-301: 9 journeys, 16 type lines
F-server-302: 11 journeys, 16 type lines
F-server-304: 10 journeys, 14 type lines
F-server-305: 6 journeys, 7 type lines
F-server-308: 8 journeys, 16 type lines
F-server-309: 10 journeys, 14 type lines
F-server-313: 6 journeys, 7 type lines
F-server-311: 18 journeys, 30 type lines

## Words
These are server functions. Where the panel or app words were found they are quoted (dashboard/src/crm/auth/signin.ts errorWords, mobile/src/cloud/session.ts, mobile/src/shop/InviteScreen.tsx:199). Elsewhere user_sees names the server answer (BAD_STEP, CHANGED, TOO_LATE, SOLD_OUT, PICK_GYM); the screen words for those were not opened.

## Entities
All ids exist. Trainer in F-server-311 read as E-gym-trainers (a staff person with the trainer tick); gym_staff.role only allows owner/staff (0010).

## Seen in passing (not sure enough for a finding)
- create_gym (0001_init.sql:120-131) has no empty-name check and no retry key; a double tap makes two gyms. Old account design; not checked whether any screen still calls it.
- A member who switches gym under the old account design (join_gym_by_code) stays on the old gym's member_summary list until the phone's next push.
- demo_start_gym's 300-an-hour brake counts gym_owner_keys rows (0002_shop.sql:191); owner_retire_key deletes those rows, so retired gyms drop out of the count.
- support_make_signin_code (0031_branches.sql:428-445) gives support a full owner session with no time window and no audit row in the function itself; compare promise P-A7-legal-2-13 ("support looks only in a short window"). Not checked whether HQ tooling records it elsewhere.
- Gym rename through a gym record push (crm_push kind 'gym', 0018_staff_and_owner_rules.sql:229-231): not checked whether _staff_write_ok lets a front-desk session rename the gym this way, which owner_rename_gym forbids.

## Could not check
- Tests: no test file was opened, so every journey has coverage "unknown".
- Latest staff_sign_in (0048_security_fixes.sql:282) was read only to line 345; how PIN lock length grows was not read.
- Anything that needs a second test gym (cross-gym isolation) was not run.
