# iPhone + Apple Watch port: everything that is Android-only today

Research only, 5 Nov 2026. Read from the code at HEAD (no builds, no tests run). All paths are
under `apps/mobile/` unless they start with `deploy/`, `supabase/` or `.github/`.

## The short version (plain English)

- **Most of the app is already shared.** Screens, workout logic, records, plans, the gym and shop,
  backups and the AI layer are TypeScript and would run on an iPhone as they are. The Android-only
  part is a thin outer layer: two native modules (4,900 lines of Kotlin, plus 250 lines of tests),
  the Wear OS watch app (4,250 lines plus 1,070 lines of tests, 30 files), one config plugin, and
  21 files that check `Platform.OS`.
- **Today an iPhone build would open and work, but quietly lose a lot.** Both native modules are
  loaded "optionally", so on iPhone they are simply missing and those features hide. The bigger
  surprise: **seven files switch off notifications, workout sounds and push on everything that is
  not Android** (they meant "not web"). An iPhone build would get no "Rest is over" alert, no
  reminders, no gym messages and no rest bell until those lines change. That is a small fix.
- **One real defect waits for iPhone:** with no native module the app thinks it is a GitHub copy and
  would offer "download the new APK" on an iPhone. Apple rejects that. Small fix.
- **There is no Google Play Billing in this app.** Members pay their gym (fees, shop orders) by UPI
  or the gym's payment company. Apple allows that outside its own payment system, because it is a
  real-world service and physical goods. So no Apple in-app purchase is needed today.
- **Things an iPhone cannot do at all:** Play's in-app update, APK updates, pinning a widget or a
  gym-logo shortcut to the home screen for the member, changing the start-up screen per gym,
  reading the phone's silent switch, taking back Health permissions from inside the app, telling
  whether the member allowed Health *reading*, and opening the App Store on the watch to install.
  Each has an iPhone-shaped stand-in below, or the row hides.
- **The watch protocol is small and clean.** Two "latest state" items (rest, workout), four button
  messages from the watch, two replies from the phone. An Apple Watch app can speak the same thing
  over Apple's WatchConnectivity, almost one-for-one.
- **The biggest pieces of work:** the rest timer and live workout card on the lock screen (iPhone
  "Live Activity" with buttons), and the Apple Watch app itself. Each is several weeks.
- **What it costs him:** Apple Developer Program, 99 US dollars a year (an organisation account also
  needs a D-U-N-S number). GitHub's Mac build machines are free for this public repo. Without an
  iPhone or a Mac, everything can be built and tested on simulators in the cloud, but the lock
  screen, the watch buzz, Health and push only prove themselves on a real iPhone and Apple Watch.
  Someone with both must try a TestFlight build before the first release.
- **Keeping both apps equal automatically** works only if the rules stay in TypeScript and the two
  native sides stay thin and identical in shape. Section 8 lists the checks that make CI fail when
  an Android change has no iPhone twin.

---

## 1. Native modules: every function, its Android API, who calls it, and the iPhone equivalent

Both modules declare `"platforms": ["android"]` in `modules/*/expo-module.config.json`, and the JS
loaders return null off Android (`src/tracker/phone/native.ts` `phoneNative()`,
`src/tracker/services/restCard.ts` line ~118). The iPhone version should be the SAME Expo module
name and the SAME function names, written in Swift under `modules/<name>/ios/`, with `"ios"` added
to `platforms`. Then no TypeScript caller changes.

Difficulty: 1 = a day or two, 2 = about a week, 3 = several weeks. "No" = iPhone cannot do it.

### 1a. `ForgePhone` (`modules/forge-phone`, Kotlin 1,431 lines)

Kotlin entry: `ForgePhoneModule.kt`. JS interface: `src/tracker/phone/native.ts` (`ForgePhone`).

