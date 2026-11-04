#!/usr/bin/env bash
# F191 / R-297 UAT on a Wear OS emulator (wear-build.yml, job "uat"): with the watch's "Always-on
# screen" OFF, an open workout keeps MettleUp in front. The screen turns off, and when it wakes the
# workout screen is back, not the watch face. When the workout ends, the app lets go (no foreground
# service, no "Workout in progress" notice).
#
# No phone exists in CI: the workout is put on the watch by writing the saved state the phone's Data
# Layer message leaves behind (as scripts/ci/watch_video.sh does; needs `adb root`). The workout is
# written so that the phone "went silent" WorkoutLive.CAP_MS ago minus LEFT_S seconds: after LEFT_S
# the watch ends it by itself through the same code that runs when the phone says "ended"
# (WorkoutLive.sync(false)), which is how the "after the workout" half is tested.
#
# Phases:
#   C  control: no workout open. App up, screen off for HOLD_S, wake: what is in front (recorded).
#   A  workout open: the service is in the foreground and the notice is posted; screen off for
#      HOLD_S (checked: Always-on screen off and the screen black while off); wake:
#      MettleUp must be in front, showing the workout.
#   B  workout over: the service and the notice must be gone; screen off for HOLD_S, wake: what is
#      in front (recorded).
# Required (exit 1 if not): A-service, A-notice, A-screen-off, A-front, B-service, B-notice.
#
# Usage: watch_keep_screen_uat.sh <apk> <out-dir>
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.mettleup.app
ACT=$PKG/com.forgeai.wear.MainActivity
HOLD_S="${HOLD_S:-75}"
LEFT_S="${LEFT_S:-300}"
CAP_MS=$((4 * 60 * 60 * 1000))
mkdir -p "$OUT/shots"
RES="$OUT/results.txt"
: > "$RES"
FAILS=0
log() { echo "[$(date +%H:%M:%S)] $*"; }
shot() { adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png "$OUT/shots/$1.png" >/dev/null || true; }
result() { # name PASS|FAIL|INFO text
  echo "$2 $1: $3" | tee -a "$RES"
  if [ "$2" = "FAIL" ]; then FAILS=$((FAILS + 1)); fi
}
front() { # the window that has the focus
  adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp" | head -2 | tr -d '\r' | tr '\n' ' '
}
resumed() {
  adb shell dumpsys activity activities 2>/dev/null | grep -E "topResumedActivity|ResumedActivity:" | head -2 | tr -d '\r' | tr '\n' ' '
}
wakefulness() {
  adb shell dumpsys power 2>/dev/null | grep -m1 -E "mWakefulness=" | tr -d '\r' | sed 's/.*mWakefulness=//'
}
service_fg() { # prints "fg", "bg" or "none"
  local s
  s="$(adb shell dumpsys activity services $PKG 2>/dev/null | tr -d '\r')"
  if ! grep -q "WorkoutService" <<< "$s"; then echo none
  elif grep -A30 "WorkoutService" <<< "$s" | grep -q "isForeground=true"; then echo fg
  else echo bg; fi
}
notice_up() { # 1 if the workout notice (id 51004) of this app is posted
  adb shell dumpsys notification --noredact 2>/dev/null | tr -d '\r' | grep -E "NotificationRecord.*pkg=$PKG.*id=51004" -q && echo 1 || echo 0
}
# Screen off for HOLD_S (Always-on off: the screen must be black), then wake; records what is in front.
off_and_wake() { # phase
  local p="$1"
  adb shell input keyevent KEYCODE_SLEEP
  sleep 4
  local w; w="$(wakefulness)"
  adb shell dumpsys power 2>/dev/null | grep -E "mWakefulness=|Display Power|mScreenOn|state=" | head -8 > "$OUT/$p-power-off.txt"
  echo "$w" > "$OUT/$p-wakefulness-off.txt"
  shot "$p-2-screen-off"
  OFF_DARK="$(dark "$OUT/shots/$p-2-screen-off.png")"
  sleep $((HOLD_S - 4))
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 4
  shot "$p-3-after-wake"
  echo "$(front)" > "$OUT/$p-front-after-wake.txt"
  echo "$(resumed)" >> "$OUT/$p-front-after-wake.txt"
  WAKE_OFF="$w"
}

adb wait-for-device
SDK=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
echo "sdk $SDK" | tee "$OUT/device.txt"
adb shell getprop ro.build.fingerprint | tee -a "$OUT/device.txt"

