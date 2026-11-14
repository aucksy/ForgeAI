# F207 Gym page: every gym's own free web page (R-519, R-521)

14 Nov 2026. Plan, design and the hidden first build. Research on the AI helper: [AI-RESEARCH.md](AI-RESEARCH.md).
Draft database change (not applied, not a migration): [gym_page.draft.sql](gym_page.draft.sql).

## 1. The plan in ten lines

1. Every gym gets one free page at **join.mettleup.fit/<gym-name-area>**, e.g. join.mettleup.fit/example-fitness-sector-12.
2. One fixed design for every gym, coloured by the gym's own brand colour and logo (already in the system).
3. The owner adds only: a short "About" (500 letters), up to 6 photos, facility ticks, the Google Maps link, and
   whether to show the phone and WhatsApp. Plans, prices, timings, address, name, colour and logo come from what the
   gym already has.
4. The page shows, in this order on a phone: the gym's signboard (name, area, "Open now"), photos, Fees, Timings,
   About, Find us (Maps, directions, call, WhatsApp), Ask the gym, Share on WhatsApp, the disclaimer and Report.
5. "Become a member" opens the existing Join online page (/m/CODE, live since 14 Nov); "Ask the gym" lands in the
   gym's Enquiries with an alert, like Bring a friend does.
6. It is a step in new-gym setup ("Your free web page", skippable) and an editor in Settings.
7. Pages stay hidden from Google until the owner ticks "Let Google show my page"; nothing is public until the owner
   presses Publish and agrees the content is the gym's own.
8. Safety: fixed facility list (no free claims), no links in text, photos only uploaded through us, a Report link on
   every page, MettleUp HQ can take any page down, daily limits on both forms.
9. Photos live in Cloudflare R2 (10 GB free, no download charges), shrunk in the browser to under ~400 KB each.
10. No AI helper on the page now. The owner's AI switch (on by default) is stored now and shown when the helper exists.

## 2. Pictures (Example gym, never a real gym)

Rendered from the real code with headless Chrome, 14 Nov 2026. Kept outside git (they carry Wikimedia Commons photos
used only as stand-ins: Gym, Katowice; Barbell and Dumbbells in a local health club; Dumbbells in a local Gym; Woman in
a gym doing dumbbell curls; CC BY-SA 4.0 / CC BY 2.0). The render script is `scratchpad/render-gympage.mjs` style:
`pageFrom(example)` then `renderGymPage(page, {nowMs})`.

- a-phone: orange gym, logo, open now, join online on, 5 photos (390 px)
- a-phone-dark: the same in dark mode (the wall goes dark, the boards stay white)
- a-desktop: 1440 px, two columns
- b-phone: long name, no logo, blue, **closed now** (the shutter stays half down with "OPENS 5:30 AM TOMORROW"), no
  Join online (the main button becomes "Ask a question")
- c-phone: pale yellow brand colour (black letters chosen automatically), no photos, no timings

## 3. Screens

**A. The public page** (built, hidden). Design brief: `apps/dashboard/.impeccable/surfaces/public-gym-page-page-js.md`
(a painted shop signboard over a rolling shutter, then the tin fee and timing boards by the door). Phone first; on a
computer the photos become a mosaic and the boards sit in a right-hand column. The page is complete without
JavaScript; the one small script adds the shutter roll-up, the bottom bar on phones, the forms and Copy link.

**B. Owner setup step in new-gym onboarding** (not built; needs the database part). One screen after brand colour:
- "Your free web page" with a live small preview of their page.
- Address part, filled from name + area, editable, with a "free" or "taken" check.
- About (500 letters, a counter), facility ticks (fixed list), up to 6 photos (pick, crop to 4:5, shrink in browser).
- Google Maps link (paste from Maps "Share"), "Show my phone number", "Show WhatsApp".
- One tick: "These fees, photos and words are my gym's own, and I am responsible for them." Then **Publish** or
  **Later**. Skippable; never blocks finishing setup.

