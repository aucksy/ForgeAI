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

# Rest-alert audit: Doze for the screen-off rest. A plain `force-idle` on the emulator answered
# "Unable to go deep idle; stopped at INACTIVE" (run 38144864717): deep Doze is switched off on an
# emulator image, so it never got past INACTIVE and the rest was never tested in Doze. Switch deep
# Doze on, force it, and when it still is not IDLE, step it (INACTIVE -> IDLE_PENDING -> SENSING
# -> LOCATING -> IDLE) until it is. The final state is logged either way.
force_deep_idle() {
  DOZE_WAS=$(adb shell dumpsys deviceidle enabled deep 2>/dev/null | tr -d '\r\n ')
  adb shell dumpsys deviceidle enable deep >/dev/null 2>&1 || true
  adb shell dumpsys deviceidle enable all >/dev/null 2>&1 || true
  log "doze: deep was enabled=${DOZE_WAS:-?}; force-idle deep: $(adb shell dumpsys deviceidle force-idle deep 2>&1 | tr -d '\r' | tr '\n' ' ' | cut -c1-120)"
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
    # Android will not enter deep Doze while a wake-from-idle alarm is under an hour away
    # (DeviceIdleController: "there is an upcoming alarm"). The rest's alarm-clock alarm is that
    # alarm (run 38150955406), so Doze cannot hold it back: this is the fix working, not a gap.
    log "doze: held off by the rest alarm (next wake from idle = $PKG, state ${state:-unknown}); Doze cannot delay it"
  else
    log "DOZE NOT REACHED: deep state ${state:-unknown} after stepping (the rest was not tested in Doze)"
  fi
}

log "device: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
adb install -r "$APK" || { log "INSTALL FAILED"; exit 1; }
# A freshly booted emulator can still be busy; its launcher sometimes throws an
# "isn't responding" box over the app. Let it settle, then clear system dialogs.
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb logcat -c
# Rest-alert audit (11 Oct 2026): exact alarms are NOT switched on by hand any more. A real phone
# on Android 14+ has "Alarms & reminders" OFF after a fresh install, and that is where "Rest is
# over" came minutes late (and the watch never buzzed); this run used to allow it first, so it
# never saw that phone. The app now gets exact alarms at install (USE_EXACT_ALARM); the run must
# prove it, as installed, with nothing granted by hand.
adb shell appops set $PKG SCHEDULE_EXACT_ALARM default >/dev/null 2>&1 || true
log "exact alarms as installed: USE_EXACT_ALARM $(adb shell dumpsys package $PKG | tr -d '\r' | grep -m1 -oE 'android.permission.USE_EXACT_ALARM: granted=(true|false)' || echo 'not listed'); SCHEDULE_EXACT_ALARM appop $(adb shell appops get $PKG SCHEDULE_EXACT_ALARM | tr -d '\r' | tr '\n' ' ')"

# Which parts run (qa-device.yml inputs, audit v2 phase B).
#   QA_ONLY  (`only`):  empty = the whole phone test (A ... M, the UAT-M parts, then W). Otherwise ONLY
#                       the parts named, comma or space separated, from the whole run's parts (OLD_PARTS
#                       and UAT_PARTS below, in their usual order) and w, dnd, longrest, anim, mk. Such a run is
#                       named "(partial ...)" and never opens the release gate. A part leans on
#                       what the parts before it left (part A's workout for b, h, h3; part J's
#                       routines for j2, j3), so name those too; when `a` is not named, the demo
#                       data is loaded first (gate-demo.yaml) so the other parts have data.
#   QA_EXTRA (`extra`): opt-in parts added to a WHOLE run (dnd, longrest, anim, mk): dnd, longrest
#                       and anim run after part M, mk after part W. Empty = the whole run exactly as before.
#   QA_PROFILE (`profile`): default = the emulator as it boots (411 dp, font 1.0, UTC). owner = the
#                       owner's phone for EVERY part: ~360 dp wide (density 480), font 1.3,
#                       Asia/Kolkata. Part W always sets these itself.
# b = B0 + B; h = H1, H1D, H2; h3 = H3A..C; link = the two widget links; inv = INV-a..e; invf = INV-f1..f3.
OLD_PARTS="a b c d e f g h h3 p1 p2 i link i2 j j2 j3 k l n p9 r br inv invf p7 p0 m"
# UAT work package 4 (17 Oct 2026, U-M3 / U-M4): the member app's risky, never-pressed actions,
# pressed and checked on the screen. Part of every whole run, after part M (they delete and erase,
# so nothing after them leans on their state; each starts from a fresh install + demo or from the
# UAT part before it). uh = a past workout logged, edited, deleted; ur = start while open, untick,
# remove set + Undo, Update routine; un = "Rest alerts are off"; ud = remove demo, load demo, import
# Replace + Undo, Save my history; ue = erase (solo, gym member) + the welcome's "From Hevy".
# UAT WP4b (17 Oct 2026): ub = start-up error screen (database damaged as root), uf = Finish refused
# (write lock held) and on a full phone, ua = auto-pause + "Count it" + "Ended at" (clock moved),
# uv = edit while a workout is open, ug = merge an exercise, uk = real widget + app-icon shortcuts
# (qa/uat-wp4b.sh). Part M also turns on "Include photos in my backup" and checks the photos return.
UAT_PARTS="uh ur un ud ue ub uf ua uv ug uk"
GATE_PARTS="w dnd longrest anim mk"
qa_list() { echo "$1" | tr ',;' '  ' | tr '[:upper:]' '[:lower:]' | xargs; }
QA_ONLY_LIST=$(qa_list "${QA_ONLY:-}")
QA_EXTRA_LIST=$(qa_list "${QA_EXTRA:-}")
for p in $QA_ONLY_LIST; do
  case " $OLD_PARTS $UAT_PARTS $GATE_PARTS " in
    *" $p "*) ;;
    *) log "UNKNOWN PART '$p' in only (known: $OLD_PARTS $UAT_PARTS $GATE_PARTS)"; status=1 ;;
  esac
done
for p in $QA_EXTRA_LIST; do
  case " $GATE_PARTS " in
    *" $p "*) ;;
    *) log "UNKNOWN PART '$p' in extra (known: $GATE_PARTS)"; status=1 ;;
  esac
done
# Does part $1 run in this run?
qa_runs() {
  if [ -n "$QA_ONLY_LIST" ]; then
    case " $QA_ONLY_LIST " in *" $1 "*) return 0 ;; esac
    return 1
  fi
  case " $OLD_PARTS $UAT_PARTS w " in *" $1 "*) return 0 ;; esac
  case " $QA_EXTRA_LIST " in *" $1 "*) return 0 ;; esac
  return 1
}
# Is any part of the whole run (A ... M) named in `only`?
qa_any_old() {
  local p
  for p in $QA_ONLY_LIST; do
    case " $OLD_PARTS " in *" $p "*) return 0 ;; esac
  done
  return 1
}
# UAT U-G4: a part whose server function is missing. A whole run (the one the release gate reads)
# FAILS on it: a gate must never pass a part it did not run. A partial run may still skip it.
qa_server_missing() {
  if [ -z "$QA_ONLY_LIST" ]; then
    status=1
    log "PART $1 FAILED: $2"
  else
    log "PART $1 SKIPPED (partial run): $2"
  fi
}
QA_PROFILE=${QA_PROFILE:-default}
BASE_FONT=1.0
if [ "$QA_PROFILE" = "owner" ]; then
  BASE_FONT=${W_FONT:-1.3}
  adb shell wm density "${W_DENSITY:-480}" >/dev/null 2>&1 || true
  adb shell settings put system font_scale "$BASE_FONT" >/dev/null 2>&1 || true
  adb shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
  adb shell cmd alarm set-timezone Asia/Kolkata >/dev/null 2>&1 || adb shell setprop persist.sys.timezone Asia/Kolkata >/dev/null 2>&1 || true
  sleep 3
  log "PROFILE owner: screen $(adb shell wm size | tr -d '\r' | tail -1), density $(adb shell wm density | tr -d '\r' | tail -1), font scale $(adb shell settings get system font_scale | tr -d '\r'), time $(adb shell "date '+%a %d %b %Y %H:%M %Z'" | tr -d '\r')"
  [ "$(adb shell settings get system font_scale | tr -d '\r')" = "$BASE_FONT" ] || { log "PROFILE owner FAILED: font scale not set"; status=1; }
elif [ "$QA_PROFILE" != "default" ]; then
  log "UNKNOWN PROFILE '$QA_PROFILE' (default | owner)"
  status=1
fi
# UAT WP14 (17 Oct 2026): QA_ENV (`env`) = one row of the pairwise phone-setting matrix
# (scripts/ci/pairwise.py, docs/uat/ENV-MATRIX.md), e.g. "font=2.0,width=360,net=flaky,tz=ist,
# saver=on", set for EVERY part, on top of the profile. Only with `only` (a partial run: it never
# opens the release gate). font = font_scale; width 360 = density 480 (411 = the emulator's own);
# net offline = Wi-Fi and data off, flaky = the emulator's slowest link (GPRS speed and delay);
# tz ist / utc; saver on = Battery Saver.
QA_ENV=${QA_ENV:-}
ENV_SAVER=""
# Battery Saver cannot be on while the phone charges, and the emulator starts "on AC": take it off
# the charger first (runs 38997271281...: low_power stayed 0). Part A puts the battery back after
# its screen-off rest, so it calls this again.
env_saver_on() {
  adb shell dumpsys battery unplug >/dev/null 2>&1 || true
  adb shell settings put global low_power 1 >/dev/null 2>&1 || true
  adb shell cmd power set-mode 1 >/dev/null 2>&1 || true
}
if [ -n "$QA_ENV" ]; then
  [ -n "$QA_ONLY_LIST" ] || { log "ENV FAILED: env '$QA_ENV' needs only (a partial run)"; status=1; }
  for env_kv in $(echo "$QA_ENV" | tr ',;' '  '); do
    env_v=${env_kv#*=}
    case "$env_kv" in
      font=1.0|font=1.3|font=2.0)
        BASE_FONT=$env_v; adb shell settings put system font_scale "$env_v" >/dev/null 2>&1 || true ;;
      width=360) adb shell wm density 480 >/dev/null 2>&1 || true ;;
      width=411) adb shell wm density reset >/dev/null 2>&1 || true ;;
      net=online) ;;
      net=offline)
        adb shell cmd connectivity airplane-mode enable >/dev/null 2>&1 || true
        adb shell svc wifi disable >/dev/null 2>&1 || true
        adb shell svc data disable >/dev/null 2>&1 || true ;;
      net=flaky)
        adb emu network speed gprs >/dev/null 2>&1 || true
        adb emu network delay gprs >/dev/null 2>&1 || true ;;
      tz=utc|tz=ist)
        [ "$env_v" = ist ] && env_z=Asia/Kolkata || env_z=UTC
        adb shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
        adb shell cmd alarm set-timezone "$env_z" >/dev/null 2>&1 || adb shell setprop persist.sys.timezone "$env_z" >/dev/null 2>&1 || true ;;
      saver=off) adb shell settings put global low_power 0 >/dev/null 2>&1 || true ;;
      saver=on) ENV_SAVER=on; env_saver_on ;;
      *) log "ENV FAILED: unknown setting '$env_kv' (font=1.0|1.3|2.0 width=360|411 net=online|offline|flaky tz=utc|ist saver=off|on)"; status=1 ;;
    esac
  done
  sleep 3
  log "ENV $QA_ENV: screen $(adb shell wm size | tr -d '\r' | tail -1), density $(adb shell wm density | tr -d '\r' | tail -1), font scale $(adb shell settings get system font_scale | tr -d '\r'), time $(adb shell "date '+%a %d %b %Y %H:%M %Z'" | tr -d '\r'), battery saver $(adb shell settings get global low_power | tr -d '\r') ($(adb shell dumpsys power | tr -d '\r' | grep -m1 -oE 'mIsPowered=[a-z]+')), airplane $(adb shell settings get global airplane_mode_on | tr -d '\r')"
fi
log "parts: only='${QA_ONLY_LIST}' extra='${QA_EXTRA_LIST}' profile=$QA_PROFILE env='${QA_ENV}'"

if [ -n "$QA_ONLY_LIST" ]; then
  log "QA_ONLY=$QA_ONLY_LIST: only these parts run (a partial run: it cannot release)"
  if qa_any_old && ! qa_runs a; then
    log "part seed start (demo data for the named parts, part A not named)"
    maestro test --format junit --output "$OUT/part-seed.xml" --test-output-dir "$OUT/part-seed" "$QA_DIR/gate-demo.yaml" \
      > "$OUT/part-seed.log" 2>&1 || { status=1; log "PART SEED FAILED"; }
    free_maestro
  fi
fi
# ---------------------------------------------------------------- part A
if qa_runs a; then
log "part A start"
maestro test --format junit --output "$OUT/part-a.xml" --test-output-dir "$OUT/part-a" "$QA_DIR/phase1-a.yaml" \
  > "$OUT/part-a.log" 2>&1 || { status=1; log "PART A FAILED"; }
TICK_MS=$(now_ms)
log "rest (30s) started at about device ms $TICK_MS"
adb shell dumpsys notification --noredact > "$OUT/notifications-during-rest.txt"
# The rest's alarm as Android holds it (the audit: an alarm-clock alarm, which Doze never delays).
adb shell dumpsys alarm > "$OUT/alarms-during-rest.txt" 2>/dev/null || true
log "rest alarm during the rest: $(grep -c "$PKG" "$OUT/alarms-during-rest.txt" 2>/dev/null || echo 0) alarm lines for the app; next alarm clock: $(grep -iA2 'next alarm clock' "$OUT/alarms-during-rest.txt" 2>/dev/null | tr -d '\r' | tr '\n' ' ' | cut -c1-200)"
adb exec-out screencap -p > "$OUT/a-end.png"

