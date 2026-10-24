#!/usr/bin/env bash
# Real-life phone conditions (UAT work package 7, 17 Oct 2026). Called by
# .github/workflows/qa-conditions.yml from inside the emulator runner. ADVISORY: not in the release
# gate. The owner's phone profile (360 dp, font 1.3, Asia/Kolkata), the member app driven by Maestro
# (apps/mobile/qa/xc-*.yaml), the LIVE server read through the owner's own functions
# (apps/mobile/qa/xc_server.py, on top of WP6's xj_server.py) and what the phone holds read over adb
# (apps/mobile/qa/xc_phone.py: the database with root, the notification list, the channels).
#
#   C1 upgrade      the previous MettleUp release (rebuilt from its tag for the emulator, signed as released), real data (2 workouts, a followed plan, Body
#                   fat, lb, Ring through DND on) and a workout left OPEN mid-rest -> `adb install -r`
#                   of this build -> the data, the open workout, the setting, the rest alert (fires or
#                   is cleanly gone) and the channel names ("Rest is over")
#   C2 no internet  a shop order offline (bag kept, plain words) -> online: ONE order on the server;
#                   QR check-in offline -> online: ONE visit (and a second scan: still one); Leave
#                   offline with open orders (refused, nothing half-done), then with none (left, told to
#                   the gym on the next start: the server forgets the member); the workout loop offline
#   C3 flaky        GPRS delay + EDGE speed: an order still placed once; airplane mode switched on
#                   straight after "Place order": ONE order after the retry
#   C4 process      killed (Home, then `am kill`, never force-stop) mid-rest, with the finish sheet
#      death        open, and mid-Hevy-import: the workout and rest intact; no half import
#   C5 Doze         a 1:30 rest with the screen off, deep Doze forced and the app in standby bucket
#                   "rare": "Rest is over" within 5 s of the rest's end
#   C6 exact alarm  SCHEDULE_EXACT_ALARM denied (as after a restore): the alert still comes, and the
#                   app says so when it may be late; background-restricted: "May be late - tap to fix"
#
# An app bug a condition finds keeps its check, marked as an EXPECTED FAIL with its finding id
# (XFAIL below; Audit/uat/FINDINGS.md U-C*), so the run can stay green while the bug is open.
#
# Security (WP6 rules): the run makes its OWN fresh online gym and never touches FORGE1 or RAMS01; the
# owner session key lives only in $XJ_STATE_DIR (under $RUNNER_TEMP, never uploaded) and is signed
# out at the end; every 48-hex string is cut from the evidence as the last step. The release-signed
# APK is never put in the evidence.
#
# Environment: XC_APK_DEBUG (this commit, the build's own debug key; always), XC_APK_NEW (this commit
# re-signed with the release key rotation, as release-apk.yml signs; may be empty), XC_APK_OLD
# (the previous MettleUp release rebuilt from its tag for x86_64 and signed the same way: the published
# APK is ARM-only and cannot start on this emulator, see qa-conditions.yml; EMPTY when no MettleUp
# release exists yet, and then C1 is skipped: a ForgeAI release is another app, nothing to upgrade),
# XC_OLD_LABEL (that release's tag, for the log), XC_ONLY (a comma list of condition numbers,
# empty = all).
set -u
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${QA_OUT:-$PWD/qa-out}"
C_OUT="$OUT/conditions"
PKG=com.mettleup.app
export XJ_STATE_DIR="${XJ_STATE_DIR:-${RUNNER_TEMP:-/tmp}/xc-state}"
export XC_OUT="$C_OUT"
mkdir -p "$OUT" "$C_OUT" "$XJ_STATE_DIR"
chmod 700 "$XJ_STATE_DIR" 2>/dev/null || true
export PATH="$PATH:$HOME/.maestro/bin"
APK_DEBUG="${XC_APK_DEBUG:-}"
APK_NEW="${XC_APK_NEW:-}"
APK_OLD="${XC_APK_OLD:-}"
OLD_LABEL="${XC_OLD_LABEL:-the previous release}"
C1_SKIPPED=""
ONLY="$(echo "${XC_ONLY:-}" | tr ',;' '  ' | xargs)"
status=0
T0=$(date +%s)
GYM="QA Conditions Gym"
ROSTER="Asha Offline"
ROSTER_MOBILE="9876500031"

# Expected fails: "<part> <step>" -> the finding id (Audit/uat/FINDINGS.md). Such a step still runs
# and is still reported; its failure does not fail the run (a pass says the finding may be fixed).
declare -A XFAIL=(
  ["C1 4"]="U-C1"
)

log() { echo "[xc] $*" | tee -a "$OUT/timeline.txt"; }
free_maestro() {
  adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
  adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
  sleep 10
}
runs() { [ -z "$ONLY" ] && return 0; case " $ONLY " in *" $1 "*) return 0 ;; esac; return 1; }
now_ms() { adb shell date +%s%3N | tr -d '\r'; }

# ---------------------------------------------------------------- parts and their steps
PARTS="C1 C2s C2a C2b C2c C2d C3a C3b C3c C4a C4b C4c C5 C6a C6b"
declare -A PNAME=(
  [C1]="upgrade the previous MettleUp release -> this build over real data" [C2s]="no internet: join the gym (setup)"
  [C2a]="no internet: shop order" [C2b]="no internet: QR check-in" [C2c]="no internet: Leave"
  [C2d]="no internet: the workout loop" [C3a]="flaky network: order on GPRS/EDGE"
  [C3b]="flaky network: airplane mode in the middle of the order request"
  [C3c]="flaky network: the order's answer lost on the way back" [C4a]="process death mid-rest"
  [C4b]="process death with the finish sheet open" [C4c]="process death mid-Hevy-import"
  [C5]="Doze + standby rare, 1:30 rest asleep" [C6a]="exact alarms denied (as after a restore)"
  [C6b]="background-restricted app"
)
declare -A PFAIL=()
declare -A PSTEPS=()
declare -A PXFAIL=()
declare -A PRAN=()

