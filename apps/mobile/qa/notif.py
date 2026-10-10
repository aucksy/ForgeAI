"""Read `adb shell dumpsys notification --noredact` for the device QA (run-device-qa.sh).

Only the notification RECORDS count. Splitting the dump on "NotificationRecord(" alone is wrong:
the last block then also holds the channel list printed after it, where channel NAMES such as
"Rest is over, app open" and "Workout in progress" match even when no such alert is showing
(v0.26.1 review). So each record is cut at the first line that is not indented deeper than it.

Usage: notif.py <check> <dump-file> [args]
  over-locked <tick_ms> [during-rest-dump]
                          "Rest is over" posted after a rest on a sleeping phone. The due time is
                          the rest card's `when` (the exact end time the app set) read from the
                          dump taken during the rest; FAILS when the alert was more than
                          REST_LATE_BUDGET_S (default 5) late, or more than 2 s early.
                          Without that dump the due time is tick + 30 s (approximate): lateness
                          is then printed but cannot fail the run.
  ongoing                 the "Workout in progress" card is showing
  card <title-prefix>     the rest card is showing: swipe-away, both buttons, the given title,
                          on the Phase 2 channel "rest-card-v2"
  over-open               "Rest is over" posted while the app was open, and the rest card gone

Phase 2 (RT-05 / RT-06): the card moved to the channel "rest-card-v2" (the old "rest-card" is
deleted) and the shade draws its own view (a countdown "2:53 left · Bench Press, set 2" over
"Rest 3:00 · ends …", Notification.DecoratedCustomViewStyle). That view's text is not in the
dump's extras, but RestCard.kt still sets the title ("Rest 3:00 · ends …", android.title), the
text ("Next: …", android.text) for a watch, and `when` = the rest's end, so every check here
reads those, as before. Whether the custom view was used is printed, not gated.
"""
import os
import re
import sys

PKG = "pkg=com.forgeai.app"
CARD_CHANNEL = "rest-card-v2"
# Any rest card, on the Phase 2 channel or the deleted v0.26.1 one: a card left on the old
# channel still counts as "a card showing" (and the card check then fails on its channel).
CARD_CHANNELS = (CARD_CHANNEL, "rest-card")


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


def channel_of(block):
    m = re.search(r"channel=([\w-]+)", header(block))
    return m.group(1) if m else ""


def text_of(block):
    m = re.search(r"android\.text=\w+ \((.*)\)\s*$", block, re.M)
    return m.group(1) if m else ""


def is_card(block):
    return channel_of(block) in CARD_CHANNELS


def main():
    check, path = sys.argv[1], sys.argv[2]
    recs = records(open(path, encoding="utf-8", errors="replace").read())
    over = [b for b in recs if title(b) == "Rest is over"]
    cards = [b for b in recs if is_card(b)]
    if check == "over-locked":
        tick = int(sys.argv[3])
        if not over:
            print("[qa] REST ALERT NOT FOUND in the notification list 50 s after a 30 s rest")
            return 1
        b = over[0]
        # Only the posting time counts: the alert's own `when` is the rest's due time
        # (RestCard.postOver sets it), so reading it would always measure 0 s late.
        m = re.search(r"mCreationTimeMs=(\d+)", b)
        ch = re.search(r"channel=([\w-]+)", header(b))
        channel = ch.group(1) if ch else "?"
        if not m:
            print("[qa] REST ALERT posted (no timestamp found in dump); lateness NOT measured")
            return 0
        posted = int(m.group(1))
        # Due time = the rest card's `when`, the exact end time the app set when the rest began.
        due = None
        if len(sys.argv) > 4:
            during = records(open(sys.argv[4], encoding="utf-8", errors="replace").read())
            card = [x for x in during if is_card(x)]
            w = re.search(r"\bwhen=(\d+)", card[0]) if card else None
            due = int(w.group(1)) if w else None
        if due is None:
            late = (posted - (tick + 30000)) / 1000
            print(f"[qa] REST ALERT posted (channel {channel}); due ~{tick + 30000} (approximate: no rest card in the during-rest dump), posted {posted}, late by about {late:.1f}s - lateness NOT gated")
            return 0
        budget = float(os.environ.get("REST_LATE_BUDGET_S", "5"))
        late = (posted - due) / 1000
        ok = -2.0 <= late <= budget
        verdict = "within budget" if ok else ("REST ALERT TOO LATE" if late > budget else "REST ALERT TOO EARLY")
        print(f"[qa] REST ALERT posted (channel {channel}); due {due} (the rest card's end time), posted {posted}, late by {late:.1f}s; budget {budget:g}s: {verdict}")
        return 0 if ok else 1
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
        # The buttons are the record's notification ACTIONS ('[1] "Skip" -> PendingIntent...'),
        # not any text that happens to contain the word.
        plus = re.search(r'^\s*\[\d+\] "\+15 s" ->', b, re.M) is not None
        skip = re.search(r'^\s*\[\d+\] "Skip" ->', b, re.M) is not None
        t = title(b)
        ch = channel_of(b)
        on_v2 = ch == CARD_CHANNEL
        chrono = "android.showChronometer=Boolean (true)" in b
        down = "android.chronometerCountDown=Boolean (true)" in b
        # RT-05: the shade's own countdown view. Informational: a build without the layout posts
        # the plain card, which a watch shows the same way.
        view = "DecoratedCustomViewStyle" in b
        chan = ch or "?"
        if not on_v2:
            chan += f" (NOT {CARD_CHANNEL})"
        print(f"[qa] REST CARD: title='{t}' text='{text_of(b)}' channel={chan} flags={hex(f)} swipe-away={'yes' if swipe else 'NO'} +15={'yes' if plus else 'NO'} skip={'yes' if skip else 'NO'} chronometer={'yes' if chrono else 'no'} countdown={'yes' if down else 'no'} countdown-view={'yes' if view else 'no'}")
        return 0 if swipe and plus and skip and on_v2 and t.startswith(want) else 1
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
