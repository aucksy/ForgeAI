# shellcheck shell=bash
# UAT work package 4b (17 Oct 2026): the member app's last high-risk gaps, on a real screen, in REAL
# bad conditions made around the app (never inside it): sourced by run-device-qa.sh, which runs the
# parts after the other UAT parts (UAT_PARTS). Each part starts from a fresh install + the demo.
#   ub  M-07   the start-up error screen: the database damaged (first 4 KB overwritten, log files
#              moved aside, as root), "Details", "Save my data file" (Android's share sheet),
#              "Try again" while still damaged, then restored -> "Try again" opens the app on the
#              same workouts.
#   uf  M-58   Finish refused while another program holds the database's write lock (sqlite3,
#              root): "Could not save", the banner, the workout still open; then Finish on a FULL
#              phone (filled as the app's own user); then space freed, Finish saves exactly once.
#   ua  M-50, M-56   the phone's clock moved 75 min on (root): the timer pauses by itself, "Count
#              it"; Finish asks "Ended at ..." / "Now" and saves the real length.
#   uv  M-67   edit a past workout while one is open: Resume / "Discard it and edit this one".
#   ug  M-96   merge an own exercise into Barbell Bench Press: its record and workout move.
#   uk  M-110  the real Today widget's Start (keyed) and Resume, then the app-icon shortcuts opened
#              with the intent Android holds for them: Resume, Start (keyed), the same Start again
#              (spent key: asks first), Log body weight.
# Evidence: part-u*/ (screenshots), uat-*.txt, timeline.txt.
#
# Errors a part makes ON PURPOSE (a damaged database, a held lock, a full phone) are listed in
# $OUT/expected-errors.txt (part, pattern): qa_report.py scan reports a matching line in THAT part's
# own log as expected, not as a failure; the same line anywhere else still fails the run. The part
# also checks the line DID appear (the condition really reached the app).
UROOT=/data/local/tmp/uat-root.sh

# Root helper on the phone (tools/uat-root.sh). Needs the google_apis image's su.
uat_root_ready() {
  adb push "$QA_DIR/tools/uat-root.sh" "$UROOT" >/dev/null 2>&1 || { log "UAT ROOT: could not push tools/uat-root.sh"; return 1; }
  adb shell chmod 755 "$UROOT" >/dev/null 2>&1 || true
  [ "$(adb shell su 0 id -u 2>/dev/null | tr -d '\r')" = "0" ] || { log "UAT ROOT: no root on this image (su 0 id -u)"; return 1; }
}
# Runs a helper command as root; prints its output, returns ITS exit code (adb passes it through).
uroot() {
  local out rc
  out=$(adb shell su 0 sh "$UROOT" "$@" 2>&1)
  rc=$?
  printf '%s\n' "$out" | tr -d '\r'
  return $rc
}
uat_app_uid() { adb shell dumpsys package "$PKG" 2>/dev/null | tr -d '\r' | grep -m1 -oE '(userId|appId)=[0-9]+' | cut -d= -f2; }

# A part's expected (injected) error: part name as qa_report.py names it (UB2), and an ERE.
uat_expect() { printf '%s\t%s\n' "$1" "$2" >> "$OUT/expected-errors.txt"; }
# Did part $1's own device log show the injected error $2 (proof the condition reached the app)?
uat_saw() { grep -rqsE "$2" "$OUT/part-$1" 2>/dev/null; }

# The screen as text into $OUT/$1-ui.txt: uiautomator, else Maestro's hierarchy (a ticking clock on
# screen stops uiautomator: "could not get idle state").
uat_dump() {
  adb shell rm -f /sdcard/qa-uat.xml >/dev/null 2>&1 || true
  adb shell uiautomator dump /sdcard/qa-uat.xml >/dev/null 2>&1 || true
  adb pull /sdcard/qa-uat.xml "$OUT/$1-ui.txt" >/dev/null 2>&1 || true
  if ! grep -q '<node' "$OUT/$1-ui.txt" 2>/dev/null; then
    maestro hierarchy > "$OUT/$1-ui.txt" 2>/dev/null || true
    free_maestro
  fi
}
# The Profile's "Workouts: N" (N) off the screen, after a flow that left it there.
uat_workouts() {
  uat_dump "$1"
  grep -oE 'Workouts: [0-9,]+' "$OUT/$1-ui.txt" 2>/dev/null | head -1 | grep -oE '[0-9,]+' | tr -d ','
}
uat_fail() { status=1; log "UAT $1 FAILED: $2"; }