# step <part> <n> <who> <what> -- <command...>
# One check or action. Output to conditions/<part>.log; CHECK / DB / CHANNEL / CARDS / OWNER / NEW GYM
# / KILLED / VERDICT lines also to the timeline. A failed step fails its part and SKIPS the part's
# later steps (said so), unless it is an expected fail (XFAIL).
step() {
  local p=$1 n=$2 who=$3 what=$4
  shift 5
  PSTEPS[$p]=$n
  PRAN[$p]=1
  if [ -n "${PFAIL[$p]:-}" ]; then
    log "$p step $n ($who: $what) SKIPPED: the part already failed at ${PFAIL[$p]}"
    return 1
  fi
  log "$p step $n ($who: $what) start"
  local t=$(date +%s) tmp rc xf="${XFAIL["$p $n"]:-}"
  tmp=$(mktemp)
  "$@" > "$tmp" 2>&1
  rc=$?
  { echo "===== $p step $n ($who: $what) exit $rc"; cat "$tmp"; } >> "$C_OUT/$p.log"
  grep -E '^(CHECK|DB |CHANNEL|CARDS|OWNER|NEW GYM|SIGNED|KILLED|VERDICT|INSTALL|\[qa\] REST)' "$tmp" | while read -r l; do log "  $l"; done
  rm -f "$tmp"
  if [ $rc -eq 0 ]; then
    if [ -n "$xf" ]; then
      log "$p step $n PASSED although marked expected-fail $xf ($(( $(date +%s) - t ))s): is $xf fixed?"
    else
      log "$p step $n OK ($(( $(date +%s) - t ))s)"
    fi
    return 0
  fi
  adb exec-out screencap -p > "$C_OUT/$p-step$n-failed.png" 2>/dev/null || true
  if [ -n "$xf" ]; then
    PXFAIL[$p]="${PXFAIL[$p]:-}${PXFAIL[$p]:+, }step $n = $xf"
    log "$p step $n EXPECTED FAIL ($xf: $who: $what) after $(( $(date +%s) - t ))s: conditions/$p.log"
    return 0
  fi
  status=1
  PFAIL[$p]="step $n ($who: $what)"
  log "$p step $n FAILED ($who: $what) after $(( $(date +%s) - t ))s: conditions/$p.log, conditions/$p-step$n-failed.png"
  return 1
}
blocked() {
  local p=$1 why=$2
  PRAN[$p]=1
  status=1
  [ -n "${PFAIL[$p]:-}" ] || PFAIL[$p]="blocked: $why"
  log "$p BLOCKED: $why"
}
ok_so_far() { [ -z "${PFAIL[$1]:-}" ]; }

# The commands a step runs.
member() {  # member <flow> [KEY=VALUE ...]: one Maestro flow
  local flow=$1
  shift
  local envs=() kv
  for kv in "$@"; do envs+=(-e "$kv"); done
  free_maestro
  maestro test "${envs[@]}" --format junit --output "$C_OUT/$flow.xml" --test-output-dir "$C_OUT/$flow" "$QA_DIR/$flow.yaml"
}
server() {  # server <check> [args...], `;` between checks (the run's gym, slot C)
  local rc=0 args=()
  for a in "$@" ";"; do
    if [ "$a" = ";" ]; then
      [ ${#args[@]} -gt 0 ] && { python3 "$QA_DIR/xc_server.py" check C "${args[@]}" || rc=1; }
      args=()
    else
      args+=("$a")
    fi
  done
  return $rc
}
server_wait() { python3 "$QA_DIR/xc_server.py" wait C "$@"; }
owner() { python3 "$QA_DIR/xc_server.py" "$1" C "${@:2}"; }
phone() { python3 "$QA_DIR/xc_phone.py" "$@"; }
dbval() {  # dbval <label> <key>: a number from the last `phone db <label>`
  python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ''))" "$C_OUT/db-$1.json" "$2" 2>/dev/null
}
dump() { adb shell dumpsys notification --noredact > "$C_OUT/$1"; }

# Network. Airplane mode as a member switches it (all radios off), then back; the emulator's link
# shaped through its console (adb emu) for the flaky part.
airplane() {  # airplane enable|disable
  adb shell cmd connectivity airplane-mode "$1" >/dev/null 2>&1 || adb shell settings put global airplane_mode_on "$([ "$1" = enable ] && echo 1 || echo 0)"
  sleep 3
  log "airplane mode $1d (airplane_mode_on=$(adb shell settings get global airplane_mode_on | tr -d '\r'))"
}
net_wait() {  # back online: a default network again, then a few seconds for it to settle
  local i
  for i in $(seq 1 30); do
    if adb shell dumpsys connectivity 2>/dev/null | tr -d '\r' | grep -qE 'Active default network: [0-9]+'; then
      sleep 5
      log "network back after ~$(( i * 2 + 5 ))s"
      return 0
    fi
    sleep 2
  done
  log "NETWORK NOT BACK after 60 s"
  return 1
}
online() { airplane disable; net_wait; }
shape() {  # shape <delay> <speed>: gprs/edge, or none/full
  adb emu network delay "$1" > /dev/null 2>&1 || true
  adb emu network speed "$2" > /dev/null 2>&1 || true
  log "emulator link: delay $1, speed $2"
}

