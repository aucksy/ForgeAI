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
