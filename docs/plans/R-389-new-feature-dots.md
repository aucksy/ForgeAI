# R-389 New-feature dots ("follow the dots"), admin panel + member app — plan, 7 Nov 2026

Owner ask (7 Nov 2026): like Samsung's software, a NEW FEATURE (never a fix) shows a small dot on
each entry point on the way to it: the left menu item (Settings), the row on the Settings page
(Pay MettleUp), and beside the heading of that section on the page. Both the admin panel and the
member app. Show them in production for the recent admin features; the member app too (only he uses it).

## Research (7 Nov 2026)
- Mainstream: Samsung One UI and Android settings mark new items; Shopify Polaris has a "New" badge
  pattern for features it wants adopted, with a short life and a warning about clutter.
- What users hate: dots that never go away, dots for things that are not new to them, too many at once
  ("dot fatigue"). Advice: a dot means one thing, it clears when the person reaches it, it expires,
  it has screen-reader text, and dots are not mixed with numbers in one menu.

## Design
1. **One source.** A What's new line gets `feature: true` (fixes never do). Its `go` path is already the
   destination. The trail is derived from that path: no second list to keep in step.
   - Admin: `/settings/mettleup` -> left menu "Settings" + the "Pay MettleUp" row on Settings + the page heading.
   - Member: `/settings/health` -> the Settings entry + the "Sleep and workouts" row + the page heading.
   - A section inside a page (e.g. member Gym tab `section: 'gym'`) gets the dot on that section heading.
2. **When a dot clears.** Opening the destination page marks that feature seen on this device. The
   heading dot shows during that visit (so the person sees where it is) and is gone next time. Parent dots
   (menu, row) go at once, unless another unseen feature sits under them.
3. **Expiry.** A dot shows at most 30 days after the feature went live (the entry's date). An owner who
   never looks is not chased for ever.
4. **Limit.** At most 3 features carry dots at once (newest first), against dot fatigue.
5. **Look.** One small dot (8 px) in the brand accent, never a number (the bell keeps the count).
   Screen readers hear "New". On the member app, a gym's own colour is used where the gym has branding.
6. **Memory.** Per device: localStorage (admin) and AsyncStorage (member app). A new phone or computer shows
   the dots again, still inside the 30 days.
7. **First seed.** Admin: Pay MettleUp (6 Nov) and the home-screen icon preview on Branding (6 Nov), plus any
   5 Nov feature that is still under 30 days. Member: the 0.73.0 features.

## Tests (R-363/R-364 UAT types)
- Unit: trail from a path; fixes never light; 30-day expiry; limit of 3; seen clears parents, keeps others.
- e2e admin: dot on Settings menu, on the Pay MettleUp row, on the heading; open the page -> menu and row dots
  gone, heading dot gone after a reload; a fix line lights nothing; clock at day 31 -> no dot; phone width.
- Member app: a qa-device "uat" flow for one trail (Settings -> Sleep and workouts), plus largest text.
- Fresh-eyes review on pictures (owner, desk, member roles).

## Shipping
- Admin: deploy after UAT + fresh-eyes, with an ADMIN_NEWS entry? No: the dots themselves are not a feature
  owners need told about; the What's new line of each feature already exists.
- Member app: goes with the next version, only after his "release" (R-309).
- Conflict to settle with him: the feature freeze until the full test round T76 (R-363).