# Process death as Android does it to a background app: Home, then `am kill` (never force-stop, which
# would also cancel the app's alarms and notifications). If a foreground service keeps the process
# alive, it is killed with SIGKILL as root, as the low-memory killer would.
kill_app() {  # kill_app [seconds between Home and the kill, default 2]
  local before after
  before=$(adb shell pidof "$PKG" | tr -d '\r')
  adb shell input keyevent KEYCODE_HOME
  sleep "${1:-2}"
  adb shell am kill "$PKG"
  sleep 3
  after=$(adb shell pidof "$PKG" | tr -d '\r')
  if [ -n "$after" ]; then
    echo "KILLED: am kill left pid $after alive (a foreground service?); SIGKILL as root, as the low-memory killer does"
    adb shell "su 0 kill -9 $after"
    sleep 3
    after=$(adb shell pidof "$PKG" | tr -d '\r')
  fi
  if [ -n "$after" ]; then
    echo "KILLED FAILED: pid $after still alive"
    return 1
  fi
  echo "KILLED: pid ${before:-none} gone (Home, then am kill)"
}
reopen() {  # the member taps the app's icon (no force-stop)
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 8
  log "app opened again: pid $(adb shell pidof "$PKG" | tr -d '\r')"
}
open_link() {  # the poster's QR as the camera opens it: the link at the app
  adb shell am start -W -a android.intent.action.VIEW -d "https://forgeai.aakashpahuja.in/c/$1" -p "$PKG" >/dev/null 2>&1
  sleep 4
}
sleep_phone() {
  adb shell input keyevent KEYCODE_SLEEP
  adb shell dumpsys battery unplug >/dev/null 2>&1 || true
}
wake_phone() {
  adb shell dumpsys deviceidle unforce >/dev/null 2>&1 || true
  adb shell dumpsys battery reset >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 1
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
}
# Deep Doze, the way part A forces it (run-device-qa.sh force_deep_idle): switched on, forced, stepped.
force_deep_idle() {
  adb shell dumpsys deviceidle enable deep >/dev/null 2>&1 || true
  adb shell dumpsys deviceidle enable all >/dev/null 2>&1 || true
  adb shell dumpsys deviceidle force-idle deep >/dev/null 2>&1 || true
  local state i
  state=$(adb shell dumpsys deviceidle get deep 2>/dev/null | tr -d '\r\n ')
  for i in $(seq 1 10); do
    [ "$state" = "IDLE" ] && break
    adb shell dumpsys deviceidle step deep >/dev/null 2>&1 || true
    state=$(adb shell dumpsys deviceidle get deep 2>/dev/null | tr -d '\r\n ')
  done
  if [ "$state" = "IDLE" ]; then
    log "doze: deep state IDLE"
  elif adb shell dumpsys alarm 2>/dev/null | tr -d '\r' | grep -A1 'Next wake from idle' | grep -q "$PKG"; then
    log "doze: held off by the rest's own alarm-clock alarm (next wake from idle = $PKG, state ${state:-?}): Doze cannot delay it"
  else
    log "doze: deep state ${state:-unknown} after stepping"
  fi
}
# Wait until <due ms> + <extra s> on the phone's clock.
wait_until_due() {
  local due=$1 extra=$2 now left
  now=$(now_ms)
  left=$(( (due - now) / 1000 + extra ))
  [ "$left" -gt 0 ] && sleep "$left"
  return 0
}
# A rest asleep: the rest is running (a flow just ticked it); dump during, sleep, wait past its end,
# dump after. Sets DUE (the card's end) and TICK.
rest_asleep() {  # rest_asleep <name> <extra-before-sleep-command...>
  local name=$1
  shift
  TICK=$(now_ms)
  dump "$name-during.txt"
  DUE=$(phone due "$C_OUT/$name-during.txt")
  log "$name: rest card ends at $DUE (now $TICK, $(( (DUE - TICK) / 1000 )) s left)"
  sleep_phone
  "$@"
  wait_until_due "$DUE" 8
  dump "$name-after.txt"
  phone cards "$C_OUT/$name-after.txt" | while read -r l; do log "  $l"; done
}

# ---------------------------------------------------------------- the phone
log "device: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r')); conditions: ${ONLY:-all}"
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb logcat -G 16M >/dev/null 2>&1 || true
adb logcat -c
# The owner's phone (the same profile as qa-device.yml's `owner`): 360 dp, font 1.3, India time.
adb shell wm density 480 >/dev/null 2>&1 || true
adb shell settings put system font_scale 1.3 >/dev/null 2>&1 || true
adb shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
adb shell cmd alarm set-timezone Asia/Kolkata >/dev/null 2>&1 || adb shell setprop persist.sys.timezone Asia/Kolkata >/dev/null 2>&1 || true
sleep 3
log "PROFILE owner: screen $(adb shell wm size | tr -d '\r' | tail -1), density $(adb shell wm density | tr -d '\r' | tail -1), font scale $(adb shell settings get system font_scale | tr -d '\r'), time $(adb shell "date '+%a %d %b %Y %H:%M %Z'" | tr -d '\r')"
[ "$(adb shell settings get system font_scale | tr -d '\r')" = "1.3" ] || { log "PROFILE owner FAILED: font scale not set"; status=1; }
for f in "$APK_DEBUG" "$APK_NEW" "$APK_OLD"; do
  [ -n "$f" ] && log "apk: $(basename "$f") $(stat -c %s "$f" 2>/dev/null || echo '?') bytes"
done

# The build that runs every condition after C1 (C1 installs it as the update).
NEW_LABEL=""
install_fresh() {
  local apk label
  for label in rotated debug; do
    apk=$([ $label = rotated ] && echo "$APK_NEW" || echo "$APK_DEBUG")
    [ -n "$apk" ] || continue
    if adb install -r "$apk" > "$C_OUT/install-$label.txt" 2>&1; then
      NEW_LABEL=$label
      log "INSTALL this build ($label key) on a clean phone"
      return 0
    fi
    log "INSTALL $label FAILED: $(tail -1 "$C_OUT/install-$label.txt")"
  done
  return 1
}

