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

## Members' workouts on our own server + member accounts (0032, tracker #50/#43) — NOT APPLIED
Needs the owner's yes (#50) before it goes live. Additive and re-runnable; apply after 0030. Adds
`member_items` (one compact row per workout, routine folder, own exercise, body weight, measurement,
progress-photo day and the profile, keyed by the member's Supabase Auth account), `app_config` with the
free plan's switch (`free_limits`, OFF), and the functions `member_copy_put`, `member_copy_get`,
`member_copy_count`, `member_account_delete` (signed-in members only, each on its own rows; "Delete my
account" deletes the copy always, and the sign-in account only when it is nothing but a member
account: Supabase links Google to an existing same-email account, so an owner's or trainer's sign-in,
or an older gym-sync member with a gym, keeps its account) and
`app_limits` (anyone; answers only that row). Row level security: a member reads only their own rows;
there is NO policy for a gym, so no owner, trainer or desk sees any of it (#46 is a later decision).
Size math is in the migration's header (about 1 KB a workout; the free plan holds about 1,500
members for 1.5 years). No existing table or function changes.

To apply: SQL Editor → paste all of `migrations/0032_member_cloud.sql` → Run. Then paste
`tests/0032_member_cloud.sql` → Run: it must end in an error that reads `RESULT PASS (58 checks)`.
Then `tests/security.sql` → `RESULT PASS`. Until it is applied, the app's copy simply waits (its queue
tries again every few hours) and the free limits read as off.

Switching the free plan's limits on later (HQ will get a button; until then the SQL Editor):
`update public.app_config set value = jsonb_set(value, '{on}', 'true'), updated_at = now() where key = 'free_limits';`
(`'false'` switches them off again). Phones pick it up within 12 hours, with no app update.

### Owner steps for "Continue with Google" (one time, free)
1. Google Cloud (skip what tracker #42 already did): open https://console.cloud.google.com/projectcreate,
   make a project named ForgeAI. Open https://console.cloud.google.com/auth/branding: app name ForgeAI,
   your email as support and contact email, audience External; then Audience → "Publish app".
2. https://console.cloud.google.com/auth/clients → Create client → **Android**: package name = the
   app's Play ID (see tracker #57: `com.forgeai.app` is taken, so the ID changes before the first Play
   upload; use the new one, and make this client again if it was made with the old one), SHA-1
   `97:F8:15:53:15:41:CF:71:D4:22:69:8F:5B:6B:84:69:AC:6F:93:88` (the release key's public
   fingerprint) → Create.
3. Same page → Create client → **Web application**, name "ForgeAI app" → Create. Copy its **Client ID**
   (ends in `.apps.googleusercontent.com`; not a secret: send it to Claude for app.json) and its
   **Client secret** (a secret: paste it ONLY into Supabase in step 4, never into chat or a file).
4. Supabase: https://supabase.com/dashboard/project/hdxzqbdiokjklnypfisq/auth/providers → **Google** →
   turn on "Enable Sign in with Google" → **Client IDs**: the Web client ID first, then a comma, then
   the Android client ID → **Client Secret (for OAuth)**: the Web client secret → leave "Skip nonce
   checks" OFF → Save. (If sign-in later fails with a "nonce" error, turn that switch on.)