# Phone goes to sleep for the rest, like a phone on the gym floor: screen off, off the charger,
# and (rest-alert audit) forced into Doze — the deep sleep where a non-alarm-clock alarm can be held
# back for many minutes. The alert must still come on time, with sound and vibration.
adb shell input keyevent KEYCODE_SLEEP
log "screen off"
adb shell dumpsys battery unplug >/dev/null 2>&1 || true
force_deep_idle
sleep 50
adb shell dumpsys notification --noredact > "$OUT/notifications-after-rest.txt"
adb shell dumpsys deviceidle unforce >/dev/null 2>&1 || true
# Put the emulator's deep-Doze switch back as it was, so no later part can fall asleep mid-flow.
if [ "${DOZE_WAS:-}" = "false" ] || [ "${DOZE_WAS:-}" = "0" ]; then
  adb shell dumpsys deviceidle disable deep >/dev/null 2>&1 || true
fi
adb shell dumpsys battery reset >/dev/null 2>&1 || true
[ "$ENV_SAVER" = on ] && env_saver_on
# Rest-alert audit: Android's own record of what last made a SOUND and a BUZZ must be "Rest is
# over" (id 41002) — a posted but silent alert (the bug the owner heard) fails here.
for kind in Sound Vibrate; do
  key=$(grep -oE "m${kind}NotificationKey=[^ ]*" "$OUT/notifications-after-rest.txt" | head -1 | tr -d '\r')
  if echo "$key" | grep -q "|41002|"; then
    log "REST ALERT ${kind}: Rest is over ($key)"
  else
    status=1
    log "REST ALERT ${kind}: NOT from Rest is over (${key:-none})"
  fi
done
# Why a notification left the list: Android's events log keeps every enqueue/cancel with its
# reason (4 = error, 8 = app cancel, 19 = timeout, 10/22 = listener/assistant); logcat -c does
# not clear this buffer. Saved for part A's "Rest is over" (id 41002).
adb logcat -b events -d 2>/dev/null | grep -E "notification_(enqueue|canceled|cancel)" | grep -i forgeai > "$OUT/a-notif-events.txt" || true
adb logcat -d 2>/dev/null | grep -iE "bad notification|NotifInflat|onNotificationError|ForgeRest" > "$OUT/a-notif-errors.txt" || true
log "rest alert events: $(grep -c '41002' "$OUT/a-notif-events.txt" 2>/dev/null || echo 0) lines for id 41002 (a-notif-events.txt)"
adb shell dumpsys alarm | grep -i -A3 "$PKG" > "$OUT/alarms.txt" || true
# Which way the end of the rest went (RestCard.kt logs it under the tag ForgeRest): run 38081757903
# had the alarm on time but no "Rest is over" 50 s later, and no log of that window. Saved now,
# before part B's Maestro clears logcat.
adb logcat -d -v time > "$OUT/a-rest-logcat.txt" 2>/dev/null || true
log "rest end path (ForgeRest lines): $(grep 'ForgeRest' "$OUT/a-rest-logcat.txt" 2>/dev/null | sed 's/^.*ForgeRest[^:]*: //' | tr '\n' ';' | cut -c1-600)"
adb shell input keyevent KEYCODE_WAKEUP
sleep 1
adb shell wm dismiss-keyguard || true
log "screen on"

# When did "Rest is over" post, compared with when it was due (the rest card's end time, read
# from the dump taken during the rest)? Fails when more than REST_LATE_BUDGET_S (5 s) late.
python3 "$QA_DIR/notif.py" over-locked "$OUT/notifications-after-rest.txt" "$TICK_MS" "$OUT/notifications-during-rest.txt" >> "$OUT/timeline.txt" || status=1
# 15 Oct 2026 (owner: "the sound should not change"): the screen-off "Rest is over" channel plays
# the app's own rest-done sound (a raw resource of the app), not the phone's default tone, and the
# old default-tone channel "rest-timer" is gone.
REST_SOUND_CH=$(grep -o "NotificationChannel{mId='rest-over-sound'[^}]*" "$OUT/notifications-after-rest.txt" 2>/dev/null | head -1)
if printf '%s' "$REST_SOUND_CH" | grep -q "mSound=android.resource://com.forgeai.app/raw/forge_rest_done" \
   && ! grep -q "NotificationChannel{mId='rest-timer'.*mDeleted=false" "$OUT/notifications-after-rest.txt"; then
  log "REST SOUND: OK (rest-over-sound plays the app's own rest sound; old rest-timer channel gone)"
else
  status=1
  log "REST SOUND FAILED: $(printf '%s' "$REST_SOUND_CH" | grep -o 'mSound=[^,]*' || echo 'no rest-over-sound channel')"
fi
# 13 Oct 2026: ONE workout notification at a time — after the rest "Rest is over" shows ALONE (the
# live workout card is down until it goes), and during the rest the rest card was alone.
python3 "$QA_DIR/notif.py" alone "$OUT/notifications-after-rest.txt" >> "$OUT/timeline.txt" || status=1
python3 "$QA_DIR/notif.py" alone "$OUT/notifications-during-rest.txt" >> "$OUT/timeline.txt" || status=1
# v0.26.1: the rest card was showing during the rest (what a paired watch would show); Phase 6:
# with its three buttons in the order Done, +15 s, Skip (the next set exists, so Done shows).
python3 "$QA_DIR/notif.py" card "$OUT/notifications-during-rest.txt" "Rest 0:30" >> "$OUT/timeline.txt" || status=1
fi  # part a

# ---------------------------------------------------------------- part B
if qa_runs b; then
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > "$OUT/b-shade.png"
log "part B0 start"
maestro test --format junit --output "$OUT/part-b0.xml" --test-output-dir "$OUT/part-b0" "$QA_DIR/phase1-b0.yaml" \
  > "$OUT/part-b0.log" 2>&1 || { status=1; log "PART B0 FAILED"; }
# v0.37.1 (audit C4): the notification was tapped and the app is back on the workout: "Rest is
# over" has gone and the live workout card is BACK. ("alone" cannot tell a live card that never
# returned from one that did.)
sleep 3
adb shell dumpsys notification --noredact > "$OUT/b-after-tap.txt"
python3 "$QA_DIR/notif.py" live-back "$OUT/b-after-tap.txt" >> "$OUT/timeline.txt" || status=1
free_maestro
log "part B start"
maestro test --format junit --output "$OUT/part-b.xml" --test-output-dir "$OUT/part-b" "$QA_DIR/phase1-b.yaml" \
  > "$OUT/part-b.log" 2>&1 || { status=1; log "PART B FAILED"; }
fi  # part b

# ---------------------------------------------------------------- part C (Phase 2 exercises)
if qa_runs c; then
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
# Part B's Maestro driver can still hold its port right after B ends; a third session then
# fails "Failed to bind to address :36609" before its first step. Stop it and let it go.
free_maestro
log "part C start"
maestro test --format junit --output "$OUT/part-c.xml" --test-output-dir "$OUT/part-c" "$QA_DIR/phase2-c.yaml" \
  > "$OUT/part-c.log" 2>&1 || { status=1; log "PART C FAILED"; }
fi  # part c

# ---------------------------------------------------------------- part D (Phase 3 progress)
if qa_runs d; then
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
fi  # part d

# ---------------------------------------------------------------- part E (records live + share)
if qa_runs e; then
free_maestro
log "part E start"
maestro test --format junit --output "$OUT/part-e.xml" --test-output-dir "$OUT/part-e" "$QA_DIR/phase3-e.yaml" \
  > "$OUT/part-e.log" 2>&1 || { status=1; log "PART E FAILED"; }
fi  # part e

# ---------------------------------------------------------------- part F (v0.25.1: figure + best pace)
if qa_runs f; then
free_maestro
log "part F start"
maestro test --format junit --output "$OUT/part-f.xml" --test-output-dir "$OUT/part-f" "$QA_DIR/v0251-f.yaml" \
  > "$OUT/part-f.log" 2>&1 || { status=1; log "PART F FAILED"; }
fi  # part f

# ---------------------------------------------------------------- part G (v0.26.0: routines and plans)
if qa_runs g; then
# A routine file "someone shared", in Downloads, for the import steps.
push_fixture "$QA_DIR/fixtures/qa-shared.forgeai.json" /sdcard/Download/qa-shared.forgeai.json
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/qa-shared.forgeai.json" >/dev/null 2>&1 || true
# The broadcast is a no-op on newer Android; a volume scan makes the file picker list it (as for part D's photos).
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "downloads: $(wait_media qa-shared 1 20 downloads) routine file"
free_maestro
log "part G start"
maestro test --format junit --output "$OUT/part-g.xml" --test-output-dir "$OUT/part-g" "$QA_DIR/v0260-g.yaml"   > "$OUT/part-g.log" 2>&1 || { status=1; log "PART G FAILED"; }
fi  # part g