# ================================================================ C1 upgrade over real data
c1_upgrade() {
  # The new side, in order: this build with its own debug key (expected to be refused: the old side is
  # signed with key rotation, so Android 9+ sees the release key), then this build signed like a
  # release (rotation). The first that installs in place wins.
  local label apk
  for label in debug rotated; do
    case $label in
      debug) apk=$APK_DEBUG ;;
      *) apk=$APK_NEW ;;
    esac
    if [ -z "$apk" ]; then
      echo "INSTALL $label: no such APK in this run"
      continue
    fi
    if adb install -r "$apk" > "$C_OUT/c1-install-$label.txt" 2>&1 && grep -q Success "$C_OUT/c1-install-$label.txt"; then
      echo "INSTALL $label: Success (updated in place over $OLD_LABEL)"
      echo "$label" > "$C_OUT/c1-upgrade-side.txt"
      return 0
    fi
    echo "INSTALL $label: $(grep -E 'Failure|INSTALL_' "$C_OUT/c1-install-$label.txt" | tail -1)"
  done
  return 1
}
c1_verdict_rest() {  # the rest left running across the update: "Rest is over" came, or nothing stale
  phone rest-clean "$C_OUT/c1-after-due.txt" "$C1_DUE" || return 1
  REST_LATE_BUDGET_S=5 python3 "$QA_DIR/notif.py" over-locked "$C_OUT/c1-after-due.txt" "$C1_TICK" "$C_OUT/c1-during.txt" || echo "(on-time check above is information only for the update case)"
  return 0
}
if runs 1; then
  log "condition 1: upgrade over real data"
  if [ -z "$APK_OLD" ]; then
    # MettleUp 0.56.0: a ForgeAI release (com.forgeai.app) is another app on the phone, so there is
    # no in-place upgrade to test until a MettleUp release exists. Not a failure (advisory run).
    C1_SKIPPED="no published MettleUp release yet (ForgeAI releases are another app), so there is no upgrade to test"
    log "C1 SKIPPED: $C1_SKIPPED"
  elif ! adb install "$APK_OLD" > "$C_OUT/c1-install-old.txt" 2>&1; then
    blocked C1 "$OLD_LABEL did not install: $(tail -1 "$C_OUT/c1-install-old.txt")"
  else
    log "INSTALL $OLD_LABEL: $(adb shell dumpsys package "$PKG" | tr -d '\r' | grep -m1 -E 'versionName=') $(adb shell dumpsys package "$PKG" | tr -d '\r' | grep -m1 -oE 'primaryCpuAbi=[^ ]*')"
    sleep 20
    step C1 1 member "$OLD_LABEL: welcome, 2 workouts, plan, Body fat, lb, Ring through DND, a workout open mid-rest 3:00" -- member xc-1-old-seed
    if ok_so_far C1; then
      C1_TICK=$(now_ms)
      dump c1-during.txt
      C1_DUE=$(phone due "$C_OUT/c1-during.txt")
      log "C1: rest card ends at $C1_DUE ($(( (C1_DUE - C1_TICK) / 1000 )) s left)"
      dump c1-channels-old.txt
      phone channels "$C_OUT/c1-channels-old.txt" > "$C_OUT/c1-channels-old-list.txt" 2>&1 || true
      log "$(phone db c1-old)"
      step C1 2 phone "adb install -r of the new side (debug key, then the release-key rotation)" -- c1_upgrade
    fi
    if ok_so_far C1; then
      log "C1: upgraded with: $(cat "$C_OUT/c1-upgrade-side.txt" 2>/dev/null || echo none); $(adb shell dumpsys package "$PKG" | tr -d '\r' | grep -m1 -E 'versionName=')"
      sleep 8
      dump c1-after-install.txt
      phone cards "$C_OUT/c1-after-install.txt" | while read -r l; do log "  C1 just after the update: $l"; done
      wait_until_due "$C1_DUE" 10
      dump c1-after-due.txt
      step C1 3 phone "the rest across the update: Rest is over came, or nothing stale is left" -- c1_verdict_rest
      step C1 4 phone "that Rest is over carries the live card's Complete set (audit C5-1)" -- phone over-has "$C_OUT/c1-after-due.txt" "Complete set"
      reopen
      step C1 5 member "the open workout, 2 workouts, Body fat 17.5, lb, Ring through DND on, Full Body A" -- member xc-1-new-check
      dump c1-channels-new.txt
      step C1 6 phone "channels renamed: Rest is over; old ones gone" -- phone channels "$C_OUT/c1-channels-new.txt" "rest-over-sound=Rest is over" "rest-over-open=Rest is over, sounds off"
      step C1 7 phone "the database: 2 workouts, the open one with its ticked set, the plan, the measurement" -- phone db-check c1-new workouts=2 open=1 open_done_sets=1 measurements=1 "plan_days>=2"
      NEW_LABEL=$(cat "$C_OUT/c1-upgrade-side.txt" 2>/dev/null || echo "")
    fi
  fi
  adb logcat -d -v time > "$C_OUT/c1-logcat.txt" 2>/dev/null || true
fi
# Every later condition runs on this build. If C1 did not leave it installed, install it now.
if [ -z "$NEW_LABEL" ]; then
  adb uninstall "$PKG" >/dev/null 2>&1 || true
  install_fresh || { log "INSTALL FAILED: this build could not be installed"; status=1; }
  ONBOARDED=0
else
  ONBOARDED=1
fi

