# ForgeAI cloud (Supabase) — beta setup

Free tier, Mumbai region. One-time owner steps to bring the cloud online.

## 1. Apply the schema
Supabase Dashboard → **SQL Editor** → paste all of `migrations/0001_init.sql` → **Run**.
Creates `gyms`, `profiles`, `member_summary`, RLS policies, the version guard, and
the `create_gym` / `join_gym_by_code` / `delete_my_cloud_data` RPCs.

## 2. Beta auth setting (important)
Dashboard → **Authentication → Providers → Email** → **turn OFF "Confirm email"** for
the beta, so a member can sign up and immediately sync (no email round-trip during
testing). Re-enable it before real launch.

## 3. Create a test gym + get its join code
SQL Editor (run as the owner — or just insert directly for testing):
```sql
-- quick test gym with a known code:
insert into public.gyms(name, join_code) values ('Iron Temple Fitness', 'IRON01');
```
Members enter **`IRON01`** in the app (Settings → Gym sync) to connect.
_(In production the owner calls `select public.create_gym('My Gym');` after signing in,
which returns a random `join_code`.)_

## 4. Verify it works
- In the app: Settings → **Gym sync** → Create account (email + password) + code `IRON01`
  + consent → **Connect**. Log a workout in chat → a row appears in `member_summary`.
- RLS check: `member_summary` should only be readable by that member and the gym's
  owner/trainer. Test as a second gym's member — they must see nothing.

