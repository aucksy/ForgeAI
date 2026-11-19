# Checkpoint A5-panel-logic-2-4

F-panel-732: 7 journeys, 17 type lines
F-panel-733: 5 journeys, 7 type lines
F-panel-734: 9 journeys, 15 type lines
F-panel-735: 4 journeys, 8 type lines
F-panel-738: 10 journeys, 26 type lines
F-panel-725: 13 journeys, 14 type lines
F-panel-736: 9 journeys, 15 type lines
F-panel-737: 14 journeys, 23 type lines

All 8 features done (16 feature x role pairs). 1 finding row (FN-A5-panel-logic-2-4-01).

## Entities
- No entity fits the browser's own storage ("newest update seen", F-panel-738; the remembered message language, F-panel-725; "alerts card closed", F-panel-734): left out of writes/reads, type lines say "none".
- No entity for the test alert of F-panel-734 was found by name; only E-gym-web-push and E-gym-alert-settings are linked.
- Members, memberships, payments, visits, enquiries and workout plans are all linked as E-crm-records (the panel's synced rows).

## Roles
- The panel code knows two roles only, owner and staff. "trainer" journeys are written as a staff sign-in with the trainer tick; no trainer-only rule was seen in the files opened.

## Seen in passing (not findings; not sure, or by design)
- F-panel-738: the feature name and the header note of logic/whatsNew.ts still say "card on Today after an update". The code shows updates in the bell (top right) and on the What's new page; ui/WhatsNew.tsx says the owner moved it off Today (R-245). Journeys follow the code.
- F-panel-735: the card is shown to any sign-in that may see totals, which today is the owner only (auth/permissions.ts:69). Fine now; it would follow that switch if staff ever get totals.
- F-panel-735: "Money collected" leaves out cancelled receipts (weekSummary.ts:51). Whether a refund is stored as a cancelled receipt or as its own row was not checked.
- F-panel-735: plans and enquiries with no made-on time are left out of "Plans sold" and "New enquiries" (weekSummary.ts:52,55); which clock places them on a day (dateISOFromEpoch) was not opened.
- F-panel-735: the AI Assistant also reads these numbers on a Monday (assistant/suggestions.ts:10, assistant/answer.ts:23); not opened.
- F-panel-725: the renewal price comes from the member's plan even when the gym has switched that plan off (renewOffer.ts:18-23 does not look at "active"); the longer-plan line does check it. Not sure it is wrong.
- F-panel-725: on a member's page "Plan ending" is offered from 15 days before the end (whatsapp.ts:124); the list sender's group is called ending7 (messageTemplates.ts:376). Two different windows; may be meant.
- F-panel-725: in the one-member sheet, changing the message or the language replaces hand-typed words with no question (ui/WhatsAppSheet.tsx:77-80, 93-96). The list sender does this on purpose; here it may surprise.
- F-panel-725: whether the send button guards an emptied message box was not checked.
- F-panel-734: "You can send another in {n} seconds" reads "1 seconds" when one second is left (webPush.ts:249).
- F-panel-734: what happens to a browser's saved alert address at sign-out, or when a second person signs in on the same browser, was not checked (shop/webPushApi.ts not read in full).
- F-panel-733: the trial is read once per sign-in; a failed read gives no banner until reload (ui/TrialBanner.tsx:22-36). Days left use India days, "ended" uses the exact minute (trial.ts:64-67, 91).
- F-panel-733: the banner's words are plain English strings, like the Workout plans, Workout offer and WhatsApp sheet words; whether Hinglish reaches them another way was not checked.
- F-panel-736: whether a front-desk sign-in gets the Today card "N rewards to give" (it needs the gym key in the session) was not checked.
- F-panel-732: the workout-of-the-day builder reuses the same video box (logic/gymWod.ts:13); not opened.

## Could not check
- Nothing was driven on a screen and no test was opened: every journey has coverage "unknown".
- Server rules behind the panel (migrations 0024, 0025, 0030, 0051, 0076, 0095) were not opened; refusals are written from the panel's own words for them.
- Exact greeting words of the WhatsApp messages ("Hi <name>," and the sign-off line) were not read; journeys show them as "...".
- Member-app side of plans, videos and offers (the phone) was not opened.
- About 2,700 code lines read of the 3,000 allowed.
