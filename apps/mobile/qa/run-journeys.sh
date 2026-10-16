#!/usr/bin/env bash
# Cross-role journeys (UAT work package 6, 17 Oct 2026). Called by .github/workflows/qa-journeys.yml
# from inside the emulator runner. Each journey is one business story across the member app (Maestro
# on the emulator, the owner's phone: 360 dp, font 1.3, India time), the admin app (Playwright,
# phone size, en-IN, Asia/Kolkata, against the REAL live server, signed in as the run's own gym's
# owner) and the server (the owner's own functions, apps/mobile/qa/xj_server.py), checked at every
# hand-off:
#   J1 order chain     owner adds a product (stock 3) -> member joins by code, orders 2 -> owner
#                      "Mark ready" -> member sees Ready -> owner "Collected (paid)" -> member sees
#                      Collected; stock 1
#   J2 cancel chain    member orders 1 and cancels (stock back, owner sees "Cancelled by member");
#                      member orders 1, owner cancels (member sees "The gym cancelled", stock back)
#   J3 message chain   owner sends -> bell 1 + inbox -> opened: owner's "Seen by 1 of 1" -> owner
#                      takes it back -> gone from the inbox
#   J4 check-in chain  owner adds a member with a mobile + sells Monthly -> poster link c/<code>,
#                      mobile typed -> in, NO "see the desk" -> owner's Visits: the visit, tagged App
#   J5 import chain    owner imports a 2-row CSV (one row = the member's mobile) -> poster link ->
#                      matched to that row -> owner's Visits: tagged App
#   J6 branding        owner sets a brand colour -> the member app joins and relaunches in it (the
#                      gym's name under the titles, the start-up screen, the colour read off the screen)
#
# Security (WP6 hard rules): the run makes its OWN two fresh ONLINE gyms (gym_create_online, the way
# part INV-f does; A for J1-J4, B for J5-J6) and never touches FORGE1 or RAMS01. The owner session
# keys live only in $XJ_STATE_DIR (under $RUNNER_TEMP, never uploaded), are masked in the log, and
# are signed out at the end. The gyms themselves stay behind, like INV-e / INV-f's.
#
# Usage: run-journeys.sh <path-to-apk>        Evidence: qa-out/ (uploaded as the qa-journeys artifact)
set -u
APK="$1"
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
DASH_DIR="$(cd "$QA_DIR/../../dashboard" && pwd)"
OUT="${QA_OUT:-$PWD/qa-out}"
J_OUT="$OUT/journeys"
PKG=com.forgeai.app
export XJ_STATE_DIR="${XJ_STATE_DIR:-${RUNNER_TEMP:-/tmp}/xj-state}"
mkdir -p "$OUT" "$J_OUT" "$XJ_STATE_DIR"
chmod 700 "$XJ_STATE_DIR" 2>/dev/null || true
export PATH="$PATH:$HOME/.maestro/bin"
status=0
T0=$(date +%s)
BRAND="#FF5CA8"   # the colour XJ6a saves (apps/dashboard/e2e-live/xj-checkin.live.mjs)
GYM_A="QA Journey Gym A"
GYM_B="QA Journey Gym B"
SHAKER="QA Shaker"
TOWEL="QA Towel"
TITLE="QA journeys: closed on Monday"

log() { echo "[xj] $*" | tee -a "$OUT/timeline.txt"; }
free_maestro() {
  adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
  adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
  sleep 10
}

# ---------------------------------------------------------------- journeys and their steps
JOURNEYS="J1 J2 J3 J4 J5 J6"
declare -A JNAME=(
  [J1]="order chain" [J2]="cancel chain" [J3]="message chain"
  [J4]="check-in chain" [J5]="import to check-in" [J6]="branding chain"
)
declare -A JFAIL=()
declare -A JSTEPS=()

