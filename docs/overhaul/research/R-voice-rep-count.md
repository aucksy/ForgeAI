# Counting reps and logging a set hands-free — research, 22 Oct 2026

Owner's idea (R-63, docs/CLAUDE-NOTES.md): when a member trains hard they can lose count. If they want,
they connect their earbuds, allow the mic, and the app listens to them count and logs the set when
they finish. "Maybe there is a different way to solve the problem."

Two separate problems hide in this:
1. **"I lost count"**: in the middle of a hard set. Hands are on the bar.
2. **"Log the set without touching the phone"**: at the end of the set.

## The short answer
- **Build the listening idea, with one change and a test first.** Listen through the **phone's own
  mic**, not the earbud mic. On normal (classic) Bluetooth earbuds, opening the earbud mic turns the
  member's music into phone-call quality for as long as it listens. Android's own guide says so.
- Listen **only for numbers and "done"** (English and Hindi), **on the phone only**, and never send
  sound anywhere. That keeps the "your workouts stay on this phone" promise, and it costs nothing.
- Use the earbuds for the **app's voice back**: "ten, logged" plays over the music, which dips for a
  moment and comes back. The app already plays sounds this way.
- **Nobody does this well today.** No big app counts reps by listening. The few tiny apps that try
  have almost no users and poor reviews. Watch and camera rep counters exist and get many complaints.
- The big unknown is accuracy in a loud Indian gym. So the first version is a **test build for the
  owner's own workouts**, with a hit-rate log. If it gets 9 of 10 sets right, we finish it.

## What ForgeAI has today (checked in the code)
- A set is ticked with the ✓ on the set row. The ✓ saves weight and reps (typed, or last time's grey
  hint) and starts the rest timer. The watch's Done and the notification's "Complete set" use the
  same path.
- The phone app **already contains** a speech-recognition library and a text-to-speech library.
  Both were added for the AI coach, which is switched off. Workout sounds already **dip the music
  instead of stopping it**.
- The **microphone permission was deliberately removed** before launch (launch item C5), because only
  the coach used it. Putting it back is the owner's call.
- The watch app shows the rest ring, heart rate and a "Complete set" / Done button. **Done cannot
  change the reps today.** It sends back the phone's numbers unchanged. The watch uses no motion
  sensor.
- No earbud-button handling, no motion sensors, no screen-off listening service exist yet.
- The app has no Hindi screens. Hindi is used today only to pick the Hindi speech language.

---

## Option 1: Listen to the member count aloud (the owner's idea)

### The earbud mic trap (this matters most)
- Normal Bluetooth earbuds play music on a high-quality channel. The moment an app uses the earbud
  mic, the earbuds switch to the phone-call channel. Music becomes mono and muffled until the mic
  closes. Android's guide: "Bluetooth classic lowers audio quality when using Bluetooth microphones."
- Android's own code notes that the earbud-mic channel records mono sound at 8 kHz (call quality).
- Newer "LE Audio" earbuds keep music good while the mic is on (Android 13 and up, up to 32 kHz).
  Few budget earbuds sold in India support it today, so we cannot count on it.
