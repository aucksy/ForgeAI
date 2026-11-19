# A5-panel-auth-data-3 checkpoint

Output: docs/system-map/_work/out/A5-panel-auth-data-3.jsonl (230 rows: 84 journeys, 146 type lines, 0 findings)

## Finished features
F-panel-1018: 11 journeys, 14 type lines
F-panel-1006: 15 journeys, 21 type lines
F-panel-1019: 19 journeys, 29 type lines
F-panel-1021: 10 journeys, 14 type lines
F-panel-1024: 4 journeys, 8 type lines
F-panel-1020: 10 journeys, 14 type lines
F-panel-1023: 16 journeys, 21 type lines
F-panel-1022: 8 journeys, 16 type lines

All 8 items done. Journeys per type: 1 = 19, 2 = 17, 3 = 19, 6 = 19, 12 = 19. Type 2 "no" lines: 4 (F-panel-1019 trainer, F-panel-1024 owner, F-panel-1022 owner and staff).

## Entities: none fits
- The gym kept in this browser (browser storage key forgeai-crm-v1 and its kept copies): no entity. F-panel-1020 and F-panel-1021 journeys leave writes/reads empty for it.
- The offline waiting list on the device (IndexedDB forgeai-outbox) and the offline copy of the gym (IndexedDB forgeai-offline): no entity. E-crm-records used for the records they hold.
- The "ask for a PIN" reminder in the browser (mettleup.askPin.v1): no entity.

## Seen in passing (not written as findings, not verified beyond the lines named)
- apps/dashboard/src/crm/data/local.ts:239-242: a browser gym saved by an OLDER data version is refused with the "saved by a newer version of MettleUp ... Reload the page" words. The comment says no older version exists yet, so nobody can hit it today.
- apps/dashboard/src/crm/data/savedCopy.ts:137-138: the offline copy is replaced in two separate steps (remove all, then write). A tab closed or a write that fails between the two leaves the device with no copy until the next good fetch.
- apps/dashboard/src/crm/auth/PinForms.tsx:111-121 and 187-193: the PIN sheet's title, intro and buttons are plain English strings, while the two box labels go through the language list (PinForms.tsx:38, 47). Possible mixed English and Hinglish on one sheet; not checked whether the sheet or button translate by themselves.
- apps/dashboard/src/crm/auth/pinPrompt.ts:42-48: one reminder per device, so a second person signing in with a code replaces the first person's unanswered reminder.
- apps/dashboard/src/crm/ui/screens/Settings.tsx:507-509 with data/local.ts:320-322: "Load demo gym" replaces a browser-only gym after one confirm and keeps no copy of the real gym (the sheet does warn "Don't use it on a gym with real members.").

## Could not check
- Where the page gate is applied in the app shell, and whether the server also refuses a Staff sign-in on owner-only data (only the browser-side rules were read).
- Whether a trainer signs in with a role of their own: the panel's rules know only owner and staff, so trainer journeys assume the Staff limits.
- Exact words for a too-short or too-easy PIN, for a full browser store, for a new-PIN save after the 15 minutes, and for opening the panel offline on a device with no copy (written as "a plain message").
- The first screen's "Start demo" button and the Plans page's starter-plans button label (seen only in the language list and the handler).
- Nothing was driven on a device and no test file was opened: every journey has coverage "unknown".

Code lines read: about 2,450 of the 3,000 allowed.
