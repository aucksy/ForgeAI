# R-gym-timings: how to let a gym owner set opening hours that members see (R-124)

Researched 25 Oct 2026 (every "checked" date below is this date). Plain English first, sources after.
Marks: **VERIFIED** = read the primary page myself. **SECONDARY** = a directory, blog or search summary.

## 0. The short version (recommendation)

1. **Copy Google's model, made smaller.** For each day: Closed, Open 24 hours, or up to two time ranges
   (morning + evening). Plus "special days" for a date (closed, or different hours, with a note like
   "Diwali"). That is exactly how Google Business Profile stores hours, so owners already know it.
2. **Allow late-night ranges explicitly** (10:00 pm to 2:00 am = "ends next day"), ending by 12 noon,
   like Google. Refuse anything else in plain words (end before start, two ranges that overlap).
3. **Member app: one line, not a timetable.** "Open now · closes 10:00 pm" / "Closed now · opens
   4:00 pm" / "Open 24 hours", worked out in India time, tap for the week with today marked. GymMaster's
   member app does the same (today, then a link to the week).
4. **Beat the others on holiday notice.** The main complaint is turning up to a shut gym. So a special
   day in the next 7 days shows on the Gym tab by itself ("Closed Sun 8 Nov · Diwali") with no message
   to send. (Google shows special hours on the listing only when someone looks it up.)
5. **Skip for now:** "more hours" per service (ladies batch, PT, steam) as structured data. A one-line
   note ("Ladies batch 11 am to 12 pm") covers it; Google's "More hours" is the later upgrade.

## 1. How Google Business Profile models hours

- Regular hours: per day; a day not ticked is closed; several ranges per day ("9 AM to 2 PM, then
  5 PM to 10 PM"); "Opens at → 24 hours" for an all-day day. **VERIFIED**
  https://support.google.com/business/answer/15300403?hl=en (checked 25 Oct 2026)
- Special hours: for holidays and temporary changes; override regular hours for that date; can be
  "closed" for the whole date or have their own ranges. **VERIFIED**
  https://support.google.com/business/answer/6303076?hl=en (checked 25 Oct 2026)
- Data model: each range has openDay/openTime/closeDay/closeTime, so a range can end the next day
  ("later in the same day, or on a subsequent day"). A special-day range must be under 24 hours and may
  run to 11:59 am the next day. **VERIFIED**
  https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations#BusinessHours
- "More hours": separate hours for a service or a group (senior hours, delivery). **VERIFIED** (same
  special-hours help page and the API's moreHours field).

## 2. How gym software shows hours

- GymMaster: the gym's "Open Hours" are a roster in Settings; the member app has an "Open Hours" widget
  showing **today's hours with a link to the upcoming week**. **VERIFIED**
  https://www.gymmaster.com/user-manual/manual_app_lookgood_widgets_enable_open_hours and
  https://www.gymmaster.com/user-manual/manual_gettingstarted_settings_roster (checked 25 Oct 2026)
- EGYM: hours are set per location in the member-app settings, with a free-text option for a temporary
  full closure (renovation). **SECONDARY** (search summary of
  https://knowledge.egym.com/cs/business-suite/egym/member-app/settings/app-settings---location-details)
- Glofox, Gymdesk, PushPress, Wodify: no help page found on opening hours; they are class-schedule
  first. Indian tools (FitBinary, Gymgest): nothing public found. **UNVERIFIED**
- Multi-branch: every tool above keeps hours per location. Ours: per branch (each branch is a gym, 0031).

## 3. Indian gym patterns

- Split shifts are common: e.g. 5:30 am to 12 pm + 3:30 to 9 pm, Mon to Sat, Sunday closed (a women's
  gym, Bengaluru); 7 to 11 am + 5 to 9 pm (Delhi). Others run one long day (6 am to 10 pm) with Sunday
  closed. **SECONDARY** (LyfSkills directory listings, e.g. https://discover.lyfskills.com/listing/3641,
  https://discover.lyfskills.com/listing/15969, https://discover.lyfskills.com/listing/3063)
- 24-hour gyms (Anytime Fitness India): members get in at any hour, but staffed / office hours are
  separate and Sunday office is closed. **VERIFIED**
  https://www.anytimefitness.com/en-in/locations/new-delhi-delhi-in-1253 (checked 25 Oct 2026). So "Open
  24 hours" plus a note ("Desk 7 am to 10 pm") is the right shape.
- Festival closures (Diwali, Holi) move every year and vary from one day to several; gyms post them a
  few days ahead. **SECONDARY** (search summary; no gym-specific source found).

## 4. What members complain about

- Gym closing earlier than the advertised hours (UK ASA ruling on Bannatyne). **SECONDARY**
  https://www.prolificnorth.co.uk/?p=10616
- Hours changed but the listing not updated (24 Hour Fitness member locked in; PureGym no longer 24
  hours). **SECONDARY** https://daytondailynews.com/news/national/man-trapped-inside-hour-fitness-when-gym-closes-for-night/TyTQhMPAXpmUjitN5J818O,
  https://uk.trustpilot.com/review/www.puregym.com/location/brentwood
- Holiday hours not updated on Google Maps in time; advice is "call ahead". **SECONDARY** (blog).
- Takeaway: the owner must find it quick to change, and holidays must reach members before the day.

## 5. What we built (R-124)

Admin app → Gym timings (sidebar and More, next to Branding; Settings has a link). Owner edits; front
desk sees the hours read-only. Server: 0036 (one row per gym = per branch). Member app: Gym tab line +
"Gym timings" page, kept on the phone for offline. Details: docs/CLAUDE-NOTES.md R-124.
