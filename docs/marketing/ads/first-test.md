# First paid-ad test: gym owners (draft, 9 Nov 2026)

**Status: READY FOR HIS LOOK. Nothing is posted, paid or created anywhere.** Aakash runs or approves every rupee.
His words (9 Nov): try it with a small amount, different hooks, professional videos. He chose: the first ads speak to gym owners.
Note: the growth plan still says "Rs0 ads, onboard gyms in person first" (R-417). His 9 Nov words change that for a small test only; the plan's order (proof first) still holds.

Creatives: `marketing/owner-ads` (Remotion). Renders run in GitHub Actions (`owner-ads.yml`). Finished files on his PC: `D:\Apps\ForgeAI\Marketing\owner-ads-v1\`.

## The five ads

Every ad: 9:16 video (about 17-19 s, hook readable in under 2 s, burned-in captions, voice + music), plus a 1:1 and a 4:5 still for the feed.
Same campaign look (dark steel room, forge-orange light, real screens in 3D, the steel MettleUp name at the end); each has its own motif.
Every demo screen is the live admin panel's example gym "Iron Temple Fitness", marked "Example gym" on screen; demo mobile numbers are masked. No people, faces, reviews or outcome numbers.
Voice: Kokoro (free), Hindi voice `hf_alpha` reading English (an Indian accent). It says "MettleUp" like "Metal up" (same sound).

### 1. Pending fee (`01-pending-fee`)
- **Primary text:** How much fee is pending in your gym right now? MettleUp shows who owes, how much, and for how long.
  Tap Collect when they pay, or send a ready WhatsApp reminder, one tap each. Free for 3 months, no card.
- **Headline:** See every pending fee in one list
- **Description:** Free for 3 months. No card.
- **Screens:** Money > Dues (phone + desktop), the Collect list.

### 2. Less than one member's fee (`02-one-member-fee`)
- **Primary text:** Gym software for less than one member's monthly fee: MettleUp Starter is ₹999 a month.
  Members, plans, renewals, check-ins and dues, plus a free workout app for every member in your gym's name. Free for 3 months, no card.
- **Headline:** ₹999 a month. Free app for members.
- **Description:** If a member pays you more than ₹999 a month, it costs less than one member.
- **Screens:** Plans (example monthly plan ₹1,200), Today, Dues. A price tag carries the condition in writing.

### 3. Your gym's own app (`03-own-app`)
- **Primary text:** Big chains have their own app. Now your gym can too: every member gets a free workout app in your gym's name.
  It shows last time's weight on every set. On Pro, add your logo and colours. Free for 3 months, no card.
- **Headline:** A member app in your gym's name
- **Description:** Logo and colours on Pro.
- **Screens:** Branding (the member-app preview with the gym's name), the member app's workout screen. "Logo and colours: on Pro" is on screen.

### 4. We move your members (`04-excel-move`)
- **Primary text:** Still keeping members in Excel or a register? Send it to us and we move your members into MettleUp, free.
  Or do it yourself: choose the file, check the list, tap Add. Free for 3 months, no card.
- **Headline:** We move your members for you, free
- **Description:** From an Excel sheet or a paper register.
- **Screens:** Members list, Import members from Excel. A drawn sheet and register (no names on them) fly into the phone.

### 5. Trainer leaves (`05-trainer-leaves`)
- **Primary text:** When a trainer leaves, do his plans leave with him? On MettleUp Pro, plans live in your gym's account, not on his phone.
  The next trainer opens the same plans and sends them to members. Free for 3 months, no card.
- **Headline:** Trainers change. Your plans stay.
- **Description:** Trainer plans are on Pro.
- **Screens:** Workout plans (admin, the example gym with three plans sent to its Monthly and Quarterly members), the member app's Gym tab ("Your trainer's workout plans, right on your Workout tab"). "On Pro" is on screen and spoken.

**Button (all):** Sign up -> `https://app.mettleup.fit/start` (live: opens "Start my gym"). Not "Message us on WhatsApp": Click-to-WhatsApp needs a Facebook Page linked to the number, and the plan holds it until 3 live gyms.

## Hinglish lines: Aakash reads each aloud before anything runs
Shown on screen under the hook (not spoken). Roman letters only. The apps' screens stay English and no ad implies Hindi screens.
| Ad | Line | Means |
|---|---|---|
| 1 | Kitni fees baaki hai? Ek nazar mein dekhiye. | How much fee is left? See it at a glance. |
| 2 | Ek member ki fees se bhi kam. | Less than even one member's fee. |
| 3 | Aapke gym ke naam ka app. | An app in your gym's name. |
| 4 | Excel ya register bhejiye. Baaki hum karenge. | Send the Excel or register. We do the rest. |
| 5 | Trainer jaaye, plans gym mein hi rahenge. | If a trainer goes, the plans stay in the gym. |

