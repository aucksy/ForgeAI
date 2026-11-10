# MettleUp privacy notice and terms: accuracy audit, 10 Nov 2026 (R-443)

Owner's ask (10 Nov 2026): "Redo or reassess the whole privacy notice and terms and conditions, ensure everything is
accurate and the language is simpler and on par with how everyone does it." Plus his approved Feedback line for
"Add my watch's screen log" (R-441).

**Status (10 Nov 2026, R-445): PUBLISHED.** The owner approved D1-D8 "all as recommended". The drafts became the one source, `docs/legal/*.body.html` (built by `scripts/legal_pages.py`); the draft files were removed. Original status: **audit + DRAFTS only. Nothing live changed.** Live pages untouched: `apps/dashboard/public/privacy.html`,
`terms.html`, `data-agreement.html`, `delete-account.html`, and the in-app texts. Drafts: `docs/legal/privacy-draft.html`,
`docs/legal/terms-draft.html`, `docs/legal/data-agreement-draft.html`. Publishing needs the owner's explicit yes
(privacy and legal wording are his call; R-387: "keep the policy-page approval for the very end").

Important: since 4-5 Nov the LIVE `privacy.html` was edited by hand (R-319/R-320 trainers + backup, R-367 sleep), so
`docs/launch/PRIVACY-NOTICE.md` (and `scripts/legal_pages.py`'s output) is OLDER than the live page. Running
`legal_pages.py` today would silently remove the approved trainer, Ask-a-trainer, backup and sleep lines. The live page
was the baseline for this audit. See "Publishing steps" at the end.

## 1. Every claim of the live notice vs the code today

Legend: OK = true today. WRONG = the code does something else. STALE = was true, the app moved. GAP = the code does it,
the notice says nothing.

| # | Live notice says | Code today (proof) | Verdict |
|---|---|---|---|
| 1 | "The only AI feature today is your gym owner's optional member-list import" | Help questions are answered by Claude Haiku (`deploy/panel/help.js`, live since 2 Nov); the same notice lists it in another row | WRONG (contradicts itself) |
| 2 | "A copy of the error text goes to our private bug list on GitHub" | `scripts/watch/crashes.mjs` opens issues in `GITHUB_REPOSITORY` = aucksy/ForgeAI, which is **public** (`api.github.com/repos/aucksy/ForgeAI`: `"visibility": "public"`). 0 crash issues exist today (search `label:crash` = 0), but the next new crash kind would be public. Text is scrubbed of emails, phones, long numbers and keys (`deploy/panel/crash.js`) | WRONG |
| 3 | Health Connect data "stays on your phone and is not shared" | Weigh-ins read from Health Connect go into the body-weight log (`src/tracker/phone/healthRead.ts` F55), and the body-weight log is in the member's MettleUp account copy (`src/cloud/pack.ts` kind 'b') and in "Download my data". Never to the gym (trainer share excludes body weight, 0050) | WRONG for signed-in members |
| 4 | Firebase "carries each pop-up: your gym's name and the first line of the message or offer; nothing about your workouts" | Pop-ups now also carry a trainer's whole reply (up to 1,000 characters, 0053 `hq_push_next` trainer_reply: title = trainer's first name, body = the reply) and short alerts: pause/renew answered, report asked for, shop order ready/cancelled (0054 `member_push_notes`) | STALE |
| 5 | Paths "Settings → Backup", "Settings → Health Connect", "Settings → Backup → Delete my account" | Today: Settings → Your data → "Backup and restore"; Settings → Phone and watch → "Health apps" (`src/components/settings/settingsLines.ts`) | STALE |
| 6 | Saved workouts = "each exercise and set (weight, reps, time)" | Also titles, workout and set notes, RPE, set type, distance, speed, incline, machine level (`pack.ts` 'w'), and since R-436 the exercise list of the last empty workout ('p' id 'empty') | GAP (incomplete) |
| 7 | "Staff sign in with single-use codes" (Security section) | Staff sign in with mobile + a PIN (bcrypt-hashed, 0034) or a one-time code the owner made; "Forgot your PIN?" / new gym sign-up by WhatsApp (0061 live, `phoneInbound.js`) | STALE |
| 8 | "Backup copies at our provider expire within 7 more days"; providers list names Cloudflare only as "delivers the desk app and passes requests" | A nightly full copy of the gym database (every public table plus sign-in accounts) is kept in **Cloudflare KV** for 7 days (`deploy/hq/backup.js` KEEP_SECONDS = 7 days; 0052 live 4 Nov). The 7 days are right; Cloudflare *storing* the copy is not said | GAP |
| 9 | Feedback row: no watch log | R-441 (commit 5a5f6828): optional switch "Add my watch's screen log" sends screen on/off/dim times + Battery Saver and screen settings as a second feedback row (`src/lib/watchDiag.ts`). Owner approved the line 10 Nov | GAP (approved line) |
| 10 | No mention of busy machines | F137 (0049 live 3 Nov): when the gym switches it on, the phone sends, per workout of the last 35 days, the date, the start hour and which of the gym's machine exercises were done; ON by default, switch "Share which machines I use" (`src/shop/machineBusySync.ts`, `settings/gym-sees.tsx`). Kept per member; >63 days deleted; leaving deletes | GAP |
| 11 | No mention of workout reports for the gym | F121 (0045 live): the gym can ask; only on the member's yes the phone sends a spreadsheet of workouts since the join date; the gym can download it for 30 days, then deleted | GAP |
| 12 | No mention of pause/renew requests | F150 (0044 live): member asks from the app; the gym sees name + request | GAP |
| 13 | No mention of Bring a friend | F147 (0056 live): the member's invite link; the friend's name, mobile and best time to train go to the gym's Enquiries, marked "Referred by <member>"; the member sees a count. Friend form limits use a daily scrambled address hash (`deploy/panel/friend.js`, 2 days) | GAP (also covers non-users) |
| 14 | No mention of paying the gym online | F79 (`deploy/panel/pay.js`, `payProviders.js`, D1 0011 live 5 Nov): a payment link is made through the GYM's own Razorpay / Cashfree / PayU / PhonePe account with the member's name, mobile and amount; MettleUp keeps only the gym's member id, amount and label. TEST MODE until `PAY_LIVE` is on (not set in `wrangler.jsonc`) | GAP (not yet live money; disclose before it is) |
| 15 | No mention of the desk's member photo | F107 (0043 live): the desk can take a member's photo (~400 px JPEG) for the member card and check-in screen; gym record | GAP (gym-side) |
| 16 | No mention of trainer profiles and bookings | F105 (0065 live 7 Nov): trainer photo, what they teach, hours, PT bookings; gym records | GAP (gym-side) |
| 17 | No mention of MettleUp support access | 0028 live: MettleUp can look at a gym's records read-only only in a window the owner opens (1 hour) or an emergency window (15-60 min, reason written), every look logged and shown to the owner; HQ audit log kept 2 years | GAP |
| 18 | No mention of WhatsApp sign-in checks | 0061 + `phoneInbound.js` (live 8 Nov): a staff member sends a WhatsApp message with a code to MettleUp's business number (Meta WhatsApp Business Platform); we keep only keyed hashes for 2 days | GAP (staff) |
| 19 | No mention of gyms paying MettleUp | 0060 live (6 Nov): owner enters UPI/bank reference (UTR) and amount; HQ confirms. Online checkout (0063, Razorpay/Cashfree) is built but OFF | GAP (owners) |
| 20 | No mention of the website forms | `deploy/panel/leads.js`: demo form (mobile, gym name, city, size, current software), kept 12 months without a deal (HQ nightly clean-up, `deploy/hq/web.js`); address only as a salted daily hash. Websites set no cookies and run no analytics; `localStorage` only remembers the look | GAP (visitors) |
| 21 | No mention of the watch | Phone and watch exchange workout data directly through Google Play services on the two devices; the watch shows live heart rate from its sensor during a workout but never saves or sends it (`android/wear/.../HeartRate.kt`; nothing in `src` reads it); watch version is read by the phone to offer updates (R-438) | GAP |
| 22 | No mention of "Ask an AI about your workouts" | F61: builds a text of the last 4 weeks and opens the phone's share sheet; MettleUp sends nothing (`settings/ask-ai.tsx`) | GAP (worth one line: it is the member's own share) |
| 23 | Join: "your name, mobile number, the gym..." | Joining sends the code and the NAME only (`apiJoin`, `src/shop/gymApi.ts`); the mobile is sent only when the member types it at a QR check-in, and the desk must confirm it (0048) | Imprecise |
| 24 | Trainer share (R-319 text) | Matches 0050/0053: weekly summary 12 weeks, best lifts, new heaviest, last day, up to 30 workouts in 3 months; never body weight, photos, notes, food, mobile; off deletes at once; 90 days without an update deletes | OK |
| 25 | Ask a trainer: 180 days, delete on leaving, withdraw an unanswered one | 0053 | OK |
| 26 | Leaderboard: 31 days sent, 62 days kept, name opt-in, winners list with mobile until leaving | 0037/0047/0048 | OK |
| 27 | Gym-mate profiles, off by default, 60 days/30 workouts | 0040 | OK |
| 28 | Busy right now from check-ins, shown at 5+ | 0039 | OK |
| 29 | Push address deleted on leave / messages off / 60 days unused | 0038 | OK |
| 30 | Feedback: message, app version, phone model, gym code, random install number, scrambled address; 1 year | `feedback.js` + HQ nightly clean-up `deploy/hq/web.js` | OK (also keeps the screen name: add) |
| 31 | Help: Anthropic writes the answer, no training; kept 1 year | `help.js`: Claude sees the text, app, screen name and version only; MettleUp's own reply is kept too (D1 0009) | OK (add "our reply") |
| 32 | Voice: Groq (USA), neither keeps it; counts 7 days | `voice.js` KEEP_COUNT_DAYS 7; Groq "Inference APIs ZDR" switched on (OWNER-INBOX, 30 Oct) | OK |
| 33 | Crash reports 90 days, no personal data | `crash.js` KEEP_DAYS 90; scrubbed | OK (except row 2) |
| 34 | Account delete: copy + account at once; owner/trainer sign-in kept; email route 30 days | 0032 `member_account_delete` | OK |
| 35 | Technical logs 7 days, 1 year from May 2027 | 0028 access log; failed sign-ins 1 day; gym creator's address 1 year | OK (DPDP Rule 6 date: 13 May 2027) |
| 36 | Gym deleted: within 30 days, backups 7 more | data agreement point 9; `backup.js` 7 days | OK |
| 37 | Sleep: on phone only, not stored or sent; Limited Use sentence | `healthRead.ts` / R-344 | OK |
| 38 | Steps: shown only | `healthRead.ts` F62 "nothing is stored" | OK |
| 39 | Old Google Drive backups, Download my data | `settings/backup.tsx`, `save-backup.tsx` | OK |
| 40 | "Grievance Officer ... We reply within 30 days, usually within a week" | No ticketing or SLA in code; "usually within a week" is a soft promise (owner rule: no reply-time promises). 30 days is required by the SPDI Rules 2011 (one month) and fits DPDP Rule 14 (max 90 days) | Keep 30 days, drop "usually within a week" |
| 41 | "We do not sell your data, show ads, or use your data to profile you" | No ad, analytics or tracking SDK in `apps/mobile/package.json`; websites have no analytics | OK |
| 42 | "Under 18 ... the member app is only for 18 or over" | The 18+ tick exists only when joining a gym (`src/shop/joinTerms.ts`). A member who never joins never ticks it; Play target audience is 18+ | OK as a rule; the check is weak (see decisions) |
| 43 | In-app links | The app and the Health Connect rationale screen open `https://forgeai.aakashpahuja.in/privacy.html` (old domain, still serves the same files; `joinTerms.ts`, `HealthRationaleActivity.kt`) | Works; should move to mettleup.fit/privacy in a later app version |

