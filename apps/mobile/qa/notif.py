"""Read `adb shell dumpsys notification --noredact` for the device QA (run-device-qa.sh).

Only the notification RECORDS count. Splitting the dump on "NotificationRecord(" alone is wrong:
the last block then also holds the channel list printed after it, where channel NAMES such as
"Rest is over, app open" and "Workout in progress" match even when no such alert is showing
(v0.26.1 review). So each record is cut at the first line that is not indented deeper than it.

Usage: notif.py <check> <dump-file> [args]
  over-locked <tick_ms>   "Rest is over" posted after a rest on a sleeping phone (prints how late)
  ongoing                 the "Workout in progress" card is showing
  card <title-prefix>     the rest card is showing: swipe-away, both buttons, the given title
  over-open               "Rest is over" posted while the app was open, and the rest card gone
"""
import re
import sys

PKG = "pkg=com.forgeai.app"


def records(text):
    out = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.lstrip(" ")
        if not s.startswith("NotificationRecord("):
            i += 1
            continue
        indent = len(line) - len(s)
        block = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            s2 = nxt.lstrip(" ")
            if s2 and len(nxt) - len(s2) <= indent:
                break
            block.append(nxt)
            i += 1
        if PKG in line:
            out.append("\n".join(block))
    return out


def title(block):
    m = re.search(r"android\.title=\w+ \((.*)\)\s*$", block, re.M)
    return m.group(1) if m else ""


def header(block):
    return block.split("\n", 1)[0]


def main():
    check, path = sys.argv[1], sys.argv[2]
    recs = records(open(path, encoding="utf-8", errors="replace").read())
    over = [b for b in recs if title(b) == "Rest is over"]
    cards = [b for b in recs if "channel=rest-card" in header(b)]
    if check == "over-locked":
        tick = int(sys.argv[3])
        if not over:
            print("[qa] REST ALERT NOT FOUND in the notification list 50 s after a 30 s rest")
            return 1
        b = over[0]
        m = re.search(r"mCreationTimeMs=(\d+)", b) or re.search(r"\bwhen=(\d+)", b)
        ch = re.search(r"channel=([\w-]+)", header(b))
        if m:
            posted = int(m.group(1))
            late = (posted - (tick + 30000)) / 1000
            print(f"[qa] REST ALERT posted (channel {ch.group(1) if ch else '?'}); due ~{tick + 30000}, posted {posted}, late by about {late:.1f}s (tick time is approximate, +/- a few s)")
        else:
            print("[qa] REST ALERT posted (no timestamp found in dump)")
        return 0
    if check == "ongoing":
        ok = any(title(b) == "Workout in progress" for b in recs)
        print("[qa] ONGOING CARD present" if ok else "[qa] ONGOING CARD MISSING")
        return 0 if ok else 1
    if check == "card":
        want = sys.argv[3]
        if not cards:
            print("[qa] REST CARD NOT FOUND")
            return 1
        b = cards[0]
        fm = re.search(r"flags=(0x[0-9a-fA-F]+)", header(b))
        f = int(fm.group(1), 16) if fm else -1
        swipe = f >= 0 and not (f & 0x2) and not (f & 0x20)
        plus = "+15 s" in b
        skip = re.search(r'"Skip"', b) is not None or "Skip" in b
        t = title(b)
        chrono = "android.showChronometer=Boolean (true)" in b
        down = "android.chronometerCountDown=Boolean (true)" in b
        print(f"[qa] REST CARD: title='{t}' flags={hex(f)} swipe-away={'yes' if swipe else 'NO'} +15={'yes' if plus else 'NO'} skip={'yes' if skip else 'NO'} chronometer={'yes' if chrono else 'no'} countdown={'yes' if down else 'no'}")
        return 0 if swipe and plus and skip and t.startswith(want) else 1
    if check == "over-open":
        if not over:
            print("[qa] REST IS OVER (app open) NOT FOUND")
            return 1
        ch = re.search(r"channel=([\w-]+)", header(over[0]))
        print(f"[qa] REST IS OVER with the app open: posted on channel {ch.group(1) if ch else '?'}; rest cards left: {len(cards)}")
        return 0 if not cards and ch and ch.group(1) == "rest-over-open" else 1
    print("unknown check " + check)
    return 2


if __name__ == "__main__":
    sys.exit(main())