# ---------------------------------------------------------------- part H (v0.26.1: the watch's rest card)
if qa_runs h; then
# The cloud phone cannot pair a watch. A watch shows exactly the phone's swipe-away alerts and
# runs their buttons on the phone, so the card, its buttons and the end alert are proven here.
free_maestro
log "part H1 start"
maestro test --format junit --output "$OUT/part-h1.xml" --test-output-dir "$OUT/part-h1" "$QA_DIR/v0261-h.yaml" \
  > "$OUT/part-h1.log" 2>&1 || { status=1; log "PART H1 FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-card-after-plus15.txt"
# The card must be swipe-away (no ongoing / no-clear flag), on its Phase 2 channel (rest-card-v2,
# no sound), with its three buttons in the order Done, +15 s, Skip (Phase 6). Its shade view
# counts down; notif.py reads the title it still sets.
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-plus15.txt" "Rest 3:15" "Barbell Bench Press, set 2" >> "$OUT/timeline.txt" || status=1
# Phase 6: "Done" on that card, from the shade (still open), with the app in the background:
# set 2 is ticked and its rest starts, so the card comes back as "Rest 3:00" naming set 3; the
# app, opened again, shows it. H2 then uses THIS card's Skip.
free_maestro
log "part H1D start"
maestro test --format junit --output "$OUT/part-h1d.xml" --test-output-dir "$OUT/part-h1d" "$QA_DIR/v0261-h1d.yaml"   > "$OUT/part-h1d.log" 2>&1 || { status=1; log "PART H1D FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h-card-after-done.txt"
python3 "$QA_DIR/notif.py" card "$OUT/h-card-after-done.txt" "Rest 3:00" "Barbell Bench Press, set 3" >> "$OUT/timeline.txt" || status=1
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
adb logcat -d -v time > "$OUT/h2-rest-logcat.txt" 2>/dev/null || true
log "H2 rest end path (ForgeRest lines): $(grep 'ForgeRest' "$OUT/h2-rest-logcat.txt" 2>/dev/null | sed 's/^.*ForgeRest[^:]*: //' | tr '\n' ';' | cut -c1-600)"
adb shell cmd statusbar expand-notifications
sleep 2
adb exec-out screencap -p > "$OUT/h-117-shade-rest-over.png"
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
python3 "$QA_DIR/notif.py" over-open "$OUT/h-after-rest-app-open.txt" >> "$OUT/timeline.txt" || status=1
# v0.37.1: "Rest is over" names the set that is next (set 4 of 4 is still to do here). The last
# set's "All sets done" is checked in part H3, after that set.
python3 "$QA_DIR/notif.py" over-text "$OUT/h-after-rest-app-open.txt" "Bench Press, set 4" >> "$OUT/timeline.txt" || status=1
# v0.37.1 (audit C4): the app-open "Rest is over" goes by itself after 60 s, and the live workout
# card comes BACK (its timeout's delete intent, and the app's own re-post).
sleep 65
adb shell dumpsys notification --noredact > "$OUT/h-after-over-timeout.txt"
python3 "$QA_DIR/notif.py" live-back "$OUT/h-after-over-timeout.txt" >> "$OUT/timeline.txt" || status=1
fi  # part h

# ---------------------------------------------------------------- part H3 (v0.37.1, audit C1)
if qa_runs h3; then
# "Complete set" on the live workout card with ForgeAI CLOSED (Android stopped it in the
# background; phone in a pocket, a watch tap). H3A leaves the app on set 4 (the last) and goes home; the
# script stops the app's process; H3B taps "Complete set" in the shade: the phone itself starts
# set 4's rest (the rest card alone, "All sets done": set 4 is the last) - never the old "Open
# ForgeAI to save ..." note beside the live card. The rest runs out ("Rest is over", alone); H3C
# opens the app: set 4 is ticked (saved from the phone's queue) and no second rest starts; the
# app in front clears "Rest is over" and the live card is back.
free_maestro
log "part H3A start"
maestro test --format junit --output "$OUT/part-h3a.xml" --test-output-dir "$OUT/part-h3a" "$QA_DIR/v0371-h3a.yaml" \
  > "$OUT/part-h3a.log" 2>&1 || { status=1; log "PART H3A FAILED"; }
sleep 3
adb shell am kill "$PKG"
sleep 3
log "H3: app process after kill: '$(adb shell pidof $PKG | tr -d '\r')' (empty = stopped)"
adb shell dumpsys notification --noredact > "$OUT/h3-before-tap.txt"
python3 "$QA_DIR/notif.py" live-back "$OUT/h3-before-tap.txt" "Complete set" >> "$OUT/timeline.txt" || status=1
free_maestro
log "part H3B start"
maestro test --format junit --output "$OUT/part-h3b.xml" --test-output-dir "$OUT/part-h3b" "$QA_DIR/v0371-h3b.yaml" \
  > "$OUT/part-h3b.log" 2>&1 || { status=1; log "PART H3B FAILED"; }
adb shell dumpsys notification --noredact > "$OUT/h3-after-tap.txt"
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
python3 "$QA_DIR/notif.py" rest-up "$OUT/h3-after-tap.txt" "Rest 0:30" "All sets done" >> "$OUT/timeline.txt" || status=1
python3 "$QA_DIR/notif.py" alone "$OUT/h3-after-tap.txt" >> "$OUT/timeline.txt" || status=1
sleep 40
adb shell dumpsys notification --noredact > "$OUT/h3-after-rest.txt"
adb logcat -d -v time > "$OUT/h3-logcat.txt" 2>/dev/null || true
log "H3 tap and rest path (ForgeRest lines): $(grep 'ForgeRest' "$OUT/h3-logcat.txt" 2>/dev/null | sed 's/^.*ForgeRest[^:]*: //' | tr '\n' ';' | cut -c1-600)"
python3 "$QA_DIR/notif.py" over-text "$OUT/h3-after-rest.txt" "All sets done" >> "$OUT/timeline.txt" || status=1
python3 "$QA_DIR/notif.py" alone "$OUT/h3-after-rest.txt" >> "$OUT/timeline.txt" || status=1
free_maestro
log "part H3C start"
maestro test --format junit --output "$OUT/part-h3c.xml" --test-output-dir "$OUT/part-h3c" "$QA_DIR/v0371-h3c.yaml" \
  > "$OUT/part-h3c.log" 2>&1 || { status=1; log "PART H3C FAILED"; }
sleep 3
adb shell dumpsys notification --noredact > "$OUT/h3-app-open.txt"
python3 "$QA_DIR/notif.py" live-back "$OUT/h3-app-open.txt" >> "$OUT/timeline.txt" || status=1
fi  # part h3

# ---------------------------------------------------------------- part P1 (15 Oct 2026: plates and bars)
if qa_runs p1; then
free_maestro
log "part P1 start"
maestro test --format junit --output "$OUT/part-p1.xml" --test-output-dir "$OUT/part-p1" "$QA_DIR/p1-plates.yaml" > "$OUT/part-p1.log" 2>&1 || { status=1; log "PART P1 FAILED"; }
adb shell input keyevent KEYCODE_HOME
fi  # part p1

# ---------------------------------------------------------------- part P2 (15 Oct 2026: pause the workout)
if qa_runs p2; then
# Paused, the duration must not move: its accessibility label is read twice, 70 s apart.
# The 70 s wait reads the SCREEN: keep it awake (review).
adb shell svc power stayon true >/dev/null 2>&1 || true
free_maestro
log "part P2 start"
if maestro test --format junit --output "$OUT/part-p2a.xml" --test-output-dir "$OUT/part-p2a" "$QA_DIR/p2-pause-a.yaml" > "$OUT/part-p2a.log" 2>&1; then
  p2_label() { adb shell uiautomator dump /sdcard/p2.xml >/dev/null 2>&1; adb pull /sdcard/p2.xml "$OUT/$1" >/dev/null 2>&1; grep -o 'content-desc="Workout duration[^"]*"' "$OUT/$1" | head -1; }
  first=$(p2_label p2-first.xml)
  sleep 70
  second=$(p2_label p2-second.xml)
  log "P2 paused label: $first / 70 s later: $second"
  if [ -n "$first" ] && [ "$first" = "$second" ]; then
    log "P2 PAUSE OK: the duration did not move in 70 s"
  else
    status=1
    log "P2 PAUSE FAILED: the paused duration moved or was not found"
  fi
  free_maestro
  maestro test --format junit --output "$OUT/part-p2b.xml" --test-output-dir "$OUT/part-p2b" "$QA_DIR/p2-pause-b.yaml" > "$OUT/part-p2b.log" 2>&1 || { status=1; log "PART P2B FAILED"; }
else
  status=1
  log "PART P2A FAILED"
fi
adb shell input keyevent KEYCODE_HOME
fi  # part p2

# ---------------------------------------------------------------- part I (v0.27.0: the rest of Phase 5)
if qa_runs i; then
# A Strong export "someone made" (older layout, pounds and miles), in Downloads, for the import.
push_fixture "$QA_DIR/fixtures/qa-strong.csv" /sdcard/Download/qa-strong.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
# v0.39.0: take Health Connect access away first (the install grants every permission), so part I
# presses "Connect" for real and must see the system's permission screen open. Logcat is read
# after: the app logs "permission screen did not open" when Android refuses the request.
for perm in android.permission.health.WRITE_EXERCISE android.permission.health.WRITE_ACTIVE_CALORIES_BURNED; do
  adb shell pm revoke "$PKG" "$perm" > "$OUT/i-hc-revoke.txt" 2>&1 || log "HEALTH CONNECT: could not revoke $perm ($(tr -d '\r' < "$OUT/i-hc-revoke.txt"))"
done
adb logcat -c 2>/dev/null || true
free_maestro
log "part I start"
maestro test --format junit --output "$OUT/part-i.xml" --test-output-dir "$OUT/part-i" "$QA_DIR/v0270-i.yaml"   > "$OUT/part-i.log" 2>&1 || { status=1; log "PART I FAILED"; }
adb logcat -d -s ForgeHealth > "$OUT/i-health-logcat.txt" 2>/dev/null || true
if grep -q "did not open" "$OUT/i-health-logcat.txt"; then
  status=1
  log "HEALTH CONNECT: the permission screen did not open (see i-health-logcat.txt)"
fi
# The reminders the app set (expo keeps them as alarms) and the widget the home screen holds.
# NB: a count of dumpsys LINES that mention the app, not a count of alarms (audit QA-27).
adb shell dumpsys alarm | grep -c "com.forgeai.app" > "$OUT/i-alarm-count.txt" 2>/dev/null || true
log "dumpsys alarm lines mentioning the app after part I (not an alarm count): $(cat "$OUT/i-alarm-count.txt" 2>/dev/null)"
adb shell dumpsys appwidget > "$OUT/i-appwidget.txt" 2>/dev/null || true
log "home-screen widget list saved (i-appwidget.txt); ForgeAI widget lines: $(grep -c 'com.forgeai.phone.TodayWidget' "$OUT/i-appwidget.txt" 2>/dev/null)"
fi  # part i

# ---------------------------------------------------------------- widget link (audit Phase 6, PH-09)
# The Today widget's Start / Resume opens forgeai://workout/start?routine=<id> (plus the widget's
# own secret token). A link WITHOUT that token never starts a workout by itself, and one with no
# routine, or a routine that does not exist, lands on the Workout tab. Here: the app idle (part I
# finished its workout, none is open), the link opened with adb, then a short Maestro part
# (phase6-link.yaml) reads the screen: "Start empty workout", and no open workout's texts. Also
# no "Workout in progress" notification may appear (notif.py no-ongoing, dumps before and after).
# Part I2 starts the app afresh after this, so the screen it leaves does not matter.
widget_link() {
  local name="$1" url="$2" before="$OUT/link-$1-notif-before.txt" after="$OUT/link-$1-notif-after.txt" res bad=""
  adb shell input keyevent KEYCODE_HOME
  sleep 2
  adb shell dumpsys notification --noredact > "$before"
  free_maestro
  res=$(adb shell am start -W -a android.intent.action.VIEW -d "\"$url\"" "$PKG" 2>&1 | tr -d '\r')
  echo "$res" > "$OUT/link-$name-am.txt"
  log "WIDGET LINK $name: am start -W $url -> $(echo "$res" | grep -E '^(Status|Error|Warning)' | tr '\n' ' ')"
  sleep 5
  log "part link$name start"
  maestro test --format junit --output "$OUT/part-link$name.xml" --test-output-dir "$OUT/part-link$name" "$QA_DIR/phase6-link.yaml" \
    > "$OUT/part-link$name.log" 2>&1 || { status=1; log "PART LINK$(echo "$name" | tr '[:lower:]' '[:upper:]') FAILED"; bad="the Workout tab did not show, or an open workout did (part-link$name.log, link-$name.png)"; }
  adb exec-out screencap -p > "$OUT/link-$name.png"
  adb shell dumpsys notification --noredact > "$after"
  if echo "$res" | grep -qiE "^Error|unable to resolve"; then
    bad="${bad:+$bad; }the link did not open ForgeAI ($(echo "$res" | grep -iE '^Error|unable to resolve' | head -1))"
  fi
  # A "Workout in progress" card that was not there before the link = a workout was started.
  if python3 "$QA_DIR/notif.py" no-ongoing "$before" > /dev/null; then
    python3 "$QA_DIR/notif.py" no-ongoing "$after" > /dev/null || bad="${bad:+$bad; }a live workout notification appeared after the link"
  else
    log "WIDGET LINK $name: note, a \"Workout in progress\" notification was already showing before the link (none should be after part I)"
  fi
  if [ -n "$bad" ]; then
    log "WIDGET LINK $name FAILED: $url: $bad"
    status=1
  else
    log "WIDGET LINK $name: $url opened the Workout tab and started nothing"
  fi
}
if qa_runs link; then
widget_link 1 "forgeai://workout/start"
widget_link 2 "forgeai://workout/start?routine=not-a-routine"
free_maestro
adb shell input keyevent KEYCODE_HOME
fi  # part link

# ---------------------------------------------------------------- part I2 (audit Phase 6, PH-01: notifications off)
# Notifications blocked for ForgeAI: Settings → Notifications (redesign R6) says so and offers
# "Turn on notifications". Blocked here by taking the notification permission away (Android stops the app);
# given back right after, for the parts that follow.
if qa_runs i2; then
adb shell pm revoke "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/i2-revoke.txt" 2>&1 || log "NOTIFICATIONS OFF: could not revoke the permission ($(tr -d '\r' < "$OUT/i2-revoke.txt"))"
sleep 2
free_maestro
log "NOTIFICATIONS OFF: permission now: $(adb shell dumpsys package "$PKG" | tr -d '\r' | grep -o 'android.permission.POST_NOTIFICATIONS: granted=[a-z]*' | head -1)"
log "part I2 start"
maestro test --format junit --output "$OUT/part-i2.xml" --test-output-dir "$OUT/part-i2" "$QA_DIR/phase6-i2.yaml"   > "$OUT/part-i2.log" 2>&1 || { status=1; log "PART I2 FAILED"; }
adb shell pm clear-permission-flags "$PKG" android.permission.POST_NOTIFICATIONS user-set user-fixed >/dev/null 2>&1 || true
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/i2-grant.txt" 2>&1 || true
if adb shell dumpsys package "$PKG" | tr -d '\r' | grep -q "android.permission.POST_NOTIFICATIONS: granted=true"; then
  log "NOTIFICATIONS OFF: permission given back after part I2"
else
  log "NOTIFICATIONS OFF FAILED: the notification permission could not be given back ($(tr -d '\r' < "$OUT/i2-grant.txt"))"
  status=1
fi
adb shell input keyevent KEYCODE_HOME
fi  # part i2

# ---------------------------------------------------------------- part J (v0.28.0: the member's own Hevy routines)
# A real-format Hevy .csv (text dates) with two routines, free workouts and an old name.
if qa_runs j; then
push_fixture "$QA_DIR/fixtures/qa-hevy.csv" /sdcard/Download/qa-hevy.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
free_maestro
log "part J start"
maestro test --format junit --output "$OUT/part-j.xml" --test-output-dir "$OUT/part-j" "$QA_DIR/v0280-j.yaml"   > "$OUT/part-j.log" 2>&1 || { status=1; log "PART J FAILED"; }
fi  # part j

# ---------------------------------------------------------------- part J2 (v0.40.0: press, hold, drag a routine)
# The flow brings Push A and Pull A on screen; then a real finger's touch events (down, hold, move, up)
# moves Push A below Pull A, the screen is read back, and the same drag puts it back.
if qa_runs j2; then
free_maestro
log "part J2 start"
if maestro test --format junit --output "$OUT/part-j2.xml" --test-output-dir "$OUT/part-j2" "$QA_DIR/v0400-j2.yaml" > "$OUT/part-j2.log" 2>&1; then
  j2_dump() { adb shell uiautomator dump /sdcard/j2.xml >/dev/null 2>&1; adb pull /sdcard/j2.xml "$OUT/$1" >/dev/null 2>&1; }
  # A finger: down, hold 0.8 s (past the 350 ms lift, with room for a slow emulator), then move in
  # ten small steps and lift. `input draganddrop` held only ~400 ms and jumped a quarter of the way
  # at once, which a slow UI thread could read as a scroll (review).
  j2_drag() {
    adb shell input motionevent DOWN "$1" "$2"
    sleep 0.8
    for k in 1 2 3 4 5 6 7 8 9 10; do
      adb shell input motionevent MOVE "$1" $(( $2 + ($4 - $2) * k / 10 ))
      sleep 0.05
    done
    adb shell input motionevent UP "$3" "$4"
  }
  j2_dump j2-before.xml
  before=$(python3 "$QA_DIR/drag_check.py" order "$OUT/j2-before.xml" "Push A" "Pull A")
  coords=$(python3 "$QA_DIR/drag_check.py" drag "$OUT/j2-before.xml" "Push A" "Pull A")
  log "J2 before: $before; drag $coords"
  if [ "$before" = "A-first" ] && [ "$coords" != "missing" ]; then
    j2_drag $coords
    sleep 2
    j2_dump j2-after.xml
    adb exec-out screencap -p > "$OUT/j2-after-drag.png" 2>/dev/null || true
    after=$(python3 "$QA_DIR/drag_check.py" order "$OUT/j2-after.xml" "Push A" "Pull A")
    if [ "$after" = "B-first" ]; then
      log "J2 DRAG OK: Pull A is now above Push A"
      # UAT work package 4 (item 14): the new order is SAVED, not only drawn: the app stopped and
      # opened again (the same flow brings both cards on screen) still shows Pull A first.
      back_from="$OUT/j2-after.xml"
      adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
      free_maestro
      log "part J2R start"
      if maestro test --format junit --output "$OUT/part-j2r.xml" --test-output-dir "$OUT/part-j2r" "$QA_DIR/v0400-j2.yaml" > "$OUT/part-j2r.log" 2>&1; then
        j2_dump j2-restart.xml
        kept=$(python3 "$QA_DIR/drag_check.py" order "$OUT/j2-restart.xml" "Push A" "Pull A")
        if [ "$kept" = "B-first" ]; then
          log "J2 ORDER KEPT: after a restart Pull A is still above Push A"
          back_from="$OUT/j2-restart.xml"
        else
          status=1
          log "J2 ORDER NOT KEPT: after a restart the order is '$kept' (want B-first; j2-restart.xml)"
        fi
      else
        status=1
        log "PART J2R FAILED (the routines after a restart: part-j2r.log)"
      fi
      back=$(python3 "$QA_DIR/drag_check.py" drag "$back_from" "Push A" "Pull A")
      j2_drag $back
      sleep 2
      j2_dump j2-back.xml
      again=$(python3 "$QA_DIR/drag_check.py" order "$OUT/j2-back.xml" "Push A" "Pull A")
      [ "$again" = "A-first" ] && log "J2 DRAG BACK OK" || { status=1; log "J2 DRAG BACK FAILED ($again)"; }
    else
      status=1
      log "J2 DRAG FAILED: the order did not change after press-hold-drag ($after)"
    fi
  else
    status=1
    log "J2 DRAG FAILED: cards not found as expected ($before / $coords)"
  fi
else
  status=1
  log "PART J2 FAILED"
fi
adb shell input keyevent KEYCODE_HOME
fi  # part j2

# ---------------------------------------------------------------- part J3 (15 Oct 2026: drag an exercise mid-workout)
# Owner, in the gym: press and hold an exercise in the LIVE workout, every card shrinks to its name
# row, drag it, a buzz as it passes one. j3-workout-drag.yaml opens Push A; the same real finger
# as J2 holds the 2nd exercise's name row and drags it above the 1st; the order is read back
# (drag_check.py ex-names) and j3-end.yaml discards the workout.
if qa_runs j3; then
free_maestro
log "part J3 start"
# The live workout's clock ticks every second, so `uiautomator dump` can fail to find an idle
# screen (the first v0.44 run got no file at all). Try it a few times, logging why; then fall back
# to Maestro's own view tree (JSON), which drag_check.py also reads.
j3_dump() {
  rm -f "$OUT/$1"
  for t in 1 2 3 4; do
    adb shell rm -f /sdcard/j3.xml >/dev/null 2>&1
    why=$(adb shell uiautomator dump /sdcard/j3.xml 2>&1)
    adb pull /sdcard/j3.xml "$OUT/$1" >/dev/null 2>&1 && [ -s "$OUT/$1" ] && return 0
    log "J3 screen read $t failed: $why"
    sleep 1
  done
  maestro hierarchy > "$OUT/$1" 2> "$OUT/$1.err" && [ -s "$OUT/$1" ] && { log "J3 screen read: Maestro view tree used"; return 0; }
  log "J3 screen read: Maestro view tree failed too ($OUT/$1.err)"
}
if maestro test --format junit --output "$OUT/part-j3.xml" --test-output-dir "$OUT/part-j3" "$QA_DIR/j3-workout-drag.yaml" > "$OUT/part-j3.log" 2>&1; then
  j3_dump j3-before.xml
  j3_before=$(python3 "$QA_DIR/drag_check.py" ex-names "$OUT/j3-before.xml")
  j3_coords=$(python3 "$QA_DIR/drag_check.py" ex-drag "$OUT/j3-before.xml")
  log "J3 before: $j3_before; drag $j3_coords"
  if [ "$j3_coords" != "missing" ] && [ "$j3_before" != "missing" ]; then
    read -r j3x1 j3y1 j3x2 j3y2 <<< "$j3_coords"
    adb shell input motionevent DOWN "$j3x1" "$j3y1"
    sleep 0.8
    # The cards shrink as the hold lifts the card: photograph that (shrunk list, held card lifted).
    adb exec-out screencap -p > "$OUT/j3-held.png" 2>/dev/null || true
    for k in 1 2 3 4 5 6 7 8 9 10; do
      adb shell input motionevent MOVE "$j3x1" $(( j3y1 + (j3y2 - j3y1) * k / 10 ))
      sleep 0.05
    done
    adb shell input motionevent UP "$j3x2" "$j3y2"
    sleep 2
    j3_dump j3-after.xml
    j3_after=$(python3 "$QA_DIR/drag_check.py" ex-names "$OUT/j3-after.xml")
    j3_first=${j3_before%%|*}; j3_second=${j3_before##*|}
    if [ "$j3_after" = "$j3_second|$j3_first" ]; then
      log "J3 DRAG OK: $j3_second is now above $j3_first"
      # UAT work package 4 (item 14): the order is SAVED: the app stopped, opened again, back into
      # the open workout (uat-j3-resume.yaml): the dragged order still.
      adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
      free_maestro
      log "part J3R start"
      if maestro test --format junit --output "$OUT/part-j3r.xml" --test-output-dir "$OUT/part-j3r" "$QA_DIR/uat-j3-resume.yaml" > "$OUT/part-j3r.log" 2>&1; then
        j3_dump j3-restart.xml
        j3_kept=$(python3 "$QA_DIR/drag_check.py" ex-names "$OUT/j3-restart.xml")
        if [ "$j3_kept" = "$j3_second|$j3_first" ]; then
          log "J3 ORDER KEPT: after a restart $j3_second is still above $j3_first"
        else
          status=1
          log "J3 ORDER NOT KEPT: after a restart the order is '$j3_kept' (want '$j3_second|$j3_first'; j3-restart.xml)"
        fi
      else
        status=1
        log "PART J3R FAILED (the open workout after a restart: part-j3r.log)"
      fi
    else
      status=1
      log "J3 DRAG FAILED: order after the drag is '$j3_after' (want '$j3_second|$j3_first')"
    fi
  else
    status=1
    log "J3 DRAG FAILED: two exercises not found on screen ($j3_before / $j3_coords)"
  fi
else
  status=1
  log "PART J3 FAILED"
fi
# Review: always discard (a setup that failed after Push A started would leave it open for later parts).
free_maestro
maestro test --format junit --output "$OUT/j3-end.xml" --test-output-dir "$OUT/j3-end" "$QA_DIR/j3-end.yaml" > "$OUT/j3-end.log" 2>&1 \
  || log "J3 end: no workout to discard, or the discard flow failed (j3-end.log)"
adb shell input keyevent KEYCODE_HOME
fi  # part j3

# ---------------------------------------------------------------- part K (v0.28.0: an export shared to ForgeAI)
# The Files app, as a person shares a file (qa-hevy.csv was pushed to Downloads for part J).
if qa_runs k; then
qa_runs j || push_fixture "$QA_DIR/fixtures/qa-hevy.csv" /sdcard/Download/qa-hevy.csv
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
adb shell am start -n com.google.android.documentsui/com.android.documentsui.files.FilesActivity > "$OUT/k-files.txt" 2>&1   || adb shell am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/root/primary" >> "$OUT/k-files.txt" 2>&1   || log "FILES APP DID NOT OPEN"
sleep 8
log "part K start"
maestro test --format junit --output "$OUT/part-k.xml" --test-output-dir "$OUT/part-k" "$QA_DIR/v0280-k.yaml"   > "$OUT/part-k.log" 2>&1 || { status=1; log "PART K FAILED"; }
adb logcat -d -s ForgeShare:W > "$OUT/k-share-log.txt" 2>/dev/null || true
log "share errors logged: $(grep -c 'ForgeShare' "$OUT/k-share-log.txt" 2>/dev/null)"
fi  # part k

# ---------------------------------------------------------------- part L (v0.29.0: Import routines from a Hevy link)
# Reads the owner's public Hevy folder on hevy.com in the app's hidden in-app browser (needs the internet).
# Audit Phase 4: first his Hevy HISTORY of those routines (two rounds of Push 1 → … → Leg 2), so
# the folder takes his real rotation and Today after Push 1 is Pull 1, as on his phone.
if qa_runs l; then
push_fixture "$QA_DIR/fixtures/qa-jaipur.csv" /sdcard/Download/qa-jaipur.csv
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
log "downloads: $(wait_media qa-jaipur 1 20 downloads) Jaipur history file"
adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
adb shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
log "part L start"
maestro test --format junit --output "$OUT/part-l.xml" --test-output-dir "$OUT/part-l" "$QA_DIR/v0290-l.yaml"   > "$OUT/part-l.log" 2>&1 || { status=1; log "PART L FAILED"; }
fi  # part l

# ---------------------------------------------------------------- part N (audit Phase 3: History holds everything)
# Redesign: the Profile feed / Calendar (its search across years: part J's March 2024 Hevy
# workouts), an old workout's edit (⋯ → Edit workout) asks before Back throws it away, Log a past
# workout. Saves nothing, so part M's count holds.
if qa_runs n; then
free_maestro
log "part N start"
maestro test --format junit --output "$OUT/part-n.xml" --test-output-dir "$OUT/part-n" "$QA_DIR/audit3-n.yaml" \
  > "$OUT/part-n.log" 2>&1 || { status=1; log "PART N FAILED"; }
fi  # part n

# ---------------------------------------------------------------- part P9 (audit Phase 9: beyond Hevy)
# Weekly goal on the Workout tab's Up next card, the entry bar's step and "Copy to sets below", "Share as text" to Android's
# share menu, "Start records fresh" and back (phase9-p.yaml). Saves one workout (part M reads its
# count afresh). Then the app icon's long-press shortcuts must be in Android's shortcut list:
# "Log body weight", and "Start …" / "Resume workout" (Shortcuts.kt, from the Today widget's answer).
if qa_runs p9; then
free_maestro
log "part P9 start"
maestro test --format junit --output "$OUT/part-p9.xml" --test-output-dir "$OUT/part-p9" "$QA_DIR/phase9-p.yaml" \
  > "$OUT/part-p9.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/p9-failed.png"; log "PART P9 FAILED (part-p9.log, p9-failed.png)"; }
adb shell dumpsys shortcut > "$OUT/p9-shortcuts.txt" 2>/dev/null || true
# Labels may be redacted in the dump on some images; the ids ("today", "weight") never are.
if grep -qE "Log body weight|id=weight" "$OUT/p9-shortcuts.txt" && grep -qE "Start workout|Start [A-Za-z0-9]|Resume workout|id=today" "$OUT/p9-shortcuts.txt"; then
  log "APP ICON SHORTCUTS: present ($(grep -oE 'longLabel=[^,}]*' "$OUT/p9-shortcuts.txt" | grep -iE 'Start|Resume|body weight' | sort -u | tr '\n' ';' | cut -c1-200))"
else
  status=1
  log "APP ICON SHORTCUTS: MISSING from dumpsys shortcut (p9-shortcuts.txt)"
fi
fi  # part p9

# ---------------------------------------------------------------- part R (the 3-tab redesign, photographed)
# Workout tab (Up next, folders, a routine's and a folder's ⋯, Explore), Profile (header, the
# chart in each chip and range, a bar tapped, the 4 tiles' screens, a feed card and its ⋯, a
# workout page, an exercise page's 3 tabs), Settings and 3 of its pages, Edit profile, and the
# gym's real Shop on the LIVE server: join the test gym FORGE1, order the shaker, see it Ordered,
# cancel it, leave; then the sample shop (redesign-r.yaml). Saves no workout. Its screenshots
# (r-*.png) are gathered in qa-out/redesign/ (Maestro writes them into the part's output folder,
# or on an older Maestro the working folder).
if qa_runs r; then
free_maestro
log "part R start"
maestro test --format junit --output "$OUT/part-r.xml" --test-output-dir "$OUT/part-r" "$QA_DIR/redesign-r.yaml" \
  > "$OUT/part-r.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/r-failed.png"; log "PART R FAILED (part-r.log, r-failed.png)"; }
mkdir -p "$OUT/redesign"
{ find "$OUT/part-r" -name "r-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "r-*.png" 2>/dev/null; } \
  | while read -r f; do cp "$f" "$OUT/redesign/" 2>/dev/null; done
log "REDESIGN TOUR: $(find "$OUT/redesign" -name "r-*.png" 2>/dev/null | wc -l | tr -d ' ') screenshots in qa-out/redesign/"
fi  # part r

# ---------------------------------------------------------------- part BR (gym branding, Level 1)
# Join the branded test gym RAMS01 (RAM'S FITNESS CLUB IMPACT) on the LIVE server, photograph the
# opening, Workout, Profile, Shop and a product in the gym's colours, relaunch (the opening again),
# leave (ForgeAI's look back) — brand-theme.yaml. Needs supabase/migrations/0005_gym_theme.sql on
# the server: probed first with a harmless call (a made-up owner key): 404 = the function is not
# there yet, so the part is skipped and says so, instead of failing on "That code didn't match".
br_probe() {
  local url key
  url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabaseUrl'])" "$QA_DIR/../app.json" 2>/dev/null)
  key=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabasePublishableKey'])" "$QA_DIR/../app.json" 2>/dev/null)
  [ -n "$url" ] && [ -n "$key" ] || { echo "no-config"; return; }
  curl -s -o /dev/null -w '%{http_code}' -X POST "$url/rest/v1/rpc/owner_set_brand" \
    -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    -d '{"p_key":"qa-probe","p_accent":null,"p_bg":null,"p_logo_url":null,"p_heading":null}' 2>/dev/null || echo "000"
}
BR_PROBE=$(qa_runs br && br_probe)
if ! qa_runs br; then
  :
elif [ "$BR_PROBE" = "404" ] || [ "$BR_PROBE" = "no-config" ]; then
  qa_server_missing BR "gym branding is not on the server yet (owner_set_brand probe: $BR_PROBE) — apply 0005_gym_theme.sql"
else
  free_maestro
  log "part BR start (owner_set_brand probe: $BR_PROBE)"
  maestro test --format junit --output "$OUT/part-br.xml" --test-output-dir "$OUT/part-br" "$QA_DIR/brand-theme.yaml" \
    > "$OUT/part-br.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/br-failed.png"; log "PART BR FAILED (part-br.log, br-failed.png)"; }
  mkdir -p "$OUT/brand"
  { find "$OUT/part-br" -name "br-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "br-*.png" 2>/dev/null; } \
    | while read -r f; do cp "$f" "$OUT/brand/" 2>/dev/null; done
  log "BRAND TOUR: $(find "$OUT/brand" -name "br-*.png" 2>/dev/null | wc -l | tr -d ' ') screenshots in qa-out/brand/"
  # Start-up screen (15 Oct 2026): joining RAMS01 must ask Android 13+ for the plain start-up screen
  # (no ForgeAI logo before the gym's), and Leave must give ForgeAI's back — in that order.
  BR_SDK=$(adb shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r')
  adb logcat -d -s ForgeSplash:I > "$OUT/br-splash-log.txt" 2>/dev/null
  # Order (review): the join AND the relaunch inside the gym each ask for the plain screen (2+ "plain"
  # lines after the last earlier "ForgeAI" line), then Leave asks for ForgeAI's (the last line).
  # The relaunch alone would not prove the join's own call.
  br_splash_order() {
    python3 -c "
import sys
ls = [l for l in open(sys.argv[1], encoding='utf-8', errors='replace') if 'start-up screen set' in l]
kinds = ['plain' if 'plain start-up' in l else 'forge' for l in ls]
if not kinds or kinds[-1] != 'forge': sys.exit(1)
body = kinds[:-1]
plain_run = 0
for k in reversed(body):
    if k != 'plain': break
    plain_run += 1
sys.exit(0 if plain_run >= 2 else 1)
" "$OUT/br-splash-log.txt"
  }
  if [ -z "$BR_SDK" ]; then
    status=1
    log "PART BR FAILED: could not read the emulator's Android version for the start-up screen check"
  elif [ "$BR_SDK" -lt 33 ]; then
    log "BR start-up screen: SKIPPED (Android API $BR_SDK; needs 33+)"
  elif br_splash_order; then
    log "BR start-up screen: OK (plain while in RAMS01, ForgeAI's after Leave; br-splash-log.txt)"
  else
    status=1
    log "PART BR FAILED: the start-up screen was not switched (br-splash-log.txt)"
  fi
fi

# ---------------------------------------------------------------- part INV (v0.38.0: invite link)
# The gym's invite link opens the app on "Join <gym>" (invite-a..d.yaml): join FORGE1 from its link;
# the same link again says "already in"; RAMS01's link switches gyms (then Leave); a code no gym has
# says so. Each link is opened at the app by adb with the package named, as Android does once the
# link is verified (a QA build is not signed with the release key, so it is never verified here).
# Needs supabase/migrations/0007_invite_link.sql live: probed first (404 = skipped and said so).
inv_probe() {
  local url key
  url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabaseUrl'])" "$QA_DIR/../app.json" 2>/dev/null)
  key=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabasePublishableKey'])" "$QA_DIR/../app.json" 2>/dev/null)
  [ -n "$url" ] && [ -n "$key" ] || { echo "no-config"; return; }
  curl -s -o /dev/null -w '%{http_code}' -X POST "$url/rest/v1/rpc/gym_preview"     -H "apikey: $key" -H "Content-Type: application/json" -d '{"p_code":"FORGE1"}' 2>/dev/null || true
}
inv_open() {
  adb shell am start -W -a android.intent.action.VIEW -d "$1" -p "$PKG" >/dev/null 2>&1 || true
  sleep 3
}
INV_PROBE=$(qa_runs inv && inv_probe)
if ! qa_runs inv; then
  :
elif [ "$INV_PROBE" != "200" ]; then
  qa_server_missing INV "the invite link is not on the server yet (gym_preview probe: $INV_PROBE) — apply 0007_invite_link.sql"
else
  # Step E (gym messages): a fresh demo gym (anyone can start one; its key lives only in this run)
  # gets one announcement, then its invite link opens the app.
  inv_url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabaseUrl'])" "$QA_DIR/../app.json" 2>/dev/null)
  inv_key=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabasePublishableKey'])" "$QA_DIR/../app.json" 2>/dev/null)
  inv_rpc() { curl -s -X POST "$inv_url/rest/v1/rpc/$1" -H "apikey: $inv_key" -H "Content-Type: application/json" -d "$2"; }
  for step in a b c d e; do
    case $step in
      a|b) inv_open "https://forgeai.aakashpahuja.in/j/FORGE1" ;;
      c) inv_open "https://forgeai.aakashpahuja.in/j/RAMS01" ;;
      d) inv_open "forgeai://j/ZZZZZ9" ;;
      e)
        demo=$(inv_rpc demo_start_gym '{"p_name":"QA Inbox Gym"}')
        demo_key=$(printf '%s' "$demo" | python3 -c "import json,sys;print(json.load(sys.stdin).get('ownerKey',''))" 2>/dev/null)
        demo_code=$(printf '%s' "$demo" | python3 -c "import json,sys;print(json.load(sys.stdin).get('joinCode',''))" 2>/dev/null)
        sent=$(inv_rpc owner_send_message "{\"p_key\":\"$demo_key\",\"p_kind\":\"closed\",\"p_title\":\"QA: gym closed on Sunday\",\"p_body\":\"Sent by the phone test.\"}")
        log "INV-e: demo gym $demo_code, message: $(printf '%s' "$sent" | head -c 80)"
        inv_open "https://forgeai.aakashpahuja.in/j/$demo_code"
        ;;
    esac
    free_maestro
    log "part INV-$step start (gym_preview probe: $INV_PROBE)"
    maestro test --format junit --output "$OUT/part-inv-$step.xml" --test-output-dir "$OUT/part-inv-$step" "$QA_DIR/invite-$step.yaml"       > "$OUT/part-inv-$step.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/inv-$step-failed.png"; log "PART INV-$step FAILED (part-inv-$step.log, inv-$step-failed.png)"; }
  done
  mkdir -p "$OUT/invite"
  { find "$OUT"/part-inv-* -name "inv-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "inv-*.png" 2>/dev/null; }     | while read -r f; do cp "$f" "$OUT/invite/" 2>/dev/null; done
  log "INVITE TOUR: $(find "$OUT/invite" -name "inv-*.png" 2>/dev/null | wc -l | tr -d ' ') screenshots in qa-out/invite/"
fi

# ---------------------------------------------------------------- part INV-f (QR self check-in, 15 Oct 2026)
# The gym's check-in poster link /c/<CODE> opens "Check in at <gym>" (checkin-f1..f3.yaml). A fresh
# ONLINE gym is made on the live server (gym_create_online; at most 5 an hour from one address)
# with ONE roster member, mobile +91 98765 00002 (crm_push). F1 joins it from its invite link;
# F2 opens the check-in link: one tap, the number is asked once, a wrong one gets the desk words, the
# roster's one checks in; F3 opens it again: "already checked in", then Leave.
# Needs supabase/migrations/0015_qr_checkin.sql and 0016_checkin_fixes.sql live: probed first with a made-up member key
# (404 = member_check_in is not there yet: skipped and said so).
ci_probe() {
  [ -n "$inv_url" ] && [ -n "$inv_key" ] || { echo "no-config"; return; }
  curl -s -o /dev/null -w '%{http_code}' -X POST "$inv_url/rest/v1/rpc/member_check_in" \
    -H "apikey: $inv_key" -H "Content-Type: application/json" -d '{"p_key":"qa-probe"}' 2>/dev/null || echo "000"
}
inv_url=${inv_url:-$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabaseUrl'])" "$QA_DIR/../app.json" 2>/dev/null)}
inv_key=${inv_key:-$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabasePublishableKey'])" "$QA_DIR/../app.json" 2>/dev/null)}
CI_PROBE=$(qa_runs invf && ci_probe)
if ! qa_runs invf; then
  :
elif [ "$CI_PROBE" = "404" ] || [ "$CI_PROBE" = "no-config" ]; then
  qa_server_missing INV-f "QR check-in is not on the server yet (member_check_in probe: $CI_PROBE) — apply 0015_qr_checkin.sql"
else
  ci_rpc() { curl -s -X POST "$inv_url/rest/v1/rpc/$1" -H "apikey: $inv_key" -H "Content-Type: application/json" -d "$2"; }
  ci_gym=$(ci_rpc gym_create_online '{"p_gym_name":"QA Check-in Gym","p_name":"QA Owner","p_phone":"9876500001"}')
  ci_session=$(printf '%s' "$ci_gym" | python3 -c "import json,sys;print(json.load(sys.stdin).get('sessionKey',''))" 2>/dev/null)
  ci_code=$(printf '%s' "$ci_gym" | python3 -c "import json,sys;print(json.load(sys.stdin).get('joinCode',''))" 2>/dev/null)
  ci_gym_id=$(printf '%s' "$ci_gym" | python3 -c "import json,sys;print(json.load(sys.stdin).get('gymId',''))" 2>/dev/null)
  ci_body=$(python3 -c "
import json, sys, uuid
key, gym = sys.argv[1], sys.argv[2]
m = {'id': 'qa-roster-1', 'gymId': gym, 'fullName': 'QA Roster Member', 'phone': '+919876500002', 'email': None,
     'gender': None, 'dateOfBirth': None, 'address': None, 'emergencyName': None, 'emergencyPhone': None,
     'joinedOn': '2026-10-01', 'photoUri': None, 'notes': None, 'batch': None, 'archived': False,
     'appUserId': None, 'createdAt': 1, 'updatedAt': 1}
print(json.dumps({'p_key': key, 'p_base': 0, 'p_records': [{'k': 'member', 'id': m['id'], 'd': m}], 'p_push_id': str(uuid.uuid4())}))
" "$ci_session" "$ci_gym_id" 2>/dev/null)
  ci_pushed=$(ci_rpc crm_push "$ci_body")
  log "INV-f: online gym $ci_code (roster push answered: $(printf '%s' "$ci_pushed" | head -c 60))"
  if [ -z "$ci_code" ] || [ -z "$ci_session" ]; then
    status=1
    log "PART INV-f FAILED: could not make the online test gym ($(printf '%s' "$ci_gym" | head -c 120))"
  else
    for step in f1 f2 f3; do
      case $step in
        f1) inv_open "https://forgeai.aakashpahuja.in/j/$ci_code" ;;
        f2|f3) inv_open "https://forgeai.aakashpahuja.in/c/$ci_code" ;;
      esac
      free_maestro
      log "part INV-$step start (member_check_in probe: $CI_PROBE)"
      maestro test --format junit --output "$OUT/part-inv-$step.xml" --test-output-dir "$OUT/part-inv-$step" "$QA_DIR/checkin-$step.yaml" \
        > "$OUT/part-inv-$step.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/inv-$step-failed.png"; log "PART INV-$step FAILED (part-inv-$step.log, inv-$step-failed.png)"; }
    done
    mkdir -p "$OUT/invite"
    { find "$OUT"/part-inv-f* -name "inv-f*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "inv-f*.png" 2>/dev/null; } \
      | while read -r f; do cp "$f" "$OUT/invite/" 2>/dev/null; done
  fi
fi

# ---------------------------------------------------------------- part P7 (audit Phase 7: large text)
# The phone's font size at its largest step (font_scale 2.0, Android 14's top setting) and the app
# restarted, then a screen tour (phase7-bigtext.yaml): the Workout tab (top, folders), an open
# workout with a set row (an empty workout with one exercise, then discarded: nothing saved), the
# Profile page (top, chart, feed), Calendar, Statistics, Settings, the Shop grid and a product
# page, each photographed (p7-big-<nav>-*.png, also gathered in qa-out/p7-big/).
# Run once with the emulator's gesture navigation (part P7BIG) and once with Android's 3-button
# bar (part P7NAV3) when this image can switch to it by adb. Font size and navigation are put
# back before part M. Saves nothing, so part M's workout count is not changed by this part.
P7_SHOTS=12  # screenshots every tour takes, whichever way its workout step goes (14 when it starts one)
p7_font() { adb shell settings get system font_scale 2>/dev/null | tr -d '\r'; }
# 0 = 3-button, 1 = 2-button, 2 = gestures (Android's own setting, kept in step with the overlay).
p7_nav() { adb shell settings get secure navigation_mode 2>/dev/null | tr -d '\r'; }
p7_overlay_on() { adb shell cmd overlay list 2>/dev/null | tr -d '\r' | grep -q "\[x\] *com.android.internal.systemui.navbar.$1\$"; }
p7_nav_to() {  # $1 = threebutton | twobutton | gestural
  adb shell cmd overlay enable-exclusive --category "com.android.internal.systemui.navbar.$1" >/dev/null 2>&1 \
    || adb shell cmd overlay enable "com.android.internal.systemui.navbar.$1" >/dev/null 2>&1 || true
  sleep 8
  p7_overlay_on "$1"
}
p7_tour() {  # $1 = part name (p7big / p7nav3), $2 = navigation label for the screenshot names
  local n up
  up=$(echo "$1" | tr '[:lower:]' '[:upper:]')
  free_maestro
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  log "part $1 start"
  maestro test -e NAV="$2" --format junit --output "$OUT/part-$1.xml" --test-output-dir "$OUT/part-$1" "$QA_DIR/phase7-bigtext.yaml" \
    > "$OUT/part-$1.log" 2>&1 || {
      status=1
      adb exec-out screencap -p > "$OUT/$1-failed.png"
      log "PART $up FAILED (large-text tour, $2 navigation, font scale $(p7_font)): part-$1.log, $1-failed.png"
    }
  # Maestro writes screenshots into the part's output folder (or, on an older Maestro, the
  # working folder): gather this tour's into qa-out/p7-big/ so they sit together in the artifact.
  mkdir -p "$OUT/p7-big"
  { find "$OUT/part-$1" -name "p7-big-$2-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "p7-big-$2-*.png" 2>/dev/null; } \
    | while read -r f; do cp "$f" "$OUT/p7-big/" 2>/dev/null; done
  n=$(find "$OUT/p7-big" -name "p7-big-$2-*.png" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" -ge "$P7_SHOTS" ]; then
    log "BIG TEXT ($2 navigation): $n screenshots in qa-out/p7-big/"
  else
    log "BIG TEXT ($2 navigation): screenshots MISSING, $n of at least $P7_SHOTS in qa-out/p7-big/ (part-$1.log)"
  fi
}
if qa_runs p7; then
p7_font_before=$(p7_font)
adb shell settings put system font_scale 2.0
sleep 3
if [ "$(p7_font)" = "2.0" ]; then
  log "BIG TEXT: font scale set to 2.0 (was '$p7_font_before')"
  p7_tour p7big gesture
  # 3-button navigation: an overlay on the emulator image; switched only when it is there.
  p7_nav_before=$(p7_nav)
  adb shell cmd overlay list 2>/dev/null | tr -d '\r' | grep -i "navbar" > "$OUT/p7-nav-overlays.txt" || true
  if grep -q "com.android.internal.systemui.navbar.threebutton" "$OUT/p7-nav-overlays.txt"; then
    if p7_nav_to threebutton; then
      log "THREE-BUTTON NAV: on (navigation_mode $(p7_nav), was '$p7_nav_before')"
      adb exec-out screencap -p > "$OUT/p7-nav3-bar.png"
      p7_tour p7nav3 3button
    else
      log "THREE-BUTTON NAV FAILED: the overlay would not switch on (navigation_mode $(p7_nav)); see p7-nav-overlays.txt"
      status=1
    fi
    # Back to what the phone had (gestures on this emulator; 2-button or 3-button if it said so).
    case "$p7_nav_before" in
      0) p7_back=threebutton ;;
      1) p7_back=twobutton ;;
      *) p7_back=gestural ;;
    esac
    if p7_nav_to "$p7_back"; then
      log "THREE-BUTTON NAV: put back to $p7_back (navigation_mode $(p7_nav))"
    else
      log "THREE-BUTTON NAV FAILED: could not put navigation back to $p7_back (navigation_mode $(p7_nav))"
      status=1
    fi
  else
    log "THREE-BUTTON NAV: this emulator image has no 3-button navigation overlay; that tour was not run (p7-nav-overlays.txt)"
  fi
else
  log "BIG TEXT FAILED: font scale did not change (reads '$(p7_font)'); the large-text tour was not run"
  status=1
fi
adb shell settings put system font_scale "$BASE_FONT"
sleep 3
if [ "$(p7_font)" = "$BASE_FONT" ]; then
  log "BIG TEXT: font scale put back to $BASE_FONT"
else
  log "BIG TEXT FAILED: font scale could not be put back to $BASE_FONT (reads '$(p7_font)')"
  status=1
fi
adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
fi  # part p7

# ---------------------------------------------------------------- part P0 (audit toolkit: permission off)
# The camera permission is taken away in the flow's own launchApp; Android's camera question must
# appear and the app must explain a refusal. Runs before part M, whose reinstall could leave the
# app on its welcome screen; part M reinstalls anyway, and later launches allow every permission.
if qa_runs p0; then
free_maestro
log "part P0 start"
maestro test --format junit --output "$OUT/part-p0.xml" --test-output-dir "$OUT/part-p0" "$QA_DIR/p0-permissions-off.yaml" > "$OUT/part-p0.log" 2>&1 || { status=1; log "PART P0 FAILED"; }
adb shell input keyevent KEYCODE_HOME
fi  # part p0

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

  # 2a. UAT work package 4 (item 12): more than the workout count must come back. backup-m-prep.yaml
  # sets the profile name "QA Restore", a Body fat 17.5 % entry and units lb, and ends on the Workout
  # tab with a routine card on screen, whose name is read here (backup-m-check.yaml looks for it).
  free_maestro
  maestro test --format junit --output "$OUT/part-m-prep.xml" --test-output-dir "$OUT/part-m-prep" "$QA_DIR/backup-m-prep.yaml"     > "$OUT/part-m-prep.log" 2>&1 || { adb exec-out screencap -p > "$OUT/m-prep-failed.png"; m_fail "could not set the name, measurement, units and routine to check after the restore (part-m-prep.log, m-prep-failed.png)"; return 1; }
  free_maestro
  adb shell uiautomator dump /sdcard/qa-m-routine.xml >/dev/null 2>&1 || true
  adb pull /sdcard/qa-m-routine.xml "$OUT/m-routine-ui.xml" >/dev/null 2>&1 || true
  m_routine=$(grep -oE 'Start routine [^"]+' "$OUT/m-routine-ui.xml" 2>/dev/null | head -1 | sed 's/^Start routine //')
  if [ -z "$m_routine" ]; then
    maestro hierarchy > "$OUT/m-routine-hierarchy.json" 2>/dev/null || true
    m_routine=$(grep -oE 'Start routine [^"]+' "$OUT/m-routine-hierarchy.json" 2>/dev/null | head -1 | sed 's/^Start routine //')
    free_maestro
  fi
  [ -n "$m_routine" ] || { m_fail "could not read a routine's name off the Workout tab (m-routine-ui.xml)"; return 1; }
  log "BACKUP M: before the backup: name 'QA Restore', Body fat 17.5 %, units lb, routine '$m_routine'"

  # 2b. What must come back: Settings -> Backup's first line, e.g. "12 workouts".
  free_maestro
  maestro test --format junit --output "$OUT/part-m-record.xml" --test-output-dir "$OUT/part-m-record" "$QA_DIR/backup-m-record.yaml" \
    > "$OUT/part-m-record.log" 2>&1 || { m_fail "could not reach Settings -> Backup's workout count before the backup (part-m-record.log)"; return 1; }
  free_maestro
  adb shell uiautomator dump /sdcard/qa-m-before.xml >/dev/null 2>&1 || true
  adb pull /sdcard/qa-m-before.xml "$OUT/m-before-ui.xml" >/dev/null 2>&1 || true
  line=$(grep -oE '"[0-9]+ workouts?"' "$OUT/m-before-ui.xml" 2>/dev/null | head -1 | tr -d '"')
  if [ -z "$line" ]; then
    maestro hierarchy > "$OUT/m-before-hierarchy.json" 2>/dev/null || true
    line=$(grep -oE '"[0-9]+ workouts?"' "$OUT/m-before-hierarchy.json" 2>/dev/null | head -1 | tr -d '"')
    free_maestro
  fi
  [ -n "$line" ] || { m_fail "could not read the 'N workouts' line off Settings -> Backup (m-before-ui.xml)"; return 1; }
  log "BACKUP M: before the backup Settings -> Backup shows '$line'"

  # 2c. UAT WP4b (M-157): "Include photos in my backup" ON, with at least one progress photo (one is
  # added from the gallery when there is none: the two SAMPLE pictures, as part D pushes them). The
  # copies Android's backup will carry (files/photo-backup/) are listed as root and counted.
  push_fixture "$QA_DIR/fixtures/sample-progress-1.png" /sdcard/Pictures/forgeai-sample-1.png
  push_fixture "$QA_DIR/fixtures/sample-progress-2.png" /sdcard/Pictures/forgeai-sample-2.png
  adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
  log "media store: $(wait_media forgeai-sample 2 20 images/media) sample pictures for part M's photo"
  free_maestro
  maestro test --format junit --output "$OUT/part-m-photos.xml" --test-output-dir "$OUT/part-m-photos" "$QA_DIR/backup-m-photos.yaml" \
    > "$OUT/part-m-photos.log" 2>&1 || { adb exec-out screencap -p > "$OUT/m-photos-failed.png"; m_fail "could not add a progress photo and turn on 'Include photos in my backup' (part-m-photos.log, m-photos-failed.png)"; return 1; }
  free_maestro
  sleep 3
  adb shell "su 0 ls -l /data/data/$PKG/files/photo-backup/" 2>/dev/null | tr -d '\r' > "$OUT/m-photo-backup-before.txt"
  m_photos=$(grep -cE '\.(jpg|jpeg|png|webp)$' "$OUT/m-photo-backup-before.txt")
  if [ -z "$(adb shell "su 0 ls /data/data/$PKG/" 2>/dev/null | tr -d '\r')" ]; then
    m_photos=""
    log "BACKUP M: photos: the backup folder cannot be read on this image (no root); the screens alone are checked"
  elif [ "$m_photos" -ge 1 ]; then
    log "BACKUP M: 'Include photos in my backup' is on: $m_photos photo copies in files/photo-backup/ (m-photo-backup-before.txt)"
  else
    m_fail "'Include photos in my backup' is on but files/photo-backup/ holds no photo (m-photo-backup-before.txt)"
    return 1
  fi

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
  # 6. UAT work package 4 (item 12): and the rest of what was set before the backup.
  free_maestro
  local m_re
  m_re=$(python3 -c "import re,sys;print(re.escape(sys.argv[1]))" "$m_routine")
  maestro test -e ROUTINE="$m_re" --format junit --output "$OUT/part-m-check.xml" --test-output-dir "$OUT/part-m-check" "$QA_DIR/backup-m-check.yaml"     > "$OUT/part-m-check.log" 2>&1 || { adb exec-out screencap -p > "$OUT/m-check-failed.png"; m_fail "after the reinstall the name 'QA Restore', the Body fat 17.5 % entry, units lb or routine '$m_routine' did not come back (part-m-check.log, m-check-failed.png)"; return 1; }
  log "BACKUP M: the name 'QA Restore', the Body fat 17.5 % entry, units lb and routine '$m_routine' came back too"
  # 7. UAT WP4b (M-157): the progress photos came back: on screen (Measures, the viewer, the backup
  # switch still on), and as picture FILES in files/progress-photos/ (not only their rows).
  free_maestro
  maestro test --format junit --output "$OUT/part-m-photos-check.xml" --test-output-dir "$OUT/part-m-photos-check" "$QA_DIR/backup-m-photos-check.yaml" \
    > "$OUT/part-m-photos-check.log" 2>&1 || { adb exec-out screencap -p > "$OUT/m-photos-check-failed.png"; m_fail "after the reinstall the progress photos or the photo backup switch did not come back (part-m-photos-check.log, m-photos-check-failed.png)"; return 1; }
  free_maestro
  if [ -n "${m_photos:-}" ]; then
    adb shell "su 0 ls -l /data/data/$PKG/files/progress-photos/" 2>/dev/null | tr -d '\r' > "$OUT/m-photos-after.txt"
    local m_back m_empty
    m_back=$(grep -cE '\.(jpg|jpeg|png|webp)$' "$OUT/m-photos-after.txt")
    m_empty=$(awk '/\.(jpg|jpeg|png|webp)$/ && $5 == 0' "$OUT/m-photos-after.txt" | wc -l | tr -d ' ')
    if [ "$m_back" -ge "$m_photos" ] && [ "$m_empty" = "0" ]; then
      log "BACKUP M: $m_back progress photo files back in files/progress-photos/ after the reinstall ($m_photos were in the backup; m-photos-after.txt)"
    else
      m_fail "after the reinstall files/progress-photos/ holds $m_back photo files ($m_empty empty); the backup held $m_photos (m-photos-after.txt)"
      return 1
    fi
  fi
}
if qa_runs m; then
log "part M start"
part_m
fi  # part m