adb root || true
sleep 3
adb wait-for-device
if [ "$(adb shell id -u | tr -d '\r')" != "0" ]; then
  echo "::error::adb root is not available on this emulator image"
  exit 1
fi

# A real member's watch: off the charger (a charging watch shows its big charging clock over every
# app), the screen times out after 15 s, and the Always-on screen setting is OFF.
adb shell dumpsys battery unplug || true
adb shell dumpsys battery set ac 0 || true
adb shell dumpsys battery set usb 0 || true
adb shell dumpsys battery set status 3 || true
adb shell dumpsys battery set level 82 || true
adb shell svc power stayon false || true
adb shell settings put system screen_off_timeout 15000 || true
{
  echo "== before"; for ns in global secure system; do adb shell settings list $ns | grep -iE "ambient|doze|always|aod|watchface|watch_face|return|timeout|wake|tilt" | sed "s/^/$ns: /"; done
} > "$OUT/settings.txt" 2>&1
# Wear OS keeps its "Always-on screen" switch in global ambient_enabled; doze_always_on is the
# phone-style twin. Both off.
adb shell settings put global ambient_enabled 0 || true
adb shell settings put secure doze_always_on 0 || true
{
  echo "== after"; for ns in global secure system; do adb shell settings list $ns | grep -iE "ambient|doze|always|aod" | sed "s/^/$ns: /"; done
} >> "$OUT/settings.txt" 2>&1
cat "$OUT/settings.txt"
adb shell input keyevent KEYCODE_WAKEUP || true

log "install"
adb install -r -g "$APK" || exit 1
adb shell pm grant $PKG android.permission.BODY_SENSORS || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell pm grant $PKG android.permission.health.READ_HEART_RATE 2>/dev/null || true
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow || true

DATA=/data/data/$PKG
write_prefs() { # file-on-host name
  adb push "$1" "/data/local/tmp/$2" >/dev/null
  adb shell "cp /data/local/tmp/$2 $DATA/shared_prefs/$2 && chown $OWNER $DATA/shared_prefs/$2 && chmod 660 $DATA/shared_prefs/$2 && chcon $CTX $DATA/shared_prefs/$2"
}

# First open creates the app's data folder; the first-launch questions are marked answered.
adb shell am start -W -n $ACT >/dev/null || true
sleep 5
adb shell am force-stop $PKG
sleep 1
OWNER=$(adb shell stat -c %u:%g $DATA | tr -d '\r')
CTX=$(adb shell ls -Zd $DATA | awk '{print $1}' | tr -d '\r')
adb shell "mkdir -p $DATA/shared_prefs && chown $OWNER $DATA/shared_prefs && chmod 771 $DATA/shared_prefs && chcon $CTX $DATA/shared_prefs"
cat > /tmp/forgeai_watch_ui.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="askedHr" value="true" />
    <boolean name="askedNotif" value="true" />
    <boolean name="askedExact" value="true" />
</map>
EOF
write_prefs /tmp/forgeai_watch_ui.xml forgeai_watch_ui.xml

# ---- C: control, no workout ----
log "C: no workout open"
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n $ACT >/dev/null || true
sleep 6
shot "C-1-app-no-workout"
echo "$(front)" > "$OUT/C-front-before.txt"
off_and_wake C
C_FRONT="$(cat "$OUT/C-front-after-wake.txt")"
if grep -q "$PKG" <<< "$C_FRONT"; then C_APP=1; else C_APP=0; fi
result C-front INFO "no workout, Always-on off, screen off ${HOLD_S}s (watch was $WAKE_OFF), after wake MettleUp in front=$C_APP ($C_FRONT)"
adb shell am force-stop $PKG
sleep 1

# ---- A: a workout open ----
NOW=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
AT=$((NOW - CAP_MS + LEFT_S * 1000))
END_BY=$((AT + CAP_MS))
cat > /tmp/forgeai_watch.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="active" value="true" />
    <long name="workoutAt" value="$AT" />
    <long name="workoutSeq" value="1" />
    <long name="restSeq" value="1" />
    <string name="title">Bench Press</string>
    <string name="text">Set 3 of 4</string>
    <string name="done"></string>
    <string name="set">Set 3 of 4</string>
    <string name="last">60 kg × 8</string>
    <string name="goal">60 kg × 8</string>
    <string name="accent"></string>
    <boolean name="logFlow" value="true" />
    <boolean name="eOn" value="true" />
    <boolean name="eWOn" value="true" />
    <boolean name="eROn" value="true" />
    <string name="eW">60.0</string>
    <long name="eR" value="8" />
    <string name="eUnit">kg</string>
    <string name="eStep">2.5</string>
    <boolean name="eWarm" value="false" />
    <boolean name="eRpe" value="false" />
    <long name="eRest" value="90" />
    <string name="next">Set 3 of 4 · Bench Press</string>
    <boolean name="ringThroughDnd" value="false" />
    <string name="restDone"></string>
    <boolean name="phoneAppSeen" value="true" />
