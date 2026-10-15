#!/bin/sh
# Render every recipe given (full quality), one after another. Fails if any clip is incomplete.
# Usage: sh render_all.sh ../specs/a.json ../specs/b.json      (BLENDER=path overrides the Blender binary)
B="${BLENDER:-D:/Tools/blender-4.5.14-windows-x64/blender.exe}"
fail=0
mkdir -p ../out
for s in "$@"; do
  key=$(basename "$s" .json)
  echo "== $key $(date +%T)"
  rm -f "../out/$key/frames/meta.json"
  "$B" -b --addons bl_ext.user_default.mpfb --python make_clip.py -- "$s" full > "../out/_render_$key.log" 2>&1
  grep -E "\[clip\]|Error|rror:" "../out/_render_$key.log"
  if [ ! -f "../out/$key/frames/meta.json" ]; then echo "!! $key did not finish (see out/_render_$key.log)"; fail=1; fi
done
echo "== all done $(date +%T)"
exit $fail
