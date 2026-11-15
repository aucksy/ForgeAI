#!/usr/bin/env bash
# R-577 UAT on a Wear OS emulator (wear-build.yml, job "uat", the small-round leg): the LARGEST text a
# watch offers, on the real app.
#  1. Reads the font sizes the watch's own Settings app offers (Settings > Accessibility > Font size)
#     out of its resources (aapt2), and the current font_scale. Written to font-scales.txt.
#  2. Sets the largest of them (else 1.3, Galaxy's "Largest") and photographs MettleUp with nothing
#     open and with a workout open (the Next set screen), then the same at the normal size.
# Required (exit 1 if not): MettleUp is in front on every picture, and no crash (FATAL EXCEPTION).
#
# Usage: watch_font_scale_uat.sh <apk> <out-dir>
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.mettleup.app
ACT=$PKG/com.forgeai.wear.MainActivity
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
front() {
  adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus" | head -1 | tr -d '\r'
}

ready() { # the emulator is up and adb answers (it drops "offline" for a moment after boot and after adb root)
  local i
  for i in $(seq 1 60); do
    adb wait-for-device >/dev/null 2>&1
    if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then return 0; fi
    sleep 3
  done
  return 1
}
# Root first (as the other watch UATs do): it restarts adbd, so everything after waits for it.
ready
adb root || true
sleep 5
ready
sleep 10
ready
ROOT=0; [ "$(adb shell id -u | tr -d '\r')" = "0" ] && ROOT=1
SDK=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
{ echo "sdk $SDK root $ROOT"; adb shell getprop ro.build.fingerprint; adb shell wm size; adb shell wm density; } | tr -d '\r' | tee "$OUT/device.txt"

# ---- 1. what the watch's Settings app offers ----
BT="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)"
AAPT2="${BT%/}/aapt2"
FS="$OUT/font-scales.txt"
HITS_ALL="$OUT/font-scale-arrays.txt"
: > "$HITS_ALL"
{
  echo "== font_scale now: $(adb shell settings get system font_scale | tr -d '\r')"
  PKGS="$(adb shell pm list packages | tr -d '\r' | sed 's/^package://' | grep -iE 'settings' || true)"
  echo "== settings packages: $(echo $PKGS)"
  for p in $PKGS; do
    for apk in $(adb shell pm path "$p" | tr -d '\r' | sed 's/^package://'); do
      ready
      adb pull "$apk" /tmp/s.apk >/dev/null 2>&1 || { echo "== could not pull $apk"; continue; }
      HITS="$("$AAPT2" dump resources /tmp/s.apk 2>/dev/null | grep -iE -A14 'array/[a-z_]*font[a-z_]*(scale|size)[a-z_]*' || true)"
      if [ -n "$HITS" ]; then echo "== $p ($apk)"; echo "$HITS"; echo "$HITS" >> "$HITS_ALL"; fi
    done
  done
} > "$FS" 2>&1
cat "$FS"
# The largest decimal between 1 and 3 any font-size array holds (the Settings app's own choices).
MAX="$(grep -oE '"[12]\.[0-9]+"' "$HITS_ALL" | tr -d '"' | awk '$1 >= 1.0 && $1 <= 3.0' | sort -g | tail -1)"
if [ -z "$MAX" ]; then
  MAX=1.3
  result font-scales INFO "no font-size list found in the Settings app's resources; using 1.3 (Galaxy's Largest)"
else
  result font-scales INFO "largest font size the Settings app offers: $MAX (all lines in font-scales.txt)"
fi

# ---- 2. the app at that size ----
# A real member's watch is off the charger (a charging watch shows its charging screen over every app).
adb shell dumpsys battery unplug || true
adb shell dumpsys battery set ac 0 || true
adb shell dumpsys battery set usb 0 || true
adb shell dumpsys battery set status 3 || true
adb shell dumpsys battery set level 82 || true
adb shell svc power stayon true || true
adb shell input keyevent KEYCODE_WAKEUP || true
# 0.79.0 round (16 Nov 2026): on a fresh small-round boot Wear OS can keep its own first-boot
# "TrayInitializationOverlay" in front for a while; it sat over the app in every picture of runs
# 43726710831 and 43743014201 (the app was never in front, so nothing about it was tested). Wait
# for the watch's own overlay to go before the pictures, and say how long it took.
tray_wait() {
  local i f
  for i in $(seq 1 40); do
    f="$(front)"
    if ! grep -q "TrayInitializationOverlay" <<< "$f"; then return 0; fi
    adb shell input keyevent KEYCODE_WAKEUP || true
    sleep 3
  done
  return 1
}
T0=$(date +%s)
if tray_wait; then result tray INFO "watch first-boot overlay gone after $(( $(date +%s) - T0 )) s"; else result tray INFO "watch first-boot overlay still in front after 120 s"; fi
log "install"
adb install -r -g "$APK" || exit 1
adb shell pm grant $PKG android.permission.BODY_SENSORS || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow || true

