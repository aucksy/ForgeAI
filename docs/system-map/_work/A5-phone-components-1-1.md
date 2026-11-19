# A5-phone-components-1-1 checkpoint

Counts are for both roles together (member, pass member). The code makes no difference between the two roles
in any of these 7 features, so both roles carry the same journeys.

F-phone-1300: 8 journeys, 16 type lines
F-phone-1301: 10 journeys, 14 type lines
F-phone-1302: 8 journeys, 16 type lines
F-phone-1306: 6 journeys, 18 type lines
F-phone-1307: 8 journeys, 16 type lines
F-phone-1308: 10 journeys, 16 type lines
F-phone-1309: 12 journeys, 14 type lines

ALL 7 ITEMS DONE. 172 rows (62 journeys, 110 type lines), 0 findings. About 1,250 code lines read.

## Entities left out (none fits in entities.json)
- The phone's own saved marks: "backup card closed" and "Google Drive linked" (F-phone-1300), "hidden until" (F-phone-1307),
  the list of seen new features (F-phone-1306), the saved gym look (F-phone-1301, F-phone-1302).
- The workouts kept on the phone and the open workout draft (F-phone-1307, F-phone-1308, F-phone-1309): type lines say "unknown".
- No promise row found for the words "Your workout is safe." (F-phone-1309), so its journeys link no promise.

## Seen in passing (not sure, no finding written)
- F-phone-1302: the feature name and the component's own header say the gym mark is on the Workout, Profile AND Shop tabs.
  It is drawn only on Workout (apps/mobile/src/app/(tabs)/workout.tsx:391) and Profile (apps/mobile/src/app/(tabs)/profile.tsx:385);
  apps/mobile/src/app/(tabs)/shop.tsx has no use of it. The Shop tab may name the gym another way (not read).
  Journey J-F-phone-1302-02 / -06 asks for it on the Shop tab so a drive will settle it.
- F-phone-1306: release dates carry no year (apps/mobile/src/lib/newDots.ts:61-72). A feature never opened could light its dots
  again for 30 days one year later on an updated phone. Not proven; in J type 6, step 3 as a must-not.
- F-phone-1300 / F-phone-1307: the "closed" and "hide" marks are saved after the card goes, and a failed save is only logged
  (BackupMovedCard.tsx:51, SafekeepNudgeCard.tsx:53). The card can come back after a restart. Covered by T7-closed.
- F-phone-1309: "Your workout is safe." shows on every crash, including one while the save banner says the workout cannot be
  saved (ScreenErrorBoundary.tsx:23, saveProblemStore.ts:16). Written as the type 12 journey.
- F-phone-1300: promise P-A7-legal-2-22 ("Google Drive is used only to bring back an old Drive backup") is linked; its own proof
  note says upload code still ships. Not re-checked here.

## Could not check
- What "pass member" means in code for these screens (no role check in any of the 7 files).
- Whether a screen crash is sent as a crash report (only the console log was read).
- Whether the phone app has a language setting (so no language variants were picked).
- Nothing was driven on a device; every row is from reading code.
