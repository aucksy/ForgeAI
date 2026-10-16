# shellcheck shell=bash
# Sourced (not run) by release-apk.yml for the WATCH APK, and by wear-build.yml's signing dry run.
#
# sign_rotated IN.apk OUT.apk signs IN with exactly the phone APK's signature (release-apk.yml,
# "Sign with key rotation"): v1/v2 = the OLD key (the public debug key), v3 = the NEW key plus the
# lineage that proves OLD handed over to NEW, from API 28. The Wear Data Layer only pairs a phone
# app and a watch app signed by the same key, so the arguments must never drift from the phone's.
#
# The caller sets: APKSIGNER, ZIPALIGN (paths), OLD and NEW (bash arrays of apksigner signer
# options, passwords by env: name only), LINEAGE (the `apksigner rotate` output), WORK (a scratch
# folder). Nothing secret is echoed.
sign_rotated() {
  local in="$1" out="$2"
  local keep=()
  "$ZIPALIGN" -f -P 16 4 "$in" "$WORK/rot-aligned.apk"
  "$APKSIGNER" sign --help > "$WORK/rot-sign-help.txt" 2>&1 || true
  if grep -q -- '--alignment-preserved' "$WORK/rot-sign-help.txt"; then
    keep=(--alignment-preserved true)
  fi
  "$APKSIGNER" sign "${OLD[@]}" --next-signer "${NEW[@]}" \
    --lineage "$LINEAGE" --rotation-min-sdk-version 28 \
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
    --v4-signing-enabled false "${keep[@]}" \
    --out "$WORK/rot-signed.apk" "$WORK/rot-aligned.apk"
  "$APKSIGNER" verify -v --print-certs "$WORK/rot-signed.apk"
  mv -f "$WORK/rot-signed.apk" "$out"
}
