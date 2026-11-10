#!/usr/bin/env bash
# R-442 UAT on a Wear OS emulator (wear-build.yml, job "uat"): the owner's real case. The watch's
# "Always-on display" is OFF (global ambient_enabled 0 + secure doze_always_on 0), and during a workout
# MettleUp must DIM, not go black, like the watch's own exercise app. With Always-on off the watch gives
# no app its dim state, so MettleUp keeps the screen on and dims it itself (SelfDim.kt): lowest brightness
# and the black dim screens after the watch's timeout or a wrist down; bright on a tap, the crown or a
# wrist raise; the screen is let go (fully off) when the workout ends.
#
# Read from: the app's diary lines in logcat ("ForgeWear: diag ... self-dim-*", AmbientDiag.note), the
# window's flags and brightness (dumpsys window: KEEP_SCREEN_ON, sbrt=), the watch's power state
# (dumpsys power mWakefulness: Awake = screen on), and the pictures (a dimmed screen is not all black).
# The wrist is moved with the emulator's accelerometer (adb emu sensor set acceleration x:y:z).
#
# Required (exit 1 if not): C-aod-off (control: Always-on really off here), D-keep, D-timeout, D-touch,
# D-tap-safe, D-wrist-down, D-wrist-up, D-rest-end, D-leave, D-setting, D-saver, D-end, D-no-workout.
#
# Usage: watch_dim_aod_off_uat.sh <apk> <out-dir>
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.mettleup.app
ACT=$PKG/com.forgeai.wear.MainActivity
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
diag() { adb logcat -d -s ForgeWear:I 2>/dev/null | tr -d '\r' | grep " diag " || true; }
count() { local n; n="$(diag | grep -cE "$1")" || true; echo "${n:-0}"; }
front() { adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus" | head -1 | tr -d '\r'; }
awake() { adb shell dumpsys power 2>/dev/null | tr -d '\r' | grep -m1 -oE "mWakefulness=[A-Za-z]+" | sed 's/mWakefulness=//'; }
win() { # MettleUp's window block in dumpsys window (flags, brightness)
  adb shell dumpsys window windows 2>/dev/null | tr -d '\r' |
    awk '/Window #[0-9]+/{f=($0 ~ /com\.mettleup\.app\/com\.forgeai\.wear\.MainActivity/)} f'
}
keep_on() { if win | grep -q "KEEP_SCREEN_ON"; then echo 1; else echo 0; fi; }
dim_brightness() { if win | grep -qE "sbrt=0\.0"; then echo 1; else echo 0; fi; }
dark() { # 1 if the picture is (nearly) all black
  python3 - "$1" <<'PY' 2>/dev/null || echo 0
import struct, sys, zlib
d = open(sys.argv[1], "rb").read()
idat = b"".join(d[i + 8:i + 8 + struct.unpack(">I", d[i:i + 4])[0]] for i in range(8, len(d) - 8) if d[i + 4:i + 8] == b"IDAT")
raw = zlib.decompress(idat)
lit = sum(1 for b in raw if b > 40)
print(1 if lit < len(raw) * 0.002 else 0)
PY
}
face_up() { adb emu sensor set acceleration 0:1.2:9.7 >/dev/null 2>&1 || true; }
arm_down() { adb emu sensor set acceleration 0:9.7:0.8 >/dev/null 2>&1 || true; }
wait_for() { # pattern base seconds: wait until more diary lines match pattern than base (counted BEFORE the action)
  local pat="$1" b="$2" secs="$3" i
  for i in $(seq 1 "$secs"); do
    sleep 1
    if [ "$(count "$pat")" -gt "$b" ]; then echo 1; return; fi
  done
  echo 0
}
bring_app() {
  local i
  adb shell input keyevent KEYCODE_WAKEUP
  for i in 1 2 3 4; do
    adb shell am start -W -n $ACT >/dev/null 2>&1 || true
    sleep 4
    if front | grep -q "$PKG"; then return 0; fi
    sleep 3
  done
  echo "MettleUp not in front after 4 starts: $(front)"
}
aod() { # 0|1: the watch's Always-on display
  adb shell settings put global ambient_enabled "$1" || true
  adb shell settings put secure doze_always_on "$1" || true
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

# The owner's watch: off the charger, 15 s screen timeout, Always-on display OFF, Battery Saver off.
adb shell dumpsys battery unplug || true
adb shell dumpsys battery set ac 0 || true
adb shell dumpsys battery set usb 0 || true
adb shell dumpsys battery set status 3 || true
adb shell dumpsys battery set level 82 || true
adb shell svc power stayon false || true
adb shell cmd power set-mode 0 >/dev/null 2>&1 || true
adb shell settings put system screen_off_timeout 15000 || true
aod 0
face_up
adb shell input keyevent KEYCODE_WAKEUP || true

log "install"
adb install -r -g "$APK" || exit 1
adb shell pm grant $PKG android.permission.BODY_SENSORS || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell pm grant $PKG android.permission.health.READ_HEART_RATE 2>/dev/null || true
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow || true

DATA=/data/data/$PKG
adb shell am start -W -n $ACT >/dev/null || true
sleep 5
adb shell am force-stop $PKG
sleep 1
OWNER=$(adb shell stat -c %u:%g $DATA | tr -d '\r')
CTX=$(adb shell ls -Zd $DATA | awk '{print $1}' | tr -d '\r')
adb shell "mkdir -p $DATA/shared_prefs && chown $OWNER $DATA/shared_prefs && chmod 771 $DATA/shared_prefs && chcon $CTX $DATA/shared_prefs"
write_prefs() { # file-on-host name
  adb push "$1" "/data/local/tmp/$2" >/dev/null
  adb shell "cp /data/local/tmp/$2 $DATA/shared_prefs/$2 && chown $OWNER $DATA/shared_prefs/$2 && chmod 660 $DATA/shared_prefs/$2 && chcon $CTX $DATA/shared_prefs/$2"
}
cat > /tmp/forgeai_watch_ui.xml <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="askedHr" value="true" />
    <boolean name="askedNotif" value="true" />
    <boolean name="askedExact" value="true" />
</map>
EOF
write_prefs /tmp/forgeai_watch_ui.xml forgeai_watch_ui.xml

now_ms() { echo $(( $(adb shell date +%s | tr -d '\r') * 1000 )); }
# The saved workout (as the phone's message leaves it). $1 rest end ms (0 = none); $2 when the phone last
# spoke (ms); $3 "log" = the watch-logging screens (the rest has a Skip button), else the glance screens.
workout_state() {
  local now
  now="$(now_ms)"
  {
    echo "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>"
    echo "<map>"
    echo "    <boolean name=\"active\" value=\"true\" />"
    echo "    <long name=\"workoutAt\" value=\"$2\" />"
    echo "    <long name=\"workoutSeq\" value=\"1\" />"
    echo "    <long name=\"restSeq\" value=\"1\" />"
    echo "    <string name=\"title\">Bench Press</string>"
    echo "    <string name=\"text\">Set 3 of 4</string>"
    echo "    <string name=\"done\"></string>"
    echo "    <string name=\"set\">Set 3 of 4</string>"
    echo "    <string name=\"last\">60 kg × 8</string>"
    echo "    <string name=\"goal\">60 kg × 8</string>"
    echo "    <string name=\"accent\"></string>"
    echo "    <string name=\"next\">Set 3 of 4 · Bench Press</string>"
    echo "    <boolean name=\"ringThroughDnd\" value=\"false\" />"
    echo "    <string name=\"restDone\"></string>"
    echo "    <boolean name=\"phoneAppSeen\" value=\"true\" />"
    if [ "${3:-}" = "log" ]; then echo "    <boolean name=\"logFlow\" value=\"true\" />"; fi
    if [ "$1" != "0" ]; then
      echo "    <long name=\"startedAt\" value=\"$now\" />"
      echo "    <long name=\"endsAt\" value=\"$1\" />"
    fi
    echo "</map>"
  } > /tmp/forgeai_watch.xml
  write_prefs /tmp/forgeai_watch.xml forgeai_watch.xml
}
rest_saved() { if adb shell cat $DATA/shared_prefs/forgeai_watch.xml 2>/dev/null | grep -q 'name="endsAt"'; then echo 1; else echo 0; fi; }
fresh_workout() { # rest-end-ms workoutAt-ms [log]
  adb shell am force-stop $PKG
  sleep 1
  workout_state "$1" "$2" "${3:-}"
  face_up
  bring_app
}
# The screen timeout again (one API 35 image reset it to "never", run 42770521482).
for i in 1 2 3 4 5; do
  adb shell settings put system screen_off_timeout 15000 || true
  sleep 1
  TO="$(adb shell dumpsys power 2>/dev/null | tr -d '\r' | grep -oE 'mScreenOffTimeoutSetting=[0-9]+' | head -1)"
  [ "$TO" = "mScreenOffTimeoutSetting=15000" ] && break
done
result D-timeout-setting INFO "screen timeout: $TO; Always-on: global $(adb shell settings get global ambient_enabled | tr -d '\r'), secure $(adb shell settings get secure doze_always_on | tr -d '\r')"

NOW="$(now_ms)"
adb logcat -c || true
fresh_workout $((NOW + 25 * 60 * 1000)) $((NOW - 60000))
shot "0-workout-open"

# ---- D-keep: the app holds the screen (it will dim it itself) ----
sleep 2
K="$(keep_on)"
ON="$(count 'self-dim-on')"
if [ "$K" = "1" ] && [ "$ON" -ge 1 ]; then
  result D-keep PASS "workout open, Always-on off: MettleUp keeps the screen on to dim it itself (KEEP_SCREEN_ON, diary self-dim-on)"
else
  result D-keep FAIL "KEEP_SCREEN_ON=$K, self-dim-on lines=$ON ($(diag | tail -3 | tr '\n' ' '))"
fi

# ---- D-timeout: the watch's 15 s timeout passes: dimmed, not black ----
log "D-timeout"
B="$(count 'self-dim-enter timeout')"
AB="$(count 'ambient-enter')"
sleep 22
shot "D-timeout-dim"
W="$(awake)"
D="$(dark "$OUT/shots/D-timeout-dim.png")"
BR="$(dim_brightness)"
if [ "$(count 'self-dim-enter timeout')" -gt "$B" ] && [ "$W" = "Awake" ] && [ "$D" = "0" ] && [ "$BR" = "1" ]; then
  result D-timeout PASS "after the 15 s timeout the workout screen DIMMED (screen on: $W, lowest brightness, dim screen drawn), not black"
else
  result D-timeout FAIL "after the timeout: self-dim-enter=$(count 'self-dim-enter timeout') (was $B), power=$W, black=$D, low brightness=$BR"
fi
result D-timeout-ambient INFO "the watch's own dim state was not used: ambient-enter $AB -> $(count 'ambient-enter')"
win > "$OUT/D-timeout-window.txt"

# ---- D-touch + D-tap-safe: a tap brightens and presses nothing ----
# The logging rest screen has a Skip button. A tap on it while dimmed must only brighten (the rest stays);
# the same tap when bright skips the rest (proves the tap hit the button).
log "D-touch"
NOW="$(now_ms)"
fresh_workout $((NOW + 10 * 60 * 1000)) $((NOW - 60000)) log
SIZE="$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -1)"
WPX="${SIZE%x*}"
SX=$((228 * WPX / 456))
SY=$((351 * WPX / 456))
shot "D-touch-bright-before"
sleep 20
shot "D-touch-dim"
B="$(count 'self-dim-exit touch')"
adb shell input tap "$SX" "$SY"
sleep 2
shot "D-touch-woken"
if [ "$(count 'self-dim-exit touch')" -gt "$B" ] && [ "$(dim_brightness)" = "0" ]; then
  result D-touch PASS "a tap on the dim screen made it bright (brightness back to the watch's)"
else
  result D-touch FAIL "tap on the dim screen: self-dim-exit touch $B -> $(count 'self-dim-exit touch'), still low brightness=$(dim_brightness)"
fi
KEPT="$(rest_saved)"
adb shell input tap "$SX" "$SY"
sleep 2
shot "D-touch-skip-bright"
SKIPPED_BRIGHT=$([ "$(rest_saved)" = "0" ] && echo 1 || echo 0)
if [ "$KEPT" = "1" ] && [ "$SKIPPED_BRIGHT" = "1" ]; then
  result D-tap-safe PASS "the waking tap on Skip did NOT skip the rest; the same tap when bright did (tap at $SX,$SY)"
elif [ "$KEPT" = "1" ]; then
  result D-tap-safe PASS "the waking tap did not skip the rest (the bright tap at $SX,$SY did not hit Skip either: picture D-touch-skip-bright)"
else
  result D-tap-safe FAIL "the tap that woke the dim screen skipped the rest (a button was pressed)"
fi

# ---- D-wrist: arm down dims within ~2 s, a raise brightens ----
log "D-wrist"
NOW="$(now_ms)"
fresh_workout $((NOW + 25 * 60 * 1000)) $((NOW - 60000))
sleep 3
B="$(count 'self-dim-enter wrist-down')"
arm_down
G="$(wait_for 'self-dim-enter wrist-down' "$B" 6)"
shot "D-wrist-down"
DW="$(dark "$OUT/shots/D-wrist-down.png")"
if [ "$G" = "1" ] && [ "$(awake)" = "Awake" ] && [ "$DW" = "0" ]; then
  result D-wrist-down PASS "wrist down: dimmed within seconds (not black, screen on)"
else
  result D-wrist-down FAIL "wrist down: self-dim-enter wrist-down=$G, power=$(awake), black=$DW"
fi
B="$(count 'self-dim-exit wrist-up')"
face_up
G="$(wait_for 'self-dim-exit wrist-up' "$B" 5)"
shot "D-wrist-up"
if [ "$G" = "1" ] && [ "$(dim_brightness)" = "0" ]; then
  result D-wrist-up PASS "wrist raised: bright again"
else
  result D-wrist-up FAIL "wrist raised: self-dim-exit wrist-up=$G, low brightness=$(dim_brightness)"
fi

# ---- D-rest-end: a rest ends while dimmed (buzz, Rest is over): still dimmed, not black ----
log "D-rest-end"
NOW="$(now_ms)"
ENDS=$((NOW + 32000))
fresh_workout "$ENDS" $((NOW - 60000))
sleep 20
EXIT_B="$(count 'self-dim-exit| stop ')"
shot "D-rest-dim"
while :; do
  T="$(now_ms)"
  [ "$T" -ge $((ENDS + 12000)) ] && break
  sleep 3
done
shot "D-rest-end-dim"
DE="$(dark "$OUT/shots/D-rest-end-dim.png")"
EXIT_A="$(count 'self-dim-exit| stop ')"
if [ "$(count 'self-dim-enter')" -ge 1 ] && [ "$EXIT_A" = "$EXIT_B" ] && [ "$(awake)" = "Awake" ] && [ "$DE" = "0" ] && [ "$(dim_brightness)" = "1" ]; then
  result D-rest-end PASS "the rest ended while dimmed: 12 s later still dimmed (screen on, not black, no exit)"
else
  result D-rest-end FAIL "after the rest ended: exit/stop lines $EXIT_B -> $EXIT_A, power=$(awake), black=$DE, low brightness=$(dim_brightness)"
fi

# ---- D-leave: out to the watch face and back: dims again ----
log "D-leave"
adb shell input keyevent KEYCODE_WAKEUP
adb shell input keyevent KEYCODE_HOME
sleep 4
shot "D-leave-out"
bring_app
face_up
B="$(count 'self-dim-enter timeout')"
sleep 22
shot "D-leave-dim"
DL="$(dark "$OUT/shots/D-leave-dim.png")"
if front | grep -q "$PKG" && [ "$(count 'self-dim-enter timeout')" -gt "$B" ] && [ "$(awake)" = "Awake" ] && [ "$DL" = "0" ]; then
  result D-leave PASS "after leaving the app and coming back it dims again (not black)"
else
  result D-leave FAIL "after leaving and coming back: self-dim-enter $B -> $(count 'self-dim-enter timeout'), power=$(awake), black=$DL, front: $(front)"
fi

# ---- C-aod-off: control. Always-on really is off on this emulator: a forced screen-off (sleep key, as a palm
# over the screen) gives a black screen and no dim state from the watch. Without this, D-* prove nothing. ----
log "C-aod-off"
AB="$(count 'ambient-enter')"
adb shell input keyevent KEYCODE_SLEEP
sleep 6
shot "C-sleep-key"
CD="$(dark "$OUT/shots/C-sleep-key.png")"
CW="$(awake)"
if [ "$(count 'ambient-enter')" = "$AB" ] && [ "$CD" = "1" ]; then
  result C-aod-off PASS "control: with Always-on off the watch gives no dim state (no ambient-enter; sleep key = black, power $CW)"
else
  result C-aod-off FAIL "control failed: ambient-enter $AB -> $(count 'ambient-enter'), black=$CD, power $CW: Always-on is not off here"
fi
adb shell input keyevent KEYCODE_WAKEUP
sleep 4
shot "C-wake"
result C-wake INFO "after the wake: front $(front)"

# ---- D-setting: Always-on switched ON mid-workout: the app lets the watch dim it; OFF again: back ----
log "D-setting"
bring_app
B="$(count 'self-dim-off setting')"
aod 1
G="$(wait_for 'self-dim-off setting' "$B" 6)"
K1="$(keep_on)"
B2="$(count 'self-dim-on setting')"
aod 0
G2="$(wait_for 'self-dim-on setting' "$B2" 6)"
K2="$(keep_on)"
if [ "$G" = "1" ] && [ "$K1" = "0" ] && [ "$G2" = "1" ] && [ "$K2" = "1" ]; then
  result D-setting PASS "Always-on on mid-workout: screen let go (the watch dims it); off again: the app holds and dims it again"
else
  result D-setting FAIL "Always-on on: off-line=$G keep=$K1; off again: on-line=$G2 keep=$K2"
fi

# ---- D-saver: Battery Saver on: the app leaves the screen to the watch (negative: no keep-on) ----
log "D-saver"
adb shell cmd power set-mode 1 >/dev/null 2>&1 || adb shell settings put global low_power 1 >/dev/null 2>&1 || true
sleep 7
KS="$(keep_on)"
SAVER="$(diag | grep -oE 'saver=[01?]' | tail -1)"
if [ "$KS" = "0" ]; then
  result D-saver PASS "Battery Saver on: no keep-screen-on ($SAVER); the watch saves its battery"
else
  result D-saver FAIL "Battery Saver on but the screen is still held on ($SAVER)"
fi
adb shell cmd power set-mode 0 >/dev/null 2>&1 || adb shell settings put global low_power 0 >/dev/null 2>&1 || true
sleep 7
result D-saver-off INFO "Battery Saver off again: keep-screen-on=$(keep_on)"

# ---- D-end: the workout ends while dimmed: the screen is let go and turns fully OFF ----
# The phone "went silent" CAP_MS ago minus 70 s: 70 s from now the watch ends the workout by itself, through
# the same code as the phone's "ended" (WorkoutLive.sync(false)).
log "D-end"
NOW="$(now_ms)"
fresh_workout 0 $((NOW - CAP_MS + 70000))
sleep 20
shot "D-end-dim-before"
G="$(wait_for 'self-dim-off check' "$(count 'self-dim-off check')" 75)"
KE="$(keep_on)"
sleep 20
shot "D-end-after"
DE="$(dark "$OUT/shots/D-end-after.png")"
WE="$(awake)"
if [ "$G" = "1" ] && [ "$KE" = "0" ] && [ "$WE" != "Awake" ] && [ "$DE" = "1" ]; then
  result D-end PASS "workout over: screen let go (no keep-on) and fully off 20 s later (power $WE, black)"
else
  result D-end FAIL "workout over: self-dim-off=$G keep=$KE, 20 s later power=$WE black=$DE"
fi

# ---- D-no-workout: no workout open: the app never holds the screen; it goes off by the timeout (negative) ----
log "D-no-workout"
adb shell input keyevent KEYCODE_WAKEUP
bring_app
sleep 2
KN="$(keep_on)"
sleep 22
shot "D-no-workout"
DN="$(dark "$OUT/shots/D-no-workout.png")"
WN="$(awake)"
if [ "$KN" = "0" ] && [ "$WN" != "Awake" ] && [ "$DN" = "1" ]; then
  result D-no-workout PASS "no workout: no keep-on, the screen turned fully off by the 15 s timeout (power $WN)"
else
  result D-no-workout FAIL "no workout: keep=$KN, after 22 s power=$WN black=$DN"
fi

adb shell dumpsys power 2>/dev/null | tr -d '\r' > "$OUT/power-end.txt" || true
adb logcat -d > "$OUT/logcat.txt" || true
diag > "$OUT/diary.txt"
aod 1
echo "---- results ----"
cat "$RES"
if [ "$FAILS" -gt 0 ]; then
  echo "::error::Watch dim UAT (Always-on off): $FAILS required check(s) failed (see results.txt)"
  exit 1
fi