# ================================================================ C2 + C3: the gym, offline and flaky
if runs 2 || runs 3; then
  log "conditions 2 and 3: no internet and a flaky network, against the run's own fresh gym"
  GYM_OK=0
  if [ "$ONBOARDED" != 1 ]; then
    step C2s 0 member "demo data (C1 did not leave an onboarded app)" -- member xc-seed-demo
  fi
  if python3 "$QA_DIR/xc_server.py" new-gym C "$GYM" 2>&1 | tee -a "$C_OUT/C2s.log" "$OUT/timeline.txt" | grep -q '^NEW GYM C'; then
    CODE=$(python3 "$QA_DIR/xc_server.py" code C 2>/dev/null | tail -1 | grep -E '^[0-9A-Z]{6}$')
    [ -n "$CODE" ] && GYM_OK=1
  fi
  if [ $GYM_OK != 1 ]; then
    for p in C2s C2a C2b C2c C2d C3a C3b C3c; do blocked "$p" "the run's gym could not be made"; done
  else
    step C2s 1 owner "adds QA Bottle, QA Band, QA Rope, QA Mat (stock 5 each)" -- bash -c "python3 '$QA_DIR/xc_server.py' add-product C 'QA Bottle' 200 5 && python3 '$QA_DIR/xc_server.py' add-product C 'QA Band' 150 5 && python3 '$QA_DIR/xc_server.py' add-product C 'QA Rope' 300 5 && python3 '$QA_DIR/xc_server.py' add-product C 'QA Mat' 500 5"
    step C2s 2 owner "adds $ROSTER (mobile $ROSTER_MOBILE) with a plan from today" -- owner add-roster "$ROSTER" "$ROSTER_MOBILE"
    step C2s 3 member "joins with the gym code" -- member xc-2-join CODE="$CODE" GYM="$GYM"
    step C2s 4 server "1 app member" -- server app-members 1
    if ! ok_so_far C2s; then
      for p in C2a C2b C2c C3a C3b C3c; do blocked "$p" "the phone did not join the gym (C2s)"; done
    fi
  fi

  # ---- C2a: an order with no internet, then online
  if runs 2 && ok_so_far C2s && [ $GYM_OK = 1 ]; then
    airplane enable
    step C2a 1 member "offline: Place order -> plain words, the bag kept" -- member xc-2a-order-offline GYM="$GYM"
    step C2a 2 server "nothing reached the gym" -- server orders-count "QA Bottle" 0
    online
    step C2a 3 member "online: the same bag placed with one tap" -- member xc-2a-order-online GYM="$GYM"
    step C2a 4 server "exactly ONE QA Bottle order, ordered" -- server orders-count "QA Bottle" 1 ";" order "QA Bottle" ordered 1
  fi
  # ---- C2b: QR check-in with no internet, then online, then a second scan
  if runs 2 && ok_so_far C2s && [ $GYM_OK = 1 ]; then
    airplane enable
    open_link "$CODE"
    step C2b 1 member "offline: Check in -> plain words, a Check in button again" -- member xc-2b-checkin-offline GYM="$GYM"
    step C2b 2 server "no visit yet" -- server visits-today 0
    online
    step C2b 3 member "online: Check in again -> the mobile once -> in as Asha" -- member xc-2b-checkin-online GYM="$GYM"
    step C2b 4 server "ONE visit, from the app" -- server visit "$ROSTER" app ";" visits-today 1
    open_link "$CODE"
    step C2b 5 member "the poster scanned again -> already checked in" -- member xc-2b-checkin-again GYM="$GYM"
    step C2b 6 server "still ONE visit" -- server visits-today 1
  fi
  # ---- C3: a flaky network
  if runs 3 && ok_so_far C2s && [ $GYM_OK = 1 ]; then
    shape gprs edge
    step C3a 1 member "GPRS delay + EDGE speed: QA Band ordered" -- member xc-3a-order-slow GYM="$GYM"
    step C3a 2 server "exactly ONE QA Band order" -- server orders-count "QA Band" 1
    shape none full
    # Runs 38983728841 and 38991190510: switching airplane mode on "straight after the tap" (even
    # on a 2 s link) always came after the order was done, so the cut is now made certain with the
    # phone's own firewall (root iptables), and timed by what it blocks, not by a clock:
    #  3b: the request is HELD (outgoing HTTPS dropped) when Place order is tapped; 3 s later
    #      airplane mode goes on in the middle of it. The gym never got it.
    #  3c: the ANSWER is lost (incoming HTTPS dropped on the connection the bag just used): the gym
    #      writes the order, the phone never hears back.
    # Then online again, the member taps Place order once more (the same bag), and the server must
    # hold exactly ONE order. What the server held at the cut is printed.
    fw() {  # fw add|del OUTPUT|INPUT
      local op=-I port=--dport
      [ "$1" = del ] && op=-D
      [ "$2" = INPUT ] && port=--sport
      adb shell "su 0 iptables $op $2 -p tcp $port 443 -j DROP" >/dev/null 2>&1
      adb shell "su 0 ip6tables $op $2 -p tcp $port 443 -j DROP" >/dev/null 2>&1
      log "firewall: $1 drop of HTTPS on $2 ($(adb shell "su 0 iptables -S $2" 2>/dev/null | tr -d '\r' | grep -c 'dport 443\|sport 443') rule(s) now)"
    }
    held_at_cut() {
      log "$1: at the cut the server held: $(python3 "$QA_DIR/xc_server.py" check C orders-count "$2" 1 | sed 's/^CHECK [A-Z]* C orders-count: //')"
    }
    c3b_cut() {
      member xc-3-to-bag GYM="$GYM" PRODUCT="QA Rope" || return 1
      fw add OUTPUT
      member xc-3-tap || { fw del OUTPUT; return 1; }
      sleep 3
      airplane enable
      fw del OUTPUT
    }
    step C3b 1 member "QA Rope: Place order held on its way, airplane mode on in the middle of it" -- c3b_cut
    step C3b 2 member "the words left on screen" -- member xc-3-outcome SHOT=3b
    held_at_cut C3b "QA Rope"
    online
    step C3b 3 member "back online: Place order again if the bag was kept; My orders shows 1 x QA Rope" -- member xc-3b-order-retry GYM="$GYM" PRODUCT="QA Rope" SHOT=3b
    step C3b 4 server "exactly ONE QA Rope order" -- server orders-count "QA Rope" 1
    c3c_cut() {
      member xc-3-to-bag GYM="$GYM" PRODUCT="QA Mat" || return 1
      fw add INPUT
      member xc-3-tap || { fw del INPUT; return 1; }
    }
    step C3c 1 member "QA Mat: Place order with the gym's answer cut off" -- c3c_cut
    step C3c 2 member "the words left on screen (after the app stops waiting)" -- member xc-3-outcome SHOT=3c
    held_at_cut C3c "QA Mat"
    fw del INPUT
    sleep 3
    step C3c 3 member "Place order again if the bag was kept; My orders shows 1 x QA Mat" -- member xc-3b-order-retry GYM="$GYM" PRODUCT="QA Mat" SHOT=3c
    step C3c 4 server "exactly ONE QA Mat order" -- server orders-count "QA Mat" 1
  fi
  # ---- C2c: Leave with no internet
  if runs 2 && ok_so_far C2s && [ $GYM_OK = 1 ]; then
    airplane enable
    step C2c 1 member "offline Leave with open orders: refused, still in the gym" -- member xc-2c-leave-open GYM="$GYM"
    step C2c 2 server "still 1 app member, orders still open" -- server app-members 1
    online
    step C2c 3 owner "marks every open order collected" -- owner set-orders collected
    step C2c 4 member "My orders catches up: nothing Ordered" -- member xc-2c-orders-closed GYM="$GYM"
    airplane enable
    step C2c 5 member "offline Leave, nothing open: left, the gym told later" -- member xc-2c-leave-offline GYM="$GYM"
    step C2c 6 server "the gym was not told yet: still 1 app member" -- server app-members 1
    online
    step C2c 7 member "the next start, online" -- member xc-2c-restart
    step C2c 8 server "the gym forgot the member (0 app members) within 90 s" -- server_wait 90 app-members 0
  fi
  # ---- C2d: the workout loop with no internet
  if runs 2; then
    phone db c2d-before > /dev/null 2>&1
    W0=$(dbval c2d-before workouts)
    log "C2d: $W0 workouts before"
    if [ -z "$W0" ]; then
      blocked C2d "the database could not be read before the workout"
    else
      airplane enable
      step C2d 1 member "offline: start, fill, tick, a 0:30 rest runs out, finish" -- member xc-2d-workout-offline COUNT="$(( W0 + 1 ))"
      online
      step C2d 2 phone "the database: one more workout" -- phone db-check c2d-after workouts=$(( W0 + 1 )) open=0
    fi
  fi
  airplane disable >/dev/null 2>&1
  shape none full
