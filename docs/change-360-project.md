# Change 360: MettleUp's own questions

Read together with the generic list (`~/.claude/skills/change-360/QUESTIONS.md`). These apply only to MettleUp
(phone app, watch app, owner dashboard, website, admin panel). Owner, 18 Nov 2026: generic questions stay global;
"if you have already custom questions for this project, that can go just for this project".
Answers go into the project's change card (`docs/changes/R-<n>.json`, 15 Nov framework), not a second card.

## Who and where
M1. [F] Which roles: member, gym owner, desk staff, trainer, solo user, admin (Control Room), website visitor?
M2. [F] Which surfaces: phone app, watch app, owner dashboard, website, admin panel, Play listing?
M3. Is it Free or Pro for the gym? Does a member of a Free gym ever see a Pro-only thing?
M4. Does it show only when its switch is on (gym setting, admin switch, feature flag)? Nothing switched off appears.

## Gym data and privacy
M5. [F] Could one gym see another gym's members, money or numbers? Is every new query scoped to the gym?
M6. Does testing need real member data? Only Crispy Curves (standing yes); every other gym only through its
    support window.
M7. Does any member or gym data go to an AI? Never through the free Gemini key.
M8. Could a shared picture or public number reveal a member's body weight, money or health?

## Money
M9. Does it touch the trial, the founding price, Pro, Play Billing or payments? Payments stay in test mode until he
    says "payments live".

## Time and data the way his members have it
M10. [F] Midnight India time, a Monday, the 1st of the month, a workout that crosses midnight.
M11. His phone size, the largest display size and font size 2.0, 360 dp width.
M12. About 500 past workouts; long exercise and gym names; Hindi and Hinglish text.

## Phone and watch
M13. Only with a connected Wear OS watch (no watch = nothing watch-related shows)? Watch closed, out of range,
     older watch version, watch app not installed?
M14. Does the phone's change need a watch change to match (and a watch release on Play)?

## Words
M15. [F] Every word a member, owner or visitor reads: member-words pass, banned words for members (volume, PR,
     session), Hindi lines read aloud by Aakash, an in-app What's new line and a Play "What's new" line.
M16. Does any wording name another gym software? (Never.)

## Release and records
M17. [F] Which Maestro UAT flows cover it (happy, negative, regression, settings, interruptions, edge, time,
     phone+watch, upgrade)? A red test must mean a real app bug.
M18. Admin panel change: an ADMIN_NEWS entry. App change: the What's new draft.
M19. Which tracker rows (OWNER-INBOX backlog, Claude's tasks) change status?
M20. Open testing first; production about 3 days later, only with his yes.