| JS function | What it does | Android API under it | Called from (src/) | iPhone equivalent | Diff. |
|---|---|---|---|---|---|
| `playUpdateCheck()` (async) | Ask Google Play if a newer version exists | Play Core `AppUpdateManager` (`PlayUpdate.kt`, `com.google.android.play:app-update:2.1.0`) | `lib/updateStore.ts`, `components/UpdatePrompt.tsx` | **No in-app update on iOS.** Stand-in: ask `https://itunes.apple.com/lookup?bundleId=com.mettleup.app&country=in` for the store version, then open `itms-apps://apps.apple.com/app/id<id>` | 1 |
| `playUpdateStart()` (async) | Show Google's update box, download in background | Play Core flexible update | `lib/updateStore.ts` | **No.** Open the App Store page instead | 1 |
| `playUpdateFinish()` | Install the downloaded update (restart) | `completeUpdate()` | `lib/updateStore.ts` | **No.** Hide | 1 |
| event `onPlayUpdate` | Download progress | Play Core install-state listener | `components/UpdatePrompt.tsx` | **No.** Never fires | - |
| `takeSharedFile()` (async) + event `onSharedFile`, `OnNewIntent` | A Hevy/Strong CSV/XLSX shared to the app from Android's share menu | `ACTION_SEND` intent, ContentResolver copy (`Share.kt`) | `tracker/phone/sharedImport.ts` → `app/import/index.tsx` | Register document types (CSV, XLSX) so "Open in MettleUp" / "Copy to MettleUp" appears; the file arrives as a `file://` URL through `expo-linking`. A full Share Extension is optional extra | 2 |
| `healthStatus()` | Is Health Connect installed / needs update | `HealthConnectClient.getSdkStatus` (`Health.kt`) | `tracker/phone/healthConnect.ts`, `healthRead.ts` | `HKHealthStore.isHealthDataAvailable()` ("update" never happens) | 1 |
| `healthGranted()` (async) | Write access given? | `PermissionController.getGrantedPermissions` | `healthConnect.ts` | `authorizationStatus(for:)` on the workout and energy types (write status IS visible) | 1 |
| `healthAccess()` (async) | Each permission on its own: exercise, calories, weight, steps | same | `healthConnect.ts`, `healthRead.ts` | Write ones: yes. **Read ones (weight, steps): iOS never tells an app whether reading was allowed** (privacy rule). Use `getRequestStatusForAuthorization` ("already asked") and treat "read returns nothing" as the answer | 2 |
| `healthRequest()` | Open the permission screen (write) | `PermissionController.createRequestPermissionResultContract` + `HealthRationaleActivity` | `healthConnect.ts` | `requestAuthorization(toShare:read:)` | 1 |
| `healthRequestRead(kinds)` | Ask only for reading weight / steps | same | `healthRead.ts` | same call, read set only | 1 |
| `healthReadWeights(sinceMs)` (async) | Weigh-ins since a time | `readRecords(WeightRecord)` | `healthRead.ts` | `HKSampleQuery` on `bodyMass` | 1 |
| `healthStepsToday()` (async) | Today's steps | `aggregate(StepsRecord.COUNT_TOTAL)` | `healthRead.ts` | `HKStatisticsQuery` cumulative sum on `stepCount` | 1 |
| `healthRevokeAll()` (async) | "Stop and remove MettleUp's access" | `revokeAllPermissions()` | `healthConnect.ts` (`removeHealthAccess`) | **No.** An app cannot remove its own Health access. Show "Settings → Health → Data Access → MettleUp" and hide the button (`canRemoveHealthAccess()` false) | 1 |
| `healthOpenSettings()` | Open Health Connect | intent | `healthConnect.ts` | Open the Health app (`x-apple-health://`) or app Settings | 1 |
| `healthWrite(json)` (async) | Write workouts (`HealthWorkout {id,title,startMs,endMs,kcal}`) | `insertRecords(ExerciseSessionRecord STRENGTH_TRAINING + ActiveCaloriesBurnedRecord)` with client id | `healthConnect.ts` | `HKWorkoutBuilder` (`.traditionalStrengthTraining`) + `activeEnergyBurned` sample, `HKMetadataKeyExternalUUID` = our id | 2 |
| `healthDelete(id)` (async) | Remove a deleted workout | `deleteRecords` by client id | `healthConnect.ts` (`removeWorkoutFromHealth`) | `deleteObjects(of:predicate:)` matching our external id (only our own samples) | 1 |
| `widgetSave(json)` | Hand the widgets their data | AppWidget + SharedPreferences (`Widgets.kt`, three providers Today, Week, Gym) | `tracker/phone/widgets.ts`, `phoneSync.ts` | WidgetKit extension (SwiftUI). JSON into an App Group, then `WidgetCenter.reloadAllTimelines()` | 3 (three widgets drawn again in SwiftUI) |
| `widgetCount()`, `widgetCountOf(kind)` | How many widgets are placed | `AppWidgetManager.getAppWidgetIds` | `widgets.ts` | `WidgetCenter.getCurrentConfigurations` | 1 |
| `widgetPin(kind)` | Ask the launcher to add a widget | `requestPinAppWidget` | `widgets.ts` | **No.** Show "Hold the home screen, tap +, find MettleUp" | 1 |
| `shortcutsSave(json)` | App-icon long-press shortcuts ("Start Push 1", "Log body weight") | `ShortcutManager` dynamic shortcuts (`Shortcuts.kt`) | `widgets.ts` | `UIApplication.shortcutItems` (Quick Actions; e.g. the `expo-quick-actions` package) | 1 |
| `splashPlain(plain)` | Plain start-up screen inside a branded gym (Android 13+) | `SplashScreen.setSplashScreenTheme` | `theme/gymTheme.ts` | **No.** iOS launch screen is fixed at build time. Return `"unsupported"` (callers already handle it) | - |
| `gymShortcutSupported()`, `gymShortcutPin(...)`, `gymShortcutOff(msg)` | Gym's logo as a home-screen shortcut | `ShortcutManager.requestPinShortcut` + logo download (`GymShortcut.kt`) | `shop/gymShortcut.ts`, `components/settings/GymSettings.tsx` | **No.** No app can place an icon on the iPhone home screen. Return unsupported; the row hides | - |
| `installerPackage()` | Who installed the app (Play vs GitHub APK) | `PackageManager.getInstallSourceInfo` | `lib/installSource.ts` via `updateStore.ts`, `feedbackButtonStore.ts` | Always "App Store" (TestFlight tells itself apart through StoreKit 2 `AppTransaction.environment`). **Must be fixed in TS too, see 2b** | 1 |

### 1b. `ForgeRest` (`modules/forge-rest`, Kotlin 3,447 lines + 248 test lines)

Kotlin entry: `ForgeRestModule.kt`. JS wrapper: `src/tracker/services/restCard.ts` (interface
`Native`). Under it: `RestCard.kt` (1,515 lines: the rest countdown card, "Rest is over",
alarms, sounds, Done), `WorkoutCard.kt` (the live workout card), `OfflineTick.kt` (taps while the
app is closed), `RestActionReceiver.kt`, `RestBootReceiver.kt`, `WearSync.kt` + `WearWire.kt` +
`WearActionService.kt` (the watch link).

What it is in one line: on Android the lock screen and shade carry a live rest countdown and a live
workout card with buttons (Done, +15 s, -15 s, Skip, Complete set) that work with the app closed.
**On iPhone the matching thing is ONE Live Activity (ActivityKit) for the whole workout** (lock
screen + Dynamic Island, and since watchOS 11 it also appears in the Apple Watch Smart Stack for
free), with buttons as App Intents (`LiveActivityIntent`, iOS 17+), plus a scheduled local
notification for "Rest is over". On iOS 26, **AlarmKit** can make "Rest is over" a real alarm that
rings through silent mode and Focus, which is the closest match to "Ring through Do Not Disturb".

