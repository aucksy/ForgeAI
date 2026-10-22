# R-owner-panel: a console for the owner of the whole system (ForgeAI HQ) — 23 Oct 2026

Asked by the owner (CLAUDE-NOTES R-82): "do I need an admin panel as the owner of the whole system ...
data control and governance ... maybe the same admin panel that everyone logs in ... You can decide."
Plan only. No app code, no server change. Sources at the end.

## The answer in plain English

1. **Yes, you need one, and soon (before the second gym).** Today you run ForgeAI by asking me to type
   SQL into the Supabase dashboard (new gyms, lost sign-ins, a gym's delete) and to run two scripts
   (feedback, leads). That works for one gym. It fails three ways as gyms join: you cannot see whether
   a gym is healthy without me; anyone on the internet can create a gym today (up to 5 an hour from one
   address) and nothing tells you; and **nothing records when you or I looked at a gym's data**. From
   13 May 2027 India's data law expects exactly that record, kept for a year.
2. **A separate small app, not a "super owner" switch inside the gym admin app.** Its own address
   (`forgeai-hq.aakashpahuja.in`), its own sign-in that only your Google account can pass (with your
   phone's passkey / 2-step), and a server door that the gym admin app has no key to. Reason: the gym
   app is busy, changes often, keeps a whole gym's records in the browser for offline use, and its
   sign-in is a 6-digit code an owner makes. One bug there must never open every gym at once.
3. **By default you see counts and health, not people.** Per gym: members, check-ins, shop orders,
   money collected this month (totals only), last activity, staff, failed sign-ins, feedback, leads,
   AI use and cost, app versions. **No member names or mobile numbers** on any default screen.
4. **Opening one gym's records is a "break-glass" step:** you pick the gym, type why, choose up to
   60 minutes, it is read-only, it is logged, and **that gym's owner sees it** in their admin app.
5. **Actions you get:** see new gyms (and approve/suspend), reset an owner's sign-in, sign a gym out
   everywhere, handle delete requests (gym and member), export a gym's data when its owner is locked
   out, read and sort feedback and leads, see AI use and cost and change a gym's daily AI limit, see
   how many members have each app version.
6. **Every one of your actions lands in a log nobody can edit, kept 2 years, in Mumbai.**
7. **Three small steps, about 5 working days of my time in total, ₹0 a month.** Each step needs one
   "yes" from you for a live server change; step 1 also needs a 10-minute free Cloudflare setup.

## 1. Do you need one? Yes

| Today (no console) | Why it stops working |
|---|---|
| New gyms: anyone can create one from the admin app's first screen; no list, no alert. | A spam or fake gym, or a real gym you never called, goes unnoticed. |
| Lost sign-in: I run a support function in the SQL editor. | Needs me at the keyboard; leaves no record of who did it or why. |
| Gym delete: a 7-step runbook with SQL typed by hand (docs/launch/GYM-DELETE.md). | Easy to slip; the privacy notice promises 30 days, nothing counts them. |
| Feedback and leads: two scripts on your PC. | You cannot look yourself from your phone. |
| "Is gym X using it? Did members update the app?" | Nobody can answer without SQL. |
| Looking at a gym's records: the Supabase dashboard can see everything, silently. | DPDP Rule 6 asks for access control and logs of who reached personal data. |

What the leading products do: gym software (Gymdesk, GymMaster, Gym Insight, PushPress) gives the
**gym** an owner role and staff roles; the vendor's own staff work from an internal console. The
better-run SaaS products add **support access the customer grants** for a limited time (Zoho, Tray.ai)
and **access transparency**: the customer sees when vendor staff touched their data and why (Google
Cloud Access Transparency / Access Approval). We copy that last pattern: it is cheap and it is what a
careful gym owner will ask about before trusting us with their members.

## 2. Same app or separate app? Separate. Decided.

**ForgeAI HQ** = its own page on its own address, served by its own Cloudflare Worker.

| Risk | In the gym admin app | In a separate HQ app |
|---|---|---|
| Sign-in strength | 6-digit code made by a gym owner, valid 30 min; session lives in the browser. | Cloudflare Access in front (free up to 50 users): only your Google account, which you protect with a passkey and 2-step. Nothing loads before that. |
| Who can reach the "all gyms" door | The gym app talks to the database straight from the browser with the public key; every gym function is open to that key. A platform branch inside it is one bug away from every gym. | The HQ functions are callable **only** with a private server key that lives in the HQ Worker, never in any browser and never in the gym app. A gym session key is refused there by design. |
| Data on your laptop | The gym app copies a gym's records into the browser for offline use. "See all gyms" there = every gym on your laptop. | HQ fetches counts on demand and keeps nothing in the browser. |
| Change risk | The gym app ships several times a week. | HQ changes rarely; its own deploy, its own strict security header. |
| Your own gym login | You still use the normal admin app, as a normal staff person of the demo gym. Gym owners never see HQ exists. | |

Double lock in the HQ Worker: (1) Cloudflare Access lets only your email through; (2) the Worker
checks Access's signed pass itself and an allow-list of one email kept as a Worker secret, so a
mistake in the Access setting alone cannot open it. Break-glass asks you to sign in again if your last
sign-in is older than 15 minutes.
Fallback if Access cannot be set up (past lesson: our Cloudflare token has no Access permission, so
the setup is a dashboard step): a passkey sign-in built into the Worker, like the VastuFirst panel's
own sign-in. Either way you also keep 2-step on for Supabase, Cloudflare and GitHub, because those
dashboards remain the real master keys. HQ replaces day-to-day SQL-editor use, so every look is logged.

## 3. What you see by default (counts, never people)

**Home: all gyms in one table**, newest first, with flags:
- Gym name, city, created on, status (trial / active / suspended), owner's name and mobile (your
  business contact: ForgeAI is responsible for this data itself).
- Members in the register, members linked in the app, check-ins in the last 7 and 30 days, shop
  orders in the last 30 days, money collected this month and last month (**totals only, never who
  paid**), receipts cancelled this month.
- Last desk activity, staff count, failed sign-in tries in the last 24 h, live devices.
- New feedback, AI imports this month and their cost, members on the newest app version (%).
- Flags: "new this week", "no desk activity for 7 days", "many failed sign-ins", "delete requested
  (day N of 30)", "AI limit hit".

**System page:** database size against the free 500 MB, app downloads per release (GitHub's own
counts), errors and outages (once the free Sentry and Better Stack accounts exist, #34), total AI cost
this month against your credits.

**Feedback and leads pages:** the same rows the scripts show today, with status buttons. Leads hold a
gym owner's mobile: ForgeAI's own data, so they show in full.

What you do NOT see by default: any member's name, mobile, plan, payment or visit, any staff list,
any message text. Those exist only behind break-glass (section 4).

## 4. Break-glass: opening one gym's records

Two doors, both logged:
- **The gym asks** (normal case): in their admin app, Settings → Your data → "Let ForgeAI support look
  (1 hour)". You see "Support access open until 15:40" on that gym in HQ.
- **You open it** (emergency only: suspected leak, a legal demand, a member's erase request the gym
  cannot handle, the owner locked out): pick the gym, choose a reason from a short list plus a
  sentence, choose 15 / 30 / 60 minutes, confirm with a fresh sign-in.

While it is open: **read-only** views of that gym's records (members, plans, receipts, visits,
orders, staff list), through server functions that refuse once the time is up. No "log in as the
gym", no edits as the gym: any fix goes through a named HQ action that is itself logged.
Afterwards: the gym's owner sees a line in their admin app (Settings → Your data → "ForgeAI access")
and on Today the next time they open it: "ForgeAI support viewed your records on 23 Oct, 14:05-14:35.
Reason: you asked us to fix a receipt." You can never hide or delete that line.

## 5. Actions in HQ

| Action | How it works | Replaces |
|---|---|---|
| New gyms: approve or suspend | Self-serve sign-up stays (no friction for a real owner). Every new gym lands in "New this week" with its creator's call-back number. "Approve" marks it checked; "Suspend" closes it. | Nothing today |
| Create a gym for a lead | From a lead row: gym name and owner's mobile pre-filled; HQ creates it and shows the owner's first 6-digit sign-in code to send on WhatsApp. | Hand SQL |
| Suspend / restore a gym | Suspended = staff can sign in and **download their data** but change nothing; the member app shows the gym as paused. Reason required. | Nothing today |
| Reset an owner's sign-in | Tick "I called the gym's own number and the owner confirmed", then HQ makes a one-time code. | SQL-editor support function |
| Sign a gym out everywhere | Ends every live device session of that gym (breach plan, first hour). | Hand SQL |
| Gym delete request | Requests from the admin app appear with a 30-day countdown. Steps: call-back tick → reminder the gym downloaded → type the gym's code to confirm → HQ deletes and proves no row is left → logo and product photos removed. | The 7-step runbook |
| Member erase request (by email) | Find the member by gym + mobile inside a break-glass window; erase or blank their details except payment records the law keeps; the gym owner is told. | Email + hand SQL |
| Export a gym's data | Only when its owner is locked out; the same Excel the gym itself downloads; logged and shown to the owner. | Nothing |
| AI use and limits | Per gym per day: imports, pages read, cost in ₹, limit hits; change one gym's daily limit. Read from the usage table the AI-import Worker keeps (being built, R-82). | Nothing |
| App release adoption | Share of active members on each member-app version, plus downloads per release. | Nothing |

## 6. Data governance list

**Who is responsible for what (DPDP Act 2023 + Rules 2025):**
- **Each gym is the data fiduciary** for its members' and staff records (memberships, receipts,
  visits, shop orders, desk messages). **ForgeAI is its data processor**: we may use that data only to
  run the gym's service on the gym's instructions, under the written pilot/data agreement (Act s.8(2)).
  If ForgeAI looks at member-level data for its own purposes (curiosity, marketing, its own analytics)
  it becomes a fiduciary for that use and would need its own notice and consent. Hence counts by
  default, break-glass for people.