# step <journey> <n> <who> <what> -- <command...>
# Runs one hand-off. Its output goes to journeys/<J>.log; CHECK / COLOUR / NEW GYM lines also to the
# timeline. A failed step fails its journey; the journey's later steps are then SKIPPED (said so).
step() {
  local j=$1 n=$2 who=$3 what=$4
  shift 5
  JSTEPS[$j]=$n
  if [ -n "${JFAIL[$j]:-}" ]; then
    log "$j step $n ($who: $what) SKIPPED: the journey already failed at ${JFAIL[$j]}"
    return 1
  fi
  log "$j step $n ($who: $what) start"
  local t=$(date +%s) tmp rc
  tmp=$(mktemp)
  "$@" > "$tmp" 2>&1
  rc=$?
  { echo "===== $j step $n ($who: $what) exit $rc"; cat "$tmp"; } >> "$J_OUT/$j.log"
  grep -E '^(CHECK|COLOUR|NEW GYM|SIGNED|START-UP)' "$tmp" | while read -r l; do log "  $l"; done
  rm -f "$tmp"
  if [ $rc -eq 0 ]; then
    log "$j step $n OK ($(( $(date +%s) - t ))s)"
    return 0
  fi
  status=1
  JFAIL[$j]="step $n ($who: $what)"
  adb exec-out screencap -p > "$J_OUT/$j-step$n-failed.png" 2>/dev/null || true
  log "$j step $n FAILED ($who: $what) after $(( $(date +%s) - t ))s: journeys/$j.log, journeys/$j-step$n-failed.png"
  return 1
}
# The journey cannot go on because a step it leans on (in another journey) failed.
blocked() {
  local j=$1 n=$2 why=$3
  status=1
  [ -n "${JFAIL[$j]:-}" ] || JFAIL[$j]="step $n (blocked: $why)"
  log "$j step $n BLOCKED: $why"
}

