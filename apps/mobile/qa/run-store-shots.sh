#!/usr/bin/env bash
# Play Store app screens (R-126, 25 Oct 2026): the owner's design review found the store pictures
# were taken on the large-text QA phone (titles wrapping), with test names, mixed status bars and a
# demo-looking history. This takes them on a NORMAL phone instead: Pixel 6 (1080x2400, density 420,
# font 1.0), India time, a clean status bar (SystemUI demo mode: 09:41, full signal, full battery,
# no notification icons), and a real-looking member history imported from Hevy
# (tools/make_store_hevy.py). Called by .github/workflows/store-shots.yml. Never part of a release.
#
# Usage: run-store-shots.sh <path-to-apk>      Output: store-out/*.png (+ logs)
set -u
APK="$1"
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${STORE_OUT:-$PWD/store-out}"
PKG=com.mettleup.app
mkdir -p "$OUT"
export PATH="$PATH:$HOME/.maestro/bin"
status=0
log() { echo "[store] $*" | tee -a "$OUT/timeline.txt"; }

adb install -r "$APK" || { log "INSTALL FAILED"; exit 1; }
sleep 30
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
# A normal phone, whatever the image booted with.
adb shell wm size reset; adb shell wm density reset
adb shell settings put system font_scale 1.0
adb shell setprop persist.sys.timezone Asia/Kolkata >/dev/null 2>&1 || adb shell service call alarm 3 s16 Asia/Kolkata >/dev/null 2>&1 || true
adb shell cmd alarm set-timezone Asia/Kolkata >/dev/null 2>&1 || true
adb shell appops set $PKG SCHEDULE_EXACT_ALARM allow >/dev/null 2>&1 || true
log "phone: $(adb shell wm size | tr -d '\r' | tr '\n' ' ') $(adb shell wm density | tr -d '\r' | tr '\n' ' ') font $(adb shell settings get system font_scale | tr -d '\r') tz $(adb shell getprop persist.sys.timezone | tr -d '\r') date $(adb shell date | tr -d '\r')"

demo_bar() {
  adb shell settings put global sysui_demo_allowed 1
  local b="adb shell am broadcast -a com.android.systemui.demo -e command"
  $b enter >/dev/null
  $b clock -e hhmm 0941 >/dev/null
  $b network -e wifi show -e level 4 -e fully true >/dev/null
  $b network -e mobile show -e datatype none -e level 4 -e fully true >/dev/null
  $b battery -e level 100 -e plugged false >/dev/null
  $b notifications -e visible false >/dev/null
}

TODAY=$(TZ=Asia/Kolkata date +%F)
python3 "$QA_DIR/tools/make_store_hevy.py" "$OUT/store-hevy.csv" --today "$TODAY" | tee -a "$OUT/timeline.txt"
adb push "$OUT/store-hevy.csv" /sdcard/Download/store-hevy.csv >/dev/null || { log "PUSH FAILED"; exit 1; }
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/store-hevy.csv >/dev/null 2>&1 || true
sleep 5

run_flow() {
  local name="$1"
  adb shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
  sleep 5
  demo_bar
  log "flow $name start"
  if ! maestro test --format junit --output "$OUT/$name.xml" --test-output-dir "$OUT/$name" "$QA_DIR/$name.yaml" > "$OUT/$name.log" 2>&1; then
    status=1
    adb exec-out screencap -p > "$OUT/$name-failed.png"
    log "FLOW $name FAILED ($name.log, $name-failed.png)"
  fi
}

run_flow store-a
run_flow store-b
run_flow store-c

# A demo gym on the live server, exactly as the website's "Try the demo" makes one (the phone test
# makes one per run too, part INV-e). Its invite link opens the app on "Join Iron Temple Fitness".
url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabaseUrl'])" "$QA_DIR/../app.json")
key=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['expo']['extra']['supabasePublishableKey'])" "$QA_DIR/../app.json")
demo=$(curl -s -X POST "$url/rest/v1/rpc/demo_start_gym" -H "apikey: $key" -H "Content-Type: application/json" -d '{"p_name":"Iron Temple Fitness"}')
code=$(printf '%s' "$demo" | python3 -c "import json,sys;print(json.load(sys.stdin).get('joinCode',''))" 2>/dev/null)
log "demo gym: ${code:-none} ($(printf '%s' "$demo" | head -c 60))"
if [ -n "$code" ]; then
  demo_bar
  adb shell am start -W -a android.intent.action.VIEW -d "https://app.mettleup.fit/j/$code" -p "$PKG" >/dev/null 2>&1 || true
  sleep 3
  run_flow store-d
else
  status=1
fi

# Every picture in one folder, named by the flow's takeScreenshot.
mkdir -p "$OUT/shots"
{ find "$OUT" -path "$OUT/shots" -prune -o -name "s-*.png" -print 2>/dev/null; find "$PWD" -maxdepth 1 -name "s-*.png" 2>/dev/null; } | while read -r f; do cp "$f" "$OUT/shots/" 2>/dev/null; done
log "pictures: $(ls "$OUT/shots" | tr '\n' ' ')"
adb shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
exit $status