fi

# ================================================================ C4 process death
if runs 4; then
  log "condition 4: process death (Home, then am kill)"
  step C4a 1 member "fresh install state + demo data" -- member xc-seed-demo
  step C4a 2 member "a bench workout, rest 3:00 running" -- member xc-open-rest REST="Rest 3:00" SHOT=4a
  step C4a 3 phone "killed mid-rest" -- kill_app
  step C4a 4 phone "the database while dead: the workout open, set 1 ticked" -- phone db-check c4a-dead open=1 open_done_sets=1
  if ok_so_far C4a; then
    dump c4a-dead-notifications.txt
    phone cards "$C_OUT/c4a-dead-notifications.txt" | while read -r l; do log "  C4a while dead: $l"; done
    reopen
    step C4a 5 member "opened again: workout open, set 1 ticked, rest still running" -- member xc-4a-rest-check
  fi
  if ok_so_far C4a; then
    step C4b 1 member "Finish workout tapped: the finish sheet open" -- member xc-4b-finish-sheet
    phone db c4b-before > /dev/null 2>&1
    W0=$(dbval c4b-before workouts)
    step C4b 2 phone "killed with the finish sheet open" -- kill_app
    step C4b 3 phone "the database: still open, nothing saved behind the member's back" -- phone db-check c4b-dead open=1 open_done_sets=1 workouts="${W0:-0}"
    reopen
    step C4b 4 member "opened again: the workout still open, set 1 ticked (then discarded)" -- member xc-4b-finish-check
  else
    blocked C4b "C4a did not leave a workout open"
  fi
  # ---- C4c: mid-import
  TODAY=$(date -u -d '+5 hours 30 minutes' +%F)
  # Three of part W's 3-year histories back to back (~1,500 workouts, ~19,000 sets, none on the demo's
  # last 13 weeks), so the import is still writing when the app is killed.
  : > "$C_OUT/hevy-make.txt"
  : > "$C_OUT/qa-hevy-xc.csv"
  for back in 100 1200 2300; do
    python3 "$QA_DIR/tools/make_big_hevy.py" "$C_OUT/hevy-part.csv" --today "$(date -u -d "$TODAY -$back days" +%F)" >> "$C_OUT/hevy-make.txt" 2>&1
    if [ -s "$C_OUT/qa-hevy-xc.csv" ]; then tail -n +2 "$C_OUT/hevy-part.csv" >> "$C_OUT/qa-hevy-xc.csv"; else cat "$C_OUT/hevy-part.csv" > "$C_OUT/qa-hevy-xc.csv"; fi
  done
  rm -f "$C_OUT/hevy-part.csv"
  log "C4c: Hevy history $(tr '\n' ' ' < "$C_OUT/hevy-make.txt") -> $(wc -l < "$C_OUT/qa-hevy-xc.csv") lines"
  adb push "$C_OUT/qa-hevy-xc.csv" /sdcard/Download/qa-hevy-xc.csv >/dev/null 2>&1 || log "C4c: FIXTURE PUSH FAILED"
  for i in $(seq 1 30); do
    adb shell content query --uri content://media/external/downloads --projection _display_name 2>/dev/null | grep -q qa-hevy-xc && break
    sleep 1
  done
  log "C4c: the file in the phone's Downloads list after ${i}s"
  phone db c4c-before > /dev/null 2>&1
  W1=$(dbval c4c-before workouts)
  log "C4c: $W1 workouts before the import"
  step C4c 1 member "Import from Hevy (~1,000 workouts), Merge, Import tapped" -- member xc-4c-import-start
  step C4c 2 phone "killed mid-import (as soon as the app is in the background)" -- kill_app 1
  adb exec-out screencap -p > "$C_OUT/c4c-just-after-kill.png" 2>/dev/null || true
  phone db c4c-dead > /dev/null 2>&1
  W2=$(dbval c4c-dead workouts)
  reopen
  step C4c 3 member "opened again: the app starts normally" -- member xc-4c-import-check
  sleep 30
  phone db c4c-after > /dev/null 2>&1
  W3=$(dbval c4c-after workouts)
  c4c_verdict() {
    echo "VERDICT C4c: before ${W1:-?}, right after the kill ${W2:-?}, after reopening (+30 s) ${W3:-?}"
    [ -n "$W1" ] && [ -n "$W2" ] && [ -n "$W3" ] || { echo "VERDICT C4c: database not read"; return 1; }
    if [ "$W2" = "$W1" ] && [ "$W3" = "$W1" ]; then
      echo "VERDICT C4c: NO HALF IMPORT - nothing of the import was kept (it runs in one transaction); the member imports again"
      return 0
    fi
    if [ "$W2" -ge $(( W1 + 1200 )) ]; then
      echo "VERDICT C4c: the import had already FINISHED before the kill (not mid-import; the file was too quick)"
      return 0
    fi
    if [ "$W2" = "$W1" ] && [ "$W3" -ge $(( W1 + 1200 )) ]; then
      echo "VERDICT C4c: CLEAN RESUME - nothing kept at the kill, the whole import there after reopening"
      return 0
    fi
    echo "VERDICT C4c: HALF IMPORT - $(( W2 - W1 )) workouts kept at the kill, $(( W3 - W1 )) after reopening"
    return 1
  }
  step C4c 4 phone "no half import (nothing kept, or all of it)" -- c4c_verdict
