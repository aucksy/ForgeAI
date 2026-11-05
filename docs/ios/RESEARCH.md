# MettleUp on iPhone and Apple Watch: research

Researched 5 Nov 2026. Research only: no code changed, nothing signed up for, nothing bought.
Every fact carries the date of the source it came from. "Unverified" means only blogs or forum posts back it up.

---

## Plain-English summary

**What it costs.** Apple charges US$99 a year (about ₹8,300 to ₹8,700; Apple shows the exact rupee price only during sign-up). Everything else can stay free: the repo is public, so GitHub's Mac build machines cost nothing, and Expo's free plan includes 15 iPhone builds a month. The only extra you might want is a way to tap through the app yourself (see "How you would see it" below).

**The one surprise.** In India, you can only enrol in Apple's developer programme through the **Apple Developer app, and that app runs only on an iPhone, iPad or Mac**. You will need to borrow an iPhone for about an hour to enrol. Sign up as an **individual**. That needs no company paperwork and no D-U-N-S number, and you can switch to a company account later. Forum posts from India in 2026 report waits from a few days to more than five weeks, often stuck at the ID check. Start early.

**How long until it is live.** Apple says 90% of submissions are reviewed within 24 to 48 hours. In practice, a first submission plus at least one rejection usually means 1 to 2 weeks. The watch app is not a separate submission: it sits inside the iPhone app and is reviewed with it.

**Whether the apps can be built and tested without an iPhone or Mac.** Yes, for building and automated checks. GitHub's free Mac machines (macOS 26, Xcode 26.6, with iPhone and Apple Watch simulators installed) can build the iPhone app, run the **same Maestro test journeys we already run on Android**, and take screenshots of every screen. No cloud service rents a real Apple Watch for hands-on testing. Watch screens can only be tested on the simulator in CI.

**What the watch app has to be.** React Native and Expo cannot run on Apple Watch, so the watch app has to be written in Apple's own SwiftUI. It gets plugged into the Expo app automatically at build time. Kotlin Multiplatform is not worth it here. The watch app is small, and the parts that must match on both watches are the messages between phone and watch. One shared definition can generate those for both sides and be tested in CI.

**How every Android change reaches iPhone, and why that cannot be fully automatic.** About 90% of the app is shared React Native code, so those changes reach iPhone on their own. Native parts cannot be copied across automatically: the rest-timer notification, Health Connect, the update prompt, the watch link and the watch app each need an Apple twin written once. The safeguard is a CI check that **fails the build when someone adds an Android-only native feature without its iPhone twin**, plus the same test journeys on both phones, plus screenshots of each screen side by side.

**How you would see it.** In order of preference:
1. Automatic screenshots and videos from CI on every change (free).
2. Expo's browser-based iPhone simulator. It is in limited preview with a waitlist and no published price.
3. Appetize: the free plan has only 30 minutes a month and 3-minute sessions, so Starter at US$59 a month is the real option.
4. BrowserStack App Live, a real iPhone in your browser, about US$29 to 39 a month.
5. TestFlight on a borrowed or second-hand iPhone, which is the only way to try the Apple Watch app for real.

**Biggest rejection risks for a gym app.** Any in-app sign-up must come with account deletion inside the app. If Google sign-in is offered, an equally private option (in practice Sign in with Apple) must be offered too. HealthKit must be named in the store description, every permission needs a clear reason, and health data can never feed ads. A member's own paid plan must use Apple's in-app purchase. **A plan the gym pays for (B2B) can skip in-app purchase** under the "Enterprise services" rule, and real gym access, being a physical service, must **not** use in-app purchase.

**Recommendation.** Keep one Expo codebase. Write Apple twins for the two native modules. Add a SwiftUI watch app through a build-time plugin. Run the iOS build and tests on free GitHub Mac machines. Use Expo to sign and upload store builds (this works from Windows). Add the parity CI gate before any iOS feature work begins.

---

## A. Publishing