## What syncs (and what doesn't)
Only a **one-row summary per member** (last active, streak, workouts 7d/30d, weight,
today's calories/protein) is pushed — **one way, phone → cloud**. Full history stays
on the phone. No two-way sync.

## Config in the app
`app.json > extra.supabaseUrl` + `supabasePublishableKey` (the publishable key is safe
to ship — RLS-guarded). The **service-role/secret key is never in the app.**

## Keys / naming
This project issues the new-style **`sb_publishable_...`** key (publishable). Never put
the `sb_secret_...` key in the mobile app — it bypasses RLS and belongs only in server
functions / the future owner dashboard's server side.

## Free-tier gotcha
A free Supabase project **pauses after ~7 days of no activity**. If sync stops, open the
dashboard to un-pause it (or add a tiny scheduled ping). Upgrade to Pro before launch.

## Gym branding (0005_gym_theme.sql)
Run `migrations/0005_gym_theme.sql` after 0004 (SQL Editor → paste → Run; re-runnable). It adds the
brand columns on `gyms`, the public `gym-logos` bucket, `owner_set_brand`, and the `brand` object in
`member_join` / `member_me` / `owner_gym`.

- **Branding a gym:** the owner opens the panel → Settings → **Branding**, uploads a logo, picks a
  colour (and optionally a background tone and bold-italic headings), checks the phone preview and
  presses Save. New members get it straight after joining. Members already in the gym get it after
  their app next checks with the gym (on opening, and on coming back to it at most once an hour),
  the next time they open or come back to the app — under the gym's logo, never in the middle of
  a workout.
  Keeping ForgeAI's orange saves no colour, so a logo-only gym keeps ForgeAI's own colours.
- **Test gyms:** `FORGE1` stays unbranded (ForgeAI's own look). `RAMS01` — RAM'S FITNESS CLUB IMPACT —
  is seeded in their colours (#F7D411 on #0A0A0C, bold italic headings) but has no owner key, so the
  panel cannot open it. To give it a logo: in the panel's own gym, upload the logo on the Branding
  screen, copy the logo link it shows, then run
  ```sql
  update public.gyms set brand_logo_url = '<that link>' where join_code = 'RAMS01';
  ```
  (The test picture is made by `apps/mobile/qa/tools/extract_rams_logo.py` from their proposal PDF;
  it is not in the repo.)
- **Removing a brand:** Branding → "Use ForgeAI's look" (saves all colours and the logo as empty).

## Gym logos: only our bucket (0006_brand_logo_check.sql)
Run `migrations/0006_brand_logo_check.sql` after 0005 (SQL Editor → paste → Run; re-runnable). It
puts the logo rule on the `gyms.brand_logo_url` column itself as a CHECK constraint
(`gyms_brand_logo_url_ok`, using 0005's `_logo_url_ok`): a gym's logo is either empty or a file in
this project's public `gym-logos` bucket, in an upload-ticket folder. Before it, the rule lived only
inside `owner_set_brand`, and a signed-in owner account could write any link straight into the
column (the owner's update policy from 0001) — for example a tracking pixel every member's phone
would load. The member app also refuses any logo link that is not a `gym-logos` bucket file.

- If the VALIDATE step fails, a row holds a link from elsewhere. Find it with
  `select gym_id, brand_logo_url from public.gyms where not public._logo_url_ok(brand_logo_url);`,
  set that `brand_logo_url` to null, and run the file again.
- The RAMS01 step above still works: the panel's logo link passes the check.

## Workout offer, group and timed messages (0025_workout_offer.sql) — NOT APPLIED
Waits on the owner's yes (OWNER-INBOX #49 step 2) and his approval of the consent words and privacy
lines in `docs/overhaul/offers-step2-words-for-approval.md`. Until it is applied, the member app
shows no offer card and the admin app says "Workout offers in the app are not switched on for your
gym yet"; messages go to everyone as before.

To switch it on: (1) SQL Editor → paste all of `migrations/0025_workout_offer.sql` → Run
(re-runnable; after 0024). (2) Paste `tests/0025_workout_offer.sql` → Run: it must end in an error
that reads `RESULT PASS (71 checks)` (it changes nothing). Paste `tests/security.sql` → `RESULT PASS`.
(3) Put the approved privacy lines into `docs/launch/PRIVACY-NOTICE.md` and `-HI.md` (new "Last
updated") and ship the member app release that has the offer card; deploy the admin app. (4) In the
admin app: Messages & offers → Workout offer → Start offer.

Known and accepted: a date the server already counted stays counted if the desk later takes that
check-in back (Visits → undo). The count never goes down by itself; the owner can take a reward back
while the plan's last day is unchanged.

## ForgeAI HQ, the system owner's panel (0026, 0027, 0028) — NOT APPLIED
Owner said yes (#51, "make it all LIVE"). Plan: `docs/overhaul/research/R-owner-panel.md`. Worker:
`deploy/hq` (forgeai-hq.aakashpahuja.in). All three are additive and re-runnable; apply in order, after
0025.
- **0026** `hq_audit` (append-only, 2 years) and the count reads `hq_gyms`, `hq_gym`, `hq_system`,
  `hq_audit_list`, `hq_log`. Changes nothing the apps use.
- **0027** `gyms.status` (every existing gym becomes `active`; new gyms start `trial`), "paused =
  read-only" by triggers (crm_records, shop_products, shop_orders, gym_messages, gym_staff, the gyms
  row), the delete-request list and the HQ actions. No gym function is edited.
- **0028** support access (`hq_grants`, `hq_gym_records`, `owner_hq_grant` / `owner_hq_end` /
  `owner_hq_access`), the 1-year access log (`gym_access_log`, written by triggers) and
  `hq_nightly_cleanup`. **Changes one function:** `crm_pull` gets one line that logs a whole-copy pull.
Every `hq_*` function is granted to `service_role` only, so only a Supabase secret key (HQ's own key,
"hq") can call it; the apps' publishable key and every gym key are refused (tests/0026_hq_access.sql).

To apply: SQL Editor → paste each migration → Run, **0026, 0027 and 0028 together and in this order**
(also when re-running after a change: re-run all three, in order). Each starts with
`set lock_timeout = '3s'`: if a busy table keeps it waiting it stops instead of holding the apps up;
just run it again. Then paste each test and check its last line:
`tests/0026_hq_access.sql` → `RESULT PASS (54 checks)`, `tests/0027_hq_actions.sql` →
`RESULT PASS (64 checks)`, `tests/0028_hq_breakglass_and_logs.sql` → `RESULT PASS (49 checks)`,
`tests/security.sql` → `RESULT PASS`. The tests always end in an error, so they change nothing.

**Owner step (Supabase dashboard, after HQ works):** Project Settings → API Keys → **Legacy API
keys** → disable the legacy `service_role` key, and keep the secret key named **"hq"** as the ONLY
secret key. Why: the database trusts the person named in each HQ call (`p_actor`) from any caller
holding a service_role key, so every extra secret key is another way to act as HQ. (First check
nothing else uses the legacy key: today nothing in this repo does; the apps use the publishable key.)

Access log period: 7 days until 13 May 2027, then 1 year (`_access_log_keep`), matching the privacy
notice's "Technical logs" line. Change both together.
Cloudflare database: `cd deploy/panel && npx wrangler d1 migrations apply forgeai-web --remote` (adds
`ai_limits`, 0004).

## Free trial and plan (0030, R-97) — NOT APPLIED, needs the owner's yes
Additive and re-runnable; apply after 0028. Adds `gyms.trial_starts_at`, `trial_ends_at` (default 3
months from the start, so every way a gym is made gets it), `plan` (starter | pro | ai | null),
`billing` (monthly | yearly | lifetime | null), `paid_until`. Gyms that exist when it runs start
their trial that day. Only HQ changes these (a trigger raises HQ_ONLY otherwise). New HQ actions
`hq_set_trial` (never past 6 months from the start: TRIAL_CAP) and `hq_set_plan`, both audited.
**Changes two functions additively:** `_hq_gym_extra` (HQ's gym rows also carry the trial and
plan) and `owner_hq_access` (the owner's answer also carries `trial`, for the admin app's banner).
Re-running 0028 undoes those two: **always re-run 0030 after 0026-0028.**
Nothing locks when a trial ends. Test: `tests/0030_plans_and_trials.sql` → `RESULT PASS (41 checks)`,
then `tests/security.sql` → `RESULT PASS`. Before it is applied, HQ shows "Trials need the database
update" and the admin app shows no trial line.
