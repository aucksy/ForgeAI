# F207 Gym page: every gym's own free web page (R-519, R-521)

14 Nov 2026. Plan, design and the hidden first build. Research on the AI helper: [AI-RESEARCH.md](AI-RESEARCH.md).
Database change: `supabase/migrations/0080_gym_page.sql` (test `supabase/tests/0080_gym_page.sql`, green in CI).
The owner said yes to applying it live (R-529); it is WAITING to be applied live by the main session.

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
9. Photos live in our own Supabase storage, in a private bucket (R-529, migration 0082), shrunk in the browser to
   WebP (at most 1600 px and 1 MB, camera data removed) and served by the Worker at join.mettleup.fit/p/<gym>/<id>.webp.
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

**C. Settings -> Your web page** (BUILT 14 Nov, R-529; shows only when the gym's server answers owner_gym_page, so
hidden until 0080 is live). Under "Your gym" in the menu, More on a phone, and from Set up your gym. The address is
locked once the page was published ("To change your address, write to MettleUp", screen only). "See your page"
draws the real page in the panel. Code: apps/dashboard/src/crm/gympage/, ui/screens/WebPage.tsx. Planned: The same fields, plus: Published on/off, "Let Google show my page"
(off by default), the page link with Copy and Share on WhatsApp, "See my page", a "Taken down by MettleUp" banner with
HQ's note when hidden, and later the AI helper switch (section 7). Owners only can save; staff can see the link.

**C2. Get started on Today** (R-523, R-525, step switched on by R-529). Built: a "Set your gym timings" step (live now; ticks itself when the
Gym timings screen sees real saved timings), placed just before the web page step. Built but hidden: step "Make your free gym web page", hint "People who may join
can see your fees, timings and photos, and send you a question." Opens Settings -> Your web page, ticks itself when
the page is published. It appears only when the gym's server answers owner_gym_page (getStarted.ts `webPage`, passed by
GetStartedCard since R-529), so it stays hidden until 0080 is live. The hint names the AI helper only once that helper is live (a test checks it does not now).

**D. Enquiries** (BUILT 14 Nov, R-529): a question from the page shows as "Asked on your web page" with the
question, like Joined online rows do. Until the admin app learns it, the enquiry's "interest" line carries the
question, so older admin apps still show it.

**E. MettleUp HQ** (not built; for later, nothing new in R-529): a "Reported pages" list (page, reason, count) with "Hide page" and a note to the owner.

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
| Photos | private Supabase bucket `gym-page-photos` + gym_page_photo_slots (0082), served at join.mettleup.fit/p/<gym>/<id>.webp | new |

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

Built 14 Nov (R-529): the Settings editor with photo upload (0082 private bucket; the Worker serves /p/... with the
key it already has), the Set up your gym step, the Enquiries label. Not built: a separate new-gym onboarding
screen (B: the Set up your gym step opens the editor instead), the HQ reported-pages list, a sitemap, clearing
unused photo files (a photo removed from the page stops showing at once; its file stays in the bucket).

## 6. Live changes needing the owner's yes

1. **Database (owner said yes, R-529; waiting for the main session to apply it live):** migration
   `0080_gym_page.sql` (tables gym_pages, gym_page_reports, gym_page_asks; functions owner_gym_page,
   owner_save_gym_page, gym_page_public, gym_page_ask_send, gym_page_report_send, hq_hide_gym_page(actor, slug,
   hidden, note); gym_alerts kind 'page_question'). The admin app must add 'page_question' to its alert kinds
   (gymAlerts.ts) or those alerts are not shown.
2. **Photos (R-529):** migration `0082_gym_page_photos.sql` (NOT APPLIED): private bucket gym-page-photos (1 MB,
   WebP only), gym_page_photo_slots, owner_gym_page_photo_slot(key). A file may be put only into a slot the owner
   just took (15 minutes, 12 open, 60 a day) and read only while it is on a published-or-draft page row that HQ has
   not hidden. The Worker serves it at join.mettleup.fit/p/<gym_id>/<id>.webp. No Cloudflare R2.
3. **Cloudflare:** add `join.mettleup.fit` to the panel Worker's routes (custom domain), and set `GYM_PAGES` to "live".
4. **Words:** the public words in section 8.

Switching it on, in order: 1, 2 (editor and upload are built), deploy the admin panel and the Worker, then 3, and add
a What's new line in the same go.

