#!/usr/bin/env bash
# Phase 1 device QA on a cloud Android emulator. Called by .github/workflows/qa-device.yml
# from inside the emulator runner. Everything it sees lands in qa-out/ (uploaded as an
# artifact): Maestro screenshots, the notification list after the rest, logcat, timings.
#
# Usage: run-device-qa.sh <path-to-apk>
set -u
APK="$1"
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${QA_OUT:-$PWD/qa-out}"
PKG=com.forgeai.app
mkdir -p "$OUT"
export PATH="$PATH:$HOME/.maestro/bin"
status=0

log() { echo "[qa] $*" | tee -a "$OUT/timeline.txt"; }
now_ms() { adb shell date +%s%3N | tr -d '\r'; }
# A part's Maestro driver can still hold its port right after the part ends; the next session
# then fails "Failed to bind to address" before its first step. Stop it and let it go.
free_maestro() {
  adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
  adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
  sleep 10
}
# A fixture that did not reach the phone fails the run here, by name, instead of failing the
# part that needs it somewhere confusing later (audit QA-30).
push_fixture() {
  if ! adb push "$1" "$2" >/dev/null 2>&1; then log "FIXTURE PUSH FAILED: $1 -> $2"; status=1; fi
}
# Print how many media-store rows (content://media/external/$4) have $1 in their name, waiting
# up to $3 s for at least $2 of them. Replaces a fixed sleep before the picker steps.
wait_media() {
  local n=0 i
  for i in $(seq 1 "$3"); do
    n=$(adb shell content query --uri "content://media/external/$4" --projection _display_name 2>/dev/null | grep -c "$1")
    [ "$n" -ge "$2" ] && break
    sleep 1
  done
  echo "$n"
}

log "device: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
adb install -r "$APK" || { log "INSTALL FAILED"; exit 1; }
# A freshly booted emulator can still be busy; its launcher sometimes throws an
# "isn't responding" box over the app. Let it settle, then clear system dialogs.
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb logcat -c
# Allow exact alarms ("Alarms & reminders") so the locked-phone rest alert below is measured on
# the exact path and can be gated on lateness (audit QA-15). Read back again during the rest,
# because part A's clearState may reset it.
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow >/dev/null 2>&1 || log "could not allow exact alarms"
log "exact alarm permission before part A: $(adb shell appops get $PKG SCHEDULE_EXACT_ALARM | tr -d '\r' | tr '\n' ' ')"

# ---------------------------------------------------------------- part A
log "part A start"
maestro test --format junit --output "$OUT/part-a.xml" --test-output-dir "$OUT/part-a" "$QA_DIR/phase1-a.yaml" \
  > "$OUT/part-a.log" 2>&1 || { status=1; log "PART A FAILED"; }
TICK_MS=$(now_ms)
log "rest (30s) started at about device ms $TICK_MS"
log "exact alarm permission during the rest: $(adb shell appops get $PKG SCHEDULE_EXACT_ALARM | tr -d '\r' | tr '\n' ' ')"
adb shell dumpsys notification --noredact > "$OUT/notifications-during-rest.txt"
adb exec-out screencap -p > "$OUT/a-end.png"

# Phone goes to sleep for the rest, like a phone on the gym floor.
adb shell input keyevent KEYCODE_SLEEP
log "screen off"
sleep 50
adb shell dumpsys notification --noredact > "$OUT/notifications-after-rest.txt"
adb shell dumpsys alarm | grep -i -A3 "$PKG" > "$OUT/alarms.txt" || true
# Which way the end of the rest went (RestCard.kt logs it under the tag ForgeRest): run 38081757903
# had the alarm on time but no "Rest is over" 50 s later, and no log of that window. Saved now,
# before part B's Maestro clears logcat.
adb logcat -d -v time > "$OUT/a-rest-logcat.txt" 2>/dev/null || true
log "rest end path (ForgeRest lines): $(grep 'ForgeRest' "$OUT/a-rest-logcat.txt" 2>/dev/null | sed 's/^.*ForgeRest[^:]*: //' | tr '\n' ';' | cut -c1-600)"
adb shell input keyevent KEYCODE_WAKEUP
sleep 1
adb shell wm dismiss-keyguard || true
log "screen on"

