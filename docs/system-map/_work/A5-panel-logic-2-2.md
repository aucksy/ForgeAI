# A5-panel-logic-2-2 checkpoint

F-panel-728: 8 journeys, 16 type lines
F-panel-712: 5 journeys, 7 type lines
F-panel-713: 11 journeys, 14 type lines
F-panel-715: 12 journeys, 24 type lines
F-panel-716: 10 journeys, 14 type lines
F-panel-718: 10 journeys, 14 type lines
F-panel-719: 10 journeys, 14 type lines
F-panel-721: 15 journeys, 21 type lines

All 8 features done. 0 items left.

## Entities: none fits
- F-panel-728: the "seen" list lives in the browser (localStorage key forgeai.adminNews.dotsSeen.v1); no entity id exists for it, so writes/reads are empty.
- F-panel-712: the one-time note lives in the tab's sessionStorage (key forgeai.newGymReady); no entity for it. Reads E-gyms (join code) only.
- F-panel-719: the member's notification on approve is sent by the server; the server code was not opened, so E-member-push-notes was left out of writes.
- F-panel-718: what a "yes" writes on the server besides the link row (the app member's number) was not opened; only E-gym-phone-links is in writes.

## Roles
- The panel has two sign-in roles only, owner and staff (apps/dashboard/src/crm/auth/signin.ts:16). "trainer" in F-panel-715 and F-panel-721 is a staff sign-in ticked as trainer; its journeys follow the staff code path.
- F-panel-728 staff: dots are switched on for the owner only (apps/dashboard/src/crm/CrmApp.tsx:328) and staff get a different Settings page with no tabs (Settings.tsx:187), so every staff type line is "no".

## Seen in passing (not sure; not findings)
- F-panel-712: the saved note carries a gymId but the card never compares it with the gym that is open (NewGymReady.tsx:18, newGymReady.ts:37-44). If gym creation leaves the note and the card is not drawn (tab left on the sign-in page), the next person to sign in on that tab could be shown the first gym's code.
- F-panel-712: the note is removed the moment the card draws (NewGymReady.tsx:21-23); a refresh in that second loses the "shown once" card.
- F-panel-716: the monthly table adds one per visit row (passMembers.ts:151-160) while its comment promises "one per person per day". The desk save keeps one visit per member per day (local.ts:869), but whether a desk visit and a server-written QR visit on the same day can both exist was not checked.
- F-panel-718: after an answer the card awaits the list read inside `finally` (PhoneLinksCard.tsx:47-50); if that read throws, the buttons stay switched off until the page is reloaded. Whether the read can throw was not checked.
- F-panel-719: a pause is added in full even when its dates are already in the past, and to the gym plan that ends last even when that plan has already ended (planRequests.ts:119-143).
- F-panel-719: "already done" for a pause is found by the words "app #<first 8 letters of the request id>" inside the plan's note (planRequests.ts:136); a staff edit of that note would let the days be added twice.
- F-panel-713, F-panel-721, F-panel-718, F-panel-719: many visible words ('Your numbers', tile names, 'Mark session', the two Today cards) are plain English strings not passed through the language function, so a non-English panel would show mixed languages there.
- F-panel-721: one session a day per pack (local.ts:1068-1070): a member who really does two PT classes in one day cannot have the second one counted.

## Could not check
- Exact view for a refused address (staff on /numbers/owed, /settings/mettleup; a bad /numbers/<id>): the router's refusal screen was not read.
- The label of the export button on Pass visits, and whether staff may export there.
- Where the member app shows 'Personal training: {left} of {total} left.' (template promise P-A7-templates-2-30): phone code not opened.
- Server functions owner_phone_links, owner_decide_phone_link, owner_plan_requests, owner_decide_plan_request and the QR check-in write: not opened (outside this item's entry points).
- Whether the panel has a theme setting: not read, so no theme, dark or light variants were picked.
- Nothing was driven on a screen; every row is from reading code. coverage is "unknown" on every journey.