# The commands a step runs.
member() {  # member <flow> [KEY=VALUE ...]: one Maestro flow on the emulator
  local flow=$1
  shift
  local envs=() kv
  for kv in "$@"; do envs+=(-e "$kv"); done
  free_maestro
  maestro test "${envs[@]}" --format junit --output "$J_OUT/$flow.xml" --test-output-dir "$J_OUT/$flow" "$QA_DIR/$flow.yaml"
}
admin() {  # admin <XJ step id>: one Playwright step of apps/dashboard/e2e-live
  ( cd "$DASH_DIR" && XJ_PW_OUT="$J_OUT/admin/$1" npx playwright test -c e2e-live/live.config.mjs -g " $1 " )
}
server() {  # server <slot> <check> [args...]: one or more checks, `;` between them
  local slot=$1
  shift
  local rc=0 args=()
  for a in "$@" ";"; do
    if [ "$a" = ";" ]; then
      [ ${#args[@]} -gt 0 ] && { python3 "$QA_DIR/xj_server.py" check "$slot" "${args[@]}" || rc=1; }
      args=()
    else
      args+=("$a")
    fi
  done
  return $rc
}
open_link() {  # the poster's QR as the camera opens it: the link at the app
  adb shell am start -W -a android.intent.action.VIEW -d "$1" -p "$PKG"
  sleep 3
}
checkin_at() { open_link "https://forgeai.aakashpahuja.in/c/$1" && member "$2" "${@:3}"; }
colour_check() {
  local before after
  # Maestro writes a takeScreenshot under its output folder, the working folder or the flow's own.
  before=$(find "$J_OUT/xj-5-switch" "$PWD" "$QA_DIR" -maxdepth 4 -name 'xj6-00-workout-forgeai-look.png' 2>/dev/null | head -1)
  after=$(find "$J_OUT/xj-6-relaunch" "$PWD" "$QA_DIR" -maxdepth 4 -name 'xj6-04-workout-gym-look.png' 2>/dev/null | head -1)
  [ -n "$before" ] && [ -n "$after" ] || { echo "COLOUR FAILED: screenshots missing (before '$before', after '$after')"; return 1; }
  python3 "$QA_DIR/xj_colour.py" "$BRAND" "$before" "$after"
}
# The start-up screen, read the way part BR reads it (ForgeSplash in logcat): joining the branded
# gym and the relaunch inside it ask for the plain start-up screen (2+ "plain" lines after the last
# earlier ForgeAI line), then Leave asks for ForgeAI's (the last line). Android 13+ only.
splash_check() {
  local sdk
  sdk=$(adb shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')
  # Read from the stream kept since the start: logcat's own buffer turns over within minutes
  # (run 38967797709 kept only the last launch and the Leave).
  cp "$SPLASH_LOG" "$J_OUT/xj6-splash-log.txt" 2>/dev/null || true
  if [ -z "$sdk" ] || [ "$sdk" -lt 33 ]; then echo "START-UP screen: SKIPPED (Android API ${sdk:-?}; needs 33+)"; return 0; fi
  python3 - "$J_OUT/xj6-splash-log.txt" <<'PY'
import sys
ls = [l for l in open(sys.argv[1], encoding='utf-8', errors='replace') if 'start-up screen set' in l]
kinds = ['plain' if 'plain start-up' in l else 'forge' for l in ls]
run = 0
for k in reversed(kinds[:-1]):
    if k != 'plain':
        break
    run += 1
ok = bool(kinds) and kinds[-1] == 'forge' and run >= 2
print(f"START-UP screen {'OK' if ok else 'FAILED'}: {' '.join(kinds) or 'no lines'} (needs 2+ plain, then ForgeAI's after Leave)")
sys.exit(0 if ok else 1)
PY
}

# ---------------------------------------------------------------- the phone
log "device: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
adb install -r "$APK" || { log "INSTALL FAILED"; exit 1; }
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb logcat -c
# A bigger log buffer for the evidence, and the start-up screen lines kept as they come (J6 step 6).
adb logcat -G 16M >/dev/null 2>&1 || true
SPLASH_LOG="$J_OUT/splash-stream.txt"
adb logcat -v time -s ForgeSplash:I > "$SPLASH_LOG" 2>/dev/null &
SPLASH_PID=$!
# The owner's phone (the same profile as qa-device.yml's `owner`): 360 dp, font 1.3, India time.
adb shell wm density 480 >/dev/null 2>&1 || true
adb shell settings put system font_scale 1.3 >/dev/null 2>&1 || true
adb shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
adb shell cmd alarm set-timezone Asia/Kolkata >/dev/null 2>&1 || adb shell setprop persist.sys.timezone Asia/Kolkata >/dev/null 2>&1 || true
sleep 3
log "PROFILE owner: screen $(adb shell wm size | tr -d '\r' | tail -1), density $(adb shell wm density | tr -d '\r' | tail -1), font scale $(adb shell settings get system font_scale | tr -d '\r'), time $(adb shell "date '+%a %d %b %Y %H:%M %Z'" | tr -d '\r')"
[ "$(adb shell settings get system font_scale | tr -d '\r')" = "1.3" ] || { log "PROFILE owner FAILED: font scale not set"; status=1; }

# ---------------------------------------------------------------- seed: the phone, two fresh gyms
SEED_OK=1
log "seed: demo data on the phone"
free_maestro
maestro test --format junit --output "$J_OUT/xj-seed.xml" --test-output-dir "$J_OUT/xj-seed" "$QA_DIR/xj-seed.yaml" \
  > "$J_OUT/seed.log" 2>&1 || { SEED_OK=0; status=1; adb exec-out screencap -p > "$J_OUT/seed-failed.png"; log "SEED FAILED: the phone (journeys/seed.log)"; }
GYM_A_OK=0
GYM_B_OK=0
python3 "$QA_DIR/xj_server.py" new-gym A "$GYM_A" 2>&1 | tee -a "$J_OUT/seed.log" "$OUT/timeline.txt"
[ "${PIPESTATUS[0]}" -eq 0 ] && GYM_A_OK=1
python3 "$QA_DIR/xj_server.py" new-gym B "$GYM_B" 2>&1 | tee -a "$J_OUT/seed.log" "$OUT/timeline.txt"
[ "${PIPESTATUS[0]}" -eq 0 ] && GYM_B_OK=1
# A gym code is 6 capitals or digits; anything else is never used (that gym's journeys fail).
gym_code() { python3 "$QA_DIR/xj_server.py" code "$1" 2>/dev/null | tail -1 | grep -E '^[0-9A-Z]{6}$'; }
CODE_A=$([ $GYM_A_OK = 1 ] && gym_code A)
CODE_B=$([ $GYM_B_OK = 1 ] && gym_code B)
[ -n "$CODE_A" ] || { GYM_A_OK=0; log "gym A: no usable gym code"; }
[ -n "$CODE_B" ] || { GYM_B_OK=0; log "gym B: no usable gym code"; }
for j in J1 J2 J3 J4; do
  [ $SEED_OK = 1 ] || blocked "$j" 0 "the phone seed failed"
  [ $GYM_A_OK = 1 ] || blocked "$j" 0 "gym A could not be made"
done
for j in J5 J6; do
  [ $SEED_OK = 1 ] || blocked "$j" 0 "the phone seed failed"
  [ $GYM_B_OK = 1 ] || blocked "$j" 0 "gym B could not be made"
done
A=(CODE="$CODE_A" GYM="$GYM_A")

# ---------------------------------------------------------------- J1 order chain
step J1 1 admin "adds $SHAKER (stock 3) and $TOWEL (stock 4)" -- admin XJ1a
step J1 2 server "both products, as added" -- server A stock "$SHAKER" 3 ";" stock "$TOWEL" 4
step J1 3 member "joins with the gym code, orders 2 $SHAKER" -- member xj-1-join-order "${A[@]}"
JOINED_A=$([ -z "${JFAIL[J1]:-}" ] && echo 1 || echo 0)
step J1 4 server "the order: 2, ordered; stock 1; 1 app member" -- server A order "$SHAKER" ordered 2 - J1 ";" stock "$SHAKER" 1 ";" app-members 1
step J1 5 admin "sees the order under New, taps Mark ready" -- admin XJ1b
step J1 6 server "the order is ready" -- server A order "$SHAKER" ready 2
step J1 7 member "My orders shows Ready" -- member xj-1-ready "${A[@]}"
step J1 8 admin "taps Collected (paid)" -- admin XJ1c
step J1 9 server "the order is collected; stock still 1" -- server A order "$SHAKER" collected 2 ";" stock "$SHAKER" 1
step J1 10 member "My orders shows Collected" -- member xj-1-collected "${A[@]}"

# Journeys 2-4 lean on the phone being in gym A (J1 step 3).
[ "${JOINED_A:-0}" = 1 ] || for j in J2 J3 J4; do blocked "$j" 0 "the phone did not join gym A (J1 step 3)"; done

# ---------------------------------------------------------------- J2 cancel chain
step J2 1 member "orders 1 $TOWEL, cancels it" -- member xj-2-order-cancel "${A[@]}"
step J2 2 server "cancelled by the member; stock back to 4" -- server A order "$TOWEL" cancelled 1 member J2a ";" stock "$TOWEL" 4
step J2 3 admin "sees Cancelled by member" -- admin XJ2a
step J2 4 member "orders 1 $TOWEL again" -- member xj-2-order "${A[@]}"
step J2 5 server "the order: 1, ordered; stock 3" -- server A order "$TOWEL" ordered 1 - J2b ";" stock "$TOWEL" 3
step J2 6 admin "cancels it; stock shows 4" -- admin XJ2b
step J2 7 server "cancelled by the gym; stock back to 4" -- server A order "$TOWEL" cancelled 1 gym ";" stock "$TOWEL" 4
step J2 8 member "My orders: The gym cancelled this order" -- member xj-2-gym-cancelled "${A[@]}"

# ---------------------------------------------------------------- J3 message chain
step J3 1 admin "sends a message" -- admin XJ3a
step J3 2 server "1 recipient, seen by 0" -- server A message "$TITLE" 0 no
step J3 3 member "bell shows 1 new, opens the inbox" -- member xj-3-bell "${A[@]}"
step J3 4 server "seen by 1" -- server A message "$TITLE" 1 no
step J3 5 admin "sees Seen by 1 of 1, takes it back" -- admin XJ3b
step J3 6 server "withdrawn" -- server A message "$TITLE" 1 yes
step J3 7 member "the inbox is empty" -- member xj-3-gone "${A[@]}"

# ---------------------------------------------------------------- J4 check-in chain
step J4 1 admin "adds Kiran Desk with a mobile, sells Monthly" -- admin XJ4a
step J4 2 server "her plan covers today" -- server A plan-today "Kiran Desk"
step J4 3 member "poster link, types the mobile, in with no see-the-desk line" -- checkin_at "$CODE_A" xj-4-checkin "${A[@]}"
step J4 4 server "one visit today, source app" -- server A visit "Kiran Desk" app ";" visits-today 1
step J4 5 admin "Visits shows her, tagged App" -- admin XJ4b

# ---------------------------------------------------------------- J5 import + J6 branding (gym B)
B=(CODE_B="$CODE_B" GYM_B="$GYM_B" GYM="$GYM_A")
step J6 1 admin "sets the brand colour $BRAND" -- admin XJ6a
step J6 2 server "the gym's brand colour" -- server B brand "$BRAND"
step J5 1 admin "imports a 2-row CSV" -- admin XJ5a
step J5 2 server "2 roster members" -- server B roster 2
# The phone moves from gym A to gym B: one phone step both journeys lean on (step 3 of each).
IN_B=0
if [ "${JOINED_A:-0}" != 1 ] || [ $GYM_B_OK != 1 ] || [ $SEED_OK != 1 ]; then
  blocked J5 3 "the phone is not in gym A (J1 step 3), or gym B could not be made"
  blocked J6 3 "the phone is not in gym A (J1 step 3), or gym B could not be made"
else
  log "J5+J6 step 3 (member: leaves gym A, joins gym B by its code: the gym's look) start"
  if member xj-5-switch "${B[@]}" > "$J_OUT/switch.log" 2>&1; then
    IN_B=1
    log "J5+J6 step 3 OK"
  else
    adb exec-out screencap -p > "$J_OUT/switch-failed.png" 2>/dev/null || true
    for j in J5 J6; do
      [ -n "${JFAIL[$j]:-}" ] || JFAIL[$j]="step 3 (member: leaves gym A, joins gym B)"
    done
    status=1
    log "J5+J6 step 3 FAILED (member: leaves gym A, joins gym B): journeys/switch.log, journeys/switch-failed.png"
  fi
fi
step J6 4 member "relaunch: starts in the gym's look" -- member xj-6-relaunch "${B[@]}"
step J6 5 phone "the brand colour read off the screen" -- colour_check
step J5 4 member "poster link, types the mobile, matched to the imported row" -- checkin_at "$CODE_B" xj-5-checkin "${B[@]}"
step J5 5 server "one visit today for Meera Import, source app" -- server B visit "Meera Import" app ";" visits-today 1
step J5 6 admin "Visits shows the imported member, tagged App" -- admin XJ5b
if [ "$IN_B" = 1 ]; then
  if member xj-5-leave "${B[@]}" > "$J_OUT/leave-b.log" 2>&1; then
    log "phone left gym B (ForgeAI's look back)"
    step J6 6 phone "start-up screen: plain in the gym, ForgeAI's after Leave" -- splash_check
  else
    adb exec-out screencap -p > "$J_OUT/leave-b-failed.png" 2>/dev/null || true
    blocked J6 6 "the phone could not leave gym B (journeys/leave-b.log)"
  fi
fi

# ---------------------------------------------------------------- clean-up and the verdict
[ $GYM_A_OK = 1 ] && python3 "$QA_DIR/xj_server.py" sign-out A 2>&1 | tee -a "$OUT/timeline.txt"
[ $GYM_B_OK = 1 ] && python3 "$QA_DIR/xj_server.py" sign-out B 2>&1 | tee -a "$OUT/timeline.txt"
rm -rf "$XJ_STATE_DIR"
adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
kill "$SPLASH_PID" 2>/dev/null || true
# Every screenshot in one folder.
mkdir -p "$J_OUT/screens"
{ find "$J_OUT" -path "$J_OUT/screens" -prune -o -name 'xj*.png' -print 2>/dev/null; find "$PWD" "$QA_DIR" -maxdepth 1 -name 'xj*.png' 2>/dev/null; } \
  | while read -r f; do cp "$f" "$J_OUT/screens/" 2>/dev/null; done

SECS=$(( $(date +%s) - T0 ))
{
  echo "## Cross-role journeys"
  echo
  echo "| Journey | Result |"
  echo "|---|---|"
  for j in $JOURNEYS; do
    if [ -n "${JFAIL[$j]:-}" ]; then r="FAILED at ${JFAIL[$j]}"; else r="PASS (${JSTEPS[$j]:-0} steps)"; fi
    echo "| $j ${JNAME[$j]} | $r |"
  done
  echo
  echo "Run time on the phone: $(( SECS / 60 )) min $(( SECS % 60 )) s. Gyms: $GYM_A (${CODE_A:-none}), $GYM_B (${CODE_B:-none}), made fresh for this run; owner sessions signed out."
} > "$OUT/journeys-summary.md"
cat "$OUT/journeys-summary.md" | tee -a "$OUT/timeline.txt"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$OUT/journeys-summary.md" >> "$GITHUB_STEP_SUMMARY"
log "journeys finished: $([ $status = 0 ] && echo PASS || echo FAILED)"
# No key in the evidence, as the very last thing before the upload: any 48-hex-character string
# (the shape of every owner, session and member key, _new_key in 0002) is cut from every text file.
find "$OUT" -type f \( -name '*.txt' -o -name '*.log' -o -name '*.md' -o -name '*.xml' -o -name '*.json' -o -name '*.html' \) -print0 2>/dev/null \
  | xargs -0 -r sed -i -E 's/[0-9a-f]{48}/[key removed]/g' 2>/dev/null || true
if grep -rqE --include='*.txt' --include='*.log' --include='*.md' --include='*.xml' --include='*.json' --include='*.html' '[0-9a-f]{48}' "$OUT" 2>/dev/null; then
  status=1
  echo "[xj] KEY CHECK FAILED: a key-shaped string is still in qa-out; the run fails"
fi
exit $status