# When did "Rest is over" post, compared with when it was due (the rest card's end time, read
# from the dump taken during the rest)? Fails when more than REST_LATE_BUDGET_S (5 s) late.
python3 "$QA_DIR/notif.py" over-locked "$OUT/notifications-after-rest.txt" "$TICK_MS" "$OUT/notifications-during-rest.txt" >> "$OUT/timeline.txt" || status=1
python3 "$QA_DIR/notif.py" ongoing "$OUT/notifications-after-rest.txt" >> "$OUT/timeline.txt" || status=1
# v0.26.1: the rest card was showing during the rest (what a paired watch would show); Phase 6:
# with its three buttons in the order Done, +15 s, Skip (the next set exists, so Done shows).
python3 "$QA_DIR/notif.py" card "$OUT/notifications-during-rest.txt" "Rest 0:30" >> "$OUT/timeline.txt" || status=1

# ---------------------------------------------------------------- part B
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > "$OUT/b-shade.png"
log "part B start"
maestro test --format junit --output "$OUT/part-b.xml" --test-output-dir "$OUT/part-b" "$QA_DIR/phase1-b.yaml" \
  > "$OUT/part-b.log" 2>&1 || { status=1; log "PART B FAILED"; }

# ---------------------------------------------------------------- part C (Phase 2 exercises)
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
# Part B's Maestro driver can still hold its port right after B ends; a third session then
# fails "Failed to bind to address :36609" before its first step. Stop it and let it go.
free_maestro
log "part C start"
maestro test --format junit --output "$OUT/part-c.xml" --test-output-dir "$OUT/part-c" "$QA_DIR/phase2-c.yaml" \
  > "$OUT/part-c.log" 2>&1 || { status=1; log "PART C FAILED"; }

# ---------------------------------------------------------------- part D (Phase 3 progress)
# Two SAMPLE pictures in the phone's gallery for the progress-photo steps (they say "Sample
# photo" on them). Media scan so Android's photo picker lists them.
push_fixture "$QA_DIR/fixtures/sample-progress-1.png" /sdcard/Pictures/forgeai-sample-1.png
push_fixture "$QA_DIR/fixtures/sample-progress-2.png" /sdcard/Pictures/forgeai-sample-2.png
for f in forgeai-sample-1.png forgeai-sample-2.png; do
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/$f" >/dev/null 2>&1 || true
done
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "media store: $(wait_media forgeai-sample 2 20 images/media) sample pictures"
free_maestro
log "part D start"
maestro test --format junit --output "$OUT/part-d.xml" --test-output-dir "$OUT/part-d" "$QA_DIR/phase3-d.yaml" \
  > "$OUT/part-d.log" 2>&1 || { status=1; log "PART D FAILED"; }

# ---------------------------------------------------------------- part E (records live + share)
free_maestro
log "part E start"
maestro test --format junit --output "$OUT/part-e.xml" --test-output-dir "$OUT/part-e" "$QA_DIR/phase3-e.yaml" \
  > "$OUT/part-e.log" 2>&1 || { status=1; log "PART E FAILED"; }

# ---------------------------------------------------------------- part F (v0.25.1: figure + best pace)
free_maestro
log "part F start"
maestro test --format junit --output "$OUT/part-f.xml" --test-output-dir "$OUT/part-f" "$QA_DIR/v0251-f.yaml" \
  > "$OUT/part-f.log" 2>&1 || { status=1; log "PART F FAILED"; }

# ---------------------------------------------------------------- part G (v0.26.0: routines and plans)
# A routine file "someone shared", in Downloads, for the import steps.
push_fixture "$QA_DIR/fixtures/qa-shared.forgeai.json" /sdcard/Download/qa-shared.forgeai.json
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/qa-shared.forgeai.json" >/dev/null 2>&1 || true
# The broadcast is a no-op on newer Android; a volume scan makes the file picker list it (as for part D's photos).
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "downloads: $(wait_media qa-shared 1 20 downloads) routine file"
free_maestro
log "part G start"
maestro test --format junit --output "$OUT/part-g.xml" --test-output-dir "$OUT/part-g" "$QA_DIR/v0260-g.yaml"   > "$OUT/part-g.log" 2>&1 || { status=1; log "PART G FAILED"; }