fi

# ================================================================ C5 Doze + standby rare
if runs 5; then
  log "condition 5: Doze and standby bucket rare, a 1:30 rest with the screen off"
  [ "$ONBOARDED" = 1 ] || runs 4 || step C5 0 member "demo data" -- member xc-seed-demo
  step C5 1 member "a bench workout, rest 1:30 running" -- member xc-open-rest REST="Rest 1:30" SHOT=5
  if ok_so_far C5; then
    c5_low() {
      # Run 38983728841: one set right after the screen went off read back 20 (working set); the
      # app's own notification updates can lift it again, so it is set, marked idle, and read again.
      local b i
      for i in 1 2 3; do
        adb shell am set-inactive "$PKG" true >/dev/null 2>&1 || true
        adb shell am set-standby-bucket "$PKG" rare >/dev/null 2>&1 || true
        sleep 2
        b=$(adb shell am get-standby-bucket "$PKG" | tr -d '\r')
        [ "$b" = 40 ] && break
      done
      log "standby bucket now: $b (40 = rare; 10 active, 20 working set, 30 frequent, 45 restricted); inactive: $(adb shell am get-inactive "$PKG" | tr -d '\r')"
      # Runs 38983728841 / 38991190510 read 20 every time: Android 12+ never puts an app that holds
      # the exact-alarm permission (ForgeAI: USE_EXACT_ALARM) below "working set", so "rare" cannot
      # happen to it on a real phone either. The rest is still tested asleep in that lowest bucket.
      [ "$b" = 40 ] || log "standby: 'rare' refused by Android (an app with exact alarms stays at working set or better): the rest runs in bucket $b"
      force_deep_idle
    }
    rest_asleep c5 c5_low
    step C5 2 phone "Rest is over within 5 s of the rest's end, still showing 60 s later" -- env REST_LATE_BUDGET_S=5 python3 "$QA_DIR/notif.py" over-locked "$C_OUT/c5-after.txt" "$TICK" "$C_OUT/c5-during.txt"
    wake_phone
    adb shell am set-standby-bucket "$PKG" active >/dev/null 2>&1 || true
    adb shell dumpsys deviceidle disable deep >/dev/null 2>&1 || true
  fi
fi