# ---------------------------------------------------------------- UB (M-07)
part_ub() {
  local n top restored=""
  uat_root_ready || { uat_fail UB "needs root (google_apis image) to damage and restore the database; not run"; return 1; }
  uat_part ub1 uat-b1.yaml || return 1
  n=$(uat_workouts ub1)
  [ -n "$n" ] || { uat_fail UB "could not read the Profile's 'Workouts: N' (ub1-ui.txt)"; return 1; }
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  sleep 2
  uroot db-break > "$OUT/uat-ub-db-break.txt"
  if grep -q "SQLite format 3" "$OUT/uat-ub-db-break.txt" || grep -qE "NO DATABASE|FAILED" "$OUT/uat-ub-db-break.txt"; then
    uat_fail UB "the database could not be damaged (uat-ub-db-break.txt)"
    uroot db-restore >> "$OUT/uat-ub-db-break.txt"
    return 1
  fi
  log "UAT UB: the database is damaged: first 4 KB overwritten, -wal/-shm moved aside (Profile said Workouts: $n; uat-ub-db-break.txt)"
  # The app logs the failed start (console.error, so a phone test sees it): expected in UB2 and UB3.
  uat_expect UB2 'start-up failed|reading the database failed|not a database|SQLITE_NOTADB|file is encrypted'
  uat_expect UB3 'start-up failed|reading the database failed|not a database|SQLITE_NOTADB|file is encrypted'
  if uat_part ub2 uat-b2.yaml; then
    sleep 3
    top=$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//')
    adb exec-out screencap -p > "$OUT/ub-share-sheet.png" 2>/dev/null || true
    if echo "$top" | grep -qiE 'chooser|intentresolver|ResolverActivity'; then
      log "UAT UB: 'Save my data file' opened Android's share sheet ($top)"
    else
      uat_fail UB "no share sheet in front after 'Save my data file' ($top; ub-share-sheet.png)"
    fi
    adb shell input keyevent KEYCODE_BACK
    sleep 2
    uat_saw ub2 'start-up failed' || uat_fail UB "the app never logged its failed start in part-ub2 (was the database really damaged?)"
    uat_part ub3 uat-b3.yaml || true
  fi
  uroot db-restore > "$OUT/uat-ub-db-restore.txt"
  if grep -q "SQLite format 3" "$OUT/uat-ub-db-restore.txt"; then
    restored=1
    log "UAT UB: the database is put back in place (uat-ub-db-restore.txt)"
  else
    uat_fail UB "the database could not be put back (uat-ub-db-restore.txt)"
  fi
  if [ -n "$restored" ] && uat_passed ub3; then
    uat_part ub4 uat-b4.yaml -e WORKOUTS="$n" && \
      log "UAT UB: error screen (never the welcome), Details, Save my data file, Try again while damaged, then Try again -> the app back on Workouts: $n"
  fi
}

