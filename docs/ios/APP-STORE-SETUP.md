# Apple App Store setup (groundwork, no app code)

Done 19 Nov 2026 in the simpleapps108@gmail.com Chrome window. The iPhone app itself is still paused (R-348).

## What exists at Apple now

| Thing | Value |
|---|---|
| Apple account | simpleapps108@gmail.com, Individual, team "MettleUp Workout Tracker" (Akash Pahuja) |
| Team ID | 6LR22K4WZ9 |
| Bundle ID | com.mettleup.app (explicit; no capabilities yet: add HealthKit, push, Sign in with Apple when the app uses them) |
| App Store Connect record | Apple ID 6836681097, SKU mettleup-ios, primary language English (U.K.) |
| Name (shown in search) | MettleUp - Workout Tracker (owner's choice, 19 Nov) |
| Subtitle (draft) | Gym Log & Weight Lifting Plan |
| Keywords (draft, 97 of 100) | fitness,strength,training,exercise,routine,planner,bodybuilding,reps,progress,overload,rest,timer |
| Category | Health & Fitness |
| Support URL | https://app.mettleup.fit/support |
| Marketing URL | https://mettleup.fit |
| Privacy policy URL | https://mettleup.fit/privacy |
| Copyright | 2026 Akash Pahuja |

Nothing is public. A listing goes live only after a build is submitted for review, which needs his "release".

## Search rules used (App Store)

- Apple searches only the name, subtitle and keyword box (not the description).
- A word counts once: keywords never repeat a word from the name or subtitle.
- Commas, no spaces; singular words cover plurals.
- No competitor names (Apple guideline 2.3.7, and his own rule).

## Not filled yet, and why

- **Description and promo text**: the Play text promises Health Connect, Wear OS, Google Drive backup and widgets. On iPhone those become Apple Health, Apple Watch, iCloud/Files and iPhone widgets only when built. Writing them now would list features the iPhone app does not have. Write it from docs/ios/PARITY.yaml when the iPhone app restarts.
- **App Privacy answers and age rating**: they must match the real iPhone build (its SDKs). Legal wording needs his yes.
- **Screenshots**: Apple needs real iPhone screens (6.9-inch, 1320 x 2868). The cloud simulator build (ios.yml) can take them when the app restarts. Play pictures must not be reused: they show Android-only parts.

## Release path (draft)

`.github/workflows/ios-release.yml`: started by hand only. It ends green with a notice until three repo secrets exist (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8). Then it builds a signed store build on GitHub's free Mac runner and uploads it to TestFlight. It never submits for review.

## Only he can do

1. App Store Connect > Users and Access > Integrations > App Store Connect API: press "Request Access" and accept Apple's API terms.
2. Then make a key (role App Manager), download the .p8 once, and paste it into GitHub > aucksy/ForgeAI > Settings > Secrets > Actions as ASC_KEY_P8, with ASC_KEY_ID and ASC_ISSUER_ID.
3. Business page: the Free Apps agreement is enough while the app is free. The Paid Apps agreement, bank and tax are needed only before MettleUp Plus is sold on iPhone.
4. EU trader status (App Store Connect banner) before the app goes to EU stores.