- **ForgeAI is the fiduciary** for: gym owners' and staff contact and sign-in data, the member app's
  join row, feedback, leads, AI usage, technical and access logs, and HQ's own audit log.
- The gym, not us, tells the Data Protection Board about a breach "without delay" and in full within
  72 hours (Rule 7); we tell the gym within 24 hours (pilot agreement, BREACH-PLAN.md). Separately,
  CERT-In's 2022 directions ask for 6-hour incident reports and 180 days of logs kept in India; get
  the lawyer check (already planned before the second gym) to say whether they apply to ForgeAI.
- Data stays in India by default: Supabase Mumbai. Transfers abroad are allowed unless the
  government blacklists a country (s.16). HQ's audit log goes in Mumbai, not in Cloudflare's database.

**What HQ adds:**

| Record | What it holds | Kept for |
|---|---|---|
| HQ audit log | Every HQ action and every page that shows a gym: when, your email, the gym, the action, the reason, the address. Append-only: the database refuses edits and deletes. | 2 years (law asks 1) |
| Break-glass grants | Gym, opened by (you / the gym), reason, start, end. Also shown to the gym's owner. | 2 years |
| Access log (task 9, R-49) | Every sign-in, sign-out, records pull and push in the gym app: when, gym, person, device, address. | 1 year, then deleted nightly |
| Failed sign-in tries | Today deleted after 1 day; they move into the access log. | 1 year |
| Gym creator's address | Today kept forever. | 1 year |
| AI usage | Counts and cost per gym per day, never file contents. | 1 year, then monthly totals |
| Feedback / leads | Unchanged. | 1 year / 12 months if no deal |
| A gym's records | Unchanged: while the gym uses ForgeAI; deleted within 30 days after it leaves, backups 7 more days. | — |