# ---------------------------------------------------------------- UA (M-50, M-56)
UA_AUTO_TIME=""
uat_clock_now() { adb shell date +%s 2>/dev/null | tr -d '\r'; }
# Set the phone's clock to epoch $1 (seconds). Root `date` first, then Android's own shell command.
uat_clock_set() {
  local want="$1" s now d
  s=$(date -u -d "@$want" +%m%d%H%M%Y.%S)
  adb shell su 0 date -u "$s" > "$OUT/uat-clock-set.txt" 2>&1 || true
  sleep 2
  now=$(uat_clock_now)
  d=$(( now - want )); d=${d#-}
  if [ -z "$now" ] || [ "$d" -gt 120 ]; then
    adb shell cmd alarm set-time "$(( want * 1000 ))" >> "$OUT/uat-clock-set.txt" 2>&1 || true
    sleep 2
    now=$(uat_clock_now)
    d=$(( now - want )); d=${d#-}
  fi
  [ -n "$now" ] && [ "$d" -le 120 ]
}
part_ua() {
  local t0 h0 off
  uat_root_ready || log "UAT UA: no root; the clock is moved with Android's shell command only"
  uat_part ua1 uat-a1.yaml || return 1
  UA_AUTO_TIME=$(adb shell settings get global auto_time 2>/dev/null | tr -d '\r')
  adb shell settings put global auto_time 0 >/dev/null 2>&1 || true
  t0=$(uat_clock_now)
  h0=$(date +%s)
  off=$(( t0 - h0 ))
  if uat_clock_set $(( t0 + 75 * 60 )); then
    log "UAT UA: the phone's clock moved 75 min on: $(adb shell date | tr -d '\r') (was $(date -u -d "@$t0" '+%H:%M UTC'))"
    uat_part ua2 uat-a2.yaml && \
      log "UAT UA: paused by itself after an hour with no sets, Count it (over an hour), Finish asked Ended at / Now and saved minutes, not 1h+"
  else
    uat_fail UA "the phone's clock could not be moved (uat-clock-set.txt)"
  fi
  # Back to the real time (the runner's clock, with the phone's offset before the move).
  if uat_clock_set $(( $(date +%s) + off )); then
    log "UAT UA: the phone's clock is back: $(adb shell date | tr -d '\r')"
  else
    uat_fail UA "the phone's clock could not be put back (uat-clock-set.txt)"
  fi
  [ -n "$UA_AUTO_TIME" ] && [ "$UA_AUTO_TIME" != "null" ] && adb shell settings put global auto_time "$UA_AUTO_TIME" >/dev/null 2>&1
  return 0
}

# ---------------------------------------------------------------- UF (M-58)
uat_lock_free() {
  uroot lock-free >> "$OUT/uat-uf-lock.txt"
  [ -n "${UF_LOCK_PID:-}" ] && { kill "$UF_LOCK_PID" 2>/dev/null; wait "$UF_LOCK_PID" 2>/dev/null; }
  UF_LOCK_PID=""
}
part_uf() {
  local n i uid locked="" today outcome
  uat_root_ready || { uat_fail UF "needs root (google_apis image) for the lock and the full phone; not run"; return 1; }
  uat_part uf1 uat-f1.yaml || return 1
  n=$(uat_workouts uf1)
  [ -n "$n" ] || { uat_fail UF "could not read the Profile's 'Workouts: N' (uf1-ui.txt)"; return 1; }
  # The workout starts in UF2, and a workout belongs to the day it STARTED: that is the day UF5 opens
  # in the Calendar (owner run 39647358581 crossed midnight in India between UF2 and UF5, U-Q6).
  today=$(adb shell "date '+%A %d %B'" 2>/dev/null | tr -d '\r' | sed -E 's/ 0([0-9]) / \1 /')
  uat_part uf2 uat-f2.yaml || return 1
  # 1. Another program holds the database's write lock.
  : > "$OUT/uat-uf-lock.txt"
  if uroot has-sqlite3 >> "$OUT/uat-uf-lock.txt"; then
    adb shell su 0 sh "$UROOT" lock-hold 900 >> "$OUT/uat-uf-lock.txt" 2>&1 &
    UF_LOCK_PID=$!
    for i in $(seq 1 15); do
      sleep 1
      if uroot lock-probe >> "$OUT/uat-uf-lock.txt"; then locked=1; break; fi
    done
    if [ -n "$locked" ]; then
      log "UAT UF: another program holds the database's write lock (sqlite3 BEGIN IMMEDIATE; probe refused)"
      uat_expect UF3 'database is locked|SQLITE_BUSY|database table is locked'
      uat_part uf3 uat-f3.yaml && log "UAT UF: Finish refused under the lock: 'Could not save', the banner, the workout still open with both sets"
    else
      uat_fail UF "the lock was not taken (uat-uf-lock.txt)"
    fi
    uat_lock_free
    uroot lock-probe >> "$OUT/uat-uf-lock.txt" && uat_fail UF "the lock is still held after lock-free (uat-uf-lock.txt)"
  else
    uat_fail UF "this phone image has no sqlite3, so the refused-Finish half could not run (uat-uf-lock.txt)"
  fi
  # 2. The phone's storage is full (filled as the app's own user: Android keeps its reserve). Maestro
  # cannot start a session on a full phone (it installs its driver first), so uat-f4.yaml starts
  # first and waits 150 s; the phone is filled 20 s in, meanwhile.
  uid=$(uat_app_uid)
  uat_expect UF4 'SQLITE_FULL|database or disk is full|ENOSPC|No space left|disk I/O error'
  ( sleep 20; adb shell su "$uid" sh "$UROOT" fill > "$OUT/uat-uf-fill.txt" 2>&1; echo "fill done at $(date -u +%H:%M:%S)" >> "$OUT/uat-uf-fill.txt" ) &
  fill_pid=$!
  log "UAT UF: Finish on a full phone: flow started $(date -u +%H:%M:%S), filling from 20 s in (app uid ${uid:-unknown})"
  uat_part uf4 uat-f4.yaml || true
  wait "$fill_pid" 2>/dev/null
  if grep -q "full: a 6-byte write is refused" "$OUT/uat-uf-fill.txt"; then
    log "UAT UF: the phone was full for the app ($(tr -d '\r' < "$OUT/uat-uf-fill.txt" | grep -E '^filled|^fill done' | tr '\n' ' ' | cut -c1-200))"
  else
    uat_fail UF "the phone could not be filled (uat-uf-fill.txt)"
  fi
  if find "$OUT/part-uf4" -name 'uf-05-full-could-not-save.png' 2>/dev/null | grep -q .; then
    log "UAT UF: Finish on a full phone was refused: 'Could not save', the banner named the full storage, the workout stayed open"
  elif find "$OUT/part-uf4" -name 'uf-05-full-saved-anyway.png' 2>/dev/null | grep -q .; then
    log "UAT UF: Finish on a full phone saved anyway (SQLite still had room in its own log file)"
  else
    log "UAT UF: Finish on a full phone: no outcome screenshot (part-uf4.log)"
  fi
  uroot unfill >> "$OUT/uat-uf-fill.txt"
  log "UAT UF: space freed again ($(tail -1 "$OUT/uat-uf-fill.txt" | tr -s ' '))"
  # 3. Finish again if needed; exactly one more workout, with both sets, under the day it started.
  uat_part uf5 uat-f5.yaml -e WANT="$(( n + 1 ))" -e TODAY="$today" && \
    log "UAT UF: after the retry exactly one workout was saved (Workouts: $n -> $(( n + 1 ))) with both sets; no banner left"
}

# ---------------------------------------------------------------- UV (M-67), UG (M-96)
part_uv() { uat_part uv uat-v.yaml && log "UAT UV: edit a past workout while one is open: Resume kept it; 'Discard it and edit this one' opened the edit; the live one stayed gone after a restart"; }
part_ug() { uat_part ug uat-g.yaml && log "UAT UG: QA Bench Twin merged into Barbell Bench Press: its 250 kg record and its workout moved; it is gone from Exercises"; }

# ---------------------------------------------------------------- UK (M-110)
# Open app-icon shortcut $1 (today | weight) exactly as Android holds it; $2 = what its label must
# say (an ERE). Prints the uri on success.
uat_shortcut() {
  local sid="$1" want="$2" line uri label flags where i res
  for i in 1 2 3 4 5 6; do
    adb shell dumpsys shortcut > "$OUT/uk-shortcuts-$sid.txt" 2>/dev/null || true
    adb exec-out "su 0 cat /data/data/$PKG/shared_prefs/forge_shortcuts.xml" > "$OUT/uk-shortcuts-app.xml" 2>/dev/null || true
    line=$(python3 "$QA_DIR/tools/shortcut_uri.py" "$OUT/uk-shortcuts-$sid.txt" "$OUT/uk-shortcuts-app.xml" "$sid")
    label=$(echo "$line" | cut -f2)
    echo "$label" | grep -qE "$want" && break
    sleep 3
  done
  uri=$(echo "$line" | cut -f1); flags=$(echo "$line" | cut -f3); where=$(echo "$line" | cut -f4)
  if ! echo "$uri" | grep -q '^forgeai://' || ! echo "$label" | grep -qE "$want"; then
    log "UAT UK: shortcut '$sid' is not '$want' (read: $line)"
    return 1
  fi
  local since; since=$(adb shell "date '+%m-%d %H:%M:%S.000'" 2>/dev/null | tr -d '\r')
  res=$(adb shell am start -W -a android.intent.action.VIEW -d "\"$uri\"" -f "$flags" "$PKG" 2>&1 | tr -d '\r')
  echo "$res" > "$OUT/uk-am-$sid.txt"
  # What the app did with the link: a launcher's shortcut adds NEW_TASK|CLEAR_TASK, so the screen
  # is made afresh, unlike the widget's tap (U-M6). The rest of the part's log is in part-uk*.
  # 31 Oct 2026 (v0.64.0 UK2): Maestro's own lines filled the log buffer and pushed the app's out, so
  # the failure left no trace. Only the app's tags are kept, read soon after the link.
  ( sleep 12; adb logcat -d -v time -T "$since" -s ReactNativeJS:V ReactNative:V AndroidRuntime:E ActivityTaskManager:I ForgeErr:V \
      > "$OUT/uk-logcat-$sid-$(date +%H%M%S).txt" 2>/dev/null ) &
  log "UAT UK: shortcut '$label' ($where record, flags $flags) opened: $(echo "$res" | grep -E '^(Status|Error|Warning)' | tr '\n' ' ')"
  echo "$res" | grep -qiE '^Error|unable to resolve' && return 1
  UK_URI="$uri"; UK_LABEL="$label"
  return 0
}
part_uk() {
  local start_uri routine
  adb logcat -G 16M >/dev/null 2>&1 || true  # room for the app's lines next to Maestro's
  uat_part uk1 uat-k1.yaml || return 1
  log "UAT UK: the real widget's Start started today's routine at once; its Resume brought the workout back"
  # Shortcut 1: Resume (a workout is open).
  if uat_shortcut today '^Resume workout$'; then
    sleep 3
    uat_part uk2 uat-k2.yaml || return 1
  else
    uat_fail UK "no 'Resume workout' shortcut while a workout was open (uk-shortcuts-today.txt)"; return 1
  fi
  # Shortcut 2: Start <routine>, with the widget's key.
  if uat_shortcut today '^Start .+'; then
    start_uri="$UK_URI"
    routine=$(python3 -c "import re,sys;print(re.escape(sys.argv[1][len('Start '):]))" "$UK_LABEL")
    echo "$start_uri" | grep -q 't=' || uat_fail UK "the Start shortcut carries no key ($start_uri)"
    sleep 3
    uat_part uk3 uat-k3.yaml -e ROUTINE="$routine" || return 1
  else
    uat_fail UK "no 'Start <routine>' shortcut after the workout was discarded (uk-shortcuts-today.txt)"; return 1
  fi
  # The same Start link again: its key is spent, so it must ask first.
  adb shell am start -W -a android.intent.action.VIEW -d "\"$start_uri\"" -f 0x10008000 "$PKG" > "$OUT/uk-am-replay.txt" 2>&1
  sleep 3
  uat_part uk4 uat-k4.yaml -e ROUTINE="$routine" || true
  # Shortcut 3: Log body weight.
  if uat_shortcut weight '^Log body weight$'; then
    sleep 3
    uat_part uk5 uat-k5.yaml && log "UAT UK: shortcuts Resume, Start (keyed, at once), the spent Start (asks first) and Log body weight each landed right"
  else
    uat_fail UK "no 'Log body weight' shortcut (uk-shortcuts-weight.txt)"
  fi
}

uat_wp4b() {
  if qa_runs ub; then part_ub; fi
  if qa_runs uf; then part_uf; fi
  if qa_runs ua; then part_ua; fi
  if qa_runs uv; then part_uv; fi
  if qa_runs ug; then part_ug; fi
  if qa_runs uk; then part_uk; fi
  adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
}
