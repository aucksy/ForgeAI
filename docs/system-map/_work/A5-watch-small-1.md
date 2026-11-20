# A5-watch-small-1 checkpoint
F-watch-3200: 6 journeys, 7 type lines
- Entry in features.json is "unknown"; real entry used: watch rest screen and logging screens (apps/mobile/android/wear/src/main/java/com/forgeai/wear/WatchScreens.kt:141-176, LogScreens.kt:145-170).
- No entity fits: watch display only, nothing stored; writes/reads left empty.
- Seen in passing: label growth uses the linear font scale capped at x1.24 (WatchScreens.kt:162), not Android's non-linear curve; harmless, labels are drawn at an exact computed size.
- Could not check: real Wear OS 5 watch at the largest text (needs a device); whether Wear OS largest scale exceeds the 1.3 the tests use.
