#!/system/bin/sh
# UAT WP4b (17 Oct 2026): the PHONE side of the parts that put the member app into a real bad
# condition (apps/mobile/qa/uat-wp4b.sh). Pushed to /data/local/tmp/uat-root.sh and run as root
# (`adb shell su 0 sh /data/local/tmp/uat-root.sh <command>`), or as the app's own user id for
# `fill` (`su <uid> sh ...`), on the google_apis emulator image, which has su. Nothing here is in
# the app: it changes the phone around the app, as a broken file, another program or a full phone
# would. Every command prints what it did; the script on the runner logs it.
#
#   db-break      the database damaged as a failed storage chip would: the app stopped first, its
#                 files copied aside, the first 4 KB of forgeai.db overwritten with random bytes, the
#                 -wal / -shm files moved aside (SQLite would otherwise read page 1 from the log).
#   db-restore    everything put back exactly (in place, so the files keep their owner and label).
#   has-sqlite3   exit 0 when the image has the sqlite3 program.
#   lock-hold S   another program holds the database's write lock for S seconds (sqlite3,
#                 BEGIN IMMEDIATE): the app's next write gets "database is locked".
#   lock-probe    exit 0 when a writer would be refused right now (the lock is held).
#   lock-free     the holder stopped (its lock goes with it).
#   fill          (run AS THE APP'S USER) fill /data until the app gets "No space left on device";
#                 the space Android keeps back for itself stays free, as on a real full phone.
#   unfill        the filler deleted.
#   ls DIR        the files under the app's DIR (files/...), with sizes.
PKG=com.forgeai.app
APP=/data/data/$PKG
D=$APP/files/SQLite
B=/data/local/tmp/qa-ub
FILL=$APP/files/qa-fill
HOLD=1717

cmd="$1"
[ $# -gt 0 ] && shift
case "$cmd" in
  db-break)
    [ -f "$D/forgeai.db" ] || { echo "NO DATABASE at $D/forgeai.db"; exit 1; }
    rm -rf "$B"
    mkdir -p "$B" || exit 1
    cp "$D/forgeai.db" "$B/forgeai.db" || { echo "COPY FAILED"; exit 1; }
    for x in -wal -shm; do
      if [ -f "$D/forgeai.db$x" ]; then mv "$D/forgeai.db$x" "$B/forgeai.db$x" || exit 1; fi
    done
    dd if=/dev/urandom of="$D/forgeai.db" bs=4096 count=1 conv=notrunc 2>/dev/null || { echo "DD FAILED"; exit 1; }
    sync
    echo "--- app folder after:"
    ls -lZ "$D"
    echo "--- kept aside:"
    ls -l "$B"
    echo "--- first 16 bytes now:"
    head -c 16 "$D/forgeai.db" | od -c | head -2
    ;;
  db-restore)
    [ -f "$B/forgeai.db" ] || { echo "NOTHING KEPT in $B"; exit 1; }
    cat "$B/forgeai.db" > "$D/forgeai.db" || { echo "RESTORE FAILED"; exit 1; }
    for x in -wal -shm; do
      if [ -f "$B/forgeai.db$x" ]; then mv -f "$B/forgeai.db$x" "$D/forgeai.db$x" || exit 1; fi
    done
    sync
    rm -rf "$B"
    ls -lZ "$D"
    echo "--- first 16 bytes now:"
    head -c 16 "$D/forgeai.db"
    echo
    ;;
  has-sqlite3)
    command -v sqlite3 >/dev/null 2>&1 && { command -v sqlite3; exit 0; }
    echo "no sqlite3 on this image"
    exit 1
    ;;
  lock-hold)
    # sqlite3 reads its statements from the pipe: it takes the lock and then waits for more input
    # until the sleep ends (or lock-free stops it).
    ( echo "BEGIN IMMEDIATE;"; sleep "${1:-$HOLD}" ) | sqlite3 "$D/forgeai.db"
    ;;
  lock-probe)
    out=$(echo "PRAGMA busy_timeout=0; BEGIN IMMEDIATE; ROLLBACK;" | sqlite3 "$D/forgeai.db" 2>&1)
    echo "probe: ${out:-a writer got in (not locked)}"
    echo "$out" | grep -qiE "locked|busy"
    ;;
  lock-free)
    pkill -x sqlite3 2>/dev/null
    pkill -f "sleep $HOLD" 2>/dev/null
    sleep 1
    if pgrep -x sqlite3 >/dev/null 2>&1; then echo "sqlite3 still running"; exit 1; fi
    echo "lock holder stopped"
    ;;
  fill)
    rm -f "$FILL" "$FILL.2"
    n=0
    sz=1073741824
    # Big blocks first (fast), halving at each refusal; then plain writes for the last crumbs.
    while [ "$sz" -ge 65536 ]; do
      if fallocate -o "$n" -l "$sz" "$FILL" 2>/dev/null; then n=$((n + sz)); else sz=$((sz / 2)); fi
    done
    dd if=/dev/zero of="$FILL.2" bs=4096 2>/dev/null
    echo "filled: $n bytes by fallocate, $(ls -l "$FILL.2" 2>/dev/null | awk '{print $5}') bytes written after"
    if echo probe > "$APP/files/qa-probe" 2>/dev/null; then
      rm -f "$APP/files/qa-probe"
      echo "NOT FULL: a 6-byte write still went in"
      exit 1
    fi
    echo "full: a 6-byte write is refused"
    df /data | tail -1
    ;;
  unfill)
    rm -f "$FILL" "$FILL.2" "$APP/files/qa-probe"
    sync
    df /data | tail -1
    ;;
  ls)
    ls -l "$APP/$1" 2>&1
    ;;
  *)
    echo "unknown command '$cmd'"
    exit 2
    ;;
esac