5. Say yes to applying 0032 (above), and approve the privacy-notice lines for the copy (workouts kept on
   ForgeAI's server for signed-in members, only they can see them, deleted with "Delete my account").
After step 3's Client ID is in app.json and a new app version ships, Settings → Backup shows "Keep your
workouts on ForgeAI" and the welcome screen shows "Continue with Google". The same Client ID also
switches on the Google Drive backup (#42).

## Branches (0031, tracker #41) — NOT APPLIED, needs the owner's yes
Additive and re-runnable; apply after 0030. A branch is a gym row like any other (own records, receipt
series, join code, staff); branches of one business share a `gym_groups` row (`gyms.group_id`, null =
a gym with one branch, exactly as before). Every owner is an owner of every branch; desk staff are per
branch. Added branches number receipts `B2/2026-27/0001` (imports `B2I/26-27/0001`), checked by a
trigger, so two branches under one GSTIN never print the same number. A member whose record says
`allBranches` may be checked in at another branch's desk (`branch_check_in_visitor`) or with that
branch's QR (member_check_in); the visit is kept in their own branch with `atGymId`. HQ reads groups
with `hq_groups`. **Changes five functions additively:** owner_add_person, owner_remove_person,
owner_sign_out_person, support_make_signin_code (0010) and member_check_in (0020), and points 0027's
gym_staff paused-gym trigger at `_gym_staff_not_suspended` (an owner can still be taken off or put on a
paused branch by those functions); re-running 0010, 0020 or 0027 undoes them, so always re-run 0031
after them. A new branch takes the first branch's HQ status, plan and trial dates and its GST number.
`branch_find_visitor` allows 30 look-ups an hour per branch. Test: `tests/0031_branches.sql` →
`RESULT PASS (115 checks)`, then `tests/security.sql` → `RESULT PASS`. Before it is applied the admin app
says "Branches are not switched on for your gym yet" and HQ shows no groups.

## Terms acceptance (0033, tracker #38) — NOT APPLIED, needs the owner's yes
Additive and re-runnable; apply after 0031. `gym_terms_acceptance` keeps who ticked "I agree to the
ForgeAI terms and the data agreement", when, which version (a date, the admin app's TERMS_VERSION), how
(at Create my gym, or asked at sign-in) and a sha256 hash of `<gym id>:<address>` when the gateway
passed one. The hash is not anonymous (an IPv4 address can be found by trying them all); raw addresses
live in gym_creator_ips (0021) and the access log (0028). Only versions in `_terms_versions()` that
have come are accepted: a new terms version = a new line there + the admin app's TERMS_VERSION. Append-only. `owner_terms` / `owner_accept_terms`; an
acceptance counts for every branch of the business. **Changes one function:** gym_create_online gains
`p_terms_version` (default null; the 4-argument version is dropped). Re-running 0021 puts the old one
back next to it: always re-run 0033 after 0021. Test: `tests/0033_terms_acceptance.sql` →
`RESULT PASS (27 checks)`. Before it is applied nobody is asked and nothing is recorded.

## Own sign-in PIN (0034, R-117) — APPLIED LIVE 24 Oct 2026 (0034 PASS 68, security PASS 9)
Additive and re-runnable; apply after 0033. Every person (owner and staff) may keep their own lasting
6-digit PIN: sign-in is mobile number + PIN, every time. The one-time codes keep working exactly as
before (first sign-in for staff, a new phone, recovery, HQ's reset); the sign-in box takes either, and
the server tries the PIN first. Only a bcrypt hash is kept (`gym_staff_pins`, no access for anon or
authenticated); no function ever returns it. Weak PINs are refused (one digit six times, straight runs
like 123456 / 654321, the last 6 digits of the person's own mobile). Five wrong tries in a row (PIN or
code) lock that person's PIN for 15 minutes; a one-time code still works while it is locked, and a
correct sign-in clears the count. The 0018 per-caller limit stays. New: `staff_set_pin` (your own PIN;
changing it needs the current PIN unless this device signed in with a code in the last 15 minutes) and
`staff_pin_status`. **Changes:** staff_sign_in (0018; adds `via` / `hasPin`), owner_people (0018; adds
`hasPin` / `pinLockedUntil`), owner_sign_out_person (0031; also clears that person's PIN),
hq_reset_owner_signin (0027; clears the owner's PIN before making the code) and gym_create_online (0033;
gains `p_pin`, the 5-argument version is dropped). A trigger deletes a removed person's PIN. Re-running
0018, 0027, 0031 or 0033 puts their versions back: always re-run 0034 after them. Apply it BEFORE the
admin app that asks for a PIN is deployed (an older server makes the gym without the PIN). Test:
`tests/0034_signin_pin.sql` → `RESULT PASS (68 checks)`, then `tests/security.sql` → `RESULT PASS`.

## Phone pop-ups for the gym's messages and offers (0038, R-153 step 2) — APPLIED LIVE 28 Oct 2026 (0038 PASS 44, 0026 PASS 59)
Additive and re-runnable; apply after 0037. New tables `member_push_tokens` (one row per phone push address)
and `push_jobs` (one per new message or offer, made by triggers on new `gym_messages` / `gym_offers` rows),
a trigger that deletes a member's push addresses when they leave or the gym lets the phone go, the member
functions `member_save_push_token` / `member_clear_push_token`, and the sender's `hq_push_next` / `hq_push_drop`
(service_role only: the HQ Worker's "hq" key, deploy/hq/push.js). No function that exists is changed. Messages
sent before 0038 is applied are never pushed. Test: `tests/0038_member_push.sql` → `RESULT PASS (n checks)`,
then `tests/0026_hq_access.sql` (it now also checks the two new hq_ functions) and `tests/security.sql`.
The sender also needs the HQ Worker secret FCM_SERVICE_ACCOUNT; without it nothing is sent and nothing is lost.

## How busy the gym is (0039, R-163) — APPLIED LIVE 29 Oct 2026 (R-177)
Additive and re-runnable; apply after 0038 (it uses 0036's hours). Adds one index on check-ins
(`crm_records_visit_day`: a gym's visits by day), the helper `_busy_open_hours` (no grants) and the member
function `member_gym_busy(key)`: from the gym's own timed check-ins of the last 8 weeks (QR and desk), the
level now ("quiet / normal / busy / closed", against what is usual for that weekday and time), a count only
when 5 or more and rounded to 5, and per weekday and hour a usual level 0-4 (an hour with fewer than 3
check-ins in 8 weeks shows 0; null = closed by the gym's weekly hours). No names, ids or visit times leave the
server. A gym with fewer than 40 timed check-ins in 8 weeks answers `learning` and members see nothing.
Visitors from other branches are not counted. No existing table or function changes.
Test: `tests/0039_gym_busy.sql` → `RESULT PASS (31 checks)`, then `tests/security.sql` → `RESULT PASS`.
Live test 29 Oct: PASS 31. Where a server lacks it, the member app shows no busy card (it logs once and
stops asking). The privacy line is in the notice (EN + HI, approved 29 Oct).

## Gym mate profiles (0040, R-164) — APPLIED LIVE 29 Oct 2026 (R-177)
Member functions `member_mate_share`, `member_mate_stop`, `member_mate_board`, `member_mate_profile`: a member who
turns on "Let my gym mates see my workouts" shares short workout summaries (60 days, at most 30) that same-gym
mates can open from the leaderboard. Test: `tests/0040_gym_mate_profiles.sql` → live PASS 46, then `tests/security.sql`.
