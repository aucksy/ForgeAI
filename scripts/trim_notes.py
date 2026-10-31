"""R-233 (owner, 31 Oct 2026): "check and ensure that your notes itself are not getting too big ... set up some
automated cleanup of older notes which are not relevant anymore".

Keeps the newest KEEP entries (## headings, newest on top) in docs/CLAUDE-NOTES.md and moves every older entry to
the top of docs/CLAUDE-NOTES-ARCHIVE.md, so nothing is lost and old entries stay searchable with grep. Standing
rules that matter every session live in CLAUDE.md, not here. Works in bytes and keeps the files' CRLF endings.
Runs on every tracker build (owner_inbox_page.py) and by hand: python scripts/trim_notes.py
"""
import os
import re
import sys

KEEP = 40
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(ROOT, "docs", "CLAUDE-NOTES.md")
ARCHIVE = os.path.join(ROOT, "docs", "CLAUDE-NOTES-ARCHIVE.md")
POINTER = (b"Older entries are moved automatically (scripts/trim_notes.py, newest " + str(KEEP).encode()
           + b" kept here) to docs/CLAUDE-NOTES-ARCHIVE.md: grep it before saying something was never said.")
ARCHIVE_HEAD = (b"# Claude's notes: archive\r\n\r\nOlder entries moved out of docs/CLAUDE-NOTES.md by "
                b"scripts/trim_notes.py. Newest on top.\r\n\r\n")


def trim(keep=KEEP):
    with open(NOTES, "rb") as f:
        data = f.read()
    starts = [m.start() for m in re.finditer(rb"^## ", data, flags=re.M)]
    if len(starts) <= keep:
        return 0
    head, cut = data[:starts[0]], starts[keep]
    kept, old = data[starts[0]:cut], data[cut:]
    if POINTER not in head:
        head = head.rstrip(b"\r\n") + b"\r\n\r\n" + POINTER + b"\r\n\r\n"
    try:
        with open(ARCHIVE, "rb") as f:
            arch = f.read()
    except FileNotFoundError:
        arch = ARCHIVE_HEAD
    body_at = arch.find(b"\r\n## ")
    arch_head, arch_body = (arch, b"") if body_at < 0 else (arch[:body_at + 2], arch[body_at + 2:])
    old = old.rstrip(b"\r\n") + b"\r\n\r\n"
    with open(ARCHIVE, "wb") as f:
        f.write(arch_head + old + arch_body)
    with open(NOTES, "wb") as f:
        f.write(head + kept.rstrip(b"\r\n") + b"\r\n")
    return len(starts) - keep


if __name__ == "__main__":
    n = trim(int(sys.argv[1]) if len(sys.argv) > 1 else KEEP)
    print("trim_notes: moved %d old entries to the archive" % n)