# ================================================================ C6 exact alarms after a restore
if runs 6; then
  log "condition 6: exact alarms denied (as after a backup-restore), then a background-restricted app"
  [ "$ONBOARDED" = 1 ] || runs 4 || runs 5 || step C6a 0 member "demo data" -- member xc-seed-demo
  adb shell appops set "$PKG" SCHEDULE_EXACT_ALARM deny >/dev/null 2>&1
  log "C6a: appops SCHEDULE_EXACT_ALARM: $(adb shell appops get "$PKG" SCHEDULE_EXACT_ALARM | tr -d '\r' | tr '\n' ' '); USE_EXACT_ALARM: $(adb shell dumpsys package "$PKG" | tr -d '\r' | grep -o 'android.permission.USE_EXACT_ALARM: granted=[a-z]*' | head -1)"
  step C6a 1 member "a bench workout, rest 0:30 running" -- member xc-open-rest REST="Rest 0:30" SHOT=6a
  if ok_so_far C6a; then
    rest_asleep c6a true
    step C6a 2 phone "the alert still comes" -- phone over-any "$C_OUT/c6a-after.txt" "$DUE"
    C6A_LATE=$(phone late "$C_OUT/c6a-after.txt" "$DUE")
    wake_phone
    step C6a 3 member "Settings -> Workouts: the rest alerts line" -- member xc-6-status SHOT=6a
    c6a_verdict() {
      local said=on-time
      [ -n "$(find "$C_OUT" "$PWD" "$QA_DIR" -maxdepth 7 -name 'xc6-status-6a-may-be-late.png' 2>/dev/null | head -1)" ] && said=may-be-late
      echo "VERDICT C6a: the alert came ${C6A_LATE}s after the rest's end; the app says '$said'"
      if [ "$C6A_LATE" = none ]; then return 1; fi
      if awk "BEGIN{exit !($C6A_LATE <= 5)}"; then
        echo "VERDICT C6a: on time (USE_EXACT_ALARM, granted at install, keeps exact alarms with SCHEDULE_EXACT_ALARM denied)"
        return 0
      fi
      [ "$said" = may-be-late ] && { echo "VERDICT C6a: late, and the app says so"; return 0; }
      echo "VERDICT C6a: LATE and the app does not say so"
      return 1
    }
    step C6a 4 phone "on time, or late and saying so" -- c6a_verdict
  fi
  adb shell appops set "$PKG" SCHEDULE_EXACT_ALARM default >/dev/null 2>&1
  # ---- C6b: Android restricts the app in the background (battery "Restricted")
  adb shell appops set "$PKG" RUN_ANY_IN_BACKGROUND ignore >/dev/null 2>&1
  log "C6b: appops RUN_ANY_IN_BACKGROUND: $(adb shell appops get "$PKG" RUN_ANY_IN_BACKGROUND | tr -d '\r' | tr '\n' ' ')"
  step C6b 1 member "Settings -> Workouts: the rest alerts line" -- member xc-6-status SHOT=6b
  c6b_said() {
    if [ -n "$(find "$C_OUT" "$PWD" "$QA_DIR" -maxdepth 7 -name 'xc6-status-6b-may-be-late.png' 2>/dev/null | head -1)" ]; then
      echo "CHECK OK the app says 'Rest alerts: May be late - tap to fix'"
      return 0
    fi
    echo "CHECK FAILED the app does not say the alerts may be late (background-restricted)"
    return 1
  }
  step C6b 2 phone "it says May be late - tap to fix" -- c6b_said
  step C6b 3 member "a bench workout, rest 0:30 running" -- member xc-open-rest REST="Rest 0:30" SHOT=6b
  if [ "${PSTEPS[C6b]:-0}" = 3 ] && [ -z "${PFAIL[C6b]:-}" ]; then
    rest_asleep c6b true
    step C6b 4 phone "the alert still comes (perhaps late)" -- phone over-any "$C_OUT/c6b-after.txt" "$DUE"
    wake_phone
  fi
  adb shell appops set "$PKG" RUN_ANY_IN_BACKGROUND allow >/dev/null 2>&1
fi

# ---------------------------------------------------------------- clean-up and the verdict
[ -f "$XJ_STATE_DIR/C.json" ] && python3 "$QA_DIR/xc_server.py" sign-out C 2>&1 | tee -a "$OUT/timeline.txt"
rm -rf "$XJ_STATE_DIR"
adb shell rm -f /sdcard/Download/qa-hevy-xc.csv >/dev/null 2>&1 || true
rm -f "$C_OUT/qa-hevy-xc.csv"
adb logcat -d -v time > "$OUT/logcat.txt" 2>/dev/null || true
mkdir -p "$C_OUT/screens"
{ find "$C_OUT" -path "$C_OUT/screens" -prune -o -name 'xc*.png' -print 2>/dev/null; find "$PWD" "$QA_DIR" -maxdepth 1 -name 'xc*.png' 2>/dev/null; } \
  | while read -r f; do cp "$f" "$C_OUT/screens/" 2>/dev/null; done

SECS=$(( $(date +%s) - T0 ))
{
  echo "## Real-life phone conditions (advisory)"
  echo
  echo "| Part | What | Result |"
  echo "|---|---|---|"
  for p in $PARTS; do
    [ -n "${PRAN[$p]:-}" ] || continue
    if [ -n "${PFAIL[$p]:-}" ]; then r="FAILED at ${PFAIL[$p]}"
    elif [ -n "${PXFAIL[$p]:-}" ]; then r="PASS with expected fails (${PXFAIL[$p]})"
    else r="PASS (${PSTEPS[$p]:-0} steps)"; fi
    echo "| $p | ${PNAME[$p]} | $r |"
  done
  echo
  [ -z "$C1_SKIPPED" ] || echo "C1 (upgrade) SKIPPED: $C1_SKIPPED."
  echo "Upgrade side (C1): $(cat "$C_OUT/c1-upgrade-side.txt" 2>/dev/null || echo 'not run / none'). Build for C2-C6: ${NEW_LABEL:-?} key."
  echo "Run time on the phone: $(( SECS / 60 )) min $(( SECS % 60 )) s. Gym: $GYM (${CODE:-none}), made fresh for this run; owner session signed out."
} > "$OUT/conditions-summary.md"
cat "$OUT/conditions-summary.md" | tee -a "$OUT/timeline.txt"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$OUT/conditions-summary.md" >> "$GITHUB_STEP_SUMMARY"
log "conditions finished: $([ $status = 0 ] && echo PASS || echo FAILED)"
# No key in the evidence, as the very last thing before the upload (WP6's rule).
find "$OUT" -type f \( -name '*.txt' -o -name '*.log' -o -name '*.md' -o -name '*.xml' -o -name '*.json' -o -name '*.html' \) -print0 2>/dev/null \
  | xargs -0 -r sed -i -E 's/[0-9a-f]{48}/[key removed]/g' 2>/dev/null || true
if grep -rqE --include='*.txt' --include='*.log' --include='*.md' --include='*.xml' --include='*.json' --include='*.html' '[0-9a-f]{48}' "$OUT" 2>/dev/null; then
  status=1
  echo "[xc] KEY CHECK FAILED: a key-shaped string is still in qa-out; the run fails"
fi
exit $status