### A1. Enrolment, individual vs organisation, India

| | Individual | Organisation |
|---|---|---|
| Fee | US$99 a year, charged in local currency (Apple help page, read 5 Nov 2026). Third-party estimates: ₹8,300 to ₹8,700 (Colorleaves, Spreadcast, 2026). Unverified until shown in the app. | Same US$99 |
| Seller name on the App Store | Your legal name | The company's legal name |
| D-U-N-S number | Not needed | Required. Free. About 5 business days from D&B plus up to 2 for Apple (Apple guidance quoted by third parties). India consultancies quote 1 to 4 weeks. Unverified. |
| Extra requirements | Your own card. Paying with someone else's card triggers a request for photo ID. | A legal entity (no sole proprietorships or trade names), a work email on the company domain, a public website, legal signing authority, and possibly notarised documents |
| How you enrol in India | **Only through the Apple Developer app** (Apple help page). The app runs on iPhone, iPad or Mac. | Same |
| Time to approval | Apple publishes no figure. Third parties say about a day. 2026 forum threads from India report weeks, with "ID Verification Rejected" or "Unable to Continue" stalls. | Third parties say a few days to 2 weeks after D-U-N-S |

Sources: [Apple, Program enrolment help](https://developer.apple.com/help/account/membership/program-enrollment/) · [Apple D-U-N-S help](https://developer.apple.com/es/support/D-U-N-S/) · [Spreadcast 2026](https://spreadcast.app/resources/apple-developer-program) · [Colorleaves 2026](https://colorleaves.in/blog/apple-developer-account-cost-india/) · [Adalo 2026](https://studio.adalo.com/blog/apple-developer-program-guide) · Forum reports: [India "Unable to Continue"](https://developer.apple.com/forums/thread/839376), [India blocked 5+ weeks](https://developer.apple.com/forums/thread/837697), [ID verification rejected](https://developer.apple.com/forums/thread/828487), [Stuck for weeks in 2026](https://developer.apple.com/forums/thread/822540)

### A2. Time from submission to live

- Apple's App Review page says 90% of submissions are reviewed within 24 hours. A June 2026 statement reported by 9to5Mac says 90% within 48 hours, averaging 1.5 days.
- Runway's tracker (Sept 2026) shows about 7 to 9 hours waiting plus about 2 hours in review.
- One developer sampled 64 decisions in 2026 and found a median of 73 hours.
- TestFlight internal testers (up to 100) get no review. The first build of each version for external testers (up to 10,000) goes through Beta App Review: trackers show about 10 hours, blogs report 2 to 7 days. Builds expire after 90 days. After upload, Apple takes about 5 to 10 minutes to process a build (Expo, Oct 2026).
- Since 28 April 2026, every submission must be built with the iOS 26 SDK (Expo blog). GitHub's runner has Xcode 26.6, so that is covered.

Sources: [Choicely 2026](https://www.choicely.com/tutorials/how-long-does-app-review-take) · [Tensorust, 64 decisions](https://tensorust.com/articles/app-store-review-time/) · [Axonbuild 2026](https://axonbuild.com/blog/how-long-does-app-store-review-take/) · [PTKD on TestFlight 2026](https://ptkd.com/journal/testflight-external-testing-approved-2026-backlog) · [Expo on the iOS 26 SDK minimum](https://expo.dev/blog/app-store-connect-minimum-sdk-26)

### A3. Common first-time rejections for a fitness app (guideline text read 5 Nov 2026)

| Risk | Rule | What MettleUp must do |
|---|---|---|
| HealthKit wired in but not clearly used | 2.5.1: HealthKit "should be used for health and fitness purposes and integrate with the Health app" and be named in the app description | Mention Apple Health in the description. Request only the data types actually used. Write specific purpose strings. Add the HealthKit capability only to the build that actually uses it. |
| Health data misuse | 5.1.3(i) and (ii): no use for advertising or data mining. No false data written to HealthKit. No personal health data in iCloud. | Keep health data away from analytics and ad SDKs. Supabase backup is fine; iCloud is not. |
| Account deletion | 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app." | A delete-account button inside the app, not a link to an email address |
| Login | 4.8: if a third-party or social login is the primary login, also offer an equivalent private option (name and email only, email can be hidden, no ad tracking) | If Google sign-in exists, add Sign in with Apple. Phone OTP or email-only login avoids this rule. |
| Paying for features | 3.1.1: unlocking features or subscriptions must use in-app purchase | See D4 |
| Privacy labels and policy | 5.1.1 | A privacy policy URL, and privacy labels that cover every SDK (Supabase, crash reporting, AI provider) |
| Spam or low value | 4.3, tightened 8 June 2026 | Not a risk for a real app, but the iPhone app must not look like a web wrapper |
| Ads on watch | 2.5.18: no display ads in watchOS apps | Nothing to do |

Sources: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [MacRumors, June 2026 changes](https://www.macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/) · [Sahha on HealthKit rejections](https://sahha.ai/blog/healthkit-app-store-rejection/) · [Apple forum: HealthKit rejection](https://developer.apple.com/forums/thread/762128)

### A4. Is the Apple Watch app reviewed separately?

No. A watch app that has a companion iPhone app is set up inside the iPhone app's App Store Connect record. Its screenshots and icon go under an "Apple Watch" tab and are reviewed with the new version. The watch screenshots must show the real running app. The description should say what the app does on Apple Watch. Source: [App Store Connect help, watchOS app information](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-watchos-app-information) · [Forum: watch screenshots](https://developer.apple.com/forums/thread/815829)

---

## B. Testing without an iPhone or a Mac

### B1. GitHub Actions Mac runners

- **Cost:** GitHub's billing page (read 5 Nov 2026) says standard GitHub-hosted runners are free in public repositories. `macos-15` and `macos-26` are standard runners; larger runners are billed even in public repos. For private repos, the free plan includes US$12 a month, and macOS costs US$0.062 a minute (about 190 minutes).
- **Limits:** 5 Mac jobs at once on the Free and Pro plans, and 6 hours per job.
- **Image (macos-26-arm64, 26 Oct 2026):** Xcode 26.6 by default, plus Xcode 26.0.1 through 26.5. iOS simulators 26.2, 26.4 and 26.5, and **watchOS simulators 26.2, 26.4 and 26.5**. Xcode 27 is in public preview.
- An Expo app builds with `npx expo prebuild -p ios`, then `pod install`, then `xcodebuild -sdk iphonesimulator`. A simulator build needs no signing and no Apple account. Expected time is 20 to 40 minutes; Expo quotes about 23 minutes for its own pipeline.

Sources: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits) · [macOS 26 runner image readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)

### B2. Automated tests on iOS

- **Maestro** fully supports iOS simulators (its docs list iOS 16 to 18; newer versions work in practice; check on first run). It does not officially support real iPhones as of the latest text found. A community patch exists (`maestro-ios-device`). Maestro does not drive watchOS. Our existing `apps/mobile/qa/*.yaml` flows can run on iOS with small platform branches (`runFlow: when: platform: iOS`). Expo Workflows also has a Maestro job, which is in alpha.
- **XCUITest on watchOS** works on the watch simulator with an explicit destination, for example `xcodebuild test -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)'`. Blogs say it does not run on a physical watch (unverified) and is more limited than on iPhone.
- **Screenshots:** `xcrun simctl io booted screenshot` for any simulator, Maestro `takeScreenshot` for iPhone, and `XCUIScreen.main.screenshot()` inside watch UI tests. Upload them as CI artifacts, the same way Android QA works today.

Sources: [Maestro on GitHub](https://github.com/mobile-dev-inc/Maestro) · [Maestro iOS support summary](https://deepwiki.com/mobile-dev-inc/maestro-docs/8.2-ios-support) · [maestro-ios-device](https://github.com/devicelab-dev/maestro-ios-device) · [Forum: watch UI tests from the command line](https://developer.apple.com/forums/thread/692412) · [watchOS XCTest notes](https://helpmetest.com/blog/watchos-testing-xctest/)

### B3. Ways for the owner to tap through the app on Windows

| Option | What you get | Price (date) | Catch |
|---|---|---|---|
| CI screenshots and video | Every screen after every push | Free | Not interactive |
| **EAS Simulator** (Expo) | iOS simulator streamed to a browser tab, shareable URL, replays | Not published (limited preview, Sept 2026) | Waitlist at expo.dev/services/simulators. No camera hardware, no push notifications. |
| Appetize.io | iOS simulator in the browser (upload the simulator build) | Free: 30 min a month, 3-min sessions, 2 devices. Starter: US$59 a month on annual billing (US$89 monthly), 500 min. Premium: US$319 a month. (pricing page, 5 Nov 2026) | The free plan is too small to be useful |
| BrowserStack App Live | Real iPhones in the browser | About US$39 monthly or US$29 a month on annual billing. A Freelancer tier at US$19 has 100 min. (third-party sites, 2026; unverified) | Needs a signed ad hoc or TestFlight-type build. No Apple Watch found. |
| Expo Go on iPhone | Not useful | | Cannot load our custom native modules |
| TestFlight on a borrowed or second-hand iPhone | The real thing, including the Apple Watch | iPhone cost only | Needs a physical iPhone, plus an Apple Watch paired to it for watch testing |

Sources: [Appetize pricing](https://appetize.io/pricing) · [Expo: test iOS without a Mac (7 Oct 2026)](https://expo.dev/articles/testing-and-previewing/test-ios-app-without-mac) · [Expo blog, EAS Simulator (14 Sept 2026)](https://expo.dev/blog/build-ios-apps-on-windows-with-cloud-simulators) · [TechRadar, App Live](https://www.techradar.com/reviews/browserstack-app-live) · [SaaSPriceHub, BrowserStack (Sept 2026)](https://saaspricehub.io/tools/browserstack)

### B4. EAS Build vs plain xcodebuild, and signing without a Mac

- **EAS Build, free plan:** 15 iOS builds a month, low-priority queue, no overage (it stops until the 1st of the next month). Starter is about US$19 a month with US$45 of credit; extra iOS builds cost about US$2 to 4 (third-party sites, Sept to Oct 2026; check expo.dev/pricing). EAS creates and stores the distribution certificate and provisioning profiles itself, and after that first setup no Mac is ever needed. `eas submit` uploads to App Store Connect from Windows.
- **Plain xcodebuild on GitHub:** free and unlimited for this public repo. Signing needs either fastlane `match` (certificates stored encrypted in a private git repo, read-only in CI) or the EAS credentials downloaded once. Use an **App Store Connect API key** (key ID, issuer ID, `.p8`) as a GitHub secret for uploads, so no Apple ID password or two-factor code is ever needed in CI.
- **Recommended split:** GitHub Mac runners for every-push simulator builds and tests (free, unlimited). EAS for signed store builds and submission (15 a month is plenty for releases).

Sources: [Expo app credentials](https://docs.expo.dev/app-signing/app-credentials/) · [Expo managed credentials](https://docs.expo.dev/app-signing/managed-credentials/) · [EAS Build pricing explained (2026)](https://cadrant.ai/blog/eas-build) · [Newly on EAS Build](https://newly.app/guides/eas-build) · [Fastlane in GitHub Actions for React Native (2026)](https://vp0.com/blogs/github-actions-fastlane-react-native-ios-2026/)

---

## C. Apple Watch

- **Can React Native or Expo run on watchOS? No.** No React Native watchOS runtime turned up in any 2026 source. Every guide builds the watch app natively in SwiftUI.
- **Adding a SwiftUI watch target to Expo:** use `@bacons/apple-targets` (expo-apple-targets, by Evan Bacon of Expo). It supports `watch` (a watch app with a companion iPhone app) and `watch-widget` (complications) target types, for SDK 53 and up. Swift code lives in `targets/watch/` and is generated into the Xcode project on every `expo prebuild --clean`, so the `ios/` folder never needs committing. Caveats, from GitHub issues in 2026:
  - #175: prebuild wired the watch embed wrongly on SDK 54. Fixed in March 2026.
  - #147: CFBundleVersion mismatch on App Store submit. Keep watch and phone build numbers in sync.
  - #171: no option to add frameworks to watch targets.
  - The README says not every target type has been tested.
  - The SDK 57 upgrade PR is open. We are on SDK 56; check which plugin release matches before installing.
- **Phone-to-watch link (WatchConnectivity):** `react-native-watch-connectivity` is stale (last release 1.1.0, about 4 years old, built before the New Architecture). Alternatives are `@plevo/expo-watch-connectivity` (an Expo module, about 8 months old) or, better, a **WatchConnectivity bridge written into our own `forge-phone` module**. We already own the Android side of that module, and it keeps the message format under our control.
- **Wear OS to watchOS mapping:**

| Wear OS today | watchOS twin |
|---|---|
| Health Services `ExerciseClient` workout | `HKWorkoutSession` with `HKLiveWorkoutBuilder` and `HKLiveWorkoutDataSource` (Apple doc "Running workout sessions") |
| Heart-rate stream | Live builder statistics for `heartRate` |
| Ongoing Activity / keeping the app in front | An active workout session keeps the app in front on wrist raise |
| Ambient mode / always-on | SwiftUI `isLuminanceReduced` environment value. Dim the UI and update about once a second. |
| Tiles and complications | WidgetKit complications (`watch-widget` target). ClockKit is retired. |
| Vibration | `WKInterfaceDevice.current().play(.notification / .success / .start / .stop)` |
| Data Layer (`MessageClient` / `DataClient`) | WatchConnectivity: `sendMessage` (live), `updateApplicationContext` (latest state), `transferUserInfo` (queued) |
| Standalone Wi-Fi/LTE | Independent watch app with direct network access |

Sources: [expo-apple-targets](https://github.com/EvanBacon/expo-apple-targets) · [Issue #175](https://github.com/EvanBacon/expo-apple-targets/issues/175) · [SDK 57 PR #210](https://github.com/EvanBacon/expo-apple-targets/pull/210) · [react-native-watch-connectivity](https://github.com/watch-connectivity/react-native-watch-connectivity) · [expo-watch-connectivity](https://github.com/ixacik/expo-watch-connectivity) · [Keiver, Watch and RN two-way messaging](https://keiver.dev/lab/apple-watch-app-with-react-native-bidirectional-communication) · [Apple: Running workout sessions](https://developer.apple.com/documentation/healthkit/running-workout-sessions) · [WWDC21: Always-On](https://developer.apple.com/videos/play/wwdc2021/10002/)

---

## D. iPhone-only pieces

- **Rest timer without a foreground service.** iOS has no foreground service. Schedule **one** local notification for the end time when the rest starts, and cancel or reschedule it if the rest is skipped or extended. The limit is 64 pending notifications per app; when there are more, iOS silently drops the latest ones (Apple engineer, developer forums). A rest timer uses one. The countdown on screen is drawn from the stored end time, not from a running timer.
- **Live Activity / Dynamic Island for the rest timer:**
  - `expo-widgets` is Expo's own package, in alpha in 2026. It builds Lock Screen and Dynamic Island views from Expo UI components without Swift.
  - **Voltra** (Callstack) builds Live Activities and widgets as React components, with a config plugin and push updates.
  - `expo-live-activity` (Software Mansion) is **deprecated** in favour of expo-widgets.
  - A Swift Live Activity target through `@bacons/apple-targets` is the most predictable option.
  - Use the system's native countdown (`Text(timerInterval:)`). It ticks with no app updates, which matters because iOS limits background updates.
- **HealthKit:** use `@kingstinct/react-native-healthkit`. It is Nitro-based, has an Expo config plugin with purpose strings and a background-delivery option, and is actively released (v16.x reported in Oct 2026). Avoid `react-native-health`, whose last release was Oct 2024 per one report (unverified) and which has New Architecture build problems. Neither works in Expo Go.
- **In-app update prompt:** iOS has no equivalent of Play's in-app update. Look up the latest version through the iTunes Lookup API, then show our own "Update available" sheet that opens the App Store. `expo-in-app-updates` does exactly this: Play in-app updates on Android, iTunes lookup plus an App Store modal on iOS. Our own fetch would also work and adds no dependency.
- **Who pays: Apple's rules for a gym app** (guideline text, 5 Nov 2026):
  - **The gym pays MettleUp (B2B), and members use features their gym bought:** 3.1.3(c) Enterprise Services allows this when the app is "sold directly by you to organizations or groups for their employees or students… Consumer, single user, or family sales must use in-app purchase." Gym members are not literally employees or students, so describe the scheme in the review notes. Members log in with a gym-issued code or account; **do not show any price, buy button or link to pay inside the iPhone app.** Unverified edge: a reviewer could still query it.
  - **A member buys their own premium plan:** must use in-app purchase (3.1.1). 3.1.3(b) Multiplatform lets someone who bought on Android or the web use it on iPhone, but only "provided those items are also available as in-app purchases."
  - **The gym membership itself (entry, classes, personal training in person):** 3.1.3(e) says physical services used outside the app **must not** use in-app purchase. Use UPI or card, as the gym does today. One-to-one live remote coaching may use other payment methods under 3.1.3(d) ("fitness training"); one-to-many live classes must use in-app purchase.
  - **Outside-payment links (3.1.1(a), 3.1.3(a)):** the 2026 changes to these rules came from a US court decision and apply to US-storefront apps. For India, assume no buy-outside links.

Sources: [Forum: the 64-notification limit](https://developer.apple.com/forums/thread/811171) · [Expo blog: widgets and Live Activities](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo) · [Voltra](https://github.com/callstackincubator/voltra) · [expo-live-activity (deprecated)](https://github.com/software-mansion-labs/expo-live-activity) · [react-native-healthkit](https://github.com/kingstinct/react-native-healthkit) · [Health library comparison](https://github.com/pratham124/compound/issues/13) · [expo-in-app-updates](https://npmjs.com/package/expo-in-app-updates) · [App Review Guidelines 3.1](https://developer.apple.com/app-store/review/guidelines/#payments) · [MacObserver on the 2026 guideline changes](https://www.macobserver.com/news/apple-app-review-guidelines-2026-changes-explained/)

---

## E. A parity framework: keeping Android and iOS equal automatically

What real teams do, and what fits MettleUp:

1. **Shared code first.** Screens, logic, database and AI are already shared TypeScript, so changes there reach both phones for free. Rule: new features go in shared TS unless a native API is unavoidable.
2. **One schema for the phone-to-watch protocol.** Today Kotlin on both ends: forge-phone and the Wear app. Move the message definitions into one file, for example `packages/watch-protocol/schema.json` (JSON Schema). Generate Kotlin data classes, Swift `Codable` structs and TS types from it with **quicktype** (`quicktype -s schema schema.json -o Models.swift`, and the same with `--lang kotlin` and `ts`). Commit the generated files. A CI job regenerates them and fails on any difference. Protobuf works too, but it is heavier, and both WatchConnectivity and the Data Layer already carry dictionaries or bytes. JSON is simpler to debug.
3. **Contract tests.** Keep a folder of golden example messages, such as `start-workout.json`, `set-logged.json` and `rest-started.json`. Every side gets a unit test that decodes every example and re-encodes it identically: Kotlin (JVM, on Linux), Swift (`swift test` on the Mac runner) and TS (vitest). Adding a message without examples fails CI.
4. **The same end-to-end journeys on both platforms.** Run the existing Maestro flows on an Android emulator and on an iOS simulator in the same workflow. Use a matrix job: Linux for Android, `macos-26` for iOS. Platform differences go in `when: platform:` blocks, never in separate flow files. Watch journeys use XCUITest (watchOS) and the existing Wear tests, run against the same golden messages.
5. **Screenshot comparison across platforms.** Pixel diffs between Android and iOS always fail, because fonts and status bars differ. Teams instead (a) compare each platform with its own previous goldens, as the Android render gate already does, and (b) publish a **side-by-side sheet** (Android | iOS for each screen) as a CI artifact or page for a human or agent UAT pass. A cheap automatic check: the same `testID`s and text strings visible on both, read from the Maestro hierarchy dump.
6. **A CI gate for Android-only native code.** A small script that fails the build when:
   - a native module has an `android/` folder but no `ios/` folder, or its `expo-module.config.json` lists `android` without `apple`;
   - a TS file imports a native function without the `Platform.OS` guard or the module's iOS export;
   - a new Android permission or Gradle dependency appears in `app.json` / `android/` without a matching entry in **`docs/ios/PARITY.yaml`**.
   `PARITY.yaml` is the feature manifest: each feature with its `android:` and `ios:` status (`done` / `n-a` / `todo` plus a reason). `todo` is allowed only with an issue link, and the release workflow refuses to tag while any `todo` is marked `blocking: true`.
7. **Feature-flag manifest.** Feature flags already live in shared TS. Add a `platforms: [android, ios]` field to each flag so an Android-only feature is hidden on iOS, never half-working there. Our lessons note "never ship a lookalike stub" applies here.
8. **Kotlin Multiplatform for watch logic?** Not now. KMP can share Kotlin logic with a SwiftUI watch app; that is the usual pattern, with the UI always native. Compose Multiplatform has no confirmed watchOS UI support. But our watch logic is small: a set logger, rest timer and heart rate. Moving it to KMP means restructuring the Wear app's Gradle build and adding a Kotlin/Native framework step to the iOS build. Our lessons file already lists Kotlin/Native traps from the VastuFirst iPhone port. The schema and contract tests above give most of the safety at a fraction of the cost. Revisit if the watch gains real business logic, such as offline programme progression.

Sources: [quicktype](https://github.com/agilebits/quicktype) · [quicktype blog](https://quicktype.io/blog/quicktype-news-vol-4) · [Kotlin Multiplatform](https://www.jetbrains.com/kotlin-multiplatform/) · [Shipping a running app with KMP](https://fluxrunai.com/blog/kotlin-multiplatform-running-app) · [KMP watch PoC issue](https://github.com/Huythanh0x/course_deals_ComposeMultiplatform/issues/223)

---

## Recommended plan, in order

1. **Owner:** borrow an iPhone, install the Apple Developer app, and enrol as an individual (US$99). This can take weeks, so do it now.
2. Write the parity gate and `PARITY.yaml` first. They list the gaps automatically from what is on disk.
3. Add a `macos-26` CI job: prebuild, simulator build, Maestro journeys, screenshots. The repo is public, so this is free.
4. Add iOS twins to `forge-rest` (local notification and Live Activity) and `forge-phone` (HealthKit via kingstinct, update check, WatchConnectivity).
5. Add the watch-protocol schema and contract tests. Then write the SwiftUI watch app through `@bacons/apple-targets`, with watch-simulator XCUITests.
6. Sign and submit through EAS (free plan, from Windows). TestFlight internal testing goes to a borrowed iPhone and Apple Watch for the final hands-on check, and the owner joins the EAS Simulator waitlist.
7. Before submission: account deletion in the app, Sign in with Apple if Google login exists, HealthKit wording and privacy labels, a B2B note for App Review, and no purchase path on iPhone except Apple in-app purchase.