## Claims check (every line against the backlog in docs/OWNER-INBOX.md and the live gym site)
| Claim | Proof | OK? |
|---|---|---|
| Shows who owes, how much, for how long | F82 Payments, dues and receipts (Live); F92 tiles (Live); live demo Money > Dues | Yes |
| Tap Collect when they pay | Live demo: Collect on every dues row | Yes |
| Ready WhatsApp reminder, one tap each | F88 Renewals list and WhatsApp messages (Live). Not automatic (F104 Not doing): copy says "one tap each" | Yes |
| Free for 3 months, no card | Gym site pricing ("Every pack starts with 3 months free... No card"); R-416 keeps the trial | Yes |
| Starter ₹999 a month | Gym site pricing card (published price) | Yes |
| Less than one member's fee | Conditional only: "if a member pays you more than ₹999 a month" (skill rule 6 allows conditional maths) | Yes, with the condition on screen and in the description |
| Members, plans, renewals, check-ins, dues | F81, F82, F86, F88, F120 (Live) | Yes |
| Free app for every member in your gym's name | Gym site Starter list ("Free workout app for every member, with your gym's name"); F116 join by code (Live) | Yes. Member app is Android only (not said, not implied otherwise) |
| Logo and colours | F98, F118 (Live), Pro only | Yes, "on Pro" on screen and in copy |
| Last time's weight on every set | F1 Workout logging (Live) | Yes |
| Big chains have their own app | General market fact, no chain named | Yes (no rival brand) |
| We move your members, free (Excel or register) | Promised offer (skill: free set-up and data move, decided 6 Nov); F97 Import from Excel (Live). A register is typed in by us, not read from a photo (photo reading is not built) | Yes. **Gap: the gym site does not say "we move your members for you, free" yet.** The ad's promise should also be on the page it sends to |
| Choose the file, check the list, tap Add | Live Import screen: "Nothing is saved until you check the list and tap Add" | Yes |
| Trainer plans live in your gym's account | F99 Gym workout plans (Live), Pro only (gym site Pro list) | Yes, "on Pro" in voice, copy and on screen |
| The next trainer opens the same plans, sends them | F99 (plans belong to the gym; any trainer login can send them) | Yes |
Not claimed anywhere: members stay / more renewals (no pilot numbers in proof/), reply times, "best", "#1", "only us", rival names, automatic reminders, Hindi screens, iPhone.

## Test setup (suggested, his yes needed for every rupee)
- **Where:** Meta (Instagram Reels + Facebook/Instagram feed), placements: Reels, Stories, Feed. 9:16 video for Reels/Stories, 4:5 for Feed, 1:1 as backup.
- **Who:** Jaipur + 40 km. Age 24-55. Interests: gym owner / fitness business / gym equipment / personal trainer certification (narrow to business, not "fitness", which reaches members). One ad set, broad inside that.
- **Budget:** ₹500 a day total for 7 days = ₹3,500.
- **Metric:** cost per qualified lead. Qualified = an owner or manager of a gym who starts "Start my gym" (a new gym appears in HQ) or writes to us with his gym's name. Also watch the hook rate (3-second plays / impressions; 30% is good) and link clicks.
- **How many ideas at once (skill formula):** (daily budget x 4) / (2 x target cost per qualified lead) = (500 x 4) / (2 x 1,500) = **about 1**. At ₹500 a day the data cannot pick a winner among 5. My view: run **2 hooks** (1 Pending fee and 4 We move your members: the most concrete pain and the strongest offer) for the 7 days, ₹250 a day each; keep 2, 3 and 5 for round 2. If he still wants all 5, treat it as a hook-rate test only (which video stops owners), not a cost test.
- **Target cost per qualified lead:** ₹1,500 (research range ₹800-2,500 for qualified B2B chats). **MISSING: the most he will pay for one paying gym**; this target should come from it.
- **Stop rule (written before launch):** never stop on day 1-2. From day 3: stop an ad that has spent 2x the target (₹3,000) with no qualified lead, or whose cost per qualified lead stays above 2x target (₹3,000) for 3 days. Stop any ad with a hook rate under 15% after 2,000 impressions. At ₹250 a day the 2x-target rule cannot fire inside 7 days, so the week ends with a HOLD / FIX / TEST / INVESTIGATE verdict per ad, not a kill.
- **Tracking:** MISSING. Sign-ups do not record which ad they came from. Before spending, give each ad its own link (`app.mettleup.fit/start?src=meta-01` etc.) or ask every new gym "how did you hear about us". Leads get the skill's follow-up (0 min reply, his gym's app picture by 10 min, day 3 "send your Excel or register").
- **Log:** results go in `docs/marketing/RESULTS.md`, ending with cost per paid gym.
- **Before launch (his steps):** Facebook Page + Instagram for MettleUp in his verified business; ad account; card on the ad account; his read-aloud of the Hinglish lines; his yes on the budget.

## Renders and checks (9 Nov 2026)

- **Files:** `D:\Apps\ForgeAI\Marketing\owner-ads-v1\` on his PC (not in git): `01-pending-fee.mp4` ... `05-trainer-leaves.mp4`, plus `-1x1.png` and `-4x5.png` for each. 1080x1920, 30 fps, 17-19 s, about 6-7 MB each.
- **Cloud runs (`owner-ads.yml`):** 42630737525 (one runner, hit the hour limit), 42640821172 (rendered, lost to a missing ffprobe), 42645656694 (first good set), 42650612913 (final, after the review fixes).
- **Checked:** frames at 0.5 s, 2 s, 35%, 55%, 75% and the end of every video; sound and picture lengths match to within 0.06 s; feed pictures read.
- **Fresh-eyes review (one helper, pictures only, as a Jaipur gym owner):** ranked 2 (price) > 1 (pending fee) > 4 (Excel move) > 5 (trainer leaves) > 3 (own app). Fixed: ad 05 showed an empty plan list and a cut-off tag; loose colour squares (03) and floating plan names (05) read as placeholders; too many words in the first 2 s; "Members pay nothing" was unclear.
- **Not fixed, on purpose:** the example gym's dues look heavy (most over 60 days, one at 711 days) because that is the live demo's data; the short blur into the end card reads as a glitch in a still, not in motion; "on Pro" stays on screen in 03 and 05 because it is true.
