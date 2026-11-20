# Play Console report (MettleUp, com.mettleup.app)

Read 21 Nov 2026, read only, in the Chrome window signed in as simpleapps108@gmail.com
(developer account "MettleUp", id 8165750959522333478; app id 4973234719959672731).
Nothing was clicked except page navigation and "Expand all" on the vitals tips.

## 1. Live version on each track

| Track | Version (code) | Status | Date |
|---|---|---|---|
| Production (phone) | 0.77.0 (77000) | Available on Google Play, full rollout, 178 countries | 14 Nov 2026 |
| Closed testing - Alpha (phone) | 0.79.0 (79000) | Ready to publish, NOT live; testers still get 0.78.0 (78000, 15 Nov) | 17 Nov 2026 |
| Open testing (phone) | 0.79.0 | Track PAUSED ("Testers are not receiving this release"); 0.79.0 ready to publish | 17 Nov 2026 |
| Internal testing (phone) | 0.79.0 (79000) | Available to internal testers | 17 Nov 2026 |
| Internal testing (Wear OS) | 0.79.0 (1000079000) | Available to internal testers | 17 Nov 2026 |
| Closed testing - Watch (Wear OS) | 0.79.0 (1000079000) | Ready to publish, NOT live; testers still get 0.78.0 (1000078000, 15 Nov) | 17 Nov 2026 |
| Open testing (Wear OS) | 0.79.0 | Ready to publish (listed on the publishing page) | 17 Nov 2026 |
| Production (Wear OS) | none listed | - | - |

Publishing overview: managed publishing is ON; last published 15 Nov 2026; 4 changes approved and
waiting for someone to press Publish (0.79.0 on open, closed-alpha, Wear open, Wear closed).
Dashboard banner: "Your recent app update has been approved and is ready for you to publish".

## 2. Newest pre-launch report

Could-not-check in the sense of "none exists": the Pre-launch report overview and details pages both
say "Upload artifacts to generate pre-launch reports" - no report has been generated for any
uploaded build. So there is no device list, crash, ANR, accessibility, security or screenshot result
to report. Likely cause: pre-launch testing is switched off for this app (not confirmed; the switch
lives under Release > Advanced settings, which was not opened). Test-account credentials in the
pre-launch settings are not filled in.

## 3. Android vitals (last 28 days, 24 Oct - 21 Nov 2026)

- User-perceived crash rate: "-" (Data unavailable). Google's bad line is 1.09 %.
- User-perceived ANR rate: "-" (Data unavailable). Google's bad line is 0.47 %.
- Plain meaning: too few users (about 14 monthly active devices) for Google to compute a rate, so
  we cannot say we are under the line, only that nothing is flagged.
- Crashes and ANRs list: "No results" (no crash or ANR clusters at all). Data last updated Fri 1:30 PM.
- Two "actions recommended" on 0.77.0:
  - Edge-to-edge: the app calls old status-bar / navigation-bar colour functions that Android 15
    deprecated (from React Native's StatusBar module, its edge-to-edge helper, and a Material
    bottom sheet). Plain: bar colours may look wrong on new phones; Google wants them migrated.
  - R8 memory: code optimisation and optimised resource shrinking are not enabled, and Google
    suggests Android Gradle plugin 9.0+. Plain: the app uses more memory and runs slower than it could.

## 4. Policy and warning banners

- App policy status: "No issues found". Developer account policy status: no issues.
- Account home shows "Policy tasks: 1 app, 1 issue" - not MettleUp (its policy page is clean), so
  this belongs to the other app on the account (ColorCloset).
- Dashboard banner: "Declare your trader status by February 1, 2027" (EU trader declaration).
- Dashboard banner: approved update ready to publish (see section 1).

## Version on main vs Play

main (e141ae9c): apps/mobile/app.json version 0.79.0; versionCode comes from the release tag
(MAJOR*1,000,000 + MINOR*1,000 + PATCH = 79000); watch = 1,000,000,000 + phone = 1000079000.
Newest release tag v0.79.0 (17 Nov 2026). Production on Play is 0.77.0 (77000) - two versions
behind main; 0.79.0 is uploaded and approved on every testing track but only live on internal.
