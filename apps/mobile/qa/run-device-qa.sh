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

log "device: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
adb install -r "$APK" || { log "INSTALL FAILED"; exit 1; }
# A freshly booted emulator can still be busy; its launcher sometimes throws an
# "isn't responding" box over the app. Let it settle, then clear system dialogs.
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb logcat -c
log "exact alarm permission: $(adb shell appops get $PKG SCHEDULE_EXACT_ALARM | tr -d '\r')"

# ---------------------------------------------------------------- part A
log "part A start"
maestro test --format junit --output "$OUT/part-a.xml" --test-output-dir "$OUT/part-a" "$QA_DIR/phase1-a.yaml" \
  > "$OUT/part-a.log" 2>&1 || { status=1; log "PART A FAILED"; }
TICK_MS=$(now_ms)
log "rest (30s) started at about device ms $TICK_MS"
adb shell dumpsys notification --noredact > "$OUT/notifications-during-rest.txt"
adb exec-out screencap -p > "$OUT/a-end.png"

# Phone goes to sleep for the rest, like a phone on the gym floor.
adb shell input keyevent KEYCODE_SLEEP
log "screen off"
sleep 50
adb shell dumpsys notification --noredact > "$OUT/notifications-after-rest.txt"
adb shell dumpsys alarm | grep -i -A3 "$PKG" > "$OUT/alarms.txt" || true
adb shell input keyevent KEYCODE_WAKEUP
sleep 1
adb shell wm dismiss-keyguard || true
log "screen on"

# When did "Rest is over" post, compared with when it was due (tick + 30 s)?
python3 "$QA_DIR/notif.py" over-locked "$OUT/notifications-after-rest.txt" "$TICK_MS" >> "$OUT/timeline.txt" || status=1
python3 "$QA_DIR/notif.py" ongoing "$OUT/notifications-after-rest.txt" >> "$OUT/timeline.txt" || status=1
# v0.26.1: the rest card was showing during the rest (what a paired watch would show).
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
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part C start"
maestro test --format junit --output "$OUT/part-c.xml" --test-output-dir "$OUT/part-c" "$QA_DIR/phase2-c.yaml" \
  > "$OUT/part-c.log" 2>&1 || { status=1; log "PART C FAILED"; }

# ---------------------------------------------------------------- part D (Phase 3 progress)
# Two SAMPLE pictures in the phone's gallery for the progress-photo steps (they say "Sample
# photo" on them). Media scan so Android's photo picker lists them.
adb push "$QA_DIR/fixtures/sample-progress-1.png" /sdcard/Pictures/forgeai-sample-1.png >/dev/null 2>&1 || log "PUSH SAMPLE 1 FAILED"
adb push "$QA_DIR/fixtures/sample-progress-2.png" /sdcard/Pictures/forgeai-sample-2.png >/dev/null 2>&1 || log "PUSH SAMPLE 2 FAILED"
for f in forgeai-sample-1.png forgeai-sample-2.png; do
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/$f" >/dev/null 2>&1 || true
done
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
sleep 5
log "media store: $(adb shell content query --uri content://media/external/images/media --projection _display_name 2>/dev/null | grep -c forgeai-sample) sample pictures"
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part D start"
maestro test --format junit --output "$OUT/part-d.xml" --test-output-dir "$OUT/part-d" "$QA_DIR/phase3-d.yaml" \
  > "$OUT/part-d.log" 2>&1 || { status=1; log "PART D FAILED"; }

# ---------------------------------------------------------------- part E (records live + share)
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part E start"
maestro test --format junit --output "$OUT/part-e.xml" --test-output-dir "$OUT/part-e" "$QA_DIR/phase3-e.yaml" \
  > "$OUT/part-e.log" 2>&1 || { status=1; log "PART E FAILED"; }

# ---------------------------------------------------------------- part F (v0.25.1: figure + best pace)
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part F start"
maestro test --format junit --output "$OUT/part-f.xml" --test-output-dir "$OUT/part-f" "$QA_DIR/v0251-f.yaml" \
  > "$OUT/part-f.log" 2>&1 || { status=1; log "PART F FAILED"; }

# ---------------------------------------------------------------- part G (v0.26.0: routines and plans)
# A routine file "someone shared", in Downloads, for the import steps.
adb push "$QA_DIR/fixtures/qa-shared.forgeai.json" /sdcard/Download/qa-shared.forgeai.json >/dev/null 2>&1 || log "PUSH ROUTINE FILE FAILED"
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/qa-shared.forgeai.json" >/dev/null 2>&1 || true
# The broadcast is a no-op on newer Android; a volume scan makes the file picker list it (as for part D's photos).
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "downloads: $(adb shell content query --uri content://media/external/downloads --projection _display_name 2>/dev/null | grep -c qa-shared) routine file"
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part G start"
maestro test --format junit --output "$OUT/part-g.xml" --test-output-dir "$OUT/part-g" "$QA_DIR/v0260-g.yaml"   > "$OUT/part-g.log" 2>&1 || { status=1; log "PART G FAILED"; }