The 1-year logs come from Rule 6(1)(e) and Rule 8(3); they start to bite on 13 May 2027. The access
log (task 9) is folded into step 3 below, so the "Blocked" task 9 gets its answer here.

## 7. Build order: three small steps

**Step 1 — Look (read-only HQ).** HQ page and Worker on `forgeai-hq.aakashpahuja.in`; the
all-gyms table, System, Feedback and Leads pages; the audit log from day one (every page view of a
gym is logged).
- Needs nothing from you: building and testing the page and Worker; reading feedback, leads and AI
  usage (our own Cloudflare database); GitHub download counts; tests on the CI test database.
- Needs you: (a) **LIVE server change, your yes:** add the audit table and the read-only count
  functions (adds only; changes no existing row or function the apps use); (b) a free 10-minute
  Cloudflare Access setup for the new address (or I do it in your Chrome with your OK); (c) a new
  Supabase secret key named "hq" for the HQ Worker (made in the Supabase dashboard; it can be revoked
  alone without touching the apps).
- Effort: about 1 working day.

**Step 2 — Act.** Approve/suspend, create a gym for a lead, reset an owner's sign-in, sign a gym out
everywhere, the delete-request workflow (gym and member), AI daily limits, feedback/lead status.
- Needs nothing from you: the screens, the gym-app message for a suspended gym, tests (including
  "a gym session key is refused by every HQ function"), updating GYM-DELETE.md to the new buttons.