DATA=/data/data/$PKG
adb shell am start -W -n $ACT >/dev/null || true
sleep 5
adb shell am force-stop $PKG
sleep 1
write_prefs() { # file-on-host name
  adb push "$1" "/data/local/tmp/$2" >/dev/null
  adb shell "cp /data/local/tmp/$2 $DATA/shared_prefs/$2 && chown $OWNER $DATA/shared_prefs/$2 && chmod 660 $DATA/shared_prefs/$2 && chcon $CTX $DATA/shared_prefs/$2"
}
if [ "$ROOT" = "1" ]; then
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
fi

workout_on() {
  local now; now=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
  cat > /tmp/forgeai_watch.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="active" value="true" />
    <long name="workoutAt" value="$now" />
    <long name="workoutSeq" value="1" />
    <long name="restSeq" value="1" />
    <string name="title">Single-Arm Dumbbell Row</string>
    <string name="text">Set 2 of 4</string>
    <string name="done"></string>
    <string name="set">Set 2 of 4</string>
    <string name="last">22.5 kg × 10</string>
    <string name="goal">22.5 kg × 11</string>
    <string name="accent"></string>
    <boolean name="logFlow" value="true" />
    <boolean name="eOn" value="true" />
    <boolean name="eWOn" value="true" />
    <boolean name="eROn" value="true" />
    <string name="eW">22.5</string>
    <long name="eR" value="10" />
    <string name="eUnit">kg</string>
    <string name="eStep">2.5</string>
    <boolean name="eWarm" value="false" />
    <boolean name="eRpe" value="false" />
    <long name="eRest" value="90" />
    <string name="next">Set 2 of 4 · Single-Arm Dumbbell Row</string>
    <boolean name="ringThroughDnd" value="false" />
    <string name="restDone"></string>
    <boolean name="phoneAppSeen" value="true" />
</map>
EOF
  write_prefs /tmp/forgeai_watch.xml forgeai_watch.xml
}

pictures() { # label scale
  local label="$1" scale="$2"
  adb shell am force-stop $PKG
  adb shell settings put system font_scale "$scale"
  sleep 2
  adb shell "rm -f $DATA/shared_prefs/forgeai_watch.xml" 2>/dev/null || true
  adb shell input keyevent KEYCODE_WAKEUP
  adb shell am start -W -n $ACT >/dev/null || true
  sleep 6
  # The watch's own first-boot overlay (see tray_wait) can come back over the app: wait it out, open again.
  if grep -q "TrayInitializationOverlay" <<< "$(front)"; then
    tray_wait || true
    adb shell am start -W -n $ACT >/dev/null || true
    sleep 6
  fi
  shot "$label-1-nothing-open"
  local f; f="$(front)"
  if grep -q "$PKG" <<< "$f"; then result "$label-nothing-open" PASS "font_scale $scale, MettleUp in front"; else result "$label-nothing-open" FAIL "font_scale $scale, in front: $f"; fi
  if [ "$ROOT" = "1" ]; then
    adb shell am force-stop $PKG
    workout_on
    adb shell am start -W -n $ACT >/dev/null || true
    sleep 2
    if grep -q "TrayInitializationOverlay" <<< "$(front)"; then
      tray_wait || true
      adb shell am start -W -n $ACT >/dev/null || true
      sleep 3
    fi
    shot "$label-2-workout-next-set"
    f="$(front)"
    if grep -q "$PKG" <<< "$f"; then result "$label-workout" PASS "font_scale $scale, MettleUp in front with a workout"; else result "$label-workout" FAIL "font_scale $scale, in front: $f"; fi
  else
    result "$label-workout" INFO "no adb root on this image: the workout picture is skipped"
  fi
}

adb logcat -c || true
pictures largest "$MAX"
pictures normal 1.0
adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
CRASH="$( { grep -A3 "FATAL EXCEPTION" "$OUT/logcat.txt" | grep "Process: $PKG"; grep "ANR in $PKG" "$OUT/logcat.txt"; } || true)"
if [ -n "$CRASH" ]; then
  result crash FAIL "a crash or ANR in logcat.txt"
else
  result crash PASS "no crash, no ANR"
fi
adb shell settings put system font_scale 1.0 || true

echo "---- results"; cat "$RES"
if [ "$FAILS" -gt 0 ]; then echo "::error::$FAILS font-size check(s) failed (see $RES)"; exit 1; fi
exit 0
