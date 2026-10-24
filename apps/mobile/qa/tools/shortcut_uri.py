"""UAT WP4b, part UK (M-110): the intent Android holds for one of ForgeAI's app-icon shortcuts.

Usage: shortcut_uri.py <dumpsys-shortcut.txt> <forge_shortcuts.xml or -> <id: today | weight>
Prints one tab-separated line: uri, long label, intent flags, where it was read
("android" = `dumpsys shortcut`, the record the launcher starts from; "app" = the list the app handed
to Android, shared_prefs/forge_shortcuts.xml, used only when the dump hides the link). Exit 1 when
neither holds a forgeai:// link for that id.
"""
import html
import json
import re
import sys

PKG = "com.mettleup.app"
# Android starts a shortcut's intent with NEW_TASK | CLEAR_TASK unless the intent says otherwise.
LAUNCHER_FLAGS = "0x10008000"


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def from_dumpsys(text, sid):
    i = text.find(f"Package: {PKG}")
    if i < 0:
        return None
    rest = text[i:]
    j = rest.find("Package: ", len("Package: "))
    section = rest if j < 0 else rest[:j]
    for block in re.split(r"(?=ShortcutInfo \{)", section):
        if not re.match(r"ShortcutInfo \{id=" + re.escape(sid) + r"\b", block):
            continue
        dat = re.search(r"dat=(forgeai://[^\s}]+)", block)
        if not dat:
            return None
        label = re.search(r"longLabel=([^,]*)", block)
        flg = re.search(r"\bflg=(0x[0-9a-fA-F]+)", block)
        return dat.group(1), (label.group(1).strip() if label else ""), (flg.group(1) if flg else LAUNCHER_FLAGS)
    return None


def from_prefs(text, sid):
    m = re.search(r'<string name="last">(.*?)</string>', text, re.S)
    if not m:
        return None
    try:
        items = json.loads(html.unescape(m.group(1)))
    except ValueError:
        return None
    for it in items:
        if it.get("id") == sid and str(it.get("uri", "")).startswith("forgeai://"):
            return it["uri"], it.get("long", ""), LAUNCHER_FLAGS
    return None


def main():
    dump, prefs, sid = sys.argv[1], sys.argv[2], sys.argv[3]
    got = from_dumpsys(read(dump), sid)
    where = "android"
    # Android 14 shortens the link in its dump ("dat=forgeai://workout/...", run 38993380014): then
    # the full link comes from the list the app handed to Android, and it must start with the part
    # Android shows, with the same label Android holds.
    shown = None
    if got and "..." in got[0]:
        shown, got = got, None
    if not got and prefs != "-":
        got = from_prefs(read(prefs), sid)
        where = "app"
        if got and shown:
            prefix = shown[0].split("...")[0].rstrip("/")  # scheme + host
            if not got[0].startswith(prefix) or (shown[1] and shown[1] != got[1]):
                print(f"the app's list ({got[0]}, {got[1]}) does not match Android's record ({shown[0]}, {shown[1]})")
                return 1
            got = (got[0], got[1], shown[2])
            where = "app, matching Android's record"
    if not got:
        print(f"no forgeai:// link for shortcut '{sid}'")
        return 1
    print("\t".join([got[0], got[1], got[2], where]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