| JS function / event | What it does | Android API | Called from (src/) | iPhone equivalent | Diff. |
|---|---|---|---|---|---|
| `show(startedAt, endsAt, next)` | A rest started / moved | Notification with count-down Chronometer + exact `AlarmManager.setAlarmClock` for the end | `tracker/services/workoutAlerts.ts` (`showRestCard`) | Update the Live Activity (`Text(timerInterval:)` counts down by itself) + `UNTimeIntervalNotificationTrigger` (or AlarmKit) at `endsAt` | 3 (with the rows below) |
| `clear(dismissOver)` | Rest skipped / workout ended | cancel notification + alarm | `workoutAlerts.ts` (`clearRestCard`) | update/end Live Activity, remove pending notification | incl. |
| `getState()` | The rest as native knows it; settles one that ended while away; re-arms; restores live card | SharedPreferences | `restCard.ts` (`readRestCard`) ← `store/restTimerStore`, `workoutPresence.ts` | App Group `UserDefaults` | incl. |
| `setQuiet(quiet)` | Keep the card silent | channel choice | `workoutAlerts.ts` | relevance / no sound on update | incl. |
| `setRestAllDone(on)` | Next rest follows the last set | prefs | `workoutAlerts.ts` | same, in shared state | incl. |
| `setDoneTarget(workout, exKey, setKey, open, values)` | Which row the next Done ticks | prefs | `restCard.ts` `showRestCard` | stored in App Group; read by the Done intent | incl. |
| `takePendingDone()`, `doneSettled()`, `postDoneNote(title,text)` | A Done tap kept for JS; release; quiet note | `PendingIntent` broadcast, `goAsync` | `tracker/services/restDoneRun.ts` | `LiveActivityIntent.perform()` writes the tap to the App Group; notification action (`UNNotificationAction`) for "Rest is over" | incl. |
| `takeQueuedTicks()` | Ticks made while the app was closed (rest started natively from the `plan` JSON) | `OfflineTick.kt` | `restDoneRun.ts` | same idea: intent runs in the app's process with JS asleep; queue in App Group | incl. |
| `showWorkoutCard(title,text,image,done,plan,clock)`, `hideWorkoutCard(...)` | Live workout card with "Complete set", picture, workout clock | `WorkoutCard.kt` (ongoing notification, RemoteViews) | `tracker/services/workoutPresence.ts` | the same Live Activity, workout state (image from App Group file; `Text(timerInterval:)` clock) | incl. |
| `clearWorkoutCard()`, `clearWorkoutCardSaved()` | Workout ended (saved: watch says "Workout saved") | cancel | `workoutPresence.ts` | `activity.end(...)` | incl. |
| `dismissRestOver()` | An old "Rest is over" goes | cancel | `store/restTimerStore.ts` | `removeDeliveredNotifications` | 1 |
| `setAccent(hex)` | Gym colour on the cards | notification colour | `restCard.ts` `syncNotifAccent` | colour in the Live Activity attributes | 1 |
| `setRestSound(id)` | "forge" / "bell" / "beep" / "whistle" | one notification channel per sound | `restCard.ts` `setRestSoundNative` | sound file per notification (`.caf`/`.wav`, max 30 s, in the app bundle) | 1 |
| `restBell()` | Who rings with the app open: native / hold (DND) / app | `NotificationManager.getCurrentInterruptionFilter` | `store/restTimerStore.ts` | return "app": the app plays its own bell (expo-audio); Focus state is not readable without extra entitlements | 1 |
| `setRingThroughDnd(on)` | "Rest is over" as an alarm through DND | alarm channel, `USAGE_ALARM` | `restCard.ts` | iOS 26: AlarmKit alarm. Older iOS: "Time Sensitive" notifications (entitlement; the member's Focus must allow it). Critical Alerts need Apple's special approval: do not plan on it | 2 |
| `canScheduleExact()`, `openExactAlarmSettings()` | "Alarms & reminders" permission | `AlarmManager.canScheduleExactAlarms` | `tracker/services/restAlertAccess.ts`, `components/RestTimerBar.tsx` | **Not a thing on iOS** (notifications fire on time). Return true / no-op | - |
| `notificationsEnabled()`, `openNotificationSettings()` | Notifications allowed? Fix page | `NotificationManagerCompat` | `restAlertAccess.ts`, `tracker/phone/reminders.ts` | `UNUserNotificationCenter.getNotificationSettings`; `UIApplication.openNotificationSettingsURLString` | 1 |
| `alertChannelState()`, `openAlertChannelSettings()` | "Rest is over" channel silenced/blocked | channel importance | `restAlertAccess.ts` | No channels on iOS. Map to `alertSetting` / `soundSetting` / `timeSensitiveSetting` | 1 |
| `backgroundRestricted()` | Battery restriction on the app | `ActivityManager.isBackgroundRestricted` | `restAlertAccess.ts` | `backgroundRefreshStatus` / Low Power Mode (informational only) | 1 |
| `openAppSettings()` | App settings page | intent | `restAlertAccess.ts` | `UIApplication.openSettingsURLString` | 1 |
| `is24Hour()` | Phone clock style | `DateFormat.is24HourFormat` | `app/session/active.tsx`, `components/FinishSheet.tsx` | `DateFormatter.dateFormat(fromTemplate:"j")` has no "a" | 1 |
| `ringerMode()` | Silent / vibrate / normal | `AudioManager.ringerMode` | `store/restTimerStore.ts` | **No public API** for the silent switch. Return null (callers handle null) | - |
| `takeOpenRequest()`, event `onOpenWorkout` | App opened from a rest alert | launch intent extra | `components/WorkoutPresenceHost.tsx` | Live Activity `widgetURL` / notification tap → `mettleup://workout` deep link | 1 |
| event `onRestChange {kind: add/skip/end/done}` | Native changed the rest (button, watch) | broadcast → JS | `restDoneRun.ts`, `restCard.ts` | Swift module `sendEvent` when the app is alive; App Group otherwise | incl. |
| `setWatchAccent(hex)` | Gym colour for the watch | prefs, sent in `/forge/workout` | `restCard.ts` `syncWatchAccent` | WatchConnectivity application context | 1 |
| `openWatch(startedAt)` | A workout just STARTED: open the watch app | `RemoteActivityHelper.startRemoteActivity("mettleup-watch://workout")` + message `/forge/open` | `tracker/services/watchOpen.ts` | `HKHealthStore.startWatchApp(with: HKWorkoutConfiguration)`: the official way to launch a watch workout app from the iPhone (needs HealthKit on both) | 2 |
| `watchAppState()` (async) | none / installed / missing / unknown | `NodeClient.connectedNodes` + `CapabilityClient` (`forgeai_watch_app`) | `tracker/services/watchInstall.ts` → `app/settings/watch.tsx`, `components/WatchInstallCard.tsx`, `tracker/components/WatchStartCard.tsx` | `WCSession.isPaired` + `isWatchAppInstalled` | 1 |
| `installOnWatch()` (async) | Open the watch's Play Store on MettleUp | `RemoteActivityHelper` + `market://` | `watchInstall.ts` | **No API.** iOS installs watch apps automatically unless the member turned that off; say "Open the Watch app on your iPhone → MettleUp → Install" | 1 |
| `OnCreate` probe, `plainWatch` logic | Which watch is connected; keep the copied card quiet | Wear Node/Capability clients | internal | Not needed: iOS forwards phone notifications to the watch only while the phone is locked, and a Live Activity shows in the Smart Stack | - |

---

## 2. `Platform.OS` branches and Android-only dependencies

### 2a. The 21 files that check `Platform.OS`

**Group A: switch a feature OFF on anything but Android (would be OFF on iPhone).** These were
written to keep the web build quiet; on iPhone they turn the feature off too. Change each to
"off only on web" once the iPhone build exists.

| File | What goes off on iPhone today |
|---|---|
| `src/tracker/services/workoutAlerts.ts` (`N()`) | "Rest is over" and "Workout in progress" notifications (expo-notifications) |
| `src/tracker/phone/reminders.ts` (`N()`) | Workout reminders |
| `src/shop/gymReminders.ts` (`N()`) | Automatic reminders from the gym |
| `src/shop/noticeAlertsRun.ts` (`N()`) | Gym notices that pop up |
| `src/shop/noticeTaskSync.ts` (`syncNoticeTask`, `startNoticeTaskSync`) | The 15-minute background check for gym notices, and the push start-up |
| `src/shop/pushToken.ts` (`N()`, `startPushTokenSync`) | Firebase push address |
| `src/tracker/services/workoutSounds.ts` (`A()`) | The rest bell and the new-record chime (expo-audio) |

**Group B: the native loaders (correctly Android-only until Swift modules exist).**
`src/tracker/phone/native.ts`, `src/tracker/services/restCard.ts`.

**Group C: Android settings that do not exist on iPhone (correct as is).**
`src/tracker/components/RestTimerBar.tsx` (exact-alarm prompt), `src/tracker/components/RestAlertsStatusRow.tsx`
(alert health row), `src/tracker/components/WorkoutPrefsCard.tsx` ("Ring through Do Not Disturb" row:
show it again on iOS 26 if AlarmKit is used).

**Group D: keyboard handling (already iPhone-aware).** `src/components/KeyboardRoom.tsx` (Android
only; iOS uses each screen's own `KeyboardAvoidingView`), and `KeyboardAvoidingView behavior=padding on ios`
in `src/app/(tabs)/coach.tsx`, `src/onboarding/components/WelcomeScreen.tsx`,
`src/components/ui/Sheet.tsx` (frozen file, already correct), `src/app/session/active.tsx`,
`src/tracker/components/DoneSheet.tsx`, `src/tracker/components/HoldTimerSheet.tsx`;
`src/components/chat/InputBar.tsx` (padding). These need a look on an iPhone simulator, not new code.

**Group E: just reports the platform.** `src/lib/feedback.ts` (device line in feedback).

**Not a `Platform.OS` check, but Android-only behaviour to fix:**
- `BackHandler` (Android back button) intercepts in `src/app/session/active.tsx`, `src/app/plan/build.tsx`,
  `src/app/routines/first.tsx`, `src/onboarding/components/IntroSlides.tsx`,
  `src/onboarding/components/WelcomeScreen.tsx`. iPhone has no back button; the swipe-back gesture
  skips these. Each screen needs its stack gesture switched off or handled.
- `src/lib/installSource.ts` + `src/lib/updateStore.ts` + `src/components/UpdatePrompt.tsx`: with no
  native module, `distributionFrom(null, "github")` says "github", so **an iPhone would be offered the
  GitHub APK.** Add an "appstore" distribution (`Platform.OS === 'ios'`) that uses the App Store
  lookup instead. `src/lib/feedbackButtonStore.ts` reads the same value.
- Store links hard-coded to Play: `PLAY_STORE_URL` / `PLAY_WEB_URL` in `src/lib/updateStore.ts`;
  "Update MettleUp from the Play Store" in `src/cloud/backupWords.ts`; "Install or update Health
  Connect from the Play Store" in `src/tracker/phone/PhoneCard.tsx`; every watch-install sentence
  in `src/tracker/services/watchInstall.ts` (`opened`, `noWatch`, `fallback`) and the comments in
  `WatchInstallCard.tsx` / `WatchStartCard.tsx`. Words need iPhone versions.
- `src/shop/PayPanel.tsx` opens `upi://pay?...`. On iPhone there is no "choose a UPI app" box; it
  opens whichever app claims `upi://` (often none). Keep the QR and the UPI ID first (already so);
  add `LSApplicationQueriesSchemes` if the app ever checks first.

### 2b. Dependencies in `apps/mobile/package.json` with an Android-only side

| Dependency | Android-only part | iPhone story |
|---|---|---|
| `@react-native-google-signin/google-signin` 16 (`src/cloud/account.ts`, `src/cloud/drive.ts`) | Credential Manager, `hasPlayServices`, Android OAuth client | Works on iOS with an **iOS OAuth client id** and `iosUrlScheme` in the plugin options. **Apple rule 4.8: an app that offers Google sign-in for its account must also offer Sign in with Apple** (Supabase `signInWithIdToken({provider:'apple'})` + `expo-apple-authentication`). Drive backup is a service link, not a login, so it is fine. |
| `expo-notifications` | Notification channels (one per rest sound), `google-services.json`, FCM device token | APNs on iOS. `getDevicePushTokenAsync()` returns an **APNs** token, which the server's FCM sender (`deploy/hq/push.js`, FCM HTTP v1) cannot use. Easiest: add the Firebase iOS SDK (`@react-native-firebase/messaging`) so iOS also gets an FCM token, and upload an APNs key to Firebase project `forgeai-d7eea`; then `push.js` is unchanged. The table `member_push_tokens` already allows `platform = 'ios'` (`supabase/migrations/0038_member_push.sql`) and `apiSavePushToken(key, token, platform)` already takes it (`src/shop/gymApi.ts`); `pushToken.ts` must pass `'ios'`. Sounds: list the files under the plugin's `sounds` option. |
| `expo-background-task` / `expo-task-manager` (`src/shop/noticeTask.ts`) | WorkManager every ~15 min | BGTaskScheduler: **iOS runs it when it likes (maybe a few times a day), not every 15 minutes.** On iPhone, push becomes the main way gym messages arrive. Needs `UIBackgroundModes` `fetch`/`processing` and `BGTaskSchedulerPermittedIdentifiers` (the Expo plugin adds them). |
| `expo-audio` | none (blocked by Group A only) | Set the audio session to mix/duck with music. |
| `expo-speech-recognition` (`src/lib/voice.ts`) | Google recognizer package query in the manifest | iOS `SFSpeechRecognizer`; usage strings already in `app.json` plugin options. |
| `expo-camera`, `expo-image-picker` | none | Usage strings (camera text exists for meals; add the QR check-in reason). |
| `expo-build-properties` | only `android` options set | add `ios.deploymentTarget` (17.0 suggested for interactive Live Activities). |
| `expo-secure-store` | `configureAndroidBackup: false` | Keychain; nothing to add. |
| `xlsx`, `react-native-webview`, `expo-video`, etc. | none | work as is. |
| `modules/forge-phone/android/build.gradle` | `androidx.health.connect:connect-client:1.1.0`, `com.google.android.play:app-update:2.1.0` | HealthKit; no update library. |
| `modules/forge-rest/android/build.gradle` | `play-services-wearable:20.0.1`, `wear-remote-interactions:1.1.0` | WatchConnectivity, HealthKit `startWatchApp`. |
| `google-services.json` + `app.json android.googleServicesFile` | Firebase Android config | `GoogleService-Info.plist` + `ios.googleServicesFile` if Firebase iOS is used. |

No Play Billing library exists anywhere in the member app.

---

## 3. The watch app (`android/wear`, built only with `-PwithWear=true`)

Same application id as the phone (`com.mettleup.app`), Wear OS 3+ (`minSdkVersion 30`), Compose for
Wear, `standalone=false` (needs the phone app). It is **glance-first**: everything it shows comes
from the phone; its buttons send taps back; the phone stays the only place a set is saved.

### 3a. Screens (`WatchScreenKind` in `WatchLayout.kt`, drawn in `WatchScreens.kt`; logging flow in `LogScreens.kt`)

Chosen from state alone (`ScreenSelector.select`), in this order:

| Screen | When | What it shows / does |
|---|---|---|
| `PERMISSION_HEART_RATE` | first launch, not yet asked | ask for heart rate |
| `PERMISSION_ALERTS` | then | ask for notifications |
| `REST_TIMER` (`RestTimerScreen`; log flow `RestScreen`) | workout open + rest running | ring countdown, next set, heart rate; -15 / +15 / Skip (send `sub` / `add` / `skip`) |
| `REST_IS_OVER` (`RestIsOverScreen`; `RestOverScreen`) | rest ended, next set not logged | "Rest is over", overtime count, the set to do |
| `WORKOUT_SAVED` (`WorkoutSavedScreen`) | phone tapped Finish (~4 s) | "Workout saved" |
| `PHONE_NOT_CONNECTED` (`PhoneNotConnectedScreen`) | no phone node | how to reconnect |
| `PHONE_APP_MISSING` (`PhoneAppMissingScreen`) | phone connected, no `mettleup_phone_app` capability, never seen | "Get MettleUp on your phone" + "Open on phone" (opens Play on the phone) |
| `NOTHING_OPEN` (`NothingOpenScreen`) | no workout | idle |
| `BETWEEN_RESTS` (`BetweenRestsScreen`) | workout open, no rest | set segments, next set lines (`set`, `last`, `goal`), heart rate |

Watch logging flow (3 Nov 2026, `LogScreen` in `WatchLog.kt`): `NEXT_SET` (`NextSetScreen`: weight
and reps pills, **Digital Crown** changes the number by `eStep`), `EFFORT` (`EffortScreen`: RPE
when "Track RPE" is on, not for warm-ups), `REST` (watch starts the rest itself if the phone does not
answer, `eRest` seconds), `REST_OVER`, `EXERCISE_DONE` ("4 sets done", Go), `NOT_SAVED`
(`NotSavedScreen`: phone refused or did not answer). Phases `IDLE`, `EFFORT`, `SENDING`, `NOT_SAVED`.

Also: a "Workout started" card on the watch face when the phone starts a workout and the screen did
not open (`WorkoutStarted.kt`), the watch's own "Rest is over" notification with Done / +15 s /
Skip (`RestAlerts.kt`), gym colour (`BrandColour.kt`), Manrope font.

### 3b. The phone ↔ watch protocol (what an Apple Watch app must speak)

Phone side: `modules/forge-rest/.../WearSync.kt`, `WearWire.kt`, `WearActionService.kt`.
Watch side: `android/wear/.../WatchSync.kt`, `WatchState.kt`, `WatchActions.kt`,
`ForgeListenerService.kt`, `WorkoutStarted.kt`.

**Phone → watch: two "latest state" items (Wear Data Layer `DataItem`, latest wins, each with
`seq` = a rising ms counter; the watch skips items it already applied).** The phone keeps an outbox
(`WearOutbox`) so only the newest state of each path is retried, kept up to 6 hours across restarts.

| Path | When the phone sends it | Keys (type) |
|---|---|---|
| `/forge/rest` | a rest starts / moves (`WearSync.rest`) | `startedAt` (long ms), `endsAt` (long ms), `next` (string; "All sets done" after the last set), `ended` (false), `ringThroughDnd` (bool), `done` (string: the row JSON the Done sends back, "" = none), `seq` |
| `/forge/rest` | rest gone (`WearSync.restGone`) | `startedAt` 0, `endsAt` 0, `next` "", `ended` (true = it ran out on the phone; false = skipped), `done` "", `seq` |
| `/forge/workout` | workout open / changed / over (`WearSync.workout`, only when something changed) | `active` (bool), `title` (exercise), `text` (set line), `done` (row JSON or ""), `set` ("Set 3 of 5"), `last` ("60 kg × 8"), `goal` ("62.5 kg × 8"), `accent` ("#RRGGBB" or ""), `saved` (bool, closed with Finish), `logFlow` (true: this phone takes sets logged on the watch), `eOn` (bool), and when `eOn`: `eWOn`, `eROn` (bool: weight/reps boxes), `eW` (string number, "" = empty), `eR` (long, -1 = empty), `eUnit` ("kg"/"lb"), `eStep` (string number), `eWarm`, `eRpe` (bool), `eRest` (long seconds), plus `seq` |

The `done` row JSON (made by the phone, opaque to the watch, sent back unchanged):
`{"workout": <ms>, "exKey": "...", "setKey": "...", "open": false, "values": "<grey hint>"|null, "label": "..."|null, "endsAt": <ms>}`.

**Phone → watch messages (`MessageClient`, fire and forget):**

| Path | When | Payload |
|---|---|---|
| `/forge/open` | the member just STARTED a workout (never a resume), "Open MettleUp on my watch" on | UTF-8 decimal `startedAt` ms. Also `RemoteActivityHelper` opens `mettleup-watch://workout` |
| `/forge/nack/done` | the phone could not use a watch Done (unreadable row, an "open" row) | the same bytes the watch sent |

**Watch → phone messages (to every connected phone node):**

| Path | When | Payload |
|---|---|---|
| `/forge/act/done` | Done / Complete set / a set logged on the watch | the `done` row JSON, plus optional `"log": {"w": <num>, "r": <int>, "rpe": <1-10>, "unit": "kg"/"lb"}` (`LogMath.withLog`; checked again by `WearWire.watchLog`) |
| `/forge/act/add` | +15 s | empty |
| `/forge/act/sub` | -15 s | empty |
| `/forge/act/skip` | Skip | empty |

The phone handles each as a tap on its own notification (`WearSync.actionIntent` →
`RestActionReceiver` / `RestCard.doneBroadcast`), with the app open or closed. Its answer is simply
the next `/forge/rest` / `/forge/workout` state. "Saved" on the watch = the next `/forge/workout`
names a different `setKey` (`LogMath.confirmed`).

**Capabilities:** the watch declares `forgeai_watch_app` (`android/wear/src/main/res/values/wear.xml`);
the phone declares `mettleup_phone_app` (`modules/forge-rest/android/src/main/res/values/wear.xml`).

**Apple Watch mapping (WatchConnectivity):**
- Both state items → `updateApplicationContext` (also latest-wins). Note it holds ONE dictionary,
  so send `{"rest": {...}, "workout": {...}}` together, each with its own `seq`.
- `/forge/act/*` → `sendMessage` when `isReachable` (wakes the iPhone app in the background), else
  `transferUserInfo` (queued). The iPhone side must apply the tap **natively** (JS may be asleep),
  exactly as `OfflineTick.kt` does on Android.
- `/forge/nack/done` → reply handler of `sendMessage`.
- `/forge/open` → `HKHealthStore.startWatchApp(with:)` on the iPhone; the watch app receives
  `handle(_ workoutConfiguration:)`.
- Capabilities → `WCSession.isWatchAppInstalled` (phone) / `isCompanionAppInstalled` (watch).

### 3c. Wear-specific features and their watchOS equivalents

| Wear OS feature (file) | watchOS equivalent |
|---|---|
| Foreground service type health keeps the app up during a workout (`WorkoutService.kt`) + Ongoing Activity on the watch face (`WorkoutLive.kt`, `wear-ongoing`) | `HKWorkoutSession` (keeps the app frontmost and running for the whole workout; `WKBackgroundModes` `workout-processing`). Caution: it also saves a workout to Health, so turn off its save or the phone's Health write makes a double |
| Ambient / always-on (`AmbientLifecycleObserver` in `MainActivity.kt`, ambient twin of each screen) | Always On with `@Environment(\.isLuminanceReduced)` + `TimelineView` (automatic during a workout session) |
| Rotary crown input (`onRotaryScrollEvent` in `LogScreens.kt`, `LogMath.crownSteps`) | `.digitalCrownRotation(...)` |
| Custom buzz waveform, alarm usage through DND (`RestAlerts.restOver`, `VibratorManager`) | `WKInterfaceDevice.current().play(.notification/.stop/...)`: fixed patterns only, no custom waveform. Works in the background only during a workout session or via a notification |
| Exact alarm for the rest end + boot recovery (`RestAlerts.arm`, `RestAlarmReceiver`, `BootReceiver`) | During a workout session the app keeps running and times the rest itself; otherwise a local `UNNotification`. No boot receiver needed |
| Heart rate from Health Services `MeasureClient` (`HeartRate.kt`, `BODY_SENSORS` / `health.READ_HEART_RATE`) | `HKLiveWorkoutBuilder` heart-rate statistics during the session (HealthKit read permission on the watch) |
| Notification bridging control (`Bridging.kt`, excluded tags) | Not needed: own app present, phone alerts show on the watch only when the phone is locked |
| Remote open of the watch (`WorkoutStarted.kt`, `mettleup-watch://workout`) | `startWatchApp` (above); fallback a local notification on the watch |
| "Open on phone" Play Store page (`wear-phone-interactions`, `PhoneApp.playStoreUri`) | `WKExtension.openSystemURL` cannot open the iPhone App Store; show words only |
| Tiles, complications | **Not built on Wear today.** Optional later: WidgetKit complications / Smart Stack widget |
| Gym colour, Manrope font, round 456 px design (`RingMath`) | SwiftUI, same maths; Apple Watch screens are rounded rectangles (41/45/46/49 mm), so the ring layout needs a rectangle variant |
| Permission screens (heart rate, alerts) | HealthKit authorization on the watch + notification permission |

---

## 4. Config plugins and `app.json`

**Android-only today:**
- `plugins/backup-rules/withBackupRules.js` (+ `forgeai_backup_rules.xml`,
  `forgeai_data_extraction_rules.xml`): Android Auto Backup include/exclude lists. iPhone equivalent:
  iCloud device backup includes the app's Documents/Library by default. Decide whether the workout
  database goes to iCloud backup; mark caches and exercise media `isExcludedFromBackup`. Small.
- `app.json`: `android.package` (`com.mettleup.app`), `googleServicesFile`, `adaptiveIcon`,
  `predictiveBackGestureEnabled`, four `intentFilters` (verified links `app.mettleup.fit` and
  `forgeai.aakashpahuja.in`, paths `/j/` and `/c/`), `permissions` (`POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`); `expo-splash-screen` `android` image; `expo-build-properties` `android`
  (Proguard, shrink); `expo-secure-store` `configureAndroidBackup`; `extra.distribution: "github"`.
- Hand-edited `android/app/src/main/AndroidManifest.xml` (committed `android/`): SEND intent filter for
  CSV/XLSX, camera and speech `<queries>`, removed permissions. No `ios/` folder exists; the iPhone
  project would be generated in CI (`expo prebuild -p ios`) so nothing hand-edited drifts.
- Link verification: `deploy/panel/worker.js` serves `/.well-known/assetlinks.json` only.

**What iPhone needs (new `ios` block and plugins):**
- `ios.bundleIdentifier` — use `com.mettleup.app` (same as Android, so the 190 Maestro flows keep
  `appId: com.mettleup.app`); `ios.buildNumber` driven by CI like `versionCode`; `supportsTablet: false`.
- Watch app bundle `com.mettleup.app.watchkitapp` (`WKCompanionAppBundleIdentifier`), widget
  extension `com.mettleup.app.widgets`, Live Activity in the same extension. Adding extension
  targets in a generated project needs a config plugin (e.g. `@bacons/apple-targets`).
- Entitlements: HealthKit (phone and watch), App Groups `group.com.mettleup.app` (app + widget/Live
  Activity extension), `aps-environment` (push), Associated Domains
  (`applinks:app.mettleup.fit`, `applinks:forgeai.aakashpahuja.in`), Sign in with Apple,
  Time Sensitive notifications.
- Server: serve `/.well-known/apple-app-site-association` on both hosts (`deploy/panel/worker.js`,
  JSON, no redirect) listing `<TEAMID>.com.mettleup.app` and paths `/j/*`, `/c/*`.
- Info.plist usage strings: `NSCameraUsageDescription` (QR check-in AND meal photos),
  `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`,
  `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`, `NSSupportsLiveActivities` = YES,
  `NSAlarmKitUsageDescription` (if AlarmKit), `ITSAppUsesNonExemptEncryption` = NO.
- `CFBundleDocumentTypes` + `UTImportedTypeDeclarations` for CSV and XLSX (the share import).
- `UIBackgroundModes`: `remote-notification`, `fetch`/`processing` (background task). Watch:
  `WKBackgroundModes` `workout-processing`.
- `LSApplicationQueriesSchemes` (`upi`, `itms-apps`) if the app checks before opening.
- Google sign-in plugin: `iosUrlScheme` (reversed iOS client id). Firebase iOS: `GoogleService-Info.plist`.
- `expo-notifications` plugin: `sounds` (the four rest sounds as `.caf`/`.wav`).
- Privacy manifest (`ios.privacyManifests` in `app.json`): required-reason APIs (UserDefaults, file
  timestamps, disk space, boot time) used by Expo modules and ours.
- Icon: a single 1024 px icon (no adaptive layers); splash: `expo-splash-screen` `ios` image.

---

## 5. Money

**What exists today (Play-only):** nothing. There is no Google Play Billing library, no Play
subscription and no purchase verification in the member app or the servers. What the app has:
- F79 member payments (`src/shop/memberPay.ts`, `memberPayApi.ts`, `PayPanel.tsx`; server
  `deploy/panel/pay.js`): the member pays **the gym** its fees or a shop order by UPI QR, a
  `upi://pay` link, the gym's UPI ID, or the gym's payment company page. Test mode until live.
- The AI layer is paid by the gym owner (B2B, outside the app).

**Apple's rules, as they apply:**
- Physical goods and real-world services used outside the app (gym membership fees, shop items
  collected at the desk) **must not** use Apple in-app purchase and may use UPI / a payment page
  (App Review Guideline 3.1.3(e) and 3.1.5(a)). No commission. So F79 can stay as it is on iPhone.
- If MettleUp ever sells something **digital to the member inside the app** (an AI coach
  subscription, premium plans), it must be Apple in-app purchase (StoreKit 2): Apple keeps 30%, or
  15% under the Small Business Program (under 1 million US dollars a year) and on subscriptions
  after the first year. The backend would then need App Store Server API checks (signed
  transactions, JWS) and App Store Server Notifications v2 to a webhook. None of that exists or is
  needed today.
- Paid by the gym owner on the web dashboard and merely "unlocked" for members: allowed, as long as
  the iPhone app has no buy button or link to buy (anti-steering rules; India has no exception).

---

## 6. Tests and QA: what could run against an iPhone simulator

| What | Where | Runs on iPhone unchanged? |
|---|---|---|
| vitest, 377 test files (pure TS, Node, native packages stubbed) | `apps/mobile/test/**`, `vitest.config.ts` | **Yes**, it never touches a phone. It already guards most of the shared logic. |
| Kotlin unit tests of the phone module | `modules/forge-rest/android/src/test` (`WearWireTest`, `WorkoutClockTest`) | No; need Swift twins (XCTest). Their cases should become shared JSON fixtures (section 8). |
| Watch unit tests + Robolectric render goldens | `android/wear/src/test` (10 files: `WatchLayoutTest`, `WatchScreensRenderTest`, `WatchLogRenderTest`, `BrandColourTest`, ...), run by `.github/workflows/wear-build.yml` | No. watchOS needs XCTest + SwiftUI snapshot tests on a macOS runner. The pure layout maths (`WatchLayout.kt`, `WatchLog.kt` `LogMath`) can be ported test-for-test. |
| Maestro flows, 190 YAML files, all `appId: com.mettleup.app` | `apps/mobile/qa/*.yaml` | **Mostly yes, if the iOS bundle id is the same.** Maestro drives iOS simulators. Changes: 3 flows press the Android back key; 2 assert Android system text (permission dialogs, Android settings); permission pop-ups differ everywhere; 18 use `runScript`/`evalScript` (portable). Notification-shade checks do not port. |
| The shell drivers around them | `qa/run-device-qa.sh` (277 `adb` calls: dumpsys, settings, input, am start, screencap, logcat, wm, bmgr), `run-journeys.sh` (22), `run-conditions.sh` (75), `run-store-shots.sh`, `notif.py`, `xc_phone.py`, `qa_report.py` | **No.** Need an `xcrun simctl` version (open URL, set appearance, status bar, screenshots, privacy grants, push via `simctl push`). Font scale, display size, airplane mode and backup checks have no simple iOS simulator switch. |
| Device QA, journeys, conditions, store shots, Test Lab | `.github/workflows/qa-device.yml`, `qa-journeys.yml`, `qa-conditions.yml`, `store-shots.yml`, `test-lab.yml` | No (Android emulator / Firebase Test Lab). An iOS lane needs a `macos` runner. |
| Watch UAT on emulator ("workout keeps MettleUp in front") | `wear-build.yml` job `watch UAT` | No. Paired iPhone + Watch simulators can exercise WatchConnectivity and the screens, not real buzz or heart rate. |
| Play upload / listing | `play-upload.yml`, `play-listing.yml` | Need App Store Connect twins (API key, TestFlight upload, metadata). |

---

## 7. Work estimate (S = up to 3 days, M = about 1-2 weeks, L = 3-6 weeks of agent work)

| # | Piece | Size |
|---|---|---|
| 1 | iOS build lane in GitHub Actions: `macos` runner, `expo prebuild -p ios`, unsigned simulator build, vitest, XCTest, on every push | M |
| 2 | Apple account set-up, signing (App Store Connect API key in Actions secrets), TestFlight upload workflow, App Store listing, privacy labels, review notes with a demo gym code | M (needs his money and identity) |
| 3 | TS fixes: Group A gates, "appstore" distribution + App Store update check, store words, back-gesture on 5 screens, keyboard checks | S-M |
| 4 | Notifications on iPhone: reminders, gym reminders, notices, "Rest is over" with the four sounds, action buttons | M |
| 5 | Push on iPhone: Firebase iOS SDK + APNs key in Firebase, pass `'ios'` | S |
| 6 | Sign in with Apple (+ Supabase Apple provider) and Google iOS client | S-M |
| 7 | Universal links: `apple-app-site-association` on both hosts + entitlement | S |
| 8 | `ForgeRest` in Swift: one Live Activity for workout + rest, App Intent buttons (Done, +15, -15, Skip, Complete set), offline ticks, notification fallback, AlarmKit on iOS 26 | L |
| 9 | `ForgePhone` in Swift: HealthKit write/read/delete | M |
| 10 | Home-screen widgets in WidgetKit (Today, Week, Gym) | M-L |
| 11 | Quick actions, CSV/XLSX "Open in", installer/environment | S |
| 12 | Apple Watch app (SwiftUI): 9 screens + 6 logging screens, WatchConnectivity protocol, `HKWorkoutSession`, heart rate, crown, haptics, Always On, gym colour | L |
| 13 | iPhone side of the watch link (WatchConnectivity in `ForgeRest`, `startWatchApp`) | M |
| 14 | Parity framework (section 8) | M |
| 15 | iOS QA lane: `simctl` driver, Maestro on simulator for a core set of flows, watch snapshot tests | L |

Rough total: 4-6 months of steady agent work for full parity including the watch; an iPhone app
without the watch, widgets and Live Activity (notifications only) is about 4-6 weeks.

**Risks**
- **No real device.** Live Activities on the lock screen, App Intent buttons with the app killed,
  HealthKit with real data, APNs push, watch haptics and heart rate cannot be proven on a simulator.
  Apple Watch cannot be rented in device clouds. A person with an iPhone and Apple Watch on
  TestFlight is needed for every release that touches these.
- **App Review.** Common rejections to plan for: Google sign-in without Sign in with Apple (4.8);
  Health data use explained and not used for ads (5.1.3); account deletion in-app (exists:
  `components/settings/AccountCard.tsx`); no mention of APKs or Play anywhere; demo access for review.
- **Background limits.** iOS suspends the app; anything that must happen with the app closed (a
  watch Done, a lock-screen button) must live in Swift and be replayed into JS later, as Android's
  `OfflineTick` already does. The 15-minute gym-notice check will not run on time on iPhone.
- **Drift.** Today some rules sit inside Kotlin (e.g. when the watch gets "All sets done", the outbox
  retry, the done-row checks). Each one copied to Swift is a second place to change. Move rules to
  TS first, keep native as transport only.
- **Double workouts in Health** if both the watch's workout session and the phone save one.
- **CI time.** macOS runners are slower; a full Maestro round on iOS will take longer than Android's.

---

## 8. Keeping Android and iPhone equal automatically (the framework)

1. **One JS contract per module.** `ForgePhone` (`src/tracker/phone/native.ts`) and `Native`
   (`src/tracker/services/restCard.ts`) are the contract. Both Kotlin and Swift implement exactly
   these names; callers never check the platform for a native feature, they check whether the
   function exists (already the pattern: `n.healthAccess?.()`).
2. **A parity check in CI** (a small script, fails the build): list every `Function("x")` /
   `AsyncFunction("x")` / `Events(...)` in each `*Module.kt` and each `*Module.swift`; every Android
   name must exist in Swift or sit in an allow-list file with the reason ("iOS cannot: Play update").
   An Android change that adds a function then cannot merge without its iPhone twin or a written reason.
3. **The watch protocol as data, not code.** One file (e.g. `docs/ios/watch-protocol.json`) lists the
   paths, keys and types in section 3b, plus sample payloads. Kotlin `WearWireTest` and the Swift
   tests both load the same samples; a new key on Android fails the Swift test until it is handled.
4. **Rules in TypeScript.** Next-set lines, watch entry boxes, "All sets done", Done-row checks:
   computed in TS (`liveCard.ts` already does most) and passed down; native only stores and shows.
5. **Same bundle id and same Maestro flows.** A core set of flows (start workout, log sets, rest,
   finish, join gym, check-in) runs on both an Android emulator and an iPhone simulator; a flow that
   cannot run on iOS is tagged with the reason.
6. **iOS project generated, never hand-edited** (`expo prebuild -p ios` in CI), with all iOS settings
   in `app.json` and config plugins, so an Android-side plugin change is visible next to its iOS part.

---

## Technical appendix: file index

- Native JS loaders: `src/tracker/phone/native.ts` (`phoneNative`), `src/tracker/services/restCard.ts`
  (`Native`, `requireOptionalNativeModule('ForgeRest')`).
- forge-phone Kotlin: `modules/forge-phone/android/src/main/java/com/forgeai/phone/` —
  `ForgePhoneModule.kt` 306, `Health.kt` 299, `HealthRationaleActivity.kt` 30, `PlayUpdate.kt` 129,
  `Share.kt` 78, `Shortcuts.kt` 74, `Widgets.kt` 384, `GymShortcut.kt` 131. Manifest: Health
  permissions `WRITE_EXERCISE`, `WRITE_ACTIVE_CALORIES_BURNED`, `READ_WEIGHT`, `READ_STEPS`; widget
  receivers `TodayWidget`, `WeekWidget`, `GymWidget`.
- forge-rest Kotlin: `modules/forge-rest/android/src/main/java/com/forgeai/rest/` —
  `ForgeRestModule.kt` 299, `RestCard.kt` 1515, `WorkoutCard.kt` 400, `OfflineTick.kt` 222,
  `RestActionReceiver.kt` 69, `RestBootReceiver.kt` 43, `WearSync.kt` 571, `WearWire.kt` 275,
  `WearActionService.kt` 53. Tests: `WearWireTest.kt` 225, `WorkoutClockTest.kt` 23.
- Watch: `android/wear/src/main/java/com/forgeai/wear/` (20 files, 4,249 lines) and
  `android/wear/src/test/java/com/forgeai/wear/` (10 files, 1,072 lines); `android/wear/build.gradle`
  (Wear Compose 1.4.1, wear-ongoing 1.0.0, health-services-client 1.1.0, play-services-wearable
  20.0.1, wear-remote-interactions 1.1.0, wear-phone-interactions 1.1.0);
  `android/settings.gradle` includes `:wear` only with `-PwithWear=true`.
- Push server: `deploy/hq/push.js` (FCM HTTP v1, project `forgeai-d7eea`); table
  `member_push_tokens` (`supabase/migrations/0038_member_push.sql`, `platform in ('android','ios')`).
- Workflows: `.github/workflows/ci.yml`, `release-apk.yml`, `wear-build.yml`, `qa-device.yml`,
  `qa-journeys.yml`, `qa-conditions.yml`, `store-shots.yml`, `test-lab.yml`, `play-upload.yml`,
  `play-listing.yml`.
