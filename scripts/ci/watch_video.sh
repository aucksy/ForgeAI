#!/usr/bin/env bash
# Records the Play "Foreground service permissions" demo of the MettleUp watch app (watch-video.yml).
#
# Runs inside the Wear OS emulator job. Installs the RELEASED watch APK unchanged, grants the
# permissions a member grants on first open, and puts the app into a workout with a rest running by
# writing the same saved state the phone's Data Layer message leaves behind (no phone exists in CI;
# needs `adb root`, which the emulator allows). Heart rate is the emulator's synthetic Health Services
# data. Then it records the screen: rest timer with live heart rate, the watch face with the workout
# kept running, back in the app, "Rest is over", the next set.
#
# Usage: watch_video.sh <apk> <out-dir>
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.mettleup.app
mkdir -p "$OUT/stills"
EV="$OUT/events.txt"
: > "$EV"
log() { echo "[$(date +%H:%M:%S)] $*"; }

adb wait-for-device
adb shell getprop ro.build.version.sdk | tee "$OUT/sdk.txt"
adb shell getprop ro.build.fingerprint | tee "$OUT/fingerprint.txt"

log "root"
adb root || true
sleep 3
adb wait-for-device
if [ "$(adb shell id -u | tr -d '\r')" != "0" ]; then
  echo "::error::adb root is not available on this emulator image"
  exit 1
fi

# The screen stays on and bright for the whole recording (no dimming mid-take).
# Off the charger: a watch on its charger shows the big charging clock over every app.
adb shell dumpsys battery unplug || true
adb shell dumpsys battery set ac 0 || true
adb shell dumpsys battery set usb 0 || true
adb shell dumpsys battery set status 3 || true
adb shell dumpsys battery set level 82 || true
adb shell svc power stayon true || true
adb shell settings put system screen_off_timeout 1800000 || true
adb shell input keyevent KEYCODE_WAKEUP || true

log "install"
adb install -r -g "$APK" || exit 1
adb shell pm grant $PKG android.permission.BODY_SENSORS || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell pm grant $PKG android.permission.health.READ_HEART_RATE 2>/dev/null || true
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow || true
adb shell dumpsys package $PKG | grep -E "versionName|permission" > "$OUT/package.txt" || true

# Synthetic heart rate. Wear OS 3: these broadcasts switch Health Services to its synthetic user.
# Wear OS 4+: the emulator generates the data itself (the broadcasts are ignored there).
adb shell am broadcast -a whs.USE_SYNTHETIC_PROVIDERS com.google.android.wearable.healthservices || true
adb shell am broadcast -a whs.synthetic.user.START_EXERCISE --ei exercise_options_heart_rate 128 com.google.android.wearable.healthservices || true

# First open creates the app's data folder; then it is closed and its saved state written.
log "first open"
adb shell am start -W -n $PKG/com.forgeai.wear.MainActivity || true
sleep 6
adb shell screencap -p /sdcard/first.png && adb pull /sdcard/first.png "$OUT/stills/00-first-open.png" || true
adb shell am force-stop $PKG
sleep 1

DATA=/data/data/$PKG
NOW_S=$(adb shell date +%s | tr -d '\r')
NOW=$((NOW_S * 1000))
# The rest ends ~29 s from now: ~17 s are left when the recording starts.
ENDS=$((NOW + 29000))
STARTED=$((NOW - 56000))

cat > /tmp/forgeai_watch.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="active" value="true" />
    <long name="workoutAt" value="$NOW" />
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
    <long name="startedAt" value="$STARTED" />
    <long name="endsAt" value="$ENDS" />
    <string name="next">Set 3 of 4 · Bench Press</string>
    <boolean name="ringThroughDnd" value="false" />
    <string name="restDone"></string>
    <boolean name="phoneAppSeen" value="true" />
</map>
EOF
cat > /tmp/forgeai_watch_ui.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="askedHr" value="true" />
    <boolean name="askedNotif" value="true" />
    <boolean name="askedExact" value="true" />
</map>
EOF
cp /tmp/forgeai_watch.xml /tmp/forgeai_watch_ui.xml "$OUT/"

log "write the workout state"
adb push /tmp/forgeai_watch.xml /data/local/tmp/forgeai_watch.xml
adb push /tmp/forgeai_watch_ui.xml /data/local/tmp/forgeai_watch_ui.xml
OWNER=$(adb shell stat -c %u:%g $DATA | tr -d '\r')
CTX=$(adb shell ls -Zd $DATA | awk '{print $1}' | tr -d '\r')
echo "owner $OWNER context $CTX"
adb shell "mkdir -p $DATA/shared_prefs && chown $OWNER $DATA/shared_prefs && chmod 771 $DATA/shared_prefs && chcon $CTX $DATA/shared_prefs"
for f in forgeai_watch.xml forgeai_watch_ui.xml; do
  adb shell "cp /data/local/tmp/$f $DATA/shared_prefs/$f && chown $OWNER $DATA/shared_prefs/$f && chmod 660 $DATA/shared_prefs/$f && chcon $CTX $DATA/shared_prefs/$f"
done
adb shell ls -lZ $DATA/shared_prefs | tee "$OUT/prefs-files.txt"

log "open the app into the workout"
adb logcat -c || true
adb shell am start -W -n $PKG/com.forgeai.wear.MainActivity || true
sleep 9
adb shell dumpsys activity services $PKG > "$OUT/services-before.txt" || true

# ---- the recording (~38 s) ----
adb shell rm -f /sdcard/demo.mp4
adb shell screenrecord --time-limit 31 --bit-rate 8000000 /sdcard/demo.mp4 &
REC=$!
T0=$(date +%s.%N)
mark() { echo "$(awk -v a="$(date +%s.%N)" -v b="$T0" 'BEGIN{printf "%.1f", a-b}') $1" | tee -a "$EV"; }
shot() { adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png "$OUT/stills/$1.png" >/dev/null || true; }
sleep 0.5
mark app-rest
sleep 2
shot 01-rest-timer-heart-rate
sleep 3
mark home
adb shell input keyevent KEYCODE_HOME
sleep 2
shot 02-watch-face-workout-running
adb shell dumpsys activity services $PKG > "$OUT/services-in-background.txt" || true
sleep 3
mark back
adb shell am start -n $PKG/com.forgeai.wear.MainActivity
sleep 3
shot 03-back-in-app
# The rest runs out by itself (no touch): the buzz and "Rest is over".
while :; do
  T=$(adb shell date +%s | tr -d '\r')
  [ $((T * 1000)) -ge $((ENDS + 400)) ] && break
  sleep 0.5
done
mark rest-over
sleep 2
shot 04-rest-is-over
sleep 4
mark next-set
sleep 2
shot 05-next-set-heart-rate
sleep 4
shot 06-next-set-later
mark end
wait $REC || true
sleep 2
adb pull /sdcard/demo.mp4 "$OUT/watch-demo-raw.mp4" || true
adb shell dumpsys activity services $PKG > "$OUT/services-after.txt" || true
adb shell dumpsys notification --noredact > "$OUT/notifications.txt" 2>/dev/null || adb shell dumpsys notification > "$OUT/notifications.txt" || true
adb logcat -d > "$OUT/logcat.txt" || true
grep -E "ForgeWear|HealthServices|WHS|whs" "$OUT/logcat.txt" | tail -300 > "$OUT/logcat-app.txt" || true
log "events:"
cat "$EV"
ls -la "$OUT" "$OUT/stills"
[ -s "$OUT/watch-demo-raw.mp4" ]
