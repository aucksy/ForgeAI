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
python3 - "$OUT/notifications-after-rest.txt" "$TICK_MS" >> "$OUT/timeline.txt" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
tick = int(sys.argv[2])
found = False
for block in re.split(r"\n\s*NotificationRecord\(", text):
    if "forgeai-rest-end" in block or "Rest is over" in block:
        found = True
        m = re.search(r"mCreationTimeMs=(\d+)", block) or re.search(r"\bwhen=(\d+)", block)
        if m:
            posted = int(m.group(1))
            print(f"[qa] REST ALERT posted; due ~{tick + 30000}, posted {posted}, late by about {(posted - (tick + 30000)) / 1000:.1f}s (tick time is approximate, +/- a few s)")
        else:
            print("[qa] REST ALERT posted (no timestamp found in dump)")
        break
if not found:
    print("[qa] REST ALERT NOT FOUND in the notification list 50 s after a 30 s rest")
PY
grep -q "forgeai-workout-ongoing\|Workout in progress" "$OUT/notifications-after-rest.txt" \
  && log "ONGOING CARD present" || { log "ONGOING CARD MISSING"; status=1; }
grep -q "Rest is over" "$OUT/notifications-after-rest.txt" || status=1

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

# ---------------------------------------------------------------- crash check
adb logcat -d > "$OUT/logcat.txt"
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  log "CRASH FOUND in logcat"
  grep -n -A25 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -80 >> "$OUT/timeline.txt"
  status=1
else
  log "no crash in logcat"
fi
grep -i "ReactNativeJS" "$OUT/logcat.txt" | grep -i "error\|warn" | head -60 > "$OUT/js-errors.txt" || true
log "done, status $status"
exit $status