# ---------------------------------------------------------------- audit v2 gate parts (opt-in)
# Each starts from a fresh install's state with the demo data (gate-demo.yaml), so it runs alone
# (`only`) or after the whole run (`extra`). Evidence: part-<name>/, <name>-*.txt, timeline.
GATE_RAN=""
gate_flow() {  # $1 = part name, $2 = flow file, then extra maestro args (-e NAME=value ...)
  local name="$1" flow="$2"
  shift 2
  free_maestro
  log "part $name start"
  maestro test "$@" --format junit --output "$OUT/part-$name.xml" --test-output-dir "$OUT/part-$name" "$QA_DIR/$flow" \
    > "$OUT/part-$name.log" 2>&1 || {
      status=1
      adb exec-out screencap -p > "$OUT/$name-failed.png"
      log "PART $(echo "$name" | tr '[:lower:]' '[:upper:]') FAILED ($flow: part-$name.log, $name-failed.png)"
      return 1
    }
  GATE_RAN="$GATE_RAN $name"
  return 0
}
gate_wake() {
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 1
  adb shell wm dismiss-keyguard || true
}
gate_dump() { adb shell dumpsys notification --noredact > "$OUT/$1"; }
# Do Not Disturb as a person sets it from Quick Settings: "priority only" (zen_mode 1), where
# alarms get through. NB `set_dnd on` is TOTAL SILENCE (zen_mode 2), which blocks alarms too
# (first API 36 run, 38866492454).
gate_dnd() {  # $1 = priority | off
  adb shell cmd notification set_dnd "$1" > "$OUT/dnd-set-$1.txt" 2>&1 || true
  sleep 2
  echo "$(adb shell settings get global zen_mode | tr -d '\r')"
}