</map>
EOF
cp /tmp/forgeai_watch.xml "$OUT/workout-state.xml"
write_prefs /tmp/forgeai_watch.xml forgeai_watch.xml

log "A: workout open"
adb logcat -c || true
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -W -n $ACT >/dev/null || true
sleep 1
# Before the app's phone check runs (no phone exists in CI: a few seconds later it says
# "Phone not connected", which is what a real watch shows without its phone).
shot "A-0-workout-screen"
sleep 7
shot "A-1-workout-open"
adb shell dumpsys activity services $PKG > "$OUT/A-services.txt" 2>&1 || true
adb shell dumpsys notification --noredact > "$OUT/A-notifications.txt" 2>&1 || true
S="$(service_fg)"
[ "$S" = "fg" ] && result A-service PASS "WorkoutService runs in the foreground while the workout is open" \
  || result A-service FAIL "WorkoutService is '$S', not in the foreground"
[ "$(notice_up)" = "1" ] && result A-notice PASS "the workout notice (Ongoing Activity, id 51004) is posted" \
  || result A-notice FAIL "no workout notice (id 51004)"
off_and_wake A
# Wear OS reports a screen that is off as "Dozing" too, so the proof is the picture: with Always-on
# screen on, the app's dimmed twin would be drawn; off, the screen is black.
AMB="$(adb shell settings get global ambient_enabled | tr -d '')"
if [ "$AMB" = "0" ] && [ "$OFF_DARK" = "1" ]; then
  result A-screen-off PASS "Always-on screen off (ambient_enabled=0) and the screen was black while off (power: $WAKE_OFF)"
else
  result A-screen-off FAIL "Always-on screen not proven off: ambient_enabled=$AMB, black picture=$OFF_DARK, power $WAKE_OFF"
fi
A_FRONT="$(cat "$OUT/A-front-after-wake.txt")"
if grep -q "$PKG" <<< "$A_FRONT"; then
  result A-front PASS "after ${HOLD_S}s with the screen off, the wake shows MettleUp ($A_FRONT)"
else
  result A-front FAIL "after ${HOLD_S}s with the screen off, the wake shows something else: $A_FRONT"
fi
adb shell dumpsys activity services $PKG > "$OUT/A-services-after-wake.txt" 2>&1 || true

# ---- B: the workout is over ----
log "B: waiting for the workout to end (the phone's silence runs out)"
while :; do
  T=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
  [ "$T" -ge $((END_BY + 15000)) ] && break
  sleep 5
done
adb shell input keyevent KEYCODE_WAKEUP
sleep 3
shot "B-1-workout-over"
adb shell dumpsys activity services $PKG > "$OUT/B-services.txt" 2>&1 || true
adb shell dumpsys notification --noredact > "$OUT/B-notifications.txt" 2>&1 || true
S="$(service_fg)"
[ "$S" = "none" ] && result B-service PASS "after the workout WorkoutService is gone" \
  || result B-service FAIL "after the workout WorkoutService is still '$S'"
[ "$(notice_up)" = "0" ] && result B-notice PASS "after the workout the notice is gone" \
  || result B-notice FAIL "after the workout the notice (id 51004) is still posted"
off_and_wake B
B_FRONT="$(cat "$OUT/B-front-after-wake.txt")"
if grep -q "$PKG" <<< "$B_FRONT"; then B_APP=1; else B_APP=0; fi
result B-front INFO "workout over, screen off ${HOLD_S}s (watch was $WAKE_OFF), after wake MettleUp in front=$B_APP ($B_FRONT)"

adb logcat -d > "$OUT/logcat.txt" || true
grep -E "ForgeWear|ActivityTaskManager|WindowManager.*mettleup" "$OUT/logcat.txt" | tail -400 > "$OUT/logcat-app.txt" || true
echo "---- results ----"
cat "$RES"
ls -la "$OUT/shots"
if [ "$FAILS" -gt 0 ]; then
  echo "::error::Watch UAT: $FAILS required check(s) failed (see results.txt)"
  exit 1
fi