# ---------------------------------------------------------------- part H (v0.26.1: the watch's rest card)
# The cloud phone cannot pair a watch. A watch shows exactly the phone's swipe-away alerts and
# runs their buttons on the phone, so the card, its buttons and the end alert are proven here.
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part H1 start"
maestro test --format junit --output "$OUT/part-h1.xml" --test-output-dir "$OUT/part-h1" "$QA_DIR/v0261-h.yaml" \
  > "$OUT/part-h1.log" 2>&1 || { status=1; log "PART H1 FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-card-after-plus15.txt"
# The card must be swipe-away (no ongoing / no-clear flag), on the quiet channel, with both buttons.
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-plus15.txt" "Rest 3:15" >> "$OUT/timeline.txt" || status=1
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_HOME
sleep 3
# Android stops a background app to save memory; the card's buttons must still work.
adb shell am kill "$PKG"
sleep 3
log "app process after kill: '$(adb shell pidof $PKG | tr -d '\r')' (empty = stopped)"
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part H2 start"
maestro test --format junit --output "$OUT/part-h2.xml" --test-output-dir "$OUT/part-h2" "$QA_DIR/v0261-h2.yaml" \
  > "$OUT/part-h2.log" 2>&1 || { status=1; log "PART H2 FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-after-rest-app-open.txt"
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > "$OUT/h-117-shade-rest-over.png"
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
python3 "$QA_DIR/notif.py" over-open "$OUT/h-after-rest-app-open.txt" >> "$OUT/timeline.txt" || status=1

# ---------------------------------------------------------------- part I (v0.27.0: the rest of Phase 5)
# A Strong export "someone made" (older layout, pounds and miles), in Downloads, for the import.
adb push "$QA_DIR/fixtures/qa-strong.csv" /sdcard/Download/qa-strong.csv >/dev/null 2>&1 || log "PUSH STRONG FILE FAILED"
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part I start"
maestro test --format junit --output "$OUT/part-i.xml" --test-output-dir "$OUT/part-i" "$QA_DIR/v0270-i.yaml"   > "$OUT/part-i.log" 2>&1 || { status=1; log "PART I FAILED"; }
# The reminders the app set (expo keeps them as alarms) and the widget the home screen holds.
adb shell dumpsys alarm | grep -c "com.forgeai.app" > "$OUT/i-alarm-count.txt" 2>/dev/null || true
log "app alarms after part I: $(cat "$OUT/i-alarm-count.txt" 2>/dev/null)"
adb shell dumpsys appwidget > "$OUT/i-appwidget.txt" 2>/dev/null || true
log "home-screen widget list saved (i-appwidget.txt); ForgeAI widget lines: $(grep -c 'com.forgeai.phone.TodayWidget' "$OUT/i-appwidget.txt" 2>/dev/null)"

# ---------------------------------------------------------------- part J (v0.28.0: the member's own Hevy routines)
# A real-format Hevy .csv (text dates) with two routines, free workouts and an old name.
adb push "$QA_DIR/fixtures/qa-hevy.csv" /sdcard/Download/qa-hevy.csv >/dev/null 2>&1 || log "PUSH HEVY FILE FAILED"
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
sleep 10
log "part J start"
maestro test --format junit --output "$OUT/part-j.xml" --test-output-dir "$OUT/part-j" "$QA_DIR/v0280-j.yaml"   > "$OUT/part-j.log" 2>&1 || { status=1; log "PART J FAILED"; }

# ---------------------------------------------------------------- crash check
# Only the app's own crashes count (another app's crash on the emulator is not ours).
app_crash() { grep -A1 "FATAL EXCEPTION" "$1" 2>/dev/null | grep -q "Process: $PKG"; }
adb logcat -d > "$OUT/logcat.txt"
if app_crash "$OUT/logcat.txt"; then
  log "CRASH FOUND in logcat"
  grep -n -A25 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -80 >> "$OUT/timeline.txt"
  status=1
else
  log "no app crash in logcat"
fi
# Maestro clears logcat when each part starts, so the log above holds only the last part.
# Every part's own device log is in its test-output folder, and Maestro writes a crash or
# ANR report of its own when it sees one: check them all.
read_logs=0
for f in $(find "$OUT"/part-* -name '*logcat*' 2>/dev/null); do
  read_logs=$((read_logs + 1))
  if app_crash "$f" || grep -q "ANR in $PKG" "$f"; then log "CRASH OR ANR in $f"; status=1; fi
done
reports=$(find "$OUT"/part-* \( -name 'crash-report*' -o -name 'anr-report*' \) 2>/dev/null)
if [ -n "$reports" ]; then log "MAESTRO CRASH/ANR REPORT: $reports"; status=1; fi
log "device logs read: $read_logs (parts A-I)"
if [ "$read_logs" -eq 0 ]; then log "WARNING: no per-part device logs found - only the last part's logcat was checked"; fi
grep -i "ReactNativeJS" "$OUT/logcat.txt" | grep -i "error\|warn" | head -60 > "$OUT/js-errors.txt" || true
log "done, status $status"
exit $status