# ---------------------------------------------------------------- UAT-M parts (UAT work package 4)
# The member app's risky actions no phone test had pressed (Audit/uat FINDINGS U-M3, U-M4), pressed for
# real and checked on the screen after each press. Part of the whole run, after part M: they delete,
# replace and erase, so they run where nothing after them leans on their state (W starts afresh).
# Each part starts from a fresh install + the demo (gate-demo.yaml), or from the UAT part before it
# when that part passed. Evidence: part-u*/ (screenshots u?-*.png), part-u*.log, ud-history.csv.
UAT_OK=""
uat_part() {  # $1 = part name, $2 = flow file, then extra maestro args
  if gate_flow "$@"; then UAT_OK="$UAT_OK $1"; return 0; fi
  return 1
}
uat_passed() { case " $UAT_OK " in *" $1 "*) return 0 ;; esac; return 1; }
uat_notif() {  # granted=true|false of ForgeAI's notification permission
  adb shell dumpsys package "$PKG" | tr -d '\r' | grep -o 'android.permission.POST_NOTIFICATIONS: granted=[a-z]*' | head -1 | cut -d= -f2
}

# UH: a past workout logged from Calendar and saved, edited and saved, deleted (uat-h.yaml).
if qa_runs uh; then
  uat_part uh uat-h.yaml && log "UAT UH: a past workout logged + saved, edited + saved (kept after a restart) and deleted, each checked on screen"
