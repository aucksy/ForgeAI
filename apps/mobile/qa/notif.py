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
                          is then printed but cannot fail the run. C5 review (16 Oct 2026): with
                          that dump given, NO rest card in it FAILS (it used to pass, ungated);
                          "Rest is over" must carry "Complete set" (audit C5-1); and while the
                          phone is still asleep a second snapshot is taken ~60 s after the rest's
                          end (this script runs adb), which FAILS when the alert has gone: the
                          11 Oct regression (run 38081757903: removed within 30 s once it carried
                          a button). With the screen already on (the app may dismiss it) that
                          snapshot is skipped and says so.
  ongoing                 the live workout card is showing (channel "workout-live", id 41004;
                          an older build's "Workout in progress" card counts too)
  no-ongoing              NO live workout card (no workout was started)
  alone                   ONE ForgeAI workout notification at a time (13 Oct 2026): never the live
                          workout card beside the rest card or "Rest is over" (Android grouped
                          them under one header, both collapsed, hiding Done / +15 s / Skip).
                          v0.37.1 (audit C4): FAILS when NO workout notification shows at all (it
                          used to pass, so a build whose live card never came back passed)
  live-back [action]      v0.37.1 (C4): the live workout card is BACK - showing, with no rest card,
                          no "Rest is over" and no "Open ForgeAI to ..." note; with [action], the
                          card also carries that button (e.g. "Complete set")
  rest-up <title-prefix> [text-part]
                          v0.37.1 (C1): a rest card titled <title-prefix> (its text containing
                          text-part) is showing ALONE (no live card) - any buttons (after the last
                          set it has no Done)
  over-text <text-part>   v0.37.1 (C9): "Rest is over" is showing and its text contains text-part
  card <title-prefix> [text-part]
                          the rest card is showing: swipe-away, its three buttons in the order
                          Done, +15 s, Skip (Phase 6), the given title (and, if given, a text
                          "Next: ..." containing text-part), on the channel "rest-card-live"
                          (C5-3: no watch is paired with the emulator; "rest-card-v2" is only used
                          while a watch WITHOUT the ForgeAI watch app is connected). U-W5: the
                          phone's own log line "watch: plain" (adb logcat, tag ForgeWear) makes
                          "rest-card-v2" the one wanted instead; no such line = "rest-card-live"
  over-open               "Rest is over" posted while the app was open, on "rest-over-open-sound"
                          (C5-4: it rings itself at notification volume), and the rest card gone
  over-is <channel> <category> <sound|silent>
                          audit v2 (DND / LONGREST): the NEWEST "Rest is over" is showing, on
                          <channel>, with <category> (alarm / reminder); "sound" = Android's
                          own record of what last made a sound (mSoundNotificationKey) is THIS
                          alert, "silent" = it is not (Do Not Disturb held it back)
  watch                   "Rest is over" reaches a paired watch (not local-only) as an alarm
                          (category=alarm); the live workout card stays on the phone (local-only)

Phase 2 (RT-05 / RT-06): the card moved to the channel "rest-card-v2" (the old "rest-card" is
deleted) and the shade draws its own view (a countdown "2:53 left · Bench Press, set 2" over
"Rest 3:00 · ends …", Notification.DecoratedCustomViewStyle). That view's text is not in the
dump's extras, but RestCard.kt still sets the title ("Rest 3:00 · ends …", android.title), the
text ("Next: …", android.text) for a watch, and `when` = the rest's end, so every check here
reads those, as before. Whether the custom view was used is printed, not gated.
"""
import os
import re
import shutil
import subprocess
import sys
import time

PKG = "pkg=com.forgeai.app"
# C5-3 (16 Oct 2026): the countdown's channel with no watch (or a watch with the ForgeAI app).
CARD_CHANNEL = "rest-card-live"
# Any rest card: the C5-3 channel, the LOW one still used while a watch WITHOUT the ForgeAI app is
# connected ("rest-card-v2", also the "Open ForgeAI to ..." note's channel), or the deleted v0.26.1
# one. A card on another channel still counts as "a card showing" (the card check then fails).
CARD_CHANNELS = (CARD_CHANNEL, "rest-card-v2", "rest-card")
# U-W5: the countdown's channel while a watch WITHOUT the ForgeAI watch app is connected.
PLAIN_WATCH_CHANNEL = "rest-card-v2"
# C5-4: "Rest is over" with the app on screen rings itself on this channel ("rest-over-open" is
# now only the "Workout sounds" off, vibrate-only one).
OVER_OPEN_CHANNEL = "rest-over-open-sound"
# C5-1: the button "Rest is over" carries (the live card's own).
COMPLETE = "Complete set"
# How long after the rest's end the alert must still be showing (its own timeout is 120 s asleep).
HOLD_S = 60


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


def actions(block):
    """A record's notification ACTIONS in order ('[1] "Skip" -> PendingIntent...'), not any text."""
    return [a for _, a in sorted((int(i), a) for i, a in re.findall(r'^\s*\[(\d+)\] "(.*?)" ->', block, re.M))]


# 13 Oct 2026: the live workout card (WorkoutCard.kt: channel "workout-live", id 41004) replaced
# the quiet "Workout in progress" card; its title is the exercise's name. A build without the
# native card still posts the old one, so that title counts too.
LIVE_CHANNEL = "workout-live"
LIVE_ID = 41004


# Notification.FLAG_* by the name Android 15+ prints in `dumpsys notification` ("flags=ONGOING_EVENT|
# LOCAL_ONLY"); Android 14 printed the number ("flags=0x8"). UAT WP14, runs on API 35/36
# (38997272780 ...): the name form read as "no flags", so every rest card failed "swipe-away".
FLAG_BITS = {
    "SHOW_LIGHTS": 0x1, "ONGOING_EVENT": 0x2, "INSISTENT": 0x4, "ONLY_ALERT_ONCE": 0x8,
    "AUTO_CANCEL": 0x10, "NO_CLEAR": 0x20, "FOREGROUND_SERVICE": 0x40, "HIGH_PRIORITY": 0x80,
    "LOCAL_ONLY": 0x100, "GROUP_SUMMARY": 0x200, "AUTOGROUP_SUMMARY": 0x400, "CAN_COLORIZE": 0x800,
    "BUBBLE": 0x1000, "NO_DISMISS": 0x2000, "FSI_REQUESTED_BUT_DENIED": 0x4000,
    "USER_INITIATED_JOB": 0x8000, "LIFETIME_EXTENDED_BY_DIRECT_REPLY": 0x10000,
}


def flags_of(text):
    """The notification's flags as a number from the first `flags=` in text, in either form
    (0x.. / decimal, or NAME|NAME); -1 when there is none. An unknown name adds nothing."""
    m = re.search(r"\bflags=(0x[0-9a-fA-F]+|\d+|[A-Z_][A-Z0-9_|]*)", text)
    if not m:
        return -1
    v = m.group(1)
    if v.startswith("0x"):
        return int(v, 16)
    if v.isdigit():
        return int(v)
    return sum(FLAG_BITS.get(name, 0) for name in v.split("|"))


def is_ongoing(block):
    head = header(block)
    return channel_of(block) == LIVE_CHANNEL or re.search(rf"\bid={LIVE_ID}\b", head) is not None or title(block) == "Workout in progress"


def created(block):
    m = re.search(r"mCreationTimeMs=(\d+)", block)
    return int(m.group(1)) if m else 0


def key_of(block):
    m = re.search(r"\bkey=(\S+?):?\s", header(block) + " ")
    return m.group(1).rstrip(":") if m else ""


def phone_watch_mode():
    """U-W5: which watch the phone app believes is connected, from its own log line ("watch: plain"
    / "app" / "none", tag ForgeWear, WearSync.saveWatch, logged on every change): "plain" = a watch
    WITHOUT the ForgeAI watch app, whose copy of a DEFAULT card would buzz, so the rest card goes on
    the LOW "rest-card-v2". None when unknown (no adb, or no such line: the app then uses "none")."""
    if not shutil.which("adb"):
        return None
    try:
        out = subprocess.run(["adb", "logcat", "-d", "-s", "ForgeWear"], capture_output=True, text=True, timeout=60).stdout
    except Exception as e:  # noqa: BLE001 - unknown is taken as "none", and printed
        print(f"[qa] (the phone's watch mode unknown: {e})")
        return None
    modes = re.findall(r"\bwatch: (plain|app|none)\b", out)
    return modes[-1] if modes else None


def asleep():
    """Is the emulator's screen off right now (so nothing in the app can dismiss the alert)?"""
    try:
        out = subprocess.run(["adb", "shell", "dumpsys", "power"], capture_output=True, text=True, timeout=30).stdout
    except Exception as e:  # noqa: BLE001 - no adb: the hold snapshot is skipped and says so
        print(f"[qa] (power state unknown: {e})")
        return False
    m = re.search(r"mWakefulness=(\w+)", out)
    return bool(m) and m.group(1) in ("Asleep", "Dozing")


def hold_check(path, key, due):
    """C5-1 / the 11 Oct regression: the "Rest is over" posted at the rest's end is still showing
    ~HOLD_S s after that end (a second, fresh snapshot), with its "Complete set". 0 = ok, 1 = gone."""
    if not shutil.which("adb"):
        print("[qa] REST IS OVER HELD: not checked (no adb here)")
        return 0
    if not asleep():
        print("[qa] REST IS OVER HELD: not checked (screen already on: the app may dismiss it)")
        return 0
    wait = (due + HOLD_S * 1000 - int(time.time() * 1000)) / 1000
    if wait > 0:
        time.sleep(min(wait, HOLD_S + 5))
    snap = subprocess.run(["adb", "shell", "dumpsys", "notification", "--noredact"], capture_output=True, text=True, timeout=60).stdout
    hold_path = re.sub(r"\.txt$", "", path) + "-hold60.txt"
    try:
        with open(hold_path, "w", encoding="utf-8") as f:
            f.write(snap)
    except OSError as e:
        print(f"[qa] (hold snapshot not saved: {e})")
    since = (int(time.time() * 1000) - due) / 1000
    still = [b for b in records(snap) if title(b) == "Rest is over" and key_of(b) == key]
    if still:
        acts = actions(still[0])
        ok = COMPLETE in acts
        print(f"[qa] REST IS OVER HELD: still showing {since:.0f}s after the rest's end ({os.path.basename(hold_path)}), buttons={acts}: {'ok' if ok else 'BUTTON GONE'}")
        return 0 if ok else 1
    ev = subprocess.run(["adb", "logcat", "-b", "events", "-d"], capture_output=True, text=True, timeout=60).stdout
    why = [ln.strip() for ln in ev.splitlines() if "notification_cancel" in ln and "41002" in ln][-2:]
    print(f"[qa] REST IS OVER REMOVED EARLY: gone {since:.0f}s after the rest's end (its timeout is 120 s); cancel events {why or 'none found'}; the 11 Oct regression (run 38081757903)")
    return 1


def main():
    check, path = sys.argv[1], sys.argv[2]
    recs = records(open(path, encoding="utf-8", errors="replace").read())
    # Newest first: a stale "Rest is over" (another tag) must never be read as the fresh one.
    over = sorted([b for b in recs if title(b) == "Rest is over"], key=created, reverse=True)
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
        acts = actions(b)
        has_complete = COMPLETE in acts
        print(f"[qa] REST IS OVER buttons={acts} (want {COMPLETE!r}, audit C5-1): {'ok' if has_complete else 'MISSING'}")
        due = None
        if len(sys.argv) > 4:
            during = records(open(sys.argv[4], encoding="utf-8", errors="replace").read())
            card = [x for x in during if is_card(x) and title(x).startswith("Rest ")]
            if not card:
                # C5 review: no card during the rest used to print "NOT gated" and pass.
                chans = sorted({channel_of(x) for x in during})
                print(f"[qa] REST CARD NOT FOUND in the during-rest dump {os.path.basename(sys.argv[4])} (channels showing: {chans}; want one of {list(CARD_CHANNELS)}): FAILED")
                return 1
            w = re.search(r"\bwhen=(\d+)", card[0])
            if not w:
                print("[qa] REST CARD has no `when` (its end time) in the during-rest dump: FAILED")
                return 1
            due = int(w.group(1))
        if due is None:
            late = (posted - (tick + 30000)) / 1000
            print(f"[qa] REST ALERT posted (channel {channel}); due ~{tick + 30000} (approximate: no during-rest dump given), posted {posted}, late by about {late:.1f}s - lateness NOT gated")
            return 0 if has_complete else 1
        budget = float(os.environ.get("REST_LATE_BUDGET_S", "5"))
        late = (posted - due) / 1000
        ok = -2.0 <= late <= budget
        verdict = "within budget" if ok else ("REST ALERT TOO LATE" if late > budget else "REST ALERT TOO EARLY")
        print(f"[qa] REST ALERT posted (channel {channel}); due {due} (the rest card's end time), posted {posted}, late by {late:.1f}s; budget {budget:g}s: {verdict}")
        held = hold_check(path, key_of(b), due)
        return 0 if ok and has_complete and held == 0 else 1
    if check == "ongoing":
        ok = any(is_ongoing(b) for b in recs)
        print("[qa] ONGOING CARD present" if ok else "[qa] ONGOING CARD MISSING")
        return 0 if ok else 1
    if check == "alone":
        lives = [b for b in recs if is_ongoing(b)]
        rests = [b for b in recs if (is_card(b) and title(b).startswith("Rest ")) or title(b) == "Rest is over"]
        # v0.37.1 (audit C4): nothing showing is not "one at a time" - it is a lost notification.
        ok = bool(lives or rests) and not (lives and rests)
        verdict = "ok" if ok else ("BOTH SHOWING" if lives and rests else "NOTHING SHOWING")
        print(f"[qa] ONE AT A TIME: live cards {len(lives)}, rest card / Rest is over {len(rests)}: {verdict}")
        return 0 if ok else 1
    if check == "live-back":
        lives = [b for b in recs if is_ongoing(b)]
        rests = [b for b in recs if (is_card(b) and title(b).startswith("Rest ")) or title(b) == "Rest is over"]
        notes = [title(b) for b in cards if not title(b).startswith("Rest ")]
        want = sys.argv[3] if len(sys.argv) > 3 else ""
        acts = actions(lives[0]) if lives else []
        has = not want or want in acts
        ok = bool(lives) and not rests and not notes and has
        live = f"'{title(lives[0])}' / '{text_of(lives[0])}' buttons={acts}" if lives else "NONE"
        want_s = f" (want button '{want}': {'yes' if has else 'NO'})" if want else ""
        print(f"[qa] LIVE CARD BACK: live card {live}{want_s}; rest card / Rest is over {len(rests)}; notes {notes}: {'ok' if ok else 'NOT BACK'}")
        return 0 if ok else 1
    if check == "rest-up":
        want = sys.argv[3]
        part = sys.argv[4] if len(sys.argv) > 4 else ""
        rest = [x for x in cards if title(x).startswith(want)]
        lives = [b for b in recs if is_ongoing(b)]
        text_ok = bool(rest) and (not part or part in text_of(rest[0]))
        ok = bool(rest) and text_ok and not lives
        got = f"'{title(rest[0])}' / '{text_of(rest[0])}' buttons={actions(rest[0])}" if rest else "NONE"
        print(f"[qa] REST CARD UP: {got} (want '{want}...'{', text with ' + repr(part) if part else ''}); live cards beside it {len(lives)}: {'ok' if ok else 'FAILED'}")
        return 0 if ok else 1
    if check == "over-text":
        part = sys.argv[3]
        got = text_of(over[0]) if over else None
        ok = got is not None and part in got
        print(f"[qa] REST IS OVER TEXT: {repr(got) if got is not None else 'no Rest is over'} (want {part!r} in it): {'ok' if ok else 'FAILED'}")
        return 0 if ok else 1
    if check == "no-ongoing":
        live = [b for b in recs if is_ongoing(b)]
        print("[qa] ONGOING CARD absent (no workout open)" if not live else "[qa] ONGOING CARD PRESENT: a workout is open")
        return 0 if not live else 1
    if check == "card":
        want = sys.argv[3]
        if not cards:
            print("[qa] REST CARD NOT FOUND")
            return 1
        # Phase 6: a Done tap with the app's JS not running posts a note ("Open ForgeAI to save
        # ...") on the card's own channel; the card is the one titled "Rest ...".
        rest = [x for x in cards if title(x).startswith("Rest ")]
        notes = [title(x) for x in cards if not title(x).startswith("Rest ")]
        if notes:
            print(f"[qa] REST CARD: other notes on the card's channel: {notes}")
        b = (rest or cards)[0]
        f = flags_of(header(b))
        swipe = f >= 0 and not (f & 0x2) and not (f & 0x20)
        # The buttons are the record's notification ACTIONS ('[1] "Skip" -> PendingIntent...'),
        # not any text that happens to contain the word. Phase 6: exactly Done, +15 s, Skip, in
        # that order (a watch shows them in this order too).
        acts = [a for _, a in sorted((int(i), a) for i, a in re.findall(r'^\s*\[(\d+)\] "(.*?)" ->', b, re.M))]
        plus = "+15 s" in acts
        skip = "Skip" in acts
        done = "Done" in acts
        order = acts == ["Done", "+15 s", "Skip"]
        part = sys.argv[4] if len(sys.argv) > 4 else ""
        text_ok = not part or part in text_of(b)
        t = title(b)
        ch = channel_of(b)
        # U-W5 (UAT, 17 Oct 2026): the LOW "rest-card-v2" is right only while the phone itself says
        # a watch WITHOUT the ForgeAI app is connected (WearSync.plainWatch); then "rest-card-live"
        # is wrong. Read from the phone's own log line, never assumed.
        mode = phone_watch_mode()
        want_ch = PLAIN_WATCH_CHANNEL if mode == "plain" else CARD_CHANNEL
        on_v2 = ch == want_ch
        chrono = "android.showChronometer=Boolean (true)" in b
        down = "android.chronometerCountDown=Boolean (true)" in b
        # RT-05: the shade's own countdown view. Informational: a build without the layout posts
        # the plain card, which a watch shows the same way.
        view = "DecoratedCustomViewStyle" in b
        chan = ch or "?"
        if not on_v2:
            chan += f" (NOT {want_ch})"
        chan += f" [phone's watch: {mode or 'unknown, taken as none'}]"
        want_text = f" (want '{part}' in it: {'yes' if text_ok else 'NO'})" if part else ""
        print(f"[qa] REST CARD: title='{t}' (want '{want}...') text='{text_of(b)}'{want_text} channel={chan} flags={hex(f)} swipe-away={'yes' if swipe else 'NO'} done={'yes' if done else 'NO'} +15={'yes' if plus else 'NO'} skip={'yes' if skip else 'NO'} buttons={acts} order-Done,+15 s,Skip={'yes' if order else 'NO'} chronometer={'yes' if chrono else 'no'} countdown={'yes' if down else 'no'} countdown-view={'yes' if view else 'no'}")
        return 0 if swipe and order and on_v2 and t.startswith(want) and text_ok else 1
    if check == "watch":
        # Part W (13 Oct 2026 audit): what a paired watch gets. "Rest is over" must reach it (not
        # FLAG_LOCAL_ONLY 0x100) and ring as an alarm (category=alarm, which skips Android's
        # notification cooldown); the live workout card must stay on the phone (local only).
        if not over:
            print("[qa] WATCH: no 'Rest is over' in the list")
            return 1
        b = over[0]
        f = flags_of(header(b))
        if f < 0:
            f = flags_of(b)
        local = f >= 0 and bool(f & 0x100)
        cat = re.search(r"\bcategory=(\w+)", b)
        category = cat.group(1) if cat else "?"
        lives = [x for x in recs if is_ongoing(x)]
        live_local = []
        for x in lives:
            lf = flags_of(header(x))
            if lf < 0:
                lf = flags_of(x)
            live_local.append(lf >= 0 and bool(lf & 0x100))
        ok = f >= 0 and not local and category == "alarm" and all(live_local)
        print(f"[qa] WATCH: 'Rest is over' flags={hex(f)} local-only={'YES (the watch never gets it)' if local else 'no'} category={category} (want alarm); live cards local-only={live_local}: {'ok' if ok else 'FAILED'}")
        return 0 if ok else 1
    if check == "over-is":
        want_ch, want_cat, want_sound = sys.argv[3], sys.argv[4], sys.argv[5]
        if not over:
            print(f"[qa] REST IS OVER NOT FOUND (want channel {want_ch}, category {want_cat}, {want_sound})")
            return 1
        b = over[0]
        ch = channel_of(b)
        cat = re.search(r"\bcategory=(\w+)", b)
        category = cat.group(1) if cat else "?"
        key = key_of(b)
        full = open(path, encoding="utf-8", errors="replace").read()
        sm = re.search(r"mSoundNotificationKey=(\S*)", full)
        vm = re.search(r"mVibrateNotificationKey=(\S*)", full)
        sound_key = sm.group(1) if sm else ""
        vib_key = vm.group(1) if vm else ""
        made_sound = bool(key) and sound_key == key
        icpt = re.search(r"mIntercept=(\w+)", b)
        ok_sound = made_sound if want_sound == "sound" else not made_sound
        ok = ch == want_ch and category == want_cat and ok_sound
        print(f"[qa] REST IS OVER: channel={ch} (want {want_ch}) category={category} (want {want_cat}) "
              f"made a sound={'yes' if made_sound else 'no'} (want {'yes' if want_sound == 'sound' else 'no'}) "
              f"buzzed={'yes' if key and vib_key == key else 'no'} intercepted by DND={icpt.group(1) if icpt else '?'} "
              f"alerts showing={len(over)} key={key or '?'}: {'ok' if ok else 'FAILED'}")
        return 0 if ok else 1
    if check == "over-open":
        if not over:
            print("[qa] REST IS OVER (app open) NOT FOUND")
            return 1
        ch = re.search(r"channel=([\w-]+)", header(over[0]))
        left = [x for x in cards if title(x).startswith("Rest ")]
        print(f"[qa] REST IS OVER with the app open: posted on channel {ch.group(1) if ch else '?'}; rest cards left: {len(left)}; other notes on the card's channel: {[title(x) for x in cards if x not in left]}")
        return 0 if not left and ch and ch.group(1) == OVER_OPEN_CHANNEL else 1
    print("unknown check " + check)
    return 2


if __name__ == "__main__":
    sys.exit(main())