# ---------------------------------------------------------------- part H (v0.26.1: the watch's rest card)
# The cloud phone cannot pair a watch. A watch shows exactly the phone's swipe-away alerts and
# runs their buttons on the phone, so the card, its buttons and the end alert are proven here.
free_maestro
log "part H1 start"
maestro test --format junit --output "$OUT/part-h1.xml" --test-output-dir "$OUT/part-h1" "$QA_DIR/v0261-h.yaml" \
  > "$OUT/part-h1.log" 2>&1 || { status=1; log "PART H1 FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-card-after-plus15.txt"
# The card must be swipe-away (no ongoing / no-clear flag), on its Phase 2 channel (rest-card-v2,
# no sound), with its three buttons in the order Done, +15 s, Skip (Phase 6). Its shade view
# counts down; notif.py reads the title it still sets.
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-plus15.txt" "Rest 3:15" "Barbell Bench Press, set 2" >> "$OUT/timeline.txt" || status=1
# Phase 6: "Done" on that card, from the shade (still open), with the app in the background:
# set 2 is ticked and its rest starts, so the card comes back as "Rest 3:00" naming set 3; the
# app, opened again, shows it. H2 then uses THIS card's Skip.
free_maestro
log "part H1D start"
maestro test --format junit --output "$OUT/part-h1d.xml" --test-output-dir "$OUT/part-h1d" "$QA_DIR/v0261-h1d.yaml"   > "$OUT/part-h1d.log" 2>&1 || { status=1; log "PART H1D FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-card-after-done.txt"
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-done.txt" "Rest 3:00" "Barbell Bench Press, set 3" >> "$OUT/timeline.txt" || status=1
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_HOME
sleep 3
# Android stops a background app to save memory; the card's buttons must still work.
adb shell am kill "$PKG"
sleep 3
log "app process after kill: '$(adb shell pidof $PKG | tr -d '\r')' (empty = stopped)"
free_maestro
log "part H2 start"
maestro test --format junit --output "$OUT/part-h2.xml" --test-output-dir "$OUT/part-h2" "$QA_DIR/v0261-h2.yaml" \
  > "$OUT/part-h2.log" 2>&1 || { status=1; log "PART H2 FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-after-rest-app-open.txt"
adb logcat -d -v time > "$OUT/h2-rest-logcat.txt" 2>/dev/null || true
log "H2 rest end path (ForgeRest lines): $(grep 'ForgeRest' "$OUT/h2-rest-logcat.txt" 2>/dev/null | sed 's/^.*ForgeRest[^:]*: //' | tr '\n' ';' | cut -c1-600)"
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > "$OUT/h-117-shade-rest-over.png"
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
python3 "$QA_DIR/notif.py" over-open "$OUT/h-after-rest-app-open.txt" >> "$OUT/timeline.txt" || status=1

# ---------------------------------------------------------------- part I (v0.27.0: the rest of Phase 5)
# A Strong export "someone made" (older layout, pounds and miles), in Downloads, for the import.
push_fixture "$QA_DIR/fixtures/qa-strong.csv" /sdcard/Download/qa-strong.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
free_maestro
log "part I start"
maestro test --format junit --output "$OUT/part-i.xml" --test-output-dir "$OUT/part-i" "$QA_DIR/v0270-i.yaml"   > "$OUT/part-i.log" 2>&1 || { status=1; log "PART I FAILED"; }
# The reminders the app set (expo keeps them as alarms) and the widget the home screen holds.
# NB: a count of dumpsys LINES that mention the app, not a count of alarms (audit QA-27).
adb shell dumpsys alarm | grep -c "com.forgeai.app" > "$OUT/i-alarm-count.txt" 2>/dev/null || true
log "dumpsys alarm lines mentioning the app after part I (not an alarm count): $(cat "$OUT/i-alarm-count.txt" 2>/dev/null)"
adb shell dumpsys appwidget > "$OUT/i-appwidget.txt" 2>/dev/null || true
log "home-screen widget list saved (i-appwidget.txt); ForgeAI widget lines: $(grep -c 'com.forgeai.phone.TodayWidget' "$OUT/i-appwidget.txt" 2>/dev/null)"

# ---------------------------------------------------------------- widget link (audit Phase 6, PH-09)
# The Today widget's Start / Resume opens forgeai://workout/start?routine=<id> (plus the widget's
# own secret token). A link WITHOUT that token never starts a workout by itself, and one with no
# routine, or a routine that does not exist, lands on the Workout tab. Here: the app idle (part I
# finished its workout, none is open), the link opened with adb, then a short Maestro part
# (phase6-link.yaml) reads the screen: "Start empty workout", and no open workout's texts. Also
# no "Workout in progress" notification may appear (notif.py no-ongoing, dumps before and after).
# Part I2 starts the app afresh after this, so the screen it leaves does not matter.
widget_link() {
  local name="$1" url="$2" before="$OUT/link-$1-notif-before.txt" after="$OUT/link-$1-notif-after.txt" res bad=""
  adb shell input keyevent KEYCODE_HOME
  sleep 2
  adb shell dumpsys notification --noredact > "$before"
  free_maestro
  res=$(adb shell am start -W -a android.intent.action.VIEW -d "\"$url\"" "$PKG" 2>&1 | tr -d '\r')
  echo "$res" > "$OUT/link-$name-am.txt"
  log "WIDGET LINK $name: am start -W $url -> $(echo "$res" | grep -E '^(Status|Error|Warning)' | tr '\n' ' ')"
  sleep 5
  log "part link$name start"
  maestro test --format junit --output "$OUT/part-link$name.xml" --test-output-dir "$OUT/part-link$name" "$QA_DIR/phase6-link.yaml" \
    > "$OUT/part-link$name.log" 2>&1 || { status=1; log "PART LINK$(echo "$name" | tr '[:lower:]' '[:upper:]') FAILED"; bad="the Workout tab did not show, or an open workout did (part-link$name.log, link-$name.png)"; }
  adb exec-out screencap -p > "$OUT/link-$name.png"
  adb shell dumpsys notification --noredact > "$after"
  if echo "$res" | grep -qiE "^Error|unable to resolve"; then
    bad="${bad:+$bad; }the link did not open ForgeAI ($(echo "$res" | grep -iE '^Error|unable to resolve' | head -1))"
  fi
  # A "Workout in progress" card that was not there before the link = a workout was started.
  if python3 "$QA_DIR/notif.py" no-ongoing "$before" > /dev/null; then
    python3 "$QA_DIR/notif.py" no-ongoing "$after" > /dev/null || bad="${bad:+$bad; }a \"Workout in progress\" notification appeared after the link"
  else
    log "WIDGET LINK $name: note, a \"Workout in progress\" notification was already showing before the link (none should be after part I)"
  fi
  if [ -n "$bad" ]; then
    log "WIDGET LINK $name FAILED: $url: $bad"
    status=1
  else
    log "WIDGET LINK $name: $url opened the Workout tab and started nothing"
  fi
}
widget_link 1 "forgeai://workout/start"
widget_link 2 "forgeai://workout/start?routine=not-a-routine"
free_maestro
adb shell input keyevent KEYCODE_HOME

# ---------------------------------------------------------------- part I2 (audit Phase 6, PH-01: notifications off)
# Notifications blocked for ForgeAI: Profile's reminders row says so and offers "Turn on
# notifications". Blocked here by taking the notification permission away (Android stops the app);
# given back right after, for the parts that follow.
adb shell pm revoke "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/i2-revoke.txt" 2>&1 || log "NOTIFICATIONS OFF: could not revoke the permission ($(tr -d '\r' < "$OUT/i2-revoke.txt"))"
sleep 2
free_maestro
log "part I2 start"
maestro test --format junit --output "$OUT/part-i2.xml" --test-output-dir "$OUT/part-i2" "$QA_DIR/phase6-i2.yaml"   > "$OUT/part-i2.log" 2>&1 || { status=1; log "PART I2 FAILED"; }
adb shell pm clear-permission-flags "$PKG" android.permission.POST_NOTIFICATIONS user-set user-fixed >/dev/null 2>&1 || true
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/i2-grant.txt" 2>&1 || true
if adb shell dumpsys package "$PKG" | tr -d '\r' | grep -q "android.permission.POST_NOTIFICATIONS: granted=true"; then
  log "NOTIFICATIONS OFF: permission given back after part I2"
else
  log "NOTIFICATIONS OFF FAILED: the notification permission could not be given back ($(tr -d '\r' < "$OUT/i2-grant.txt"))"
  status=1
fi
adb shell input keyevent KEYCODE_HOME

# ---------------------------------------------------------------- part J (v0.28.0: the member's own Hevy routines)
# A real-format Hevy .csv (text dates) with two routines, free workouts and an old name.
push_fixture "$QA_DIR/fixtures/qa-hevy.csv" /sdcard/Download/qa-hevy.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
free_maestro
log "part J start"
maestro test --format junit --output "$OUT/part-j.xml" --test-output-dir "$OUT/part-j" "$QA_DIR/v0280-j.yaml"   > "$OUT/part-j.log" 2>&1 || { status=1; log "PART J FAILED"; }

# ---------------------------------------------------------------- part K (v0.28.0: an export shared to ForgeAI)
# The Files app, as a person shares a file (qa-hevy.csv was pushed to Downloads for part J).
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
adb shell am start -n com.google.android.documentsui/com.android.documentsui.files.FilesActivity > "$OUT/k-files.txt" 2>&1   || adb shell am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/root/primary" >> "$OUT/k-files.txt" 2>&1   || log "FILES APP DID NOT OPEN"
sleep 8
log "part K start"
maestro test --format junit --output "$OUT/part-k.xml" --test-output-dir "$OUT/part-k" "$QA_DIR/v0280-k.yaml"   > "$OUT/part-k.log" 2>&1 || { status=1; log "PART K FAILED"; }
adb logcat -d -s ForgeShare:W > "$OUT/k-share-log.txt" 2>/dev/null || true
log "share errors logged: $(grep -c 'ForgeShare' "$OUT/k-share-log.txt" 2>/dev/null)"

# ---------------------------------------------------------------- part L (v0.29.0: Import routines from a Hevy link)
# Reads the owner's public Hevy folder on hevy.com in the app's hidden in-app browser (needs the internet).
# Audit Phase 4: first his Hevy HISTORY of those routines (two rounds of Push 1 → … → Leg 2), so
# the folder takes his real rotation and Today after Push 1 is Pull 1, as on his phone.
push_fixture "$QA_DIR/fixtures/qa-jaipur.csv" /sdcard/Download/qa-jaipur.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "downloads: $(wait_media qa-jaipur 1 20 downloads) Jaipur history file"
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
log "part L start"
maestro test --format junit --output "$OUT/part-l.xml" --test-output-dir "$OUT/part-l" "$QA_DIR/v0290-l.yaml"   > "$OUT/part-l.log" 2>&1 || { status=1; log "PART L FAILED"; }

# ---------------------------------------------------------------- part N (audit Phase 3: History holds everything)
# List / Calendar / search across years (part J's March 2024 Hevy workouts), an old workout's
# edit asks before Back throws it away, Log a past workout. Saves nothing, so part M's count holds.
free_maestro
log "part N start"
maestro test --format junit --output "$OUT/part-n.xml" --test-output-dir "$OUT/part-n" "$QA_DIR/audit3-n.yaml" \
  > "$OUT/part-n.log" 2>&1 || { status=1; log "PART N FAILED"; }

# ---------------------------------------------------------------- part P7 (audit Phase 7: large text)
# The phone's font size at its largest step (font_scale 2.0, Android 14's top setting) and the app
# restarted, then a screen tour (phase7-bigtext.yaml): Home, the Workout tab, an open workout with
# a set row (an empty workout with one exercise, then discarded: nothing saved), History, Progress,
# Profile and its fold, each photographed (p7-big-<nav>-*.png, also gathered in qa-out/p7-big/).
# Run once with the emulator's gesture navigation (part P7BIG) and once with Android's 3-button
# bar (part P7NAV3) when this image can switch to it by adb. Font size and navigation are put
# back before part M. Saves nothing, so part M's workout count is not changed by this part.
P7_SHOTS=8   # screenshots every tour takes, whichever way its workout step goes
p7_font() { adb shell settings get system font_scale 2>/dev/null | tr -d '\r'; }
# 0 = 3-button, 1 = 2-button, 2 = gestures (Android's own setting, kept in step with the overlay).
p7_nav() { adb shell settings get secure navigation_mode 2>/dev/null | tr -d '\r'; }
p7_overlay_on() { adb shell cmd overlay list 2>/dev/null | tr -d '\r' | grep -q "\[x\] *com.android.internal.systemui.navbar.$1\$"; }
p7_nav_to() {  # $1 = threebutton | twobutton | gestural
  adb shell cmd overlay enable-exclusive --category "com.android.internal.systemui.navbar.$1" >/dev/null 2>&1 \
    || adb shell cmd overlay enable "com.android.internal.systemui.navbar.$1" >/dev/null 2>&1 || true
  sleep 8
  p7_overlay_on "$1"
}
p7_tour() {  # $1 = part name (p7big / p7nav3), $2 = navigation label for the screenshot names
  local n up
  up=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  free_maestro
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  log "part $1 start"
  maestro test -e NAV="$2" --format junit --output "$OUT/part-$1.xml" --test-output-dir "$OUT/part-$1" "$QA_DIR/phase7-bigtext.yaml" \
    > "$OUT/part-$1.log" 2>&1 || {
      status=1
      adb exec-out screencap -p > "$OUT/$1-failed.png"
      log "PART $up FAILED (large-text tour, $2 navigation, font scale $(p7_font)): part-$1.log, $1-failed.png"
    }
  # Maestro writes screenshots into the part's output folder (or, on an older Maestro, the
  # working folder): gather this tour's into qa-out/p7-big/ so they sit together in the artifact.
  mkdir -p "$OUT/p7-big"
  { find "$OUT/part-$1" -name "p7-big-$2-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "p7-big-$2-*.png" 2>/dev/null; } \
    | while read -r f; do cp "$f" "$OUT/p7-big/" 2>/dev/null; done
  n=$(find "$OUT/p7-big" -name "p7-big-$2-*.png" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" -ge "$P7_SHOTS" ]; then
    log "BIG TEXT ($2 navigation): $n screenshots in qa-out/p7-big/"
  else
    log "BIG TEXT ($2 navigation): screenshots MISSING, $n of at least $P7_SHOTS in qa-out/p7-big/ (part-$1.log)"
  fi
}
p7_font_before=$(p7_font)
adb shell settings put system font_scale 2.0
sleep 3
if [ "$(p7_font)" = "2.0" ]; then
  log "BIG TEXT: font scale set to 2.0 (was '$p7_font_before')"
  p7_tour p7big gesture
  # 3-button navigation: an overlay on the emulator image; switched only when it is there.
  p7_nav_before=$(p7_nav)
  adb shell cmd overlay list 2>/dev/null | tr -d '\r' | grep -i "navbar" > "$OUT/p7-nav-overlays.txt" || true
  if grep -q "com.android.internal.systemui.navbar.threebutton" "$OUT/p7-nav-overlays.txt"; then
    if p7_nav_to threebutton; then
      log "THREE-BUTTON NAV: on (navigation_mode $(p7_nav), was '$p7_nav_before')"
      adb exec-out screencap -p > "$OUT/p7-nav3-bar.png"
      p7_tour p7nav3 3button
    else
      log "THREE-BUTTON NAV FAILED: the overlay would not switch on (navigation_mode $(p7_nav)); see p7-nav-overlays.txt"
      status=1
    fi
    # Back to what the phone had (gestures on this emulator; 2-button or 3-button if it said so).
    case "$p7_nav_before" in
      0) p7_back=threebutton ;;
      1) p7_back=twobutton ;;
      *) p7_back=gestural ;;
    esac
    if p7_nav_to "$p7_back"; then
      log "THREE-BUTTON NAV: put back to $p7_back (navigation_mode $(p7_nav))"
    else
      log "THREE-BUTTON NAV FAILED: could not put navigation back to $p7_back (navigation_mode $(p7_nav))"
      status=1
    fi
  else
    log "THREE-BUTTON NAV: this emulator image has no 3-button navigation overlay; that tour was not run (p7-nav-overlays.txt)"
  fi
else
  log "BIG TEXT FAILED: font scale did not change (reads '$(p7_font)'); the large-text tour was not run"
  status=1
fi
adb shell settings put system font_scale 1.0
sleep 3
if [ "$(p7_font)" = "1.0" ]; then
  log "BIG TEXT: font scale put back to 1.0"
else
  log "BIG TEXT FAILED: font scale could not be put back to 1.0 (reads '$(p7_font)')"
  status=1
fi
adb shell am force-stop "$PKG" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- part M (backup survives a reinstall)
# Android's own backup (the app's backup rules: the workout database, AsyncStorage, settings) into
# the emulator's LOCAL backup store, then uninstall + reinstall the SAME APK. The member's workouts
# must come back and the welcome screen must not show. Runs LAST: it wipes and reinstalls the app.
# Evidence: m-before-ui.xml, m-backupnow.txt, m-reinstall.txt, m-restore-events.txt, part-m*/.
m_fail() { log "PART M FAILED (backup survives a reinstall): $*"; status=1; }
# The database files as root sees them (google_apis images have su; empty when they don't).
m_files() { adb shell "su 0 ls /data/data/$PKG/files/SQLite/" 2>/dev/null | tr -d '\r' | tr '\n' ' '; }
part_m() {
  local out t res pkgline line restored="" ev i
  # 1. Backup on, and the local transport (so no Google account is needed).
  out=$(adb shell bmgr enabled 2>&1 | tr -d '\r')
  log "bmgr enabled: $out"
  if echo "$out" | grep -qiE "not activ|inactive"; then
    log "bmgr activate: $(adb shell bmgr activate true 2>&1 | tr -d '\r')"
    out=$(adb shell bmgr enabled 2>&1 | tr -d '\r')
  fi
  if ! echo "$out" | grep -q "currently enabled"; then
    log "bmgr enable: $(adb shell bmgr enable true 2>&1 | tr -d '\r')"
    sleep 2
    out=$(adb shell bmgr enabled 2>&1 | tr -d '\r')
    log "bmgr enabled: $out"
    echo "$out" | grep -q "currently enabled" || { m_fail "Android backup could not be switched on ($out)"; return 1; }
  fi
  out=$(adb shell bmgr list transports 2>&1 | tr -d '\r')
  log "backup transports (* = selected): $(echo "$out" | tr -s ' ' | tr '\n' ';')"
  # API 34 names it com.android.localtransport/.LocalTransport; old images android/com.android.internal.backup.LocalTransport.
  t=$(echo "$out" | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]*LocalTransport' | head -1)
  [ -n "$t" ] || { m_fail "this phone lists no local backup transport"; return 1; }
  for i in 1 2 3; do
    res=$(adb shell bmgr transport "$t" 2>&1 | tr -d '\r')
    echo "$res" | grep -q "Selected transport" && break
    sleep 3
  done
  log "bmgr transport: $res"
  echo "$res" | grep -q "Selected transport" || { m_fail "could not select $t ($res)"; return 1; }
  # "Automatic restore" (on by default on a phone) is what brings data back at install.
  res=$(adb shell settings get secure backup_auto_restore 2>/dev/null | tr -d '\r')
  if [ "$res" != "1" ]; then
    adb shell settings put secure backup_auto_restore 1 >/dev/null 2>&1 || true
    log "automatic restore was '$res'; set to 1 (a phone's default)"
  fi

  # 2. What must come back: Profile -> Backup's first line, e.g. "12 workouts".
  free_maestro
  maestro test --format junit --output "$OUT/part-m-record.xml" --test-output-dir "$OUT/part-m-record" "$QA_DIR/backup-m-record.yaml" \
    > "$OUT/part-m-record.log" 2>&1 || { m_fail "could not reach Profile -> Backup's workout count before the backup (part-m-record.log)"; return 1; }
  free_maestro
  adb shell uiautomator dump /sdcard/qa-m-before.xml >/dev/null 2>&1 || true
  adb pull /sdcard/qa-m-before.xml "$OUT/m-before-ui.xml" >/dev/null 2>&1 || true
  line=$(grep -oE '"[0-9]+ workouts?"' "$OUT/m-before-ui.xml" 2>/dev/null | head -1 | tr -d '"')
  if [ -z "$line" ]; then
    maestro hierarchy > "$OUT/m-before-hierarchy.json" 2>/dev/null || true
    line=$(grep -oE '"[0-9]+ workouts?"' "$OUT/m-before-hierarchy.json" 2>/dev/null | head -1 | tr -d '"')
    free_maestro
  fi
  [ -n "$line" ] || { m_fail "could not read the 'N workouts' line off Profile -> Backup (m-before-ui.xml)"; return 1; }
  log "BACKUP M: before the backup Profile shows '$line'"

  # 3. Back up now. The app goes to the background first (a foreground app can be skipped);
  # never force-stop it here: Android does not back up a stopped app.
  adb shell input keyevent KEYCODE_HOME
  sleep 2
  log "root probe before uninstall, files/SQLite: '$(m_files)' (empty = no root on this image)"
  for i in 1 2; do
    res=$(timeout 180 adb shell bmgr backupnow "$PKG" 2>&1 | tr -d '\r')
    printf '%s\n' "--- attempt $i" "$res" >> "$OUT/m-backupnow.txt"
    log "bmgr backupnow (attempt $i): $(echo "$res" | tr '\n' '|')"
    pkgline=$(echo "$res" | grep -E "Package $PKG with result" | head -1)
    if echo "$res" | grep -q "Backup finished with result: Success" && echo "$pkgline" | grep -q "result: Success"; then
      break
    fi
    pkgline="${pkgline:-$(echo "$res" | grep -v '^$' | tail -1)}"
    [ "$i" -eq 2 ] && { m_fail "backup did not succeed: ${pkgline:-no output from bmgr backupnow}"; return 1; }
    sleep 5
  done
  log "BACKUP M: backup finished: $pkgline"

  # 4. Uninstall, reinstall the same APK; Android restores at install.
  adb logcat -b events -c >/dev/null 2>&1 || true
  res=$(adb uninstall "$PKG" 2>&1 | tr -d '\r')
  log "uninstall: $res"
  echo "$res" | grep -q "Success" || { m_fail "uninstall failed ($res)"; return 1; }
  adb install "$APK" > "$OUT/m-reinstall.txt" 2>&1 || { m_fail "reinstall of $APK failed: $(tail -1 "$OUT/m-reinstall.txt" | tr -d '\r')"; return 1; }
  log "reinstalled $APK: $(tail -1 "$OUT/m-reinstall.txt" | tr -d '\r')"
  # Nothing has opened the app since, so a database on disk can only have come from the restore.
  for i in $(seq 1 15); do
    if m_files | grep -q "forgeai.db"; then restored="root probe sees: $(m_files)"; break; fi
    ev=$(adb logcat -b events -d 2>/dev/null | tr -d '\r' | grep -E "restore_|full_restore" | grep "$PKG" | head -1)
    if [ -n "$ev" ]; then restored="event log: $ev"; break; fi
    sleep 2
  done
  adb logcat -b events -d 2>/dev/null | grep -iE "restore|backup" > "$OUT/m-restore-events.txt" || true
  if [ -n "$restored" ]; then
    log "BACKUP M: restored at install ($restored)"
  else
    log "BACKUP M: restore at install NOT SEEN (no root probe hit, no restore event); fallback: bmgr restore $PKG"
    res=$(timeout 120 adb shell bmgr restore "$PKG" 2>&1 | tr -d '\r')
    log "bmgr restore: $(echo "$res" | tr '\n' '|')"
  fi

  # 5. Open the app: no welcome screen, the same workout count.
  free_maestro
  maestro test -e WORKOUTS_LINE="$line" --format junit --output "$OUT/part-m.xml" --test-output-dir "$OUT/part-m" "$QA_DIR/backup-m-after.yaml" \
    > "$OUT/part-m.log" 2>&1 || { adb exec-out screencap -p > "$OUT/m-after-failed.png"; m_fail "after the reinstall the app did not open on '$line' without the welcome screen (part-m.log, m-after-failed.png)"; return 1; }
  log "BACKUP M: '$line' came back after uninstall + reinstall"
}
log "part M start"
part_m

# ---------------------------------------------------------------- crash / ANR / JS-error check
# Maestro clears logcat when each part starts, so every part's own device log (in its
# test-output folder) is read, plus the final logcat and Android's dropbox, which keeps crash
# and ANR reports across logcat clears. Fails on: the app's Java crash (FATAL EXCEPTION for
# com.forgeai.app), a native crash (Fatal signal ... (com.forgeai.app)), "ANR in com.forgeai.app",
# an error-level React Native / JS line or an unhandled JS rejection, a Maestro crash/ANR report
# (audit QA-07, QA-08). Another app's crash or ANR on the emulator is not ours and is ignored.
adb logcat -d > "$OUT/logcat.txt"
# One tag per call: several search words on one dropbox command must ALL match an entry.
: > "$OUT/dropbox.txt"
for tag in data_app_crash data_app_native_crash data_app_anr; do
  adb shell dumpsys dropbox --print "$tag" >> "$OUT/dropbox.txt" 2>/dev/null || log "could not read dropbox $tag"
done
python3 "$QA_DIR/qa_report.py" scan "$OUT" | tee -a "$OUT/timeline.txt"
[ "${PIPESTATUS[0]}" -eq 0 ] || status=1
# Every step Maestro did not run (a conditional whose condition was false, an optional tap whose
# target was not on screen), as SKIPPED lines in the timeline (audit QA-10).
python3 "$QA_DIR/qa_report.py" skipped "$OUT" | tee -a "$OUT/timeline.txt"
log "done, status $status"
exit $status
