# A5-panel-shop-2 checkpoint (20 Nov 2026)

Status: all 5 features done. Output: docs/system-map/_work/out/A5-panel-shop-2.jsonl (98 rows: 35 journeys, 62 type lines, 1 finding).

F-panel-803: 8 journeys, 16 type lines
F-panel-804: 10 journeys, 14 type lines
F-panel-805: 4 journeys, 8 type lines
F-panel-806: 4 journeys, 8 type lines
F-panel-802: 9 journeys, 16 type lines

## Entities left out (none fits)
- The gym key this browser keeps (localStorage `forgeai.cloudGym.v1`: gym id, key, join code, name, demo flag, person). entities.json has only the server-side hash (E-gym-owner-keys), which the journeys use as the nearest match. A device-side entity is missing.
- The demo page's pretend server (kept in page memory only): no entity.

## Seen in passing (not sure, not written as findings)
1. Disconnect the shop, then "Turn on the shop" again makes a brand-new gym on the server with a new code (ShopProvider.tsx:295-305 calls demo_start_gym each time). Members who joined with the old code, its orders and products stay in a gym nobody can open. The words of the "Disconnect the shop?" sheet were not read, so it may warn. Journey J-F-panel-804-09 step 2 holds the expectation.
2. A gym name over 60 letters is cut by the server without a word (0018_staff_and_owner_rules.sql:250, 0002_shop.sql:194) while this browser keeps the full name; every later "Save details" then re-sends the rename because the two names never match (ShopProvider.tsx:330).
3. Rename is two saves: gym details first, then the app name (Settings.tsx:157-165). If the second fails, the admin app shows the new name and members the old one until the owner saves again; the error banner does not say which half saved.
4. Shop today card: when the first order read fails, the figures stay "…" for ever with no error words on the card (ShopTodayCard.tsx:37-47 never reads ordersError).
5. "sold today" uses the device's own day and the order's last-change time (logic.ts:295-303), not India time and not the hand-over time: a phone set to another zone, or a later change to a collected order, can move money between days.
6. "Start demo" on the Welcome page makes a real gym row on the server for any visitor (demo_start_gym, open to everyone, capped at 300 an hour across all visitors, 0002_shop.sql:191-192). Nothing in the code read removes old demo gyms except a one-off clean-up migration (0066). Also a tab closed between the server answer and the browser storing the key leaves a gym nobody can open.
7. Feature F-panel-802's name says the same uploader serves gym page photos. The product uploader (photoUpload.ts:90) is called only from the product card and the product sheet; gym page photos have their own code under crm/gympage. Journey J-F-panel-802-03 is written as "unknown" for that reason; the feature name may be wrong.
8. photo.ts:25 pins product photo addresses to the direct storage host for the "is this our photo" check; not checked whether anything still uses that check after the address change.

## Could not check
- Nothing was driven in a browser: every user_sees line is from code, coverage is "unknown" on every journey, tests list is empty (no test file was opened).
- Whether an ended sign-in really answers BAD_KEY on owner-only calls (the finding rests on the panel's own handling of that code, ShopProvider.tsx:177).
- Later migrations that may have replaced owner_photo_ticket, owner_set_brand or owner_rename_gym after 0018 (only 0002, 0004, 0005, 0018 define them by name search).
- The gym web page photo path (other folder, outside this item's entry points).
- The words of the "Disconnect the shop?" and "Start over with a new demo gym?" sheets' bodies.
- Two-gym checks (another gym's look, name or orders never showing): needs a second test gym.