**C. Settings -> Your web page** (not built). The same fields, plus: Published on/off, "Let Google show my page"
(off by default), the page link with Copy and Share on WhatsApp, "See my page", a "Taken down by MettleUp" banner with
HQ's note when hidden, and later the AI helper switch (section 7). Owners only can save; staff can see the link.

**C2. Get started on Today** (R-523, built, hidden): step "Make your free gym web page", hint "People who may join
can see your fees, timings and photos, and send you a question." Opens Settings -> Your web page, ticks itself when
the page is published. It appears only when the admin app passes the page's state (getStarted.ts `webPage`), which it
does not yet: there is no set-up screen and no live database part, so a visible step would open nothing and never
tick. The hint names the AI helper only once that helper is live (a test checks it does not now).

**D. Enquiries** (small change, not built): a question from the page shows as "Asked on your web page" with the
question, like Joined online rows do. Until the admin app learns it, the enquiry's "interest" line carries the
question, so older admin apps still show it.

**E. MettleUp HQ** (not built): a "Reported pages" list (page, reason, count) with "Hide page" and a note to the owner.

## 4. Data

What the page shows, and where it comes from:

| On the page | Source | New? |
|---|---|---|
| Name, join code | gyms | reused |
| Brand colour, logo | gyms brand columns (0005) | reused |
| Plans and prices | crm_records kind plan (same reading as 0077's plan list) | reused |
| Timings, special days, note | gym_timings (0036), packages/theme gymHours.ts | reused |
| Address, phone | crm_records kind gym (Settings -> Gym details) | reused |
| Become a member | /m/CODE Join online (0077, live) | reused |
| Slug, about, highlights, photos, maps link, lat/lng, show phone, WhatsApp, published, Google, terms tick, HQ hide, AI helper switch | **gym_pages** | new table |
| Questions | crm_records kind enquiry (+ `pageAsk` block) and gym_page_asks (limits only) | new block + table |
| Reports | **gym_page_reports** | new table |
| Photos | R2 bucket `gym-page-photos`, served at join.mettleup.fit/p/<gym>/<id>.webp | new |

Never on the page: members, payments, staff, the owner's personal number (only the gym's number, only if switched on).

## 5. What is built now (hidden), and what is new vs reused

Built on 14 Nov 2026, all behind two locks (the host is not routed, and `GYM_PAGES` is not "live"):

- `deploy/panel/gymPage.js` - pure: checks the gym server's answer, draws the whole page, Google's ExerciseGym data,
  slug maker, Maps and WhatsApp links, rupee words, black-or-white letters on the brand colour.
- `deploy/panel/gymPageServe.js` - the join.mettleup.fit host: the page (data kept 5 minutes at the edge, the page
  drawn fresh so "Open now" is right), strict browser rules (CSP), the two forms with the friend form's guards
  (hidden box, size limit, 5 a day per network address), "not here" page, robots.txt.
- `apps/dashboard/public/gym-page/page.js` - the page's one script.
- `deploy/panel/hosts.js`, `worker.js` - join.mettleup.fit goes to the code above.
- `deploy/panel/gymPage.test.mjs` - 14 tests.

Reused: gymHours.ts (open now, week), the friend/self-join form guards and D1 limit table, Join online, Enquiries,
gym alerts, brand colour and logo, plan records.

Not built (needs the database part or the owner's yes): the photo upload endpoint and R2 bucket, the owner setup
step, the Settings editor, the Enquiries label, the HQ reported-pages list, a sitemap.

## 6. Live changes needing the owner's yes (none done)

1. **Database:** apply `gym_page.draft.sql` as the next migration (tables gym_pages, gym_page_reports, gym_page_asks;
   functions owner_gym_page, owner_save_gym_page, gym_page_public, gym_page_ask_send, gym_page_report_send,
   hq_hide_gym_page; gym_alerts kind 'page_question').
2. **Cloudflare:** an R2 bucket `gym-page-photos` bound to the panel Worker (free up to 10 GB).
3. **Cloudflare:** add `join.mettleup.fit` to the panel Worker's routes (custom domain), and set `GYM_PAGES` to "live".
4. **Words:** the public words in section 8.

Switching it on, in order: 1, 2, build the editor and upload, deploy the admin panel, test with the test gym, then 3.

## 7. Owner switches added on 14 Nov (R-521)

**AI helper switch.** Stored now in the draft (`gym_pages.ai_helper`, default ON; the page data carries `aiHelper`).
The editor shows it only once the AI helper (F208) exists. Until then it does nothing.

**Trial (for sign-ups from the page).** Not built here; handed to the self sign-up work.
- Data: on the gym's settings, `trialOn` (off by default) and `trialDays` (1 to 14, owner's choice, e.g. 3 or 7).
- Owner setting: "Offer a free trial to people who sign up online", with the number of days.
- Visitor flow: when on, the Fees board gets one line, "Free <N>-day trial. Ask at the desk." and Join online offers
  "Start with a <N>-day trial" as a choice next to the plans; the request lands in Enquiries marked "Trial, <N> days".
  When the trial ends, the gym's Today screen asks the desk to call them.
