F-panel-1102: 7 journeys, 7 type lines
F-panel-1101: 19 journeys, 31 type lines
notes 1102/1101: no entity fits the 'jobs kept on this browser' store; left out.
seen in passing: PeopleScreen list words ('Make sign-in code', 'Sign out everywhere', 'Remove', sheet texts, title) are not passed through t() while the Add a person sheet is (PeopleScreen.tsx:246,357,362,541) - a Hinglish panel shows mixed languages; not sure if by design.
seen in passing: PeopleScreen 'Make sign-in code' is disabled while busy but 'Remove' and 'Sign out everywhere' rows stay tappable during a code call (PeopleScreen.tsx:356-370); ConfirmSheet busy state not read.
F-panel-1103: 14 journeys, 34 type lines
F-panel-1105: 5 journeys, 7 type lines
F-panel-1136: 5 journeys, 7 type lines
F-panel-1137: 4 journeys, 8 type lines
notes 1103: no entity for the device's saved copy and outbox (browser storage); journeys use E-crm-records.
notes 1136/1137: demo writes nothing; writes and reads left empty.
seen in passing: demo strip words and 'Leave the demo' / 'Back to my gym' are not translated (demoMode.tsx:38,84) while DemoApp says a language switch redraws the demo.
seen in passing: offline bar sentences (offline.tsx:143-160) and CLEAR_DEVICE_WORDS are plain English, not passed through t().
seen in passing: BrandingScreen page words (title, toasts, sheet) are plain English; 'Saved · date' uses the device clock (BrandingScreen.tsx:312).
seen in passing: a logo is uploaded before Save (BrandingScreen upload then save); leaving without Save may leave an unused logo file; clean-up not read.
F-panel-1115: 12 journeys, 14 type lines
F-panel-1119: 8 journeys, 16 type lines
F-panel-1108: 10 journeys, 14 type lines
F-panel-1129: 9 journeys, 15 type lines
notes 1115/1129: visits, plans and payments live in E-crm-records; no finer entity exists.
seen in passing: Visits, Check-in QR, Shop, Your numbers and Your growth words are plain English (not through t()) while Pass visits is translated (Attendance.tsx:126, CheckInQrScreen.tsx:36, ShopScreen.tsx:77, BusinessGrowth.tsx:82, PassVisits.tsx:48).
seen in passing: at-risk WhatsApp link is a bare wa.me/<digits> with no ready text (Attendance.tsx:940); the feature name says 'WhatsApp nudge'. Not a clear bug.
seen in passing: promise P-A7-help-1-35 'Only the owner sees it' (growth): the page is closed to the desk (permissions.ts:123) but the whole gym's records are pulled to a desk device; the promise row itself already says so.
could not check: server refusals (duplicate staff number, product save by staff), the ConfirmSheet busy state, WRONG_CODE_WORDS exact text, canOpen for staff on /shop/products (only the tab logic comment was read), any live screen (nothing was driven).
A5-panel-brand-shell-1: all 10 features done; findings 0.
