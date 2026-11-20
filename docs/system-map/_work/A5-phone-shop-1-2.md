# A5-phone-shop-1-2 checkpoint (A5 journeys, phone/shop-1)

F-phone-313: 9 journeys, 15 type lines
F-phone-304: 10 journeys, 14 type lines
F-phone-316: 4 journeys, 8 type lines
F-phone-314: 6 journeys, 7 type lines
F-phone-309: 7 journeys, 17 type lines
F-phone-300: 10 journeys, 14 type lines
F-phone-301: 5 journeys, 7 type lines
F-phone-322: 5 journeys, 7 type lines
F-phone-312: 9 journeys, 15 type lines
F-phone-324: 7 journeys, 17 type lines

All 10 items done (16 feature x role pairs, all 12 types each). 1 finding (FN-A5-phone-shop-1-2-01). Output: _work/out/A5-phone-shop-1-2.jsonl (194 rows).

## Entities with no fit
- The phone's own kept copies (kept "My membership" answer, seen-reply time, popped-up reply ids, kept orders, kept diet plans and hours in AsyncStorage) have no entity; journeys list only the server entities they read.
- F-phone-309 and F-phone-324 touch no stored data of their own (type lines use entity "none").

## Seen in passing (not sure enough for a finding)
- ShopScreen.tsx:220-245: the refresh guard (running.current) is reset only after Promise.all resolves; only refreshGymNow has a catch. If refreshProducts / refreshOrders / syncGymDiets / syncGymHours can ever throw, pull to refresh stays dead until the tab remounts. Not checked whether they can throw.
- membership.ts:110-116 + 174-176: an offline kept card computes "Ends tomorrow / n days left" from the day it was kept, not today; the "As of an earlier day: ask the desk if unsure." line softens it. keptLine compares days with the phone's own clock (toDateString), not India time.
- planEnds via PlanEndsCard.tsx:39: "today" is the phone's own date (todayISO), not India time.
- noticeAlertsRun.ts:297-321 popReplies: the 15-minute pop-up of a trainer reply does not check the ask-access "hidden" state that the red count checks (askReplySync.ts:99-106), so a member whose plan ended may get a pop-up with no row to open.
- PlanRequestPanel.tsx:139: "Take back my request" has no busy state; a double tap sends two take-backs.
- gymTab.ts:22: the third tab is labelled "Ranking", while the feature name says "Leaderboard".

## Could not check
- Whether the server refuses a member's cancel once Ready (server rule read only from the phone's comments).
- The native ring (AlertRing.kt / ForgeRest.ringIfMuted) itself; only the JS gate was read.
- No live data was queried; no device run.