- **Not decided:** a "pay first, refund if they stop" trial. Do not build it until the owner decides (it touches
  money and refunds).

## 8. Public words (draft, **needs owner yes**)

Run through the member-words skill before going live. Bilingual board headers (Fees · फीस, Timings · समय, Find us
· पता, Ask the gym · सवाल पूछें) also need a Hindi check.

- Disclaimer (footer): "This page is made by <gym> on MettleUp. The fees, offers, timings and photos come from the
  gym, and the gym is responsible for them. MettleUp does not sell memberships and takes no money on this page."
- Under the fees: "Prices are set by <gym>. Please confirm at the desk before you pay."
- Question consent (unticked box): "Send my name, number and question to <gym> so they can reply to me. Only this gym
  sees them."
- After sending: "Sent. <gym> will reply on 98XXXXXX12."
- Report reasons: "Wrong or misleading fees, offers or timings", "Photos are not of this gym, or are copied",
  "Offensive or unsafe content", "Spam or a scam", "This gym has closed". After: "Thank you. MettleUp will look at
  this page."
- Owner's tick before publishing: "These fees, photos and words are my gym's own, and I am responsible for them."
- Facility list words (gymPage.js HIGHLIGHTS), e.g. "Women-only batch", "Workouts tracked in the MettleUp app".
- Footer link: "Own a gym? Get a free page like this" (to gyms.mettleup.fit).
- The page terms for owners (new section in Terms): what may go on a page, MettleUp may hide a page that breaks it.

## 9. Research behind the choices (14 Nov 2026)

- **Others:** a free one-page site exists at some foreign gym software companies (own sub-address, custom domain
  extra); others charge monthly for the website. Visitors' top complaint is hidden prices; vague buttons and too many
  equal offers cost leads; Google Business Profile drives more leads than the site. So: prices up front, two buttons
  only, Maps link prominent. (Sources in AI-RESEARCH.md and the session notes.)
- **Address:** join.mettleup.fit/<slug>, not app.mettleup.fit/j/: the Android app claims /j/ (would open the app),
  and owner-written content should not share the admin app's address (where sign-ins are kept). A separate host also
  keeps Google's view of the gym pages apart from ours (Google site reputation abuse policy, Nov 2024 update: hosting
  third-party pages is fine, not to ride our ranking; so noindex until the owner opts in, and HQ takedown).
- **Google basics:** title "<Gym>, <area>: fees, timings and photos"; description with the lowest price and open
  status; schema.org ExerciseGym with opening hours, price range, geo; canonical address; noindex by default.
- **Maps:** Google Maps URLs need no key (search: /maps/search/?api=1&query=, directions: /maps/dir/?api=1&destination=);
  the owner may paste their own Maps share link (only Google's own addresses are accepted).
- **Photos:** R2 free 10 GB, free downloads; Supabase free has 1 GB and 5 GB of downloads a month, which 6 photos per
  view would use up at about 2,800 page views a month across all gyms. R2 wins.
- **Abuse controls:** report link, owner on/off, HQ hide, noindex until opted in, photos only through our upload (size
  and type checked, re-encoded to WebP), fixed facility list, no links in text, daily limits per address, per gym and
  per phone number.