**One switch shows everything (coordinator, 14 Nov 2026, the owner's rule "show a feature only when it is on").**
`GYM_PAGES` = "live" opens join.mettleup.fit/<gym> AND shows, in the admin app, the "Your web page" menu row and
screen, Set up your gym's step "Make your free gym web page" and "Asked on your web page" on an enquiry, and adds the
assistant's "Your web page" page and the help article "Make your free gym web page". While it is off none of them
shows (a typed /settings/web-page goes to Settings, and the panel does not even ask owner_gym_page). The Worker says it
at GET /api/switches (deploy/panel/switches.js); the admin app asks on opening, on coming back to the front and every
5 minutes (apps/dashboard/src/crm/gympage/pagesOpen.ts), so it all appears together with no reload. Proof:
deploy/panel/switches.test.mjs and e2e/webpage-uat.spec.mjs WEBPAGE-0. Because owners only see the editor once pages
are open, the first gyms' pages are empty at switch-on: test with the test gym by setting the switch, then tell owners.

## 7. Owner switches added on 14 Nov (R-521)

**AI helper switch.** Stored now in the draft (`gym_pages.ai_helper`, default ON; the page data carries `aiHelper`).
The editor shows it only once the AI helper (F208) exists. Until then it does nothing.

**Trial (for sign-ups from the page).** Not built here; handed to the self sign-up work.
- Data: on the gym's settings, `trialOn` (off by default) and `trialDays` (1 to 14, owner's choice, e.g. 3 or 7).
- Owner setting: "Offer a free trial to people who sign up online", with the number of days.
- Visitor flow: when on, the Fees board gets one line, "Free <N>-day trial. Ask at the desk." and Join online offers
  "Start with a <N>-day trial" as a choice next to the plans; the request lands in Enquiries marked "Trial, <N> days".
  When the trial ends, the gym's Today screen asks the desk to call them.
- **Decided 14 Nov (R-524):** a trial is free or a small fee (e.g. Rs 199) that is taken off the plan if the person
  joins. There is **no** "pay first, refund if they stop" trial. Payments stay in test mode until the owner says
  "payments live".

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

## 10. AI chats on the page land in Enquiries (R-538, 14 Nov 2026)
The owner: every visitor question, answered by the AI or not, must reach Enquiries. Decided design:
1. **One enquiry per visitor chat, not per message.** The page keeps a random visitor id in the browser; the chat's
   questions and the AI's answers are added to the same Enquiry ("Chat on your web page"). The owner opens it and reads
   the whole chat, newest last.
2. **A status the owner can scan:** "AI answered" / "Needs you: the AI could not answer" / "Wants a call" / "Asked to
   join". The list sorts "Needs you" and "Wants a call" first.
3. **Alerts only when the owner must act:** the AI could not answer, the visitor left a number, or asked to join or for
   a trial. A chat the AI answered fully, with no number left, is saved but sends no alert (no noise).
4. **The AI asks for a name and number** once the visitor shows interest ("Want the gym to call you?"). A number turns
   the chat into a lead (same as a join-form enquiry; Call and WhatsApp buttons). The visitor has no app, so the owner
   replies by call or WhatsApp, never inside the page.
5. **The AI never makes things up:** it answers only from the gym's page data (plans, prices, timings, address,
   facilities, offers). Anything else = "I will ask the gym" -> status "Needs you", the visitor may leave a number.
6. **Cost and limits:** visitor answers use the gym's credits at 10 answers = 1 credit (decision #98 = B), 3 questions
   per visitor a day and 30 per gym a day (0078). Over a limit or no credits: the question is saved as "Needs you" and
   the visitor sees "The gym will reply. Leave your number to get a call."
7. **Privacy:** a line under the chat box: "Your chat is saved and seen by <gym>." (public words: needs his yes). Chats
   kept 90 days, then deleted; a visitor number is kept like any enquiry.
8. **When:** built together with the page's AI helper (held since #97), after the page is public on join.mettleup.fit
   and has real visitors. The non-AI "Ask the gym" box already makes an Enquiry today (0080, 'page_question' alert).

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
  view would use up at about 2,800 page views a month across all gyms. R2 looked cheaper, but the owner chose our own
  Supabase storage (R-529); the Worker's edge cache (1 hour per photo) keeps downloads from Supabase low.
- **Abuse controls:** report link, owner on/off, HQ hide, noindex until opted in, photos only through our upload (size
  and type checked, re-encoded to WebP), fixed facility list, no links in text, daily limits per address, per gym and
  per phone number.
