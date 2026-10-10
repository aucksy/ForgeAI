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
adb shell input keyevent KEYCODE_WAKEUP
sleep 1
adb shell wm dismiss-keyguard || true
log "screen on"

# When did "Rest is over" post, compared with when it was due (the rest card's end time, read
# from the dump taken during the rest)? Fails when more than REST_LATE_BUDGET_S (5 s) late.
python3 "$QA_DIR/notif.py" over-locked "$OUT/notifications-after-rest.txt" "$TICK_MS" "$OUT/notifications-during-rest.txt" >> "$OUT/timeline.txt" || status=1
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
# no sound), with both buttons. Its shade view counts down; notif.py reads the title it still sets.
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-plus15.txt" "Rest 3:15" >> "$OUT/timeline.txt" || status=1
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