fi

# UR: start while one is open (Resume / Discard and start new), untick keeps the numbers, Remove set
# and swipe Delete each undone, Finish with a set fewer -> Update routine (uat-r.yaml).
if qa_runs ur; then
  uat_part ur uat-r.yaml && log "UAT UR: Resume / Discard and start new, untick kept, Remove set + Undo, swipe + Undo, Update routine, each checked on screen"
fi

# UN: "Rest alerts are off" during a workout, notifications taken away as a member would (pm revoke).
# Given back after, as part I2 does.
if qa_runs un; then
  uat_passed ur || gate_flow un_seed gate-demo.yaml || true
  adb shell pm revoke "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/un-revoke.txt" 2>&1 || log "UAT UN: could not revoke the notification permission ($(tr -d '\r' < "$OUT/un-revoke.txt"))"
  sleep 2
  if [ "$(uat_notif)" = "false" ]; then
    log "UAT UN: notification permission taken away (granted=false)"
    uat_part un uat-n.yaml && log "UAT UN: the rest bar said 'Rest alerts are off' and offered to turn them on"
  else
    status=1
    log "UAT UN FAILED: the notification permission could not be taken away (granted=$(uat_notif)); the part was not run"
  fi
  adb shell pm clear-permission-flags "$PKG" android.permission.POST_NOTIFICATIONS user-set user-fixed >/dev/null 2>&1 || true
  adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS > "$OUT/un-grant.txt" 2>&1 || true
  if [ "$(uat_notif)" = "true" ]; then
    log "UAT UN: notification permission given back"
  else
    status=1
    log "UAT UN FAILED: the notification permission could not be given back ($(tr -d '\r' < "$OUT/un-grant.txt"))"
  fi