- Needs you: **LIVE server change, your yes:** a status on each gym, the "suspended = read-only"
  check in the gym functions, and the HQ action functions. Each real delete still asks your yes in the
  moment, as today.
- Effort: about 1.5-2 working days.

**Step 3 — Govern.** Break-glass (both doors) with the owner-visible "ForgeAI access" list in the
admin app; the 1-year access log and the nightly clean-up of every row past its period (task 9); the
member app reporting its version so adoption is exact.
- Needs nothing from you: the admin-app screens (live after deploy), the member-app change (goes out
  in the next normal release), tests.
- Needs you: **LIVE server change, your yes** (grants table, access-log table, nightly clean-up);
  **your yes on two wordings:** a line in the privacy notice and the pilot agreement ("ForgeAI opens a
  gym's records only when the gym asks or in an emergency, for at most an hour, and the gym always
  sees it") and the line the gym owner sees.
- Effort: about 2-3 working days. Due well before 13 May 2027; best before the second gym.

**Cost:** ₹0 a month (Cloudflare Access free up to 50 users, Workers free plan, same Supabase project).

## Notes for the builder (technical)
- HQ Worker = new Worker `forgeai-hq` with static assets, custom domain `forgeai-hq.aakashpahuja.in`
  (one level under the zone, so the normal certificate covers it; `hq.forgeai...` would need an extra
  certificate). Verify `Cf-Access-Jwt-Assertion` against the team's certs + AUD, then the email
  allow-list secret. Strict CSP, `connect-src 'self'`. Bindings: D1 `forgeai-web` (read; status
  writes in step 2), secret `SUPABASE_HQ_KEY`.
- Supabase: schema `hq` (not exposed through the public API), or `public.platform_*` functions with
  `revoke all from public, anon, authenticated; grant execute to service_role`. Each function takes the
  actor email the Worker verified and writes `hq_audit` in the same transaction. `hq_audit`: a trigger
  refuses UPDATE/DELETE; only the nightly purge (a definer function run by pg_cron) removes rows past 2
  years.
- Counts come from `crm_records` (kind = member/visit/payment, `deleted = false`), `gym_members`,
  `shop_orders`, `gym_sessions`, `gym_signin_fails`, `gym_creator_ips`. Money = sum of live, uncancelled
  payment rows in paise per month.
- Suspend: `gyms.status` ('trial'|'active'|'suspended'); `_owner_gym` and `crm_push` raise SUSPENDED
  on writes, pulls and export still allowed. `_staff()` is STABLE, so logging lives in the volatile
  entry functions (sign-in, `staff_me`, `crm_pull`, `crm_push`), as R-49 found.
- Break-glass: `hq_grants(gym_id, opened_by 'gym'|'hq', reason, starts_at, ends_at)`; every `hq_gym_*`
  read function checks a live grant; `owner_hq_access(key)` lets the gym owner read the list.
- Reset sign-in wraps `support_make_signin_code`; sign-out-everywhere ends all `gym_sessions` of the gym.
- Never add a platform branch to `_owner_gym` or any `owner_*` function, and never ship the HQ key to
  a browser. Test as the `anon` role that every HQ function refuses (owners and superusers bypass RLS
  and make tests pass falsely).

## Sources
- DPDP Rules 2025, Rule 6 (security safeguards, logs, 1-year retention, processor contracts): https://dpdpa.com/dpdparules/rule6.html
- Rule 7 (breach: Board without delay, detailed report in 72 h, tell each person): https://dpdpa.com/dpdparules/rule7.html
- Rule 8 (erasure, 1-year retention of data, traffic data and logs): https://dpdpa.com/dpdparules/rule8.html
- Rules notified 13 Nov 2025, main duties from May 2027: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ; https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified ; https://ssrana.in/articles/meity-notifies-final-digital-personal-data-protection-rules-2025/
- Processor vs fiduciary for SaaS, s.8(2) contract: https://treelife.in/legal/data-fiduciary-vs-data-processor-redrafting-your-b2b-vendor-dpas/ ; https://www.ey.com/en_in/insights/technology/how-data-fiduciaries-should-engage-processors-for-effective-compliance ; https://tsaaro.com/blogs/processor-contracts-under-dpdp-drafting-a-data-processing-agreement-that-survives-regulatory-scrutiny
- DPDP Act s.16 (transfers, negative list): https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
- CERT-In directions 2022 (6-hour reports, 180-day logs in India): https://www.linklaters.com/en/insights/blogs/digilinks/2022/may/india-new-and-onerous-cyber-security-framework-and-breach-reporting-obligations ; https://www.manageengine.com/log-management/cyber-security/cert-in-compliance-for-indian-enterprises.html
- Gym software roles: https://docs.gymdesk.com/help/managers ; https://help.pushpress.com/en/articles/508425-logins ; https://www.gymmaster.com/user-manual/manual_staffmembers_add_staff_details_permissions ; https://help.gyminsight.com/article/137-user-permissions-based-on-user-types ; https://www.mindbodyonline.com/business/staff-management
- Customer-granted, time-limited support access: https://help.zoho.com/portal/en/community/topic/support-access-for-zoho-crm?page=1 ; https://tray.ai/documentation/platform/enterprise-core/security-compliance/support-access-controls
- Access transparency / approval: https://docs.cloud.google.com/assured-workloads/docs/access-approval ; https://docs.langchain.com/langsmith/byoc-shared-responsibility
- Impersonation and break-glass practice: https://appmaster.io/blog/secure-admin-impersonation-controls-audit-scope ; https://www.ory.com/blog/identity-level-impersonation ; https://software.codidact.com/posts/281301 ; https://oneuptime.com/blog/post/2026-02-17-how-to-implement-emergency-break-glass-access-procedures-for-google-cloud/markdown
- Cloudflare Access free plan (50 users): https://www.cloudflare.com/en-gb/products/zero-trust/access ; https://blog.cloudflare.com/teams-plans
- Supabase secret key bypasses RLS; lock admin functions to service_role: https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z ; https://dev.to/victor_yrazusta/10-common-supabase-security-misconfigurations-and-how-to-fix-them-do8
- In this repo: supabase/migrations 0010 (sign-in, `support_make_signin_code`), 0011 + 0021 (self-serve gym creation, 5 an hour per address), docs/launch/GYM-DELETE.md, BREACH-PLAN.md, PRIVACY-NOTICE.md, deploy/panel (D1 feedback + leads), CLAUDE-NOTES R-49 (access logs), R-82 (this request), research/R-ai-import.md (AI usage in D1).