- An app does **not** get the earbud mic unless it asks for the call channel. By default it records
  from the phone's own mic and the music stays perfect. So: **phone mic by default**. The earbud mic
  becomes an option, with a plain warning that music will sound like a phone call while it listens.
  (To confirm on the owner's phone in the test: music stays full quality while the app listens.)
- What this costs: the phone has to be near the member: on the bench, the floor or the machine, about
  1–2 m away. In a pocket it will hear poorly. Most members keep the phone near them to see the rest
  timer anyway.

### Which listening engine (all free; all run on the phone)
| Engine | Size added to app | Hindi | Strengths | Weaknesses |
|---|---|---|---|---|
| **Google's on-phone recogniser** (through the speech library already in the app) | none | yes, if the phone has the offline pack | already installed; no new native code; a "must stay on this phone" switch exists | non-stop listening only on Android 13+; we can only nudge it towards our words, not lock it to them; needs Google's offline language pack on the phone |
| **Vosk** (open source, Apache 2.0) | 36 MB (Indian English) / 42 MB (Hindi) small models | yes | can be locked to a short word list (numbers and "done"), which helps a lot in noise; works on old Android; no Google needed | bigger app or a first-use download; new native code |
| **Whisper tiny** (open source, MIT) | 75 MB, needs ~273 MB of memory | yes | good general transcription | built for whole recordings, not live counting; heavy for budget phones. Not suitable |
| **Picovoice** wake-word / intent kits | small | — | made for a few fixed words | commercial licence for a paid product (price not checked: the page did not load). Not needed |
| Cloud speech (Google, Gemini, etc.) | none | yes | best general accuracy | **breaks the on-phone promise**, costs money per minute, fails in basement gyms with no signal. Do not use |

Recommendation: start with **Google's on-phone recogniser** because it is already in the app and adds
nothing to the download. Switch to **Vosk with a locked word list** if the test shows misses, or for
phones older than Android 13. One hard rule for both: if the offline pack is missing, offer the
download and do not listen. **Never fall back to online recognition.**

### English and Hindi numbers
- English: one to thirty. Hindi: ek, do, teen, chaar, paanch, chhe, saat, aath, nau, das, gyaarah,
  baarah … bees, ikkees … tees. The recogniser may also return digits or Devanagari. One small
  parser handles all three, and it can be tested in the normal test suite without a phone.
- Sound-alikes: "nau" (9) / "now", "do" (2) / "do", "das" (10) / "this". These are handled by the
  **order rule** below, not by the recogniser.
- Other Indian languages (Punjabi, Marathi, Tamil …) are out of scope for the first version.

### Noise, breathing, other people, silent counters
- **Gym music and clanging plates:** no public accuracy figure exists for counting in a gym. The only
  numbers found are vendor claims, for example JEFIT says another app's voice logging fails about 1
  time in 10 in noisy gyms. A developer who built a Gemini voice fitness prototype found it misheard
  commands with background noise. **This must be measured, not assumed.**
- **Other people counting:** in Indian gyms trainers count aloud for their clients. A phone mic will
  hear them. Guard: the **order rule**: accept only the next number (or skip one), ignore anything
  out of order, and ignore quiet far-away voices (the speech library reports loudness).
- **The hardest last reps** often come out as a grunt. Guard: if the app hears 6 and then 8, it
  assumes 7 happened.
- **Rest-pause sets** (rack it, breathe, two more): the app must **never** tick a set on silence. It
  ticks only on "done" / "ho gaya" / "bas", or on the member's own ✓.
- **Silent counters** (probably most lifters) get nothing from listening. That is why a no-mic
  option (Option 4) is in the plan.

### Screen off, Android rules
- With the screen on and the app open, the app may listen. No extra rules apply.
- To listen with the **screen locked**, Android 14+ requires a visible "foreground service" of type
  *microphone*, and it **must be started while the app is on screen**. Starting it from the
  background (for example when the rest alarm fires) is refused. So the member turns listening on in
  the open app, and it keeps running, with a notification, until the workout ends.
- Android 12+ shows a green mic dot while any app listens. The member can also block the mic for all
  apps from quick settings, and then the app just hears silence. The app should say "Mic is blocked"
  rather than look broken.
- Whether a running service may stop and restart the mic between sets with the screen locked is
  likely but **not proven**. It must be tried on a phone before that step is built.

### Google Play and privacy
- The mic permission is shown on the Play listing and asked for on the phone. We should ask only when
  the member turns listening on, never at install.
- Play's Data safety rules: data "only processed locally on the user's device and not sent off
  device" is **not counted as collected**. On-phone listening does not change the Data safety answers.
- Screen-off listening needs a **declaration in Play Console**: what the feature does, what happens
  if it is interrupted, and **a short video of the member turning it on**. It costs nothing, but the
  owner has to file it from his Play account.
- The permission text in the app config still says "talk to your AI coach". It must be rewritten.
- The privacy notice promises "nothing about your body or health leaves your phone unless you turn on
  a feature that clearly asks you first". Listening fits that promise if the sound never leaves the
  phone. It still needs its own plain paragraph, in English and Hindi.

### Battery and cost
- It listens only while a set is running, about 15–25 minutes in a typical workout. Expect a small
  battery cost. Not measured yet; the test build will show it.
- Money: none. Every engine above except cloud and Picovoice is free and runs on the phone.

### Effort in this app
- Test build (screen on, phone mic, English + Hindi numbers, order rule, "done" ticks with undo,
  hit-rate log): about 3–5 days of my work. It reuses the existing ✓ and rest path.
- Screen-off listening (a microphone service in the existing native rest module), the count on the
  watch, an earbud-mic option, and Vosk if needed: about 1–2 more weeks.

---

## Option 2: Motion counting from the watch or the phone
- **How others do it:** Garmin, Samsung Galaxy Watch (21 exercises), Apple Watch apps (Gymatic,
  Motra), Amazfit and Atlas count reps from wrist movement. Whoop detects strength work but tells
  members to log sets themselves.
- **Accuracy is poor.** A 2023 study of four Garmin watches found none accurate enough for any
  exercise. Errors were 44–67% for lunges and up to 67% for push-ups. The authors said to count by
  hand. Garmin's own manual says leg exercises "may not be counted". An Apple Watch study found poor
  bench-press counting. Two Atlas bands worn together agreed on the count only about 60% of the
  time, and accuracy depended on speed.
- **Complaints:** shoulder press logged as bench press and shrugs as squats (Garmin forum). Squat
  counting "random" or stopping after the first set (Samsung community). Motra "about 60% accurate".
  Gymatic "usually misses a rep at the beginning and at the end".
- **What fails:** leg work (the wrist barely moves), machines and cables, slow or uneven tempo,
  first and last reps.
- **For us:** Wear OS has a standard "rep count" reading, but only some watches provide it. A review
  of the owner's Pixel Watch 4 says it has **no set or rep counting**. Few Indian members own a Wear
  OS watch; most watches sold here are low-cost models that cannot run other apps (not checked
  against a market figure: the web-search allowance ran out). Building our own wrist counter means
  collecting movement data per exercise, which is weeks of work for a minority of members, with
  known-bad results on legs.
- A phone in a trouser pocket could count squats and lunges. It is fragile and only helps leg days.
  Not worth it now.

## Option 3: Camera counting (phone on the floor)
- **Who does it:** Tempo, Peloton Guide, Kemtai, Zing, cult.fit's at-home "energy meter", and
  Google's ML Kit sample.
- **Problems, from their own help pages and reviews:**
  - Tempo admits the camera confuses body and background, which causes double counts and missed
    reps. It needs 6–8 feet of clear space and no mirrors.
  - Peloton Guide showed 75 reps for 10.
  - A child sitting behind one reviewer broke the count.
  - cult.fit's fix for wrong scores is "make sure the camera sees your whole body".
- **In an Indian gym:** the floor is crowded, mirrors are everywhere, other people walk through the
  shot, and a phone on the floor gets kicked or picked up. The phone also cannot play music and film
  at once comfortably on a budget model. **Not practical.**

## Option 4: The app counts aloud in the earbuds ("Count for me")
- The app says "one … two … three …" at a pace the member picks (for example 3 seconds per rep). The
  member lifts to the voice. It needs no mic and no permission, and works for silent counters. The
  music dips for each number; the app already does this for its rest sounds.
- It fits Indian gyms: trainers counting "ek, do, teen" aloud is normal.
- **Limit:** it counts at a steady pace, not the member's real reps. When a member slows near
  failure, the voice runs ahead. So it is a pace guide that also keeps count, not a rep sensor. When
  the member ticks, the reps box can offer the number the voice reached, for the member to check.
- **Who has it:** small tempo apps such as "Rep Counter: Voice Workout", Repko (spoken tempo plus
  "GO / STOP" voice commands, May 2026) and Metric. None of Hevy, Strong or Fitbod has it, and no
  member demand for it was found.
- "Rep 6"-style milestones need the real count, so they only make sense together with Option 1.
- Effort: about 3–4 days (recorded numbers in English and Hindi, a pace setting per exercise).

## Option 5: Counting with a tap
- **Earbud button:** Android sends earbud button presses to **the last app that played music**. To
  catch them we would have to take over as the music app, which breaks the member's play/pause and
  next-song buttons. Not viable for members who play music, which is most of them. No fitness app
  was found doing this.
- **The phone's side buttons for sound up/down:** an app can catch them only while it is open on
  screen. With the screen locked it would need the accessibility service. Play allows that only
  with special disclosure and a declaration, and this feature is not an accessibility tool. With the
  app open it works, but the member's hands are on the bar.
- **A big tap area on the phone:** hands are busy mid-set. It does not solve "lost count".
- **The watch:** one tap per rep is awkward mid-lift. But the watch is a good place to **fix the reps
  before Done**, with the crown or + / − buttons. Today Done cannot change reps. That is a cheap,
  certain win for "log without touching the phone" (about 2–3 days), for watch owners.
- Closest things elsewhere: Fitbod logs a set when you nod with AirPods Pro (iPhone only). SmartGym
  logs a set with the Apple Watch double-tap.

## Option 6: Other ideas
- **Voice only for "done"**: the end-of-set half of Option 1. It needs the same mic, rules and
  wording, so it is part of Option 1 rather than a separate build.
- **Earbud head-motion counting:** Jabra tried it in 2016. The review found it "frustratingly
  erratic": it caught 2 of 10 push-ups one time. Budget earbuds give Android no motion data. Not
  viable.
- **Saying weight too** ("sixty kilo, ten"): possible later. The weight is usually already filled in
  from the plan or last time, so reps alone covers most sets.

---

## What other apps offer
| App | Rep counting | Voice / hands-free logging | Watch |
|---|---|---|---|
| Hevy | no | no | Wear OS + Apple Watch |
| Strong | no | Siri mentioned, no detail | Apple Watch only |
| Fitbod | no | AirPods head-nod logs a set (iPhone only) | Wear OS + Apple Watch |
| JEFIT | no | no | Wear OS + Apple Watch |
| Alpha Progression | no | no ("two taps" logging) | none found |
| Boostcamp | no | no | unclear (its own pages disagree) |
| Gravitus | no | no | Apple Watch only |
| HealthifyMe | no | AI assistant Ria got live voice and camera (Dec 2025); spoken set logging not confirmed | — |
| cult.fit | camera "energy meter" in at-home live classes only | no | none listed |
| Garmin, Samsung, Amazfit watches; Gymatic, Motra (Apple Watch) | yes, by wrist motion | — | — |
| Tiny voice apps (VoiceTick Counter, Burpee Counter, RepTalk, Copper's Corner, Liftly, EchoLift) | VoiceTick and Burpee Counter listen; others take spoken sets | yes | almost all iPhone only |

- **Does any app count reps by listening?** Only tiny ones. VoiceTick Counter (Oct 2025) has 2
  ratings averaging 3.0 and a "doesn't work" review. Burpee Counter listens for burpees only.
- **Spoken set logging** ("bench 90 kilos 8 reps") is a 2025–26 wave of small iPhone apps with no
  real traction. One has 7 upvotes on Product Hunt; another caps spoken logs at 100 a month on its
  cheap plan.
- **On Android, nobody does it.** That is an opening, and a warning that the problem is hard.
- Reddit could not be read (blocked). Hevy's and Strong's feature-request boards were not checked
  (the search allowance ran out). So member demand is **not proven** either way.

## Side-by-side
| | Fixes "lost count" | Logs hands-free | Music unharmed | Silent counters | Reach in Indian gyms | Effort | Money |
|---|---|---|---|---|---|---|---|
| 1. Listen (phone mic) | yes | yes ("done") | yes | no | anyone who counts aloud, phone nearby | test 3–5 days; full +1–2 weeks | none |
| 1b. Listen (earbud mic) | yes | yes | **no** (call quality) | no | earbud owners | same | none |
| 2. Watch motion | partly (arms) | yes | yes | yes | few (Wear OS only) | weeks | none |
| 3. Camera | partly | no | — | yes | poor in a crowded gym | weeks | none |
| 4. Count for me | partly (pace guide) | no | yes (brief dip) | yes | everyone with earbuds | 3–4 days | none |
| 5. Earbud button | — | — | **breaks music buttons** | — | — | — | — |
| 5b. Watch reps fix before Done | no | yes | yes | yes | watch owners | 2–3 days | none |

---

## Recommendation

### The recommended design: "Count my reps" (what the member sees and does)
1. In the workout screen's settings the member finds **Count my reps**, with two choices:
   **Listen to my count** and **Count for me**. Both are off at first.
2. They turn on **Listen to my count**. A short sheet explains it in plain words: "While a set is
   running, ForgeAI listens for your numbers and 'done', on this phone only. Nothing is recorded,
   saved or sent." Only then does Android ask for the mic. The member picks English or Hindi
   counting. If the phone lacks the offline speech pack, the sheet offers the download first.
3. The member starts a set and counts aloud as usual. Music plays in the earbuds as normal. The phone
   is on the bench or the floor.
4. The next set row shows the heard count, **large**: "7". The watch shows it too. If the member
   blanks, a glance tells them where they are. As an option, the app can quietly say each number back
   in the earbuds.
5. The member says **"done"** (or "ho gaya", or "bas"). The set is ticked with the heard reps and the
   weight already on the row. The normal rest timer starts. The earbuds say "ten, logged".
6. A bar shows "Logged 10 reps from your voice — **Change** / **Undo**". If the member never says
   "done", nothing ticks by itself. Their ✓ simply uses the heard count.
7. With the screen locked, listening carries on (a "Listening for your count" notification) until
   the workout ends or they turn it off.
8. Members who count in their head pick **Count for me** instead. The app counts aloud at their
   chosen pace, per exercise, in English or Hindi.
9. Watch owners can fix the reps on the watch before pressing Done.

### Smallest first version (a test, for the owner's own workouts)
- **Listen to my count**, with the **screen on and the app open** only. No screen-off service yet,
  and no Play declaration yet.
- Phone mic only. Google's on-phone recogniser through the library already in the app, set to
  "must stay on this phone". Android 13 and up.
- English and Hindi number words, the order rule, "done / ho gaya / bas" to tick, and the Undo bar.
- A private hit-rate log on the phone: for each set, the heard count against the reps finally saved,
  and how many numbers were heard.
- **Pass bar:** 9 of 10 sets right over 3 real workouts in his gym, with music playing in his
  earbuds, music still full quality, and no ticks caused by other people's counting.
- If it passes: build screen-off listening, then Count for me, then the watch reps fix. If it fails
  on noise: try Vosk with a locked word list before giving up.
- Cost: about 3–5 days of my work. No money.

### What needs the owner's decision
1. **Bring the microphone permission back** (removed before launch on purpose). The Play listing will
   then show "Microphone". It is asked only when a member turns listening on. *Recommended: yes.*
2. **The privacy wording**: the explanation sheet, the Android permission line, and a new paragraph in
   the privacy notice (English and Hindi). Draft: "ForgeAI listens only while a set is running, and
   only for your numbers and 'done'. The sound is turned into numbers on this phone and thrown away at
   once. Nothing is recorded, saved or sent." Hindi draft: "ForgeAI सिर्फ़ सेट चलते समय आपकी गिनती
   और 'done' सुनता है। आवाज़ इसी फ़ोन पर अंकों में बदलकर तुरंत मिटा दी जाती है। कुछ भी रिकॉर्ड, सेव
   या कहीं भेजा नहीं जाता।"
3. **Before Play launch** (only if screen-off listening ships): file the Play Console declaration for
   the microphone service, with a short video of turning it on. It is free, but it is his account.
4. **If Vosk is needed:** the app grows by about 36–42 MB per language, unless the language is
   downloaded on first use. *Recommended: download on first use.*
5. **The voice for Count for me:** the phone's free built-in voice (no cost), or a real Indian
   trainer recorded saying the numbers (may cost a fee and needs their written consent).
   *Recommended: free voice first.*

No step needs money unless he picks a recorded trainer's voice.

### What I would NOT build, and why
- **The earbud mic as the default.** On ordinary Bluetooth earbuds it turns music into phone-call
  sound for as long as it listens. Most members train with music.
- **Cloud speech recognition.** It breaks "your workouts stay on this phone", costs money per minute,
  and fails in basement gyms with no signal.
- **Whisper on the phone.** Too heavy for budget phones (75 MB plus about 273 MB of memory) and not
  made for live counting.
- **Our own watch motion counter.** Published studies and user complaints show large errors,
  especially on legs and machines. The owner's own Pixel Watch 4 has no rep counting. Few Indian
  members have a Wear OS watch.
- **Camera counting.** Crowded floors, mirrors, people walking through the shot, and a phone on the
  floor. Even home-fitness makers struggle with it.
- **Earbud-button counting.** Android gives those presses to the music app. Taking them breaks the
  member's music controls.
- **Side-button counting with the screen locked.** It needs the accessibility service, which Play
  restricts for non-accessibility apps. With the screen on, hands are on the bar anyway.
- **Ticking a set on silence.** Rest-pause sets, and chatting mid-set, would log wrong sets. A
  guess about the member must stay visible and undoable.
- **Earbud head-motion counting.** Erratic when Jabra tried it, and budget earbuds give Android no
  motion data.

## What I could not check
- Reddit (blocked), Hevy's and Strong's feature-request boards, and the Play Store pages of
  Android-only apps (the web-search allowance ran out mid-research).
- A market-share figure for Wear OS watches in India.
- Whether Google's offline Hindi speech pack is on typical budget phones. The test build checks this
  on the phone (the library can list installed offline languages).
- Real accuracy and battery in a gym. Only the test build can show these.

## Sources
**Android and Google Play (official)**
- LE Audio vs classic Bluetooth, mic lowers audio quality: https://developer.android.com/develop/connectivity/bluetooth/ble-audio/overview
- Earbud-mic (SCO) channel: mono, 8 kHz, apps must ask for it (`startBluetoothSco` notes): https://developer.android.com/reference/android/media/AudioManager#startBluetoothSco() (text read from https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/main/media/java/android/media/AudioManager.java)
- Microphone foreground service type: https://developer.android.com/develop/background-work/services/fgs/service-types
- Cannot start a mic service from the background (Android 14+): https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Foreground service started in the background cannot use the mic: https://developer.android.com/about/versions/11/privacy/foreground-services
- Mic privacy dot and the quick-settings mic block: https://developer.android.com/training/permissions/explaining-access
- Media (earbud) button routing: https://developer.android.com/media/legacy/media-buttons
- Music ducking for short sounds: https://developer.android.com/media/optimize/audio-focus
- Play foreground service declaration (video required): https://support.google.com/googleplay/android-developer/answer/13392821
- Play Data safety, on-device processing is not "collected": https://support.google.com/googleplay/android-developer/answer/10787469
- Play accessibility service policy: https://support.google.com/googleplay/android-developer/answer/10964491
- Wear OS Health Services rep count data type: https://raw.githubusercontent.com/androidx/androidx/androidx-main/health/health-services-client/src/main/java/androidx/health/services/client/data/DataType.kt

**Speech engines**
- expo-speech-recognition (the library already in the app): https://github.com/jamsch/expo-speech-recognition
- Vosk models (sizes, Hindi, Indian English, licence): https://alphacephei.com/vosk/models
- whisper.cpp (model sizes, licence): https://github.com/ggml-org/whisper.cpp

**Competitor apps**
- Hevy features: https://www.hevyapp.com/features/track-workouts/
- Strong (App Store): https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
- JEFIT watch-logging comparison (Strong, Gravitus, Setgraph watch support; RepCount noise claim): https://www.jefit.com/blog/best-apps-to-log-sets-and-reps-on-smartwatch-in-2026-top-7-tested
- Fitbod on Wear OS: https://help.fitbod.me/hc/en-us/articles/4406074415383-WearOS-on-Android
- Fitbod AirPods head-gesture logging: https://help.fitbod.me/hc/en-us/articles/360056464934-Apple-AirPod-Pros
- Alpha Progression (App Store): https://apps.apple.com/app/id1462277793
- Boostcamp vs Hevy: https://www.boostcamp.app/vs/hevy
- Gymaholic: https://apps.apple.com/us/app/gymaholic-workout-tracker/id648518560
- SmartGym watch double-tap: https://smartgymapp.com/watch
- cult.fit (App Store): https://apps.apple.com/app/id1217794588
- cult.fit energy meter: https://support.cure.fit/support/solutions/articles/25000023142-how-does-the-energy-meter-work-
- cult.fit wrong energy score: https://support.cure.fit/support/solutions/articles/25000023174-why-do-i-sometimes-see-an-incorrect-energy-score-
- HealthifyMe Ria live voice (Dec 2025): https://techcrunch.com/2025/12/02/healthify-upgrades-its-ai-assistant-ria-with-real-time-conversation-capabilities
- Tonal rep counting: https://knowledge.tonal.com/kb/guide/en/counting-reps-sLCcF9dwds/Steps/4064908

**Voice counting and voice logging apps**
- VoiceTick Counter: https://apps.apple.com/us/app/-/id6753144792
- Burpee Counter (mic): https://apps.appfollow.io/ios/burpee-counter-the-only-workout-tracker-that-tracks-your-reps-with-your-microphone/964018368
- RepTalk: https://apps.apple.com/app/id6759191361
- Copper's Corner: https://apps.apple.com/us/app/coppers-corner/id6745196643
- Liftly (Product Hunt): https://www.producthunt.com/products/liftly-voice-powered-workout-logging
- EchoLift (Product Hunt): https://www.producthunt.com/products/echolift-voice-gym-tracker
- Gemini Live fitness prototype and noise: https://dev.to/prema_ananda/building-a-hands-free-ai-fitness-applet-with-gemini-live-api-3fg1
- Rep Counter: Voice Workout (tempo voice): https://apps.apple.com/app/id6770425695
- Repko tempo + voice commands: https://repko.featurebase.app/changelog/repko-10-is-live-hands-free-tempo-training-for-serious
- Metric tempo metronome: https://metric.coach/docs/tempo-metronome

**Motion counting**
- Garmin manual, leg exercises may not be counted: https://www8.garmin.com/manuals/webhelp/forerunner945/EN-US/GUID-7C8D56F5-E9F5-4825-9F66-3CC9124B2979.html
- Garmin accuracy study (2023): https://digitalcommons.wku.edu/ijesab/vol14/iss3/143
- Garmin forum complaints: https://forums.garmin.com/sports-fitness/healthandwellness/f/venu-2/281985/strength-training-inaccuracy
- Samsung Galaxy Watch rep counting (21 exercises): https://developer.samsung.com/health/blog/en/2022/02/16/tracking-exercises-with-galaxy-watch
- Samsung community complaint: https://eu.community.samsung.com/t5/wearables/galaxy-watch-4-classic-rep-tracking-is-not-a-very-accurate/td-p/4955247
- Galaxy Watch gym guide (cables, isolation, tempo): https://evezone.evetech.co.za/quick-bytes/samsung-galaxy-watch-for-gym-training-is-it-the-right-choice
- Apple Watch study (Oberhofer 2021): https://pmc.ncbi.nlm.nih.gov/articles/PMC8471343
- Atlas band agreement study: https://digitalcommons.wku.edu/ijesab/vol8/iss7/55
- Atlas speed dependence: https://experts.boisestate.edu/en/publications/validity-of-a-wrist-worn-activity-monitor-during-resistance-train/
- RecoFit (Microsoft Research): https://www.microsoft.com/en-us/research/publication/recofit-using-wearable-sensor-find-recognize-count-repetitive-exercises/
- Whoop workout detection: https://www.whoop.com/ae/en/thelocker/how-whoop-detects-and-labels-your-workouts-activities/
- Pixel Watch 4 review (no rep counting): https://www.womanandhome.com/health-wellbeing/fitness/google-pixel-watch-4-review/
- Gymatic reviews: https://apps.apple.com/us/app/gymatic-workout-tracker/id1036069872
- Motra reviews: https://apps.apple.com/il/app/id1548577496

**Camera counting and earbud motion**
- Tempo camera limits: https://support.tempo.fit/support/solutions/articles/151000154714-3d-tempo-vision-form-feedback
- Tempo Move review (child in frame): https://connectthewatts.com/2021/12/23/tempo-move-review-iphone-powered-fitness-for-great-value-with-an-even-better-design/
- Peloton Guide overcounting: https://www.pelobuddy.com/?p=21310
- Google ML Kit pose classification / rep counting: https://developers.google.com/ml-kit/vision/pose-detection/classifying-poses
- Camera setup study (JMIR 2026): https://mhealth.jmir.org/2026/1/e82412/
- Jabra Sport Coach earbud rep counting review: https://www.engadget.com/2016-10-29-jabra-sport-coach-headphones-review.html
