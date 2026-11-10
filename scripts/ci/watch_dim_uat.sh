#!/usr/bin/env bash
# R-353 / R-364 UAT on a Wear OS emulator (wear-build.yml, job "uat"): with the watch's "Always-on
# screen" ON and a workout open, MettleUp DIMS (ambient) instead of the screen going black, and keeps
# doing so after every interruption the owner hit (a call, leaving the app, another app on top, a
# notification, the phone link dropping). Also the self-heal (AmbientDiag.Heal: a black screen where
# it should have dimmed -> one rebuild on the next wake, at most 2), the R-341 dim rest countdown, and
# that nothing keeps running afterwards (no wake lock, no rebuild loop).
#
# Ambient is read from the app's own diary lines in logcat ("ForgeWear: diag ... ambient-enter",
# AmbientDiag.note), and from the screen picture (a dimmed app is not all black).
#
# Required (exit 1 if not): H-timeout, H-sleep, I-leave, I-over, I-call, I-notify, I-link, X-heal,
# X-noloop, R-tick, R-end, N-wakelock, N-quiet, S-saver. INFO lines are recorded only.
#
# Usage: watch_dim_uat.sh <apk> <out-dir>
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
diag() { # the app's diary lines in logcat so far
  adb logcat -d -s ForgeWear:I 2>/dev/null | tr -d '\r' | grep " diag " || true
}
count() { # pattern: how many diary lines match
  local n
  n="$(diag | grep -cE "$1")" || true
  echo "${n:-0}"
}
front() {
  adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus" | head -1 | tr -d '\r'
}
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
bring_app() {
  # Android holds back an activity start for ~5 s after HOME ("app switch" protection): run 42012268965
  # (API 35) dim-checked the watch face because of it. Start, then make sure MettleUp is in front.
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
# Screen to sleep (as wrist down) and back: did MettleUp enter ambient? Sets AMB_OK and AMB_DARK.
dim_check() { # phase
  local p="$1" before
  before="$(count 'ambient-enter')"
  adb shell input keyevent KEYCODE_SLEEP
  sleep 6
  shot "$p-dim"
  AMB_DARK="$(dark "$OUT/shots/$p-dim.png")"
  if [ "$(count 'ambient-enter')" -gt "$before" ]; then AMB_OK=1; else AMB_OK=0; fi
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 4
  shot "$p-wake"
}
require_dim() { # name text
  dim_check "$1"
  if [ "$AMB_OK" = "1" ] && [ "$AMB_DARK" = "0" ]; then
    result "$1" PASS "$2: dimmed (ambient entered, dimmed screen drawn)"
  else
    result "$1" FAIL "$2: ambient entered=$AMB_OK, black screen=$AMB_DARK (front: $(front))"
  fi
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

# A member's watch off the charger, 15 s screen timeout, Always-on screen ON.
adb shell dumpsys battery unplug || true
adb shell dumpsys battery set ac 0 || true
adb shell dumpsys battery set usb 0 || true
adb shell dumpsys battery set status 3 || true
adb shell dumpsys battery set level 82 || true
adb shell svc power stayon false || true
adb shell settings put system screen_off_timeout 15000 || true
adb shell settings put global ambient_enabled 1 || true
adb shell settings put secure doze_always_on 1 || true
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

# A workout open (the phone's last word just now). REST_ENDS > 0 adds a running rest.
workout_state() { # rest-ends-ms (0 = none)
  local now at
  now=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
  at=$((now - 60000))
  {
    echo "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>"
    echo "<map>"
    echo "    <boolean name=\"active\" value=\"true\" />"
    echo "    <long name=\"workoutAt\" value=\"$at\" />"
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
    if [ "$1" != "0" ]; then
      echo "    <long name=\"startedAt\" value=\"$now\" />"
      echo "    <long name=\"endsAt\" value=\"$1\" />"
    fi
    echo "</map>"
  } > /tmp/forgeai_watch.xml
  write_prefs /tmp/forgeai_watch.xml forgeai_watch.xml
}

# A long rest runs through the first phases, so the dimmed pictures show the workout's rest screen
# (no phone exists in CI: without a rest the screen says "Phone not connected").
NOW=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
workout_state $((NOW + 25 * 60 * 1000))
adb logcat -c || true
bring_app
shot "0-workout-open"

# ---- H: happy path ----
log "H-timeout: the screen times out by itself (15 s) and must dim"
B="$(count 'ambient-enter')"
sleep 22
shot "H-timeout-dim"
D="$(dark "$OUT/shots/H-timeout-dim.png")"
if [ "$(count 'ambient-enter')" -gt "$B" ] && [ "$D" = "0" ]; then
  result H-timeout PASS "after the 15 s timeout the workout screen dimmed (not black)"
else
  result H-timeout FAIL "after the timeout: ambient entered=$([ "$(count 'ambient-enter')" -gt "$B" ] && echo 1 || echo 0), black=$D"
fi
adb shell input keyevent KEYCODE_WAKEUP
sleep 4
log "H-sleep"
require_dim H-sleep "wrist down (sleep key)"

# ---- I: interruptions, each followed by a dim check ----
log "I-leave: out to the watch face and back"
adb shell input keyevent KEYCODE_HOME
sleep 4
shot "I-leave-out"
bring_app
require_dim I-leave "after leaving the app and coming back"

log "I-over: another app over MettleUp (as the call screen), then back"
adb shell am start -W -a android.settings.SETTINGS >/dev/null 2>&1 || true
sleep 4
shot "I-over-settings"
adb shell input keyevent KEYCODE_BACK
sleep 3
bring_app
require_dim I-over "after another app was on top"

log "I-call: an incoming call (emulator modem, if it has one)"
CALL="$(adb emu gsm call 5551234 2>&1 | tr -d '\r' | head -1)"
sleep 8
shot "I-call-ringing"
result I-call-front INFO "incoming call sent ('$CALL'); in front while ringing: $(front)"
adb emu gsm cancel 5551234 >/dev/null 2>&1 || true
sleep 4
bring_app
require_dim I-call "after the call"

log "I-notify: a notification arrives on the open workout"
adb shell cmd notification post -t "Message" uat_note "Hello from a friend" >/dev/null 2>&1 || true
sleep 5
shot "I-notify"
require_dim I-notify "after a notification"
adb shell cmd notification cancel uat_note >/dev/null 2>&1 || true

log "I-link: the phone link drops (Bluetooth off, then on)"
adb shell svc bluetooth disable >/dev/null 2>&1 || adb shell cmd bluetooth_manager disable >/dev/null 2>&1 || true
sleep 6
shot "I-link-off"
require_dim I-link "with the phone link down"
adb shell svc bluetooth enable >/dev/null 2>&1 || adb shell cmd bluetooth_manager enable >/dev/null 2>&1 || true
sleep 3

# ---- X: the self-heal ----
# The owner's fault, made on purpose: the screen goes BLACK where it dimmed before (Always-on off for a
# moment). The app must spot it (blackout=1) and rebuild once on the wake; with Always-on back on, the
# rebuilt screen dims again.
log "X-heal"
adb shell settings put global ambient_enabled 0 || true
adb shell settings put secure doze_always_on 0 || true
sleep 2
RB="$(count ' rebuild ')"
adb shell input keyevent KEYCODE_SLEEP
sleep 6
shot "X-black"
BO="$(count 'stop .*blackout=1')"
adb shell settings put global ambient_enabled 1 || true
adb shell settings put secure doze_always_on 1 || true
sleep 2
adb shell input keyevent KEYCODE_WAKEUP
sleep 6
shot "X-after-wake"
RA="$(count ' rebuild ')"
if [ "$BO" -ge 1 ] && [ "$RA" -gt "$RB" ]; then
  dim_check X-heal
  if [ "$AMB_OK" = "1" ] && [ "$AMB_DARK" = "0" ]; then
    result X-heal PASS "black screen spotted (blackout=1), screen rebuilt on wake, and it dims again"
  else
    result X-heal FAIL "rebuilt, but it did not dim after: ambient=$AMB_OK black=$AMB_DARK"
  fi
else
  result X-heal FAIL "black screen not spotted or no rebuild: blackout lines=$BO rebuilds $RB -> $RA"
fi

log "X-noloop: Always-on off for good: at most 2 rebuilds, then it stops trying"
adb shell settings put global ambient_enabled 0 || true
adb shell settings put secure doze_always_on 0 || true
sleep 2
RB="$(count ' rebuild ')"
for i in 1 2 3 4; do
  adb shell input keyevent KEYCODE_SLEEP
  sleep 5
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 5
done
RA="$(count ' rebuild ')"
if [ $((RA - RB)) -le 2 ]; then
  result X-noloop PASS "4 black screens in a row: $((RA - RB)) rebuild(s) (cap 2), then no more"
else
  result X-noloop FAIL "4 black screens in a row: $((RA - RB)) rebuilds (more than 2: a loop)"
fi
adb shell settings put global ambient_enabled 1 || true
adb shell settings put secure doze_always_on 1 || true
sleep 2

# ---- R: R-341 regression, the dim rest countdown ticks each second ----
log "R-tick: a rest running while dimmed"
adb shell am force-stop $PKG
sleep 1
NOW=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
ENDS=$((NOW + 40000))
workout_state "$ENDS"
bring_app
shot "R-rest-bright"
adb shell input keyevent KEYCODE_SLEEP
sleep 4
# R-437: the end of a rest while dimmed (the buzz, the "Rest is over" card) must not end the dim state.
EXIT_B="$(count 'ambient-exit| stop ')"
shot "R-tick-1"
sleep 2
shot "R-tick-2"
adb shell dumpsys power 2>/dev/null | tr -d '\r' | grep -iE "mettleup|forgeai" > "$OUT/R-wakelocks-during-rest.txt" || true
H1="$(md5sum "$OUT/shots/R-tick-1.png" | cut -d' ' -f1)"
H2="$(md5sum "$OUT/shots/R-tick-2.png" | cut -d' ' -f1)"
D1="$(dark "$OUT/shots/R-tick-1.png")"
if [ "$H1" != "$H2" ] && [ "$D1" = "0" ]; then
  result R-tick PASS "the dimmed rest countdown changed between two pictures 2 s apart"
else
  result R-tick FAIL "the dimmed rest screen did not change in 2 s (same picture=$([ "$H1" = "$H2" ] && echo 1 || echo 0), black=$D1)"
fi
result R-wakelock-during INFO "wake locks during the dim rest: $(tr '\n' ' ' < "$OUT/R-wakelocks-during-rest.txt")"

# ---- N: negative, nothing left running ----
log "N: wait for the rest to end while dimmed"
while :; do
  T=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
  [ "$T" -ge $((ENDS + 12000)) ] && break
  sleep 3
done
# Only the wake locks HELD now (the "Wake Locks: size=" list: "PARTIAL_WAKE_LOCK 'tag' ACQ=..."), not
# the history lines (ACQ/REL events), which every rest leaves behind.
shot "R-end-dim"
EXIT_A="$(count 'ambient-exit| stop ')"
DE="$(dark "$OUT/shots/R-end-dim.png")"
if [ "$EXIT_A" = "$EXIT_B" ] && [ "$DE" = "0" ]; then
  result R-end PASS "the rest ended while dimmed (buzz + Rest is over): still dimmed 12 s later, no exit or stop"
else
  result R-end FAIL "after the rest ended while dimmed: ambient-exit/stop lines $EXIT_B -> $EXIT_A, black=$DE"
fi
result R-end-card INFO "the Rest is over card: $(adb logcat -d 2>/dev/null | tr -d '\r' | grep -E 'alerting' | grep -E '51002|rest-over' | tail -1 | cut -c1-200)"
adb shell dumpsys power 2>/dev/null | tr -d '\r' > "$OUT/N-power.txt" || true
grep -E "^ *PARTIAL_WAKE_LOCK +'(mettleup:rest-end|ForgeAI:restOver)'" "$OUT/N-power.txt" > "$OUT/N-wakelocks-after-rest.txt" || true
LAST="$(grep -E " (ACQ|REL) (mettleup:rest-end|ForgeAI:restOver)" "$OUT/N-power.txt" | tail -2 | tr '\n' ' ')"
result N-history INFO "last wake lock events: $LAST"
if [ -s "$OUT/N-wakelocks-after-rest.txt" ]; then
  result N-wakelock FAIL "a wake lock is still held after the rest: $(tr '\n' ' ' < "$OUT/N-wakelocks-after-rest.txt")"
else
  result N-wakelock PASS "no MettleUp wake lock held 12 s after the rest ended"
fi
B="$(diag | wc -l)"
RB="$(count ' rebuild ')"
sleep 60
A="$(diag | wc -l)"
RA="$(count ' rebuild ')"
if [ $((A - B)) -le 6 ] && [ "$RA" = "$RB" ]; then
  result N-quiet PASS "a quiet minute dimmed: $((A - B)) diary line(s), no rebuild (no busy loop)"
else
  result N-quiet FAIL "a quiet minute dimmed wrote $((A - B)) diary lines and $((RA - RB)) rebuilds"
fi
adb shell input keyevent KEYCODE_WAKEUP
sleep 3
shot "N-wake"

# ---- S: R-437, Battery Saver (Pixel Watch: it switches the dim screen off and turns on by itself at 15 %) ----
# A black screen under Battery Saver is the watch's own: the diary names it (cause=battery-saver) and the
# app does not rebuild (it cannot help). If this emulator keeps dimming under Battery Saver, the check
# still requires that no rebuild happened, and says so.
log "S-saver: Battery Saver on, the screen goes off"
adb shell cmd power set-mode 1 >/dev/null 2>&1 || adb shell settings put global low_power 1 >/dev/null 2>&1 || true
sleep 3
RB="$(count ' rebuild ')"
SB="$(count 'cause=battery-saver')"
AB="$(count 'ambient-enter')"
adb shell input keyevent KEYCODE_SLEEP
sleep 6
shot "S-saver-off"
adb shell input keyevent KEYCODE_WAKEUP
sleep 6
shot "S-saver-wake"
RA="$(count ' rebuild ')"
SA="$(count 'cause=battery-saver')"
AA="$(count 'ambient-enter')"
SAVER="$(diag | grep -oE 'saver=[01?]' | tail -1)"
if [ "$RA" != "$RB" ]; then
  result S-saver FAIL "Battery Saver black screen: $((RA - RB)) rebuild(s) (none wanted; $SAVER)"
elif [ "$SA" -gt "$SB" ]; then
  result S-saver PASS "Battery Saver black screen named in the diary (cause=battery-saver), no rebuild"
elif [ "$AA" -gt "$AB" ]; then
  result S-saver PASS "this emulator kept dimming under Battery Saver ($SAVER); no rebuild"
else
  result S-saver FAIL "neither named nor dimmed under Battery Saver ($SAVER, front: $(front))"
fi
adb shell cmd power set-mode 0 >/dev/null 2>&1 || adb shell settings put global low_power 0 >/dev/null 2>&1 || true

adb logcat -d > "$OUT/logcat.txt" || true
diag > "$OUT/diary.txt"
echo "---- results ----"
cat "$RES"
if [ "$FAILS" -gt 0 ]; then
  echo "::error::Watch dim UAT: $FAILS required check(s) failed (see results.txt)"
  exit 1
fi