fi

# UD: remove the demo with an own workout, load-demo questions, import Replace + Undo, Save my
# history (uat-d.yaml). The flow ends with Android's share sheet up: here it must be in front, and
# the file it shares (the app's cache, read as root on this google_apis image) must hold the 12
# workouts the Profile counted.
if qa_runs ud; then
  push_fixture "$QA_DIR/fixtures/qa-hevy.csv" /sdcard/Download/qa-hevy.csv
  adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
  log "downloads: $(wait_media qa-hevy 1 20 downloads) Hevy file for UD"
  if uat_part ud uat-d.yaml; then
    sleep 2
    ud_top=$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//')
    if echo "$ud_top" | grep -qiE 'chooser|intentresolver|ResolverActivity'; then
      log "UAT UD SAVE MY HISTORY: Android's share sheet is open ($ud_top)"
    else
      status=1
      log "UAT UD SAVE MY HISTORY FAILED: no share sheet in front after 'Save my history' ($ud_top)"
    fi
    ud_file=$(adb shell "su 0 ls /data/data/$PKG/cache/" 2>/dev/null | tr -d '\r' | grep -m1 -E '^forgeai-history-.*\.csv$')
    if [ -z "$ud_file" ]; then
      if [ -z "$(adb shell "su 0 ls /data/data/$PKG/" 2>/dev/null | tr -d '\r')" ]; then
        log "UAT UD SAVE MY HISTORY: the file cannot be read through adb on this image (no root); the share sheet check above stands alone"
      else
        status=1
        log "UAT UD SAVE MY HISTORY FAILED: no forgeai-history-*.csv in the app's cache after 'Save my history'"
      fi
    else
      adb exec-out "su 0 cat /data/data/$PKG/cache/$ud_file" > "$OUT/ud-history.csv" 2>/dev/null || true
      ud_n=$(python3 -c "
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8-sig', errors='replace', newline='')))
print(len({(r.get('title'), r.get('start_time'), r.get('end_time')) for r in rows}))
" "$OUT/ud-history.csv" 2>/dev/null)
      if [ "$ud_n" = "12" ]; then
        log "UAT UD SAVE MY HISTORY: $ud_file holds 12 workouts, as the Profile counted ($(wc -l < "$OUT/ud-history.csv" | tr -d ' ') lines, ud-history.csv)"
      else
        status=1
        log "UAT UD SAVE MY HISTORY FAILED: $ud_file holds '${ud_n:-unreadable}' workouts, the Profile counted 12 (ud-history.csv)"
      fi
    fi
    adb exec-out screencap -p > "$OUT/ud-share-sheet.png" 2>/dev/null || true
    adb shell input keyevent KEYCODE_BACK
    sleep 2
  fi
fi

# UE: Erase all data as a solo member (and the app reopens on the welcome), the welcome's "From Hevy"
# opening the import by itself (U-M2), Erase as a member of the test gym FORGE1 (uat-e.yaml).
if qa_runs ue; then
  uat_passed ud || gate_flow ue_seed gate-demo.yaml || true
  uat_part ue uat-e.yaml && log "UAT UE: erase (solo, then as a FORGE1 member) and the Hevy import opening by itself, each checked on screen"
fi
# UAT WP4b: ub uf ua uv ug uk (qa/uat-wp4b.sh).
# shellcheck source=uat-wp4b.sh
. "$QA_DIR/uat-wp4b.sh"
uat_wp4b
adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true

# ---------------------------------------------------------------- part DND (audit v2 B: Do Not Disturb)
# RestCard.postOver (RT-12) with the screen off and Do Not Disturb ON:
#   "Ring through Do Not Disturb" OFF (the app's default): "Rest is over" on the normal channel
#     rest-over-sound as a REMINDER, so Do Not Disturb holds it back: no sound.
#   "Ring through Do Not Disturb" ON: on rest-over-alarm-sound (alarm sound usage) as an ALARM,
#     which Do Not Disturb lets through: it makes a sound.
# The alert must come on time in both. Do Not Disturb is switched off again after each case.
part_dnd() {
  local ring zen want_ch want_cat want_sound t
  for ring in off on; do
    zen=$(gate_dnd priority)
    log "DND ($ring): Do Not Disturb on, zen_mode=$zen (want 1 = priority only)"
    if [ "$zen" != "1" ]; then
      gate_dnd off >/dev/null
      log "DND FAILED: Do Not Disturb could not be switched to priority only, zen_mode=$zen ($(tr -d '\r' < "$OUT/dnd-set-priority.txt" | head -c 200))"
      status=1
      return 1
    fi
    if gate_flow "dnd_$ring" gate-rest.yaml -e REST="Rest 0:30" -e RING="$ring"; then
      t=$(now_ms)
      gate_dump "dnd-$ring-during.txt"
      adb shell input keyevent KEYCODE_SLEEP
      sleep 45
      gate_dump "dnd-$ring-after.txt"
      adb logcat -d -v time 2>/dev/null | grep 'ForgeRest' > "$OUT/dnd-$ring-forgerest.txt" || true
      log "DND ($ring) rest end path: $(sed 's/^.*ForgeRest[^:]*: //' "$OUT/dnd-$ring-forgerest.txt" | tail -4 | tr '\n' ';' | cut -c1-300)"
      gate_wake
      if [ "$ring" = "off" ]; then want_ch=rest-over-sound; want_cat=reminder; want_sound=silent
      else want_ch=rest-over-alarm-sound; want_cat=alarm; want_sound=sound; fi
      python3 "$QA_DIR/notif.py" over-locked "$OUT/dnd-$ring-after.txt" "$t" "$OUT/dnd-$ring-during.txt" >> "$OUT/timeline.txt" || status=1
      if python3 "$QA_DIR/notif.py" over-is "$OUT/dnd-$ring-after.txt" "$want_ch" "$want_cat" "$want_sound" >> "$OUT/timeline.txt"; then
        log "DND ($ring ring-through): OK, Rest is over on $want_ch as $want_cat ($want_sound)"
      else
        status=1
        log "DND ($ring ring-through) FAILED: want $want_ch / $want_cat / $want_sound (see the REST IS OVER line above; dnd-$ring-after.txt)"
      fi
    fi
    zen=$(gate_dnd off)
    log "DND ($ring): Do Not Disturb off, zen_mode=$zen"
    [ "$zen" = "0" ] || { log "DND FAILED: Do Not Disturb could not be switched off (zen_mode=$zen)"; status=1; }
  done
}

# ---------------------------------------------------------------- part LONGREST (audit v2 B: a real rest asleep)
# A 2:00 rest with the screen OFF the whole time: "Rest is over" must post AFTER the rest's end
# (never early, at most 5 s late) on rest-over-sound as an alarm, and make a sound. Then, woken,
# a second rest of 0:30 right away, asleep again: its alert comes within ~2 minutes of the first,
# where Android 15+ "notification cooldown" mutes a second alert from one app unless it is an
# alarm (gap report rank 1; API 34 has no cooldown, 35/36 do). It too must post and sound. Last,
# left asleep past the alert's 2-minute timeout (OVER_TIMEOUT_MS): it goes, the live card is back.
part_longrest() {
  local t1 t2 c1 c2
  gate_flow longrest_1 gate-rest.yaml -e REST="Rest 2:00" -e RING=off || return 1
  t1=$(now_ms)
  gate_dump longrest-1-during.txt
  adb shell input keyevent KEYCODE_SLEEP
  log "LONGREST: 2:00 rest, screen off"
  sleep 135
  gate_dump longrest-1-after.txt
  python3 "$QA_DIR/notif.py" over-locked "$OUT/longrest-1-after.txt" "$t1" "$OUT/longrest-1-during.txt" >> "$OUT/timeline.txt" || status=1
  python3 "$QA_DIR/notif.py" over-is "$OUT/longrest-1-after.txt" rest-over-sound alarm sound >> "$OUT/timeline.txt" \
    || { status=1; log "LONGREST FAILED: the 2:00 rest's alert (longrest-1-after.txt)"; }
  gate_wake
  gate_flow longrest_2 gate-rest-again.yaml -e REST="Rest 0:30" || return 1
  t2=$(now_ms)
  gate_dump longrest-2-during.txt
  adb shell input keyevent KEYCODE_SLEEP
  sleep 45
  gate_dump longrest-2-after.txt
  python3 "$QA_DIR/notif.py" over-locked "$OUT/longrest-2-after.txt" "$t2" "$OUT/longrest-2-during.txt" >> "$OUT/timeline.txt" || status=1
  python3 "$QA_DIR/notif.py" over-is "$OUT/longrest-2-after.txt" rest-over-sound alarm sound >> "$OUT/timeline.txt" \
    || { status=1; log "LONGREST FAILED: the second rest's alert (longrest-2-after.txt)"; }
  c1=$(grep -A120 'tag=over-' "$OUT/longrest-1-after.txt" | grep -m1 -o 'mCreationTimeMs=[0-9]*' | cut -d= -f2)
  c2=$(grep -A120 'tag=over-' "$OUT/longrest-2-after.txt" | grep -m1 -o 'mCreationTimeMs=[0-9]*' | cut -d= -f2)
  if [ -n "$c1" ] && [ -n "$c2" ]; then
    log "LONGREST: the two alerts posted $(( (c2 - c1) / 1000 )) s apart (under 120 s = inside Android 15+'s cooldown window; API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
  fi
  # Still asleep: past the alert's 120 s timeout, the live workout card must be back.
  sleep 115
  gate_dump longrest-timeout.txt
  python3 "$QA_DIR/notif.py" live-back "$OUT/longrest-timeout.txt" >> "$OUT/timeline.txt" \
    || { status=1; log "LONGREST FAILED: after Rest is over timed out (2 min, phone asleep) the live workout card did not come back (longrest-timeout.txt)"; }
  adb logcat -d -v time 2>/dev/null | grep 'ForgeRest' > "$OUT/longrest-forgerest.txt" || true
  gate_wake
}

# ---------------------------------------------------------------- part ANIM (audit v2 B: animations on)
# Every other part runs with animations OFF (the emulator runner's disable-animations), which also
# turns the app's "reduce motion" ON, so the animated branches never ran (gap report rank 5). Here
# the three scales are 1 (a normal phone) for one short flow; put back to 0 after.
part_anim() {
  local k
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$k" 1 >/dev/null 2>&1 || true
  done
  log "ANIM: animation scales window/transition/animator = $(adb shell settings get global window_animation_scale | tr -d '\r')/$(adb shell settings get global transition_animation_scale | tr -d '\r')/$(adb shell settings get global animator_duration_scale | tr -d '\r') (reduce motion off)"
  gate_flow anim gate-anim.yaml
  log "ANIM: app process after the flow: '$(adb shell pidof $PKG | tr -d '\r')' (empty = not running)"
  mkdir -p "$OUT/anim"
  { find "$OUT/part-anim" -name "anim-*.png" 2>/dev/null; find "$PWD" -maxdepth 1 -name "anim-*.png" 2>/dev/null; } \
    | while read -r f; do cp "$f" "$OUT/anim/" 2>/dev/null; done
  log "ANIM: $(find "$OUT/anim" -name "anim-*.png" 2>/dev/null | wc -l | tr -d ' ') screenshots in qa-out/anim/"
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$k" 0 >/dev/null 2>&1 || true
  done
}

qa_runs dnd && { log "gate part DND begins"; part_dnd; }
qa_runs longrest && { log "gate part LONGREST begins"; part_longrest; }
qa_runs anim && { log "gate part ANIM begins"; part_anim; }

# ---------------------------------------------------------------- part W (the "real workout" journey)
# Audit lesson (13 Oct 2026): two audits missed what the owner found in ONE gym session, because
# the test phone was not his phone and nobody did a real workout. Part W: the phone set like his
# (a ~360 dp screen = a Pixel at a large display size, and a larger font), pinned to MONDAY
# 1 MARCH 2027 10:00 IST (a Monday AND the 1st of a month), a real-sized Hevy history (~500
# workouts over 3 years, tools/make_big_hevy.py), then one full workout (real-workout-w1..w4.yaml):
# warm-ups, RPE, a drop set, a lighter set, a record, a superset, rests waited out with the phone
# asleep, the shade after ticks (one notification at a time; what a watch gets), finish, then the
# Profile chart, the workout page and the exercise page read against their labels. Runs LAST: it
# changes the phone's clock, size and font.
W_DENSITY=${W_DENSITY:-480}   # 1080 px / (480/160) = 360 dp wide
W_FONT=${W_FONT:-1.3}
w_part() {  # $1 = part name, $2 = flow file
  free_maestro
  log "part $1 start"
  maestro test --format junit --output "$OUT/part-$1.xml" --test-output-dir "$OUT/part-$1" "$QA_DIR/$2" \
    > "$OUT/part-$1.log" 2>&1 || { status=1; adb exec-out screencap -p > "$OUT/$1-failed.png"; log "PART $(echo "$1" | tr '[:lower:]' '[:upper:]') FAILED ($2: part-$1.log, $1-failed.png)"; return 1; }
  return 0
}
w_gather() {
  mkdir -p "$OUT/real-workout"
  { find "$OUT" -path "$OUT/real-workout" -prune -o -name "w-*.png" -print 2>/dev/null; find "$PWD" -maxdepth 1 -name "w-*.png" 2>/dev/null; } \
    | while read -r f; do cp "$f" "$OUT/real-workout/" 2>/dev/null; done
  log "REAL WORKOUT: $(find "$OUT/real-workout" -name "w-*.png" 2>/dev/null | wc -l | tr -d ' ') screenshots in qa-out/real-workout/"
}
part_w() {
  local ms
  # 1. The clock: Monday 1 March 2027, 10:00 in India (root on the google_apis image).
  adb root >/dev/null 2>&1 || true
  sleep 3
  adb wait-for-device
  adb shell settings put global auto_time 0 >/dev/null 2>&1 || true
  adb shell settings put global auto_time_zone 0 >/dev/null 2>&1 || true
  adb shell cmd alarm set-timezone Asia/Kolkata >/dev/null 2>&1 || adb shell setprop persist.sys.timezone Asia/Kolkata >/dev/null 2>&1 || true
  ms=$(date -u -d '2027-03-01T04:30:00Z' +%s)000
  adb shell cmd alarm set-time "$ms" >/dev/null 2>&1 || adb shell date 030110002027.00 >/dev/null 2>&1 || true
  adb shell am broadcast -a android.intent.action.TIME_SET >/dev/null 2>&1 || true
  W_DATE=$(adb shell "date '+%a %d %b %Y %H:%M %Z'" | tr -d '\r')
  log "REAL WORKOUT: phone clock $W_DATE (want Mon 01 Mar 2027 10:0x IST)"
  case "$W_DATE" in
    "Mon 01 Mar 2027"*) ;;
    *) log "REAL WORKOUT FAILED: the phone clock could not be pinned to Monday 1 March 2027 ($W_DATE)"; status=1 ;;
  esac
  # 2. His phone's size: ~360 dp wide (a large display size) and a larger font.
  adb shell wm density "$W_DENSITY" >/dev/null 2>&1 || true
  adb shell settings put system font_scale "$W_FONT" >/dev/null 2>&1 || true
  sleep 3
  log "REAL WORKOUT: screen $(adb shell wm size | tr -d '\r' | tail -1), density $(adb shell wm density | tr -d '\r' | tail -1), font scale $(adb shell settings get system font_scale | tr -d '\r')"
  # 3. A real-sized Hevy history ending the Saturday before (generated here, never committed).
  python3 "$QA_DIR/tools/make_big_hevy.py" "$OUT/qa-hevy-big.csv" --today 2027-03-01 | tee -a "$OUT/timeline.txt"
  push_fixture "$OUT/qa-hevy-big.csv" /sdcard/Download/qa-hevy-big.csv
  adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1 || true
  log "downloads: $(wait_media qa-hevy-big 1 20 downloads) big Hevy history file"
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  # 4. The journey.
  w_part w1 real-workout-w1.yaml || { w_gather; return; }
  w_part w2 real-workout-w2.yaml || { w_gather; return; }
  # The warm-up's rest (0:30) is running: the rest card ALONE in the shade, naming the bench.
  adb shell dumpsys notification --noredact > "$OUT/w-notif-warmup-rest.txt"
  python3 "$QA_DIR/notif.py" alone "$OUT/w-notif-warmup-rest.txt" >> "$OUT/timeline.txt" || status=1
  python3 "$QA_DIR/notif.py" card "$OUT/w-notif-warmup-rest.txt" "Rest 0:30" "Bench Press" >> "$OUT/timeline.txt" || status=1
  adb shell cmd statusbar expand-notifications
  sleep 2
  adb exec-out screencap -p > "$OUT/real-workout-shade-during-warmup-rest.png"
  adb shell cmd statusbar collapse >/dev/null 2>&1 || true
  # Phone in the pocket for the rest: screen off. "Rest is over" must come, alone, as an alarm a
  # watch also gets.
  adb shell input keyevent KEYCODE_SLEEP
  sleep 45
  adb shell dumpsys notification --noredact > "$OUT/w-notif-after-warmup-rest.txt"
  python3 "$QA_DIR/notif.py" alone "$OUT/w-notif-after-warmup-rest.txt" >> "$OUT/timeline.txt" || status=1
  python3 "$QA_DIR/notif.py" watch "$OUT/w-notif-after-warmup-rest.txt" >> "$OUT/timeline.txt" || status=1
  adb shell input keyevent KEYCODE_WAKEUP
  sleep 1
  adb shell wm dismiss-keyguard || true
  adb shell cmd statusbar expand-notifications
  sleep 2
  w_part w3 real-workout-w3.yaml || { adb shell cmd statusbar collapse >/dev/null 2>&1; w_gather; return; }
  # The superset round's rest: the card alone, naming the next set (Lateral Raise, set 2).
  adb shell dumpsys notification --noredact > "$OUT/w-notif-superset-rest.txt"
  python3 "$QA_DIR/notif.py" alone "$OUT/w-notif-superset-rest.txt" >> "$OUT/timeline.txt" || status=1
  python3 "$QA_DIR/notif.py" card "$OUT/w-notif-superset-rest.txt" "Rest 0:30" "Lateral Raise" >> "$OUT/timeline.txt" || status=1
  sleep 40
  adb shell dumpsys notification --noredact > "$OUT/w-notif-after-superset-rest.txt"
  python3 "$QA_DIR/notif.py" alone "$OUT/w-notif-after-superset-rest.txt" >> "$OUT/timeline.txt" || status=1
  adb shell cmd statusbar expand-notifications
  sleep 2
  w_part w4 real-workout-w4.yaml
  adb shell cmd statusbar collapse >/dev/null 2>&1 || true
  w_gather
}