### Terms (live `terms.html` = `docs/launch/TERMS.md`, 20 Oct)

| # | Live terms say | Today | Verdict |
|---|---|---|---|
| T1 | "By tapping 'I agree' you accept them" | The only "I agree" is at gym join. A member without a gym never taps it | Fix: also "by using the app" |
| T2 | 7: "Your workouts stay on your phone, so keep your phone backed up" | Signed-in members have a copy on MettleUp | STALE |
| T3 | 9: "not liable ... for workout data kept only on your phone" | OK for members who did not sign in; reword | STALE |
| T4 | Nothing on content members write (bio, link, questions, gym-mate profile) | These reach other people | GAP |
| T5 | Nothing on health data apps, the watch, pop-ups, online payments to the gym | Live | GAP |
| T6 | Section B (gym staff) is staff rules only; gym terms = data agreement + nothing on price, trial, payments, refunds, what happens when a gym stops paying, liability | 0030 trial 3 months (HQ can extend to 6); 0060 Pay MettleUp live; refund draft `docs/drafts/refund.html` (owner 6 Nov: no money back except double/too-high payment) | GAP |
| T7 | Data agreement 3: providers = Supabase, Cloudflare, Gemini/Claude import | Also: Cloudflare stores the nightly copy 7 days; Google Firebase carries the gym's messages to members' phones; Meta WhatsApp for staff checks; Anthropic for help questions; the gym's own payment company when the gym connects one; GitHub (crash text). "We tell you before we add a new provider that sees your records": not done for Firebase (0038, 28 Oct) or the KV backup (0052, 4 Nov) | WRONG / promise not kept |
| T8 | Data agreement 4: "Staff sign in with single-use codes" | PIN + one-time code + WhatsApp check | STALE |
| T9 | Data agreement 13: "Liability. MettleUp is a beta." | Unfinished sentence; no cap | WRONG (broken clause) |
| T10 | Data agreement: nothing on support access, member photos, trainer photos, 1-year logs | 0028, 0043, 0065 | GAP |
| T12 | Data agreement 9: "We keep the request itself, and the record that you accepted this agreement, for 2 years" | Deleting a gym cascades to `gym_terms_acceptance` (0066 header: the append-only trigger lets a gym's cascade through); delete requests are kept 2 years (0028 clean-up) | WRONG for the acceptance record |
| T11 | Delete-account page: "we remove every backup copy within 15 days" | Code keeps 7 days (`backup.js`); notice says 7 | Inconsistent (fix with the publish) |

## 2. How others do it (research, 10 Nov 2026)

Read: Hevy (iubenda policy, ~3,800 words, no summary, vendors per purpose; terms 2019), Strong (~700 words, plain, Health
Connect + Limited Use line, "Your Health" section in terms), Fitbod (Health Connect + Limited Use; recurring payments
non-refundable; partial: site blocked), HealthifyMe (India; one ~15,000-word page, Grievance Officer with name, cites DPDP
Act + Rules 2025, refunds on a sliding scale, liability capped at fees paid), Zenoti (gym SaaS with an Indian entity:
"Subscriber Data: we are not the controller; we process it for our subscriber; ask your business", separate
sub-processor page; terms cap liability at fees paid in 12 months; one export within 30 days then deletion).

Patterns copied into the drafts:
1. A short summary at the top (none of the five peers does it well; regulators and Google ask for "clear and plain").
2. Strong's length and tone: short headings, "you can delete ... at any time".
3. Zenoti's split, in plain words: "If your gym added you, the gym decides; ask them; we help."
4. Hevy's "who gets what": every outside company named next to what it gets (DPDP s.11 needs the list anyway).
5. Strong's "Your health" paragraph in the terms.
6. A table for what we keep and how long (DPDP Rule 3 wants an itemised list; no peer has one, it is the clearest form).
Avoided: one giant combined page (HealthifyMe), "as long as necessary" with no numbers, perpetual content licences,
selling de-identified data, US-law references (COPPA), clauses that contradict each other.

Sources:
- Hevy: https://www.iubenda.com/privacy-policy/75379905/full-legal ; https://www.hevyapp.com/terms-and-conditions/
- Strong: https://help.strongapp.io/article/232-privacy-policy ; https://help.strongapp.io/article/179-strong-terms-of-service
- Fitbod: https://fitbod.me/privacy-policy/ ; https://fitbod.me/terms-conditions/ (snippets only)
- HealthifyMe: https://elb.healthifyme.com/terms-of-use
- Zenoti: https://www.zenoti.com/trust/privacy-notice ; https://www.zenoti.com/trust/terms-and-conditions ; https://www.zenoti.com/en-uk/trust/sub-processors

## 3. What the law and Google need (checked against the drafts)

| Need | Source | In the draft |
|---|---|---|
| Itemised data, purpose, the service each enables; standalone; clear, plain language | DPDP Rules 2025 Rule 3 (in force 13 May 2027), https://dpdpa.com/DPDP_Rules_2025_English_only.pdf | "What we collect" table per feature |
| How to withdraw consent, as easy as giving it; how to use rights; how to complain to the Board | Rule 3(c), Act s.6(4) | "Your choices and rights" lists every switch |
| Notice in English or an Eighth Schedule language on request | Act s.5(3), https://www.dpdpa.com/dpdpa2023/chapter-2/section5.html | Hindi kept; "ask us for Hindi" line (Hindi rewrite after his English yes) |
| A person who can answer questions, published; named in every reply | Rule 9 | Grievance Officer: Aakash Pahuja, contact@mettleup.fit |
| Published response time for rights requests and grievances, at most 90 days; nominee | Rule 14 | 30 days; nominee line |
| Security safeguards; logs kept 1 year; contracts with processors | Rule 6 | Security section; logs 7 days now, 1 year from 13 May 2027 |
| Breach: tell each person without delay; the Board without delay + report in 72 hours | Rule 7 | Breach section |
| Keep personal data, traffic data and logs 1 year even after an account is deleted | Rule 8(3) + Seventh Schedule (from 13 May 2027) | Delete section says what is kept and why |
| 3-year inactivity erasure | Rule 8 + Third Schedule: only e-commerce/social media 2 crore+, gaming 50 lakh+ | Not applicable (no promise made) |
| Under 18 = child; verifiable parent consent; no tracking or behavioural monitoring of children; gyms are not exempt | Act s.9, Rule 10, Fourth Schedule | 18+ only, delete if found |
| Gym = Data Fiduciary, MettleUp = processor under a contract | Act s.8(1)-(2) | Data agreement draft |
| Sensitive data today (health condition, physiological) needs consent, a published policy and a Grievance Officer resolving within one month | IT (SPDI) Rules 2011, in force until 13 May 2027 | Covered |
| E-commerce grievance officer (acknowledge 48 h, resolve 1 month) | Consumer Protection (E-Commerce) Rules 2020 r.4 (applicability to us UNVERIFIED) | Grievance Officer named; no 48 h promise (decision D4) |
| Play: name the developer, privacy contact, data types, who gets it, security, retention and deletion; public non-PDF URL; labelled "privacy policy"; linked in app and console | https://support.google.com/googleplay/android-developer/answer/10144311 | Yes |
| Play account deletion: in-app + web; say what is kept and why | https://support.google.com/googleplay/android-developer/answer/13327111 | Yes; delete page needs the 15 -> 7 days fix |
| Health Connect: say what is read/written, why, how to stop, retention, security; Limited Use statement | https://support.google.com/googleplay/android-developer/answer/9888170 , /12991134 | Yes (same sentence as Strong/Fitbod) |

Not verified: Cult.fit (page would not load), Fitbod details, exact E-Commerce Rules applicability to a sole proprietor.

## 4. Google Play Data safety: what must change to match the draft

Today on Play (from `docs/launch/PLAY-DATA-SAFETY-2026-11-03.md` and R-318): Voice (collected, ephemeral, optional), Crash
logs + Diagnostics (collected, required, Analytics), plus the 24 Oct answers. The 3 Nov draft rows were never confirmed
as submitted. Make Play match this list (the main session does it in Play Console):

| Play data type | Collected | Shared | Optional | Purposes | Why |
|---|---|---|---|---|---|
| Personal info → Name | Yes | Yes (your gym: join, leaderboard, trainers) | Yes | App functionality, Account management | Name typed at join; Google name |
| Personal info → Email address | Yes | No | Yes | Account management, App functionality | Google sign-in |
| Personal info → User IDs | Yes | No | Yes | Account management | MettleUp account id |
| Personal info → Phone number | Yes | Yes (your gym) | Yes | App functionality | Typed at QR check-in; sent to the gym's payment company for an online payment |
| Personal info → Other info | Yes | No | Yes | App functionality | Age, height, goal, bio, link in the saved profile |
| Health and fitness → Fitness info | Yes | **Yes** (your gym: trainer summary ON by default, leaderboard numbers, busy-machine starts, reports on request; gym mates if switched on) | Yes | App functionality | Saved workouts, body weight (incl. Health Connect weigh-ins), measurements |
| Health and fitness → Health info | No | - | - | - | Sleep and steps read on the phone only; heart rate shown on the watch only |
| Photos and videos → Photos | No | - | - | - | Progress photos never leave the phone (desk photos are taken in the web admin app, not this app) |
| Messages → Other in-app messages | Yes | No (they go to the user's own gym, user-started) | Yes | App functionality | Desk messages, Ask a trainer |
| Financial info → Purchase history | Yes | No | Yes | App functionality | Shop orders; payment requests from the gym |
| App activity → Other actions | Yes | No | Yes | App functionality | QR check-in times |
| App activity → Other user-generated content | Yes | No | Yes | App functionality, Analytics | Feedback, help questions, workout notes |
| Audio → Voice or sound recordings | Yes (ephemeral) | No | Yes | App functionality | Unchanged |
| App info and performance → Crash logs | Yes | No | No | Analytics | Unchanged |
| App info and performance → Diagnostics | Yes | No | Yes | Analytics, App functionality | App version + phone model with feedback; **new: watch screen log (optional switch)** |
| Device or other IDs | Yes | No | Yes | App functionality | Push address; random install number with feedback |
| Location | No | - | - | - | No location permission |

Also: encrypted in transit = Yes; deletion = both ways, URL https://mettleup.fit/delete-account; Health apps declaration:
phone READ_WEIGHT, READ_STEPS, READ_SLEEP, WRITE_EXERCISE, WRITE_ACTIVE_CALORIES_BURNED; **the watch app's
READ_HEART_RATE / BODY_SENSORS must be declared too if the watch bundle uploads it (check the Health apps form lists it).**
Service providers (Supabase, Cloudflare, Google, Groq, Anthropic, Meta) are not "sharing" in Play's terms.

## 5. Decisions only the owner can make

| # | Question | Recommendation |
|---|---|---|
| D1 | Publish the three drafts (privacy, terms, data agreement) as written? | Yes, after the fixes the fresh-reader review asks for |
| D2 | Crash text goes to the public GitHub repo. Move crash issues to a private repo (code change), so the notice can say "private"? | Yes. Until then the draft says "our bug list on GitHub, with personal details removed", not "private" |
| D3 | New gym terms version: gyms must tick "I agree" again (a live server change adding the version to `_terms_versions()` + TERMS_VERSION). Ask again at the next sign-in? | Yes, ask at next sign-in |
| D4 | Promise "acknowledge within 48 hours" (E-Commerce Rules)? | No: keep only "within 30 days" (he rules out reply-time promises; 30 days is what the law needs) |
| D5 | Gym liability cap = what the gym paid MettleUp in the 12 months before the claim (the industry norm; Zenoti, HealthifyMe)? | Yes |
| D6 | Hindi: rewrite the Hindi notice from the new English after his yes, and keep the old Hindi until then? | Yes |
| D7 | The 18+ check is only at gym join. Add an "I'm 18 or older" tick at Google sign-in too (an app change)? | Yes, in the next app version |
| D8 | Online payments to the gym (F79) are in test mode. Keep the payment lines in the notice now (disclosed before any real payment) or add them when it goes live? | Keep them now |

## 6. Publishing steps (after his yes; not done)

1. Copy the approved text into `docs/launch/PRIVACY-NOTICE.md` / `TERMS.md` / `DATA-AGREEMENT.md` (or switch
   `legal_pages.py` to read `docs/legal/*-draft.html` bodies) so a rebuild never brings back old text.
2. Hindi section (D6).
3. Delete-account page: "15 days" -> "7 days".
4. Gym terms version (D3): migration with the new date + `apps/dashboard/src/crm/auth/terms.ts` TERMS_VERSION.
5. Admin deploy with an ADMIN_NEWS line (R-333), then UAT the pages at phone and desktop width (R-314).
6. Play Data safety (section 4).
7. Later app version: links to https://mettleup.fit/privacy and /terms instead of forgeai.aakashpahuja.in.