if qa_runs w; then
  log "part W start"
  part_w
fi

# ---------------------------------------------------------------- part MK (audit v2 B1: Monkey)
# Random taps, swipes and keys INSIDE the app only (-p), with a fixed seed (the same run can be
# repeated) and no system keys, for ~10 minutes after the scripted parts. Fails on a crash or an
# ANR (Monkey's own report), and on a crash / ANR / JS error / [ForgeErr] line in its logcat
# (qa_report.py scan, the same rules as the whole run's scan). Opt-in: only=mk or extra=mk.
MK_SEED=${MK_SEED:-20261016}
# 3000 events took 155 s on the cloud phone (run 38866490224), so ~12000 for ~10 minutes.
MK_EVENTS=${MK_EVENTS:-12000}
part_mk() {
  local lpid rc
  # Alone (only=mk), the app has no data yet: the demo first, so Monkey has screens to press.
  if [ -n "$QA_ONLY_LIST" ] && [ -z "$GATE_RAN" ] && ! qa_runs w && ! qa_any_old; then
    gate_flow mk_seed gate-demo.yaml || true
  fi
  free_maestro
  mkdir -p "$OUT/part-mk"
  adb logcat -c 2>/dev/null || true
  adb logcat -v threadtime > "$OUT/part-mk/logcat-mk.txt" 2>/dev/null &
  lpid=$!
  adb shell svc power stayon true >/dev/null 2>&1 || true
  gate_wake
  log "MK: monkey seed $MK_SEED, $MK_EVENTS events, throttle 200 ms, app only"
  timeout 1200 adb shell monkey -p "$PKG" --pct-syskeys 0 --throttle 200 --monitor-native-crashes -s "$MK_SEED" -v "$MK_EVENTS" > "$OUT/mk-monkey.txt" 2>&1
  rc=$?
  adb shell pkill -f com.android.commands.monkey >/dev/null 2>&1 || true
  sleep 3
  kill "$lpid" 2>/dev/null || true
  wait "$lpid" 2>/dev/null || true
  log "MK: monkey exit $rc; $(grep -oE 'Events injected: [0-9]+' "$OUT/mk-monkey.txt" | tail -1); $(grep -m1 -oE 'Monkey finished|Monkey aborted[^.]*' "$OUT/mk-monkey.txt" || echo 'no finish line')"
  if grep -qE "// (CRASH|NOT RESPONDING): $PKG" "$OUT/mk-monkey.txt" || grep -q "Monkey aborted" "$OUT/mk-monkey.txt"; then
    status=1
    log "MK FAILED: monkey saw a crash or an ANR: $(grep -m2 -E '// (CRASH|NOT RESPONDING|Long Msg|Short Msg)' "$OUT/mk-monkey.txt" | tr '\n' ' ' | cut -c1-300)"
  elif [ "$rc" -eq 124 ]; then
    log "MK: monkey stopped by the 20-minute time limit (not a failure by itself)"
  fi
  # The same crash / ANR / JS-error / [ForgeErr] rules as the end-of-run scan, on Monkey's logcat alone.
  rm -rf "$OUT/mk-scan"
  mkdir -p "$OUT/mk-scan/part-mk"
  cp "$OUT/part-mk/logcat-mk.txt" "$OUT/mk-scan/part-mk/logcat-mk.txt" 2>/dev/null || true
  if python3 "$QA_DIR/qa_report.py" scan "$OUT/mk-scan" > "$OUT/mk-scan.txt" 2>&1; then
    log "MK: logcat scan clean ($(wc -l < "$OUT/part-mk/logcat-mk.txt" | tr -d ' ') lines)"
  else
    status=1
    log "MK FAILED: logcat scan: $(grep -E 'finding|CRASH|ANR|ERROR' "$OUT/mk-scan.txt" | head -4 | tr '\n' ' ' | cut -c1-400)"
  fi
  rm -rf "$OUT/mk-scan"
  # A result file like Maestro's, so the run summary lists MK as passed / failed.
  printf '<testsuites><testsuite name="mk" tests="1" failures="%s"></testsuite></testsuites>\n' \
    "$(grep -c 'MK FAILED' "$OUT/timeline.txt")" > "$OUT/part-mk.xml"
  adb exec-out screencap -p > "$OUT/mk-end.png" 2>/dev/null || true
  adb shell svc power stayon false >/dev/null 2>&1 || true
  # Whatever Monkey changed outside the app is put back for the checks after it.
  adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  adb shell svc wifi enable >/dev/null 2>&1 || true
  adb shell svc data enable >/dev/null 2>&1 || true
}
if qa_runs mk; then
  log "part MK start"
  part_mk
fi

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
