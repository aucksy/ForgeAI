#!/usr/bin/env python3
"""Owner inbox page (owner decision 17 Oct 2026, docs/OWNER-INBOX.md #15, option A).

Builds ONE self-contained HTML page from docs/OWNER-INBOX.md: the open decisions on top, then every
entry, each tagged with the chat it came from, with a chat picker and a status filter. A session
publishes it as a private page in the owner's Claude account (Artifact tool, same file path each
time so the link stays the same) after every inbox update. The .md file stays the source of truth.

#16 (17 Oct 2026): every open question carries its choices (`**Decide:**` + `- A: ...` lines in the
.md). On the page the owner taps a choice, adds a note if he likes, and presses Send: the page saves
the answer INTO ITSELF (the `artifact` capability publishes a new version: only the owner can, the
page is private), which wakes the Claude session watching it. A session acting on it moves the answer
into the .md ("**DECIDED ...**") and rebuilds the page, which clears the sent answer.
The page can rebuild itself because it carries its own template (TPL) next to its data (DATA).

#17 (18 Oct 2026): every entry has "Mark as read" and a reply box; option questions take a comment
without a pick; "Waiting for you" shows only what is unread or still unanswered. Read state lives in
the .md as a `**READ (date)**` line; the page keeps the owner's new taps in DATA.read until a session
moves them into the .md with --absorb (run on the saved page BEFORE every rebuild, or they are lost).

#21 (18 Oct 2026): a Feature backlog view (the .md's "## Feature backlog" section: "### <group>" headings
with "| Feature | Status | Details |" tables), each feature with its own comment box (saved into the page
as DATA.notes, printed by --absorb like answers); "Waiting for you" counts decisions only, and the
entries not read yet have their own "To read" list and filter.

R-81 (22 Oct 2026): every feature not built yet has "Move to" (Planned / Waiting for you / Idea / Not
doing). A move is saved into the page as DATA.moves and shows at once; --absorb writes it into the
feature's Status cell in the .md (his move wins). Planned = Claude may build it; Waiting for you = needs him.

R-84 (23 Oct 2026): a phone-first page. A short sticky bar with "Go to # or search" (a number jumps, words
search entries, backlog and Claude's tasks) and five tabs with counts: Home (what waits for him, what changed
since his last visit on that phone, new answers, what Claude is doing), Waiting for you, Questions & answers,
Feature backlog (status pills + group picker), Claude's tasks (Doing / Blocked / To do / Done). Cards show the
title and one line; the long answer is drawn only when opened. A link ending in #51 opens at #51.

R-96 (24 Oct 2026): every pending item (an open question or task of his, a feature not built, a task of mine not
done) has Impact and Effort (High / Medium / Low) in the .md's "## Priority" table. Pending cards show both, and
a Sort picker on the four list tabs orders them: Best first (the default), Biggest impact, Quickest, Original order.
A build prints any pending item with no rating, and any rating row that matches nothing.

Usage: owner_inbox_page.py <output.html> [<inbox.md>]
       owner_inbox_page.py --absorb <saved-page.html> [<inbox.md>]
         writes the page's read taps into the .md and prints the answers/replies it holds
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, "docs", "OWNER-INBOX.md")

ENTRY_RE = re.compile(r"^## (\d+)\. (.+?) — (.+)$", re.M)
BACKLOG_RE = re.compile(r"^## Feature backlog[^\n]*\n(.*?)^---[ \t]*$", re.M | re.S)
# A backlog row's status, as the page colours it.
BACKLOG_KIND = {"live": "done", "next release": "built", "waiting for you": "waiting", "planned": "planned", "idea": "idea", "not doing": "no"}
# R-31 (owner, 18 Oct 2026): a task waiting on HIM ("**Your task:** ...") shows under "Waiting for you"
# until he taps "I've done it" (saved into the page, moved into the .md as "**TASK DONE (when)**").
TASK_RE = re.compile(r"^\*\*Your task:\*\* (.+)$", re.M)
TASK_DONE_RE = re.compile(r"^\*\*TASK DONE \(([^)\n]*)\)\*\*[ \t]*(?:\r?\n|$)", re.M)
READ_RE = re.compile(r"^\*\*READ \([^)\n]*\)\*\*[ \t]*(?:\r?\n|$)", re.M)


def status_kind(status):
    s = status.upper()
    if "WAITING" in s:
        return "waiting"
    if "NOT RELEASED" in s:
        return "built"
    if s.startswith("BUILT") or s.startswith("DONE"):
        return "done"
    if "PLANNED" in s:
        return "planned"
    if "RESEARCHING" in s or "BUILDING" in s:
        return "working"
    return "answered"


MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


def day_of(said, entry_date):
    """'29 Oct' or '29 Oct 2026, 12:01 am' -> '2026-10-29'; the year comes from the entry's date when left out."""
    em = re.search(r"(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})", entry_date)
    m = re.search(r"(\d{1,2}) ([A-Za-z]{3})[a-z]*(?: (\d{4}))?", said)
    if not m or m.group(2).lower() not in MONTHS:
        m = em
    if not m or m.group(2).lower() not in MONTHS:
        return ""
    month = MONTHS[m.group(2).lower()]
    year = int(m.group(3)) if m.group(3) else int(em.group(3)) if em else 0
    if not m.group(3) and em and month < MONTHS.get(em.group(2).lower(), month):
        year += 1  # a December entry answered in January
    return "%04d-%02d-%02d" % (year, month, int(m.group(1)))


def thread_of(body, entry_date):
    """R-172 (owner, 29 Oct 2026): a question he replied to is a thread. replies = his follow-ups, answered = my
    answer comes after his last one, last = the day of his last follow-up (for sorting)."""
    replies = list(re.finditer(r"^\*\*YOUR REPLY \(([^)\n]*)\)", body, re.M))
    if not replies:
        return None
    last = replies[-1]
    after = body[last.end():].split(chr(10), 1)
    answered = len(after) > 1 and bool(after[1].strip())  # anything I wrote under his last follow-up
    return {"replies": len(replies), "answered": answered, "last": day_of(last.group(1), entry_date)}


def parse(text):
    """{decisions: [[#, decision, pick]], entries: [{num, title, date, chat, chatUrl, status, kind, body}]}"""
    decisions = []
    m = re.search(r"^## Waiting for your decision.*?\n(.*?)^---", text, re.M | re.S)
    if m:
        for line in m.group(1).splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) == 3 and cells[0].isdigit():
                decisions.append(cells)
    entries = []
    heads = list(ENTRY_RE.finditer(text))
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        body = text[h.end():end].strip("\n")
        chat, chat_url = "Unknown chat", ""
        cm = re.search(r"^\*\*Chat:\*\* (.+)$", body, re.M)
        if cm:
            raw = cm.group(1).strip()
            um = re.search(r"\s+—\s+(https://\S+)$", raw)
            if um:
                chat_url = um.group(1)
                raw = raw[: um.start()].strip()
            chat = raw
            body = body[: cm.start()] + body[cm.end() + 1:]
        sm = re.search(r"^\*\*Status:\*\* (.+)$", body, re.M)
        status = sm.group(1).strip() if sm else ""
        if sm:
            body = body[: sm.start()] + body[sm.end() + 1:]
        rm = READ_RE.search(body)
        if rm:
            body = body[: rm.start()] + body[rm.end():]
        tasks = [t.strip() for t in TASK_RE.findall(body)]
        body = TASK_RE.sub("", body)
        td = TASK_DONE_RE.search(body)
        if td:
            body = body[: td.start()] + body[td.end():]
        decides = []
        # R-83 (owner, 23 Oct 2026): a question added AFTER an entry's last "**DECIDED" line is a new,
        # open question (#49 got its follow-up hidden); only the ones before it are answered.
        last_decided = max((m.start() for m in re.finditer(r"^\*\*DECIDED", body, re.M)), default=-1)
        for dm in re.finditer(r"^\*\*Decide:\*\* (.+)\n((?:- [A-Z]: .+\n?)+)", body, re.M):
            if dm.start() < last_decided:
                continue
            opts = []
            for om in re.finditer(r"^- ([A-Z]): (.+)$", dm.group(2), re.M):
                said = om.group(2).strip()
                rec = said.endswith("(recommended)")
                opts.append({"key": om.group(1), "text": said[: -len("(recommended)")].strip() if rec else said, "rec": rec})
            decides.append({"q": dm.group(1).strip(), "opts": opts})
        body = re.sub(r"^\*\*Decide:\*\* .+\n(?:- [A-Z]: .+\n?)+", "", body, flags=re.M)
        entries.append({
            "num": int(h.group(1)),
            "decides": decides,
            "title": h.group(2).strip(),
            "date": h.group(3).strip(),
            "chat": chat,
            "chatUrl": chat_url,
            "status": status,
            "kind": status_kind(status),
            "read": bool(rm),
            "tasks": tasks,
            "taskDone": td.group(1) if td else "",
            "thread": thread_of(body, h.group(3).strip()),
            "body": body.strip(),
        })
    backlog, mine, prio = parse_backlog(text), parse_mine(text), parse_priority(text)
    for e in entries:
        e["prio"] = prio.get("#%d" % e["num"])
    for f in backlog:
        f["prio"] = prio.get("Feature: " + f["name"])
    for t in mine:
        t["prio"] = prio.get("Task: " + t["task"])
    return {"decisions": decisions, "entries": entries, "backlog": backlog, "mine": mine}


PRIO_LEVELS = ("High", "Medium", "Low")


def parse_priority(text):
    """R-96 (owner, 24 Oct 2026): {item: [impact, effort]} from "## Priority" (| Item | Impact | Effort |, each
    High / Medium / Low). An item is "#50", "Feature: <backlog name>" or "Task: <Claude's task>"."""
    m = re.search(r"^## Priority[^\n]*\n(.*?)^---[ \t]*$", text, re.M | re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.strip().startswith("|") and len(cells) == 3 and cells[1] in PRIO_LEVELS and cells[2] in PRIO_LEVELS:
            out[cells[0]] = [cells[1], cells[2]]
    return out


def priority_gaps(data, text):
    """R-96: pending items with no rating, and rating rows that match nothing (a renamed or removed item)."""
    missing = []
    for e in data["entries"]:
        if (e["decides"] or (e["tasks"] and not e["taskDone"])) and not e["prio"]:
            missing.append("#%d" % e["num"])
    missing += ["Feature: " + f["name"] for f in data["backlog"] if f["kind"] not in ("done", "built", "no") and not f["prio"]]
    missing += ["Task: " + t["task"] for t in data["mine"] if not t["done"] and not t["prio"]]
    known = {"#%d" % e["num"] for e in data["entries"]} | {"Feature: " + f["name"] for f in data["backlog"]} | {"Task: " + t["task"] for t in data["mine"]}
    stale = [k for k in parse_priority(text) if k not in known]
    return missing, stale


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def parse_mine(text):
    """R-33 (owner, 19 Oct 2026): [{task, status, details, done}] from "## Claude's tasks"
    (| Task | Status | Details |; Status Done / Doing / To do / Blocked)."""
    m = re.search(r"^## Claude's tasks[^\n]*\n(.*?)^---[ \t]*$", text, re.M | re.S)
    out = []
    for line in (m.group(1).splitlines() if m else []):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not line.strip().startswith("|") or len(cells) != 3 or cells[0] in ("Task", "") or set(cells[0]) <= set("-: "):
            continue
        out.append({"task": cells[0], "status": cells[1], "details": cells[2], "done": cells[1].lower().startswith("done")})
    return out


def parse_backlog(text):
    """[{id, group, name, status, kind, details, how}] from the "## Feature backlog" section ([] without one).
    R-52 (owner, 22 Oct 2026): an optional 4th cell, "How it will work", for features not built yet."""
    m = BACKLOG_RE.search(text)
    if not m:
        return []
    items, group, seen = [], "Other", set()
    for line in m.group(1).splitlines():
        hm = re.match(r"^### (.+)$", line)
        if hm:
            group = hm.group(1).strip()
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not line.strip().startswith("|") or len(cells) not in (3, 4) or cells[0] in ("Feature", "") or set(cells[0]) <= set("-: "):
            continue
        fid = slug(group) + "/" + slug(cells[0])
        if fid in seen:
            continue
        seen.add(fid)
        items.append({"id": fid, "group": group, "name": cells[0], "status": cells[1],
                      "kind": BACKLOG_KIND.get(cells[1].lower(), "idea"), "details": cells[2],
                      "how": cells[3] if len(cells) == 4 else ""})
    return items


def build(md_path=INBOX):
    data = parse(open(md_path, encoding="utf-8").read())
    now = datetime.now(timezone.utc)
    data["updated"] = now.strftime("%d %b %Y, %H:%M UTC")
    data["updatedIso"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")  # R-84: the page shows it in the reader's own time
    data["answers"] = {}
    data["read"] = {}
    data["notes"] = {}
    data["moves"] = {}
    return fill(TEMPLATE, data)


def page_data(html):
    """DATA of a saved page (its `const DATA = {...};` line; the template copy keeps only the marker)."""
    m = re.search(r"^const DATA = (.*);$", html, re.M)
    if not m:
        raise ValueError("no DATA line in the saved page")
    return json.loads(m.group(1))


def set_read(text, num, when):
    """Entry #num gets `**READ (when, via the page)**` after its Status line, or loses it (when=None)."""
    heads = list(ENTRY_RE.finditer(text))
    for i, h in enumerate(heads):
        if int(h.group(1)) != num:
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        block = READ_RE.sub("", text[h.end():end])
        if when:
            anchor = re.search(r"^\*\*Status:\*\* .*\n", block, re.M) or re.search(r"^\*\*Chat:\*\* .*\n", block, re.M)
            pos = anchor.end() if anchor else block.find("\n") + 1
            if pos <= 0:  # a heading at the very end of the file, with no newline after it
                block, pos = block + "\n", len(block) + 1
            block = block[:pos] + "**READ (" + when + ", via the page)**\n" + block[pos:]
        return text[: h.end()] + block + text[end:]
    return text


def set_task_done(text, num, when):
    """Entry #num gets `**TASK DONE (when, via the page)**` after its Status line, or loses it (when=None)."""
    heads = list(ENTRY_RE.finditer(text))
    for i, h in enumerate(heads):
        if int(h.group(1)) != num:
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        block = TASK_DONE_RE.sub("", text[h.end():end])
        if when:
            anchor = re.search(r"^\*\*Status:\*\* .*\n", block, re.M) or re.search(r"^\*\*Chat:\*\* .*\n", block, re.M)
            pos = anchor.end() if anchor else block.find("\n") + 1
            if pos <= 0:  # a heading at the very end of the file, with no newline after it
                block, pos = block + "\n", len(block) + 1
            block = block[:pos] + "**TASK DONE (" + when + ", via the page)**\n" + block[pos:]
        return text[: h.end()] + block + text[end:]
    return text


def rename_chats(text, names):
    """R-28: every `**Chat:** <old>` line (its link kept) gets the owner's new name from the page."""
    def one(m):
        raw, link = m.group(1).strip(), ""
        um = re.search(r"\s+—\s+(https://\S+)$", raw)
        if um:
            raw, link = raw[: um.start()].strip(), " — " + um.group(1)
        new = names.get(raw)
        return "**Chat:** " + (new.strip() if isinstance(new, str) and new.strip() else raw) + link
    return re.sub(r"^\*\*Chat:\*\* (.+)$", one, text, flags=re.M)


MOVE_TO = ("Planned", "Waiting for you", "Idea", "Not doing")


def move_features(text, moves):
    """R-81: each moved feature's Status cell in "## Feature backlog" becomes the owner's pick.
    Returns (text, moves written). A move to an unknown status, or of a feature no longer there, is skipped."""
    m = BACKLOG_RE.search(text)
    if not m or not moves:
        return text, []
    lines, group, done = m.group(1).split("\n"), "Other", []
    for k, line in enumerate(lines):
        hm = re.match(r"^### (.+)$", line)
        if hm:
            group = hm.group(1).strip()
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not line.strip().startswith("|") or len(cells) not in (3, 4):
            continue
        mv = moves.get(slug(group) + "/" + slug(cells[0]))
        if not mv or mv.get("to") not in MOVE_TO or cells[1] == mv["to"]:
            continue
        cells[1] = mv["to"]
        lines[k] = "| " + " | ".join(cells) + " |"
        done.append((group, cells[0], mv["to"]))
    return text[: m.start(1)] + "\n".join(lines) + text[m.end(1):], done


def absorb(saved_html, md_path=INBOX):
    """Move the page's read taps into the .md; return the answers/replies the page holds (to act on)."""
    data = page_data(saved_html)
    with open(md_path, encoding="utf-8") as f:
        text = f.read()
    read = data.get("read") or {}
    answers = data.get("answers") or {}
    for num, when in read.items():
        text = set_read(text, int(num), str(when) if when else None)
    # Sending an answer or a reply counts as read on the page; keep it so after the rebuild.
    for num, a in answers.items():
        if num not in read:
            text = set_read(text, int(num), str(a.get("at") or "sent"))
    text = rename_chats(text, data.get("chatNames") or {})
    for num, when in (data.get("done") or {}).items():
        text = set_task_done(text, int(num), str(when) if when else None)
    text, _ = move_features(text, data.get("moves") or {})
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(text)
    return answers


def enc(value):
    """JSON safe inside <script>: the page's own rebuild (fill in the template's JS) does the same."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def fill(tpl, data):
    # One pass over the template only, so a token inside the filled-in text is never replaced again.
    return re.sub(r"__TPL__|__DATA__", lambda m: enc(tpl) if m.group(0) == "__TPL__" else enc(data), tpl)


TEMPLATE = r"""<title>Project Tracker</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
/* R-84 (owner, 23 Oct 2026): a phone-first tracker. A short sticky bar (title, "Go to # or search", five tabs with
   their counts); Home says what waits and what changed; cards show the title and one line first, the rest folded. */
:root {
  --bg: #f4f5f7; --surface: #ffffff; --sunk: #eef0f3; --ink: #1b1f27; --muted: #59616f; --line: #dde1e8; --line-strong: #c4cad4;
  --accent: #b0451a; --on-accent: #ffffff; --accent-soft: #fcebe1;
  --wait: #8f5400; --wait-bg: #fff1d6; --built: #1d5fa8; --built-bg: #e2eefc;
  --done: #23733f; --done-bg: #e0f3e6; --plain: #4b5262; --plain-bg: #eceef2;
  --shadow: 0 1px 2px rgba(20, 24, 33, 0.05), 0 6px 18px -8px rgba(20, 24, 33, 0.12);
  --f-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
  --f-body: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  --f-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121419; --surface: #1b1e25; --sunk: #16181e; --ink: #e9ebf0; --muted: #a0a7b5; --line: #2c313b; --line-strong: #3d4350;
  --accent: #f08a4b; --on-accent: #1b1208; --accent-soft: #3a2418;
  --wait: #f2c36b; --wait-bg: #3a2c10; --built: #8fbaf2; --built-bg: #16283f;
  --done: #7fd39b; --done-bg: #13301e; --plain: #b9bfcc; --plain-bg: #262a33;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.35); color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #121419; --surface: #1b1e25; --sunk: #16181e; --ink: #e9ebf0; --muted: #a0a7b5; --line: #2c313b; --line-strong: #3d4350;
  --accent: #f08a4b; --on-accent: #1b1208; --accent-soft: #3a2418;
  --wait: #f2c36b; --wait-bg: #3a2c10; --built: #8fbaf2; --built-bg: #16283f;
  --done: #7fd39b; --done-bg: #13301e; --plain: #b9bfcc; --plain-bg: #262a33;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.35); color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font-family: var(--f-body); font-size: 16px; line-height: 1.5; -webkit-text-size-adjust: 100%; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--surface); }
::selection { background: var(--accent-soft); color: var(--ink); }
input, textarea { caret-color: var(--accent); }
.wrap { max-width: 760px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); box-sizing: border-box; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
a { color: var(--accent); text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
article:focus, .feat:focus { outline: none; }

/* The sticky bar: about 130 px on a phone (it was 340). */
header.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--surface); border-bottom: 1px solid var(--line); }
header.bar .wrap { padding-top: 10px; }
.toprow { display: flex; align-items: center; gap: 10px; }
h1 { font-family: var(--f-display); font-weight: 700; font-size: 1.2rem; letter-spacing: -0.01em; line-height: 1.1; margin: 0; flex: none; }
h1 span { color: var(--accent); }
.find { display: flex; gap: 6px; flex: 1; min-width: 0; margin: 0; }
.find input { flex: 1; min-width: 0; height: 44px; box-sizing: border-box; font: inherit; color: var(--ink); background: var(--sunk); border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; }
.find input::placeholder { color: var(--muted); opacity: 1; }
.findmsg { margin: 6px 0 0; font-size: 0.88rem; color: var(--wait); }
.findmsg:empty { display: none; }
.tabs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 6px; }
.tab { font: inherit; background: none; border: 0; border-bottom: 3px solid transparent; color: var(--muted); cursor: pointer; min-height: 54px; padding: 4px 2px 5px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 1px; text-align: center; font-size: 0.74rem; line-height: 1.15; }
.tab .n { font-family: var(--f-mono); font-weight: 700; font-size: 0.98rem; line-height: 1.3; color: var(--ink); font-variant-numeric: tabular-nums; min-height: 1.3em; display: flex; align-items: center; }
.tab .n.hot { color: var(--accent); }
.tab .n svg { width: 18px; height: 18px; }
.tab[aria-pressed="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 700; }
.tab:hover { color: var(--ink); }

main .wrap { padding-block: 16px 64px; }
.chatbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
.chatbar[hidden] { display: none; }
.chatbar label { font-size: 0.85rem; color: var(--muted); }
select { font: inherit; font-size: 1rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 0 10px; min-height: 44px; max-width: 100%; min-width: 0; }
.renamebox { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.renamebox[hidden] { display: none; }
.renamebox input { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; box-sizing: border-box; }

h2 { font-family: var(--f-display); font-weight: 700; font-size: 1.3rem; line-height: 1.2; margin: 0; text-wrap: balance; }
.tabhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.hint { margin: 6px 0 0; font-size: 0.92rem; color: var(--muted); max-width: 62ch; }
.grp { display: flex; align-items: baseline; gap: 8px; font-family: var(--f-display); font-weight: 600; font-size: 1.05rem; margin: 26px 0 10px; scroll-margin-top: calc(var(--hdr, 130px) + 12px); }
.cnt { font-family: var(--f-mono); font-size: 0.85rem; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
.stack { display: flex; flex-direction: column; gap: 10px; }

/* Entry cards: number + title + tags first; the long answer folded. */
article { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 14px 12px; min-width: 0; box-shadow: var(--shadow); scroll-margin-top: calc(var(--hdr, 130px) + 12px); }
article.is-open { border-color: var(--line-strong); }
.ch { display: grid; grid-template-columns: 2.9em 1fr; gap: 8px; align-items: start; }
.num { font-family: var(--f-mono); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); font-size: 0.95rem; padding-top: 1px; }
article h3 { font-family: var(--f-display); font-weight: 600; font-size: 1.04rem; line-height: 1.3; margin: 0; text-wrap: pretty; overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin: 6px 0 0; font-size: 0.8rem; color: var(--muted); }
.meta a { color: var(--muted); }
.statusline { margin: 6px 0 0; font-size: 0.86rem; color: var(--muted); }
.gist { margin: 8px 0 0; font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
article:has(.fpanel.full:not([hidden])) .gist { display: none; }
.readbtn { min-height: 40px; padding: 0 12px; font-size: 0.88rem; align-self: center; }
article .fbar { margin-top: 6px; }
article .fpanel.full { padding-top: 2px; }
.cb { min-width: 0; }
.status { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 6px; padding: 2px 7px; white-space: nowrap; }
.k-waiting, .k-blocked { color: var(--wait); background: var(--wait-bg); }
.k-built { color: var(--built); background: var(--built-bg); }
.k-done { color: var(--done); background: var(--done-bg); }
.k-doing { color: var(--accent); background: var(--accent-soft); }
.k-planned, .k-answered, .k-working, .k-idea, .k-no, .k-todo { color: var(--plain); background: var(--plain-bg); }
.k-no { text-decoration: line-through; }
.tag { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em; border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
.tag.act { color: var(--on-accent); background: var(--accent); }
.tag.new { color: var(--accent); background: var(--accent-soft); }
details > summary { cursor: pointer; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
.donebox > summary, .morelist > summary { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: var(--accent); font-size: 0.92rem; font-weight: 700; }
.chev { width: 16px; height: 16px; flex: none; transition: transform 0.18s ease-out; }
details[open] > summary .chev, button[aria-expanded="true"] .chev { transform: rotate(180deg); }
.body { margin-top: 2px; min-width: 0; overflow-wrap: anywhere; font-size: 0.97rem; }
.body p, .body ul, .body ol, .body blockquote { margin: 0 0 10px; }
.body ul, .body ol { padding-left: 1.3em; }
.body li { margin-bottom: 4px; }
.body blockquote { border-left: 1px solid var(--line-strong); padding-left: 12px; color: var(--muted); }
.body code { font-family: var(--f-mono); font-size: 0.84em; background: var(--plain-bg); border-radius: 4px; padding: 1px 4px; }
.body table { border-collapse: collapse; font-size: 0.88rem; font-variant-numeric: tabular-nums; }
.tablebox { overflow-x: auto; margin-bottom: 10px; }
.body th, .body td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
a.goto { font-family: var(--f-mono); font-size: 0.92em; }
.latest { margin: 8px 0 10px; padding: 10px 12px 2px; border-left: 4px solid var(--accent); border-radius: 10px; background: var(--accent-soft); }
.latestlbl { margin: 0 0 6px !important; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }

/* Answering: big rows to tap, Claude's pick marked, then Send. */
.form { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: 12px; background: var(--sunk); }
fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
legend { font-weight: 700; margin-bottom: 6px; padding: 0; }
.opt { display: grid; grid-template-columns: 22px 1.2em 1fr; gap: 8px; align-items: start; min-height: 44px; box-sizing: border-box; padding: 11px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); cursor: pointer; overflow-wrap: anywhere; }
.opt:hover { border-color: var(--accent); }
.opt.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
.opt input { width: 20px; height: 20px; margin: 1px 0 0; accent-color: var(--accent); }
.opt:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.key { font-family: var(--f-mono); font-weight: 700; color: var(--accent); }
.rec { display: inline-block; font-style: normal; font-size: 0.72rem; font-weight: 700; color: var(--done); background: var(--done-bg); border-radius: 5px; padding: 1px 6px; margin-left: 4px; white-space: nowrap; }
.notelbl { font-size: 0.86rem; color: var(--muted); }
textarea { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; box-sizing: border-box; resize: vertical; min-height: 60px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.btn { font: inherit; font-weight: 700; color: var(--on-accent); background: var(--accent); border: 1px solid var(--accent); border-radius: 10px; min-height: 44px; padding: 0 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; }
.btn:hover { filter: brightness(1.06); }
.btn.ghost { color: var(--accent); background: transparent; }
.btn.ghost:hover { background: var(--accent-soft); filter: none; }
.btn.quiet { color: var(--muted); border-color: var(--line-strong); font-weight: 400; }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn[hidden] { display: none; }
.msg { font-size: 0.9rem; color: var(--muted); min-width: 0; }
.msg:empty { display: none; }
.sentbox { margin-top: 12px; padding: 12px; border-radius: 12px; background: var(--done-bg); color: var(--ink); }
.sentline { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--done); font-weight: 700; }
.sentline svg { width: 18px; height: 18px; flex: none; }
.sentpicks { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sentpicks b { font-family: var(--f-mono); color: var(--done); margin-right: 4px; }
.sentnote { margin: 8px 0 0; overflow-wrap: anywhere; }
.small { margin: 8px 0 0; font-size: 0.84rem; color: var(--muted); }
.sentbox .actions { margin-top: 8px; }
.taskbox { margin-top: 12px; padding: 12px; border-radius: 12px; background: var(--sunk); }
.taskbox.done { background: var(--done-bg); }
.taskbox .tl { margin: 0; font-weight: 700; }
.taskbox.done .tl { color: var(--done); }
.taskbox ol { margin: 8px 0 10px; padding-left: 1.3em; overflow-wrap: anywhere; }
.taskbox li { margin-bottom: 6px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--f-mono); font-size: 0.8rem; margin: 6px 0 0; }

/* Lists of rows (Home, the question index, search results): one tap = jump. */
.rows { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.rows li + li { border-top: 1px solid var(--line); }
.row { display: grid; grid-template-columns: 2.9em 1fr auto; gap: 8px; align-items: start; min-height: 44px; box-sizing: border-box; padding: 11px 12px; color: var(--ink); text-decoration: none; }
.row:hover { background: var(--sunk); }
.row .rn { font-family: var(--f-mono); font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.row .rb { min-width: 0; overflow-wrap: anywhere; }
.row .rt { display: block; }
.row .rs { display: block; margin-top: 3px; font-size: 0.85rem; color: var(--muted); }
.row .rs .status { font-size: 0.68rem; }
.row .go { width: 16px; height: 16px; color: var(--muted); margin-top: 3px; }
mark { background: var(--wait-bg); color: inherit; border-radius: 3px; padding: 0 1px; }
.qindex { margin-top: 14px; }
.qindex .rows { border-color: var(--accent-soft); }

/* Home */
.lead { font-family: var(--f-display); font-weight: 600; font-size: 1.35rem; line-height: 1.3; margin: 2px 0 12px; text-wrap: balance; }
.lead b { color: var(--accent); }
.home .grp { margin-top: 28px; }
.empty { padding: 14px; border: 1px dashed var(--line-strong); border-radius: 14px; color: var(--muted); }
.empty p { margin: 0; }
.empty p + p { margin-top: 4px; }
.empty b { color: var(--ink); }
.foot { margin: 28px 0 0; font-size: 0.84rem; color: var(--muted); }
.morelist { margin-top: 6px; }
.morelist .rows { margin-top: 6px; }

/* Feature backlog and Claude's tasks */
.filters { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { font: inherit; font-size: 0.85rem; min-height: 40px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pill b { font-family: var(--f-mono); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.pill .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.pill.k-waiting .dot { background: var(--wait); } .pill.k-planned .dot, .pill.k-idea .dot, .pill.k-no .dot { background: var(--plain); }
.pill.k-done .dot { background: var(--done); } .pill.k-built .dot { background: var(--built); }
.pill.k-waiting, .pill.k-planned, .pill.k-idea, .pill.k-no, .pill.k-done, .pill.k-built { background: var(--surface); color: var(--ink); text-decoration: none; }
.pills .pill[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.pills .pill[aria-pressed="true"] .dot { background: var(--surface); }
.selrow { display: flex; align-items: center; gap: 8px; }
.selrow label { font-size: 0.85rem; color: var(--muted); }
.legend { margin: 0; font-size: 0.88rem; color: var(--muted); }
.legend b { color: var(--ink); }
.feat { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px 6px; margin-bottom: 8px; min-width: 0; scroll-margin-top: calc(var(--hdr, 130px) + 12px); }
.feat.task { padding-bottom: 12px; }
.fh { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; justify-content: space-between; }
.feat .name { font-family: var(--f-body); font-weight: 700; font-size: 1rem; margin: 0; overflow-wrap: anywhere; min-width: 0; flex: 1 1 12em; }
.feat .det { margin: 4px 0 0; color: var(--muted); font-size: 0.92rem; overflow-wrap: anywhere; }
.feat .how { margin: 4px 0 6px; font-size: 0.93rem; overflow-wrap: anywhere; }
.feat .moved { margin: 6px 0 0; font-size: 0.84rem; color: var(--muted); }
.fbar { display: flex; flex-wrap: wrap; gap: 0 14px; margin-top: 2px; }
.fbtn { font: inherit; font-size: 0.9rem; font-weight: 700; color: var(--accent); background: none; border: 0; padding: 0; min-height: 44px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.fpanel { padding-bottom: 8px; }
.fpanel[hidden] { display: none; }
.fpanel .form { margin-top: 2px; }
.waits { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; font-size: 0.86rem; color: var(--muted); align-items: center; }
.chipnum { display: inline-flex; align-items: center; min-height: 36px; padding: 0 10px; border-radius: 999px; background: var(--wait-bg); color: var(--wait); font-weight: 700; text-decoration: none; }
.chipnum b { font-family: var(--f-mono); margin-right: 4px; }
/* R-96: Impact and Effort on pending items; high impact and low effort stand out. */
.pri { font-size: 0.72rem; font-weight: 700; border-radius: 6px; padding: 1px 7px; white-space: nowrap; color: var(--muted); border: 1px solid var(--line-strong); }
.pri.i3 { color: var(--accent); border-color: currentColor; }
.pri.e1 { color: var(--done); border-color: currentColor; }
.pris { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; margin: 6px 0 0; font-size: 0.8rem; color: var(--muted); }
.sortbar { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }

/* Finished items fold at the bottom of each tab (owner, 18 Oct). */
.donebox { margin-top: 24px; padding-top: 8px; border-top: 2px dashed var(--line); }
.donebox > summary { color: var(--muted); font-family: var(--f-display); font-size: 1rem; font-weight: 600; }
.donebox .stack { margin-top: 6px; }
.toast { position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 20; max-width: calc(100% - 32px); box-sizing: border-box; padding: 12px 16px; border-radius: 12px; background: var(--ink); color: var(--surface); font-weight: 700; box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.4); }
.toast[hidden] { display: none; }
article.flash, .feat.flash { box-shadow: 0 0 0 3px var(--accent); transition: box-shadow 0.6s ease-out; }
@media (min-width: 640px) { h1 { font-size: 1.45rem; } .tab { font-size: 0.82rem; } .cb { margin-left: calc(2.9em + 8px); } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
</style>

<header class="bar"><div class="wrap">
  <div class="toprow">
    <h1>Project <span>Tracker</span></h1>
    <form class="find" id="findform" role="search" autocomplete="off">
      <label class="sr" for="find">Search everything, or type a number to go to it</label>
      <input id="find" type="search" enterkeyhint="go" maxlength="80" placeholder="Search or #51" aria-describedby="findmsg">
      <button class="btn" type="submit">Go</button>
    </form>
  </div>
  <p class="findmsg" id="findmsg" role="status" aria-live="polite"></p>
  <nav class="tabs" aria-label="Sections">
    <button class="tab" type="button" data-f="home" aria-pressed="false"><span class="n"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></span><span class="l">Home</span></button>
    <button class="tab" type="button" data-f="waiting" aria-pressed="false"><span class="n"></span><span class="l">Waiting for you</span></button>
    <button class="tab" type="button" data-f="all" aria-pressed="false"><span class="n"></span><span class="l">Questions &amp; answers</span></button>
    <button class="tab" type="button" data-f="backlog" aria-pressed="false"><span class="n"></span><span class="l">Feature backlog</span></button>
    <button class="tab" type="button" data-f="mine" aria-pressed="false"><span class="n"></span><span class="l">Claude's tasks</span></button>
  </nav>
</div></header>

<main><div class="wrap">
  <div class="chatbar" id="chatbar" hidden>
    <label for="chat">Chat</label>
    <select id="chat"></select>
    <button class="btn ghost quiet" id="rename" type="button" hidden>Rename</button>
  </div>
  <div class="renamebox" id="renamebox" hidden>
    <label class="notelbl" for="newname">New name for this chat</label>
    <input id="newname" maxlength="80" autocomplete="off">
    <div class="actions"><button class="btn" id="rensave" type="button">Save name</button><button class="btn ghost quiet" id="rencancel" type="button">Cancel</button><span class="msg" id="renmsg" role="status"></span></div>
  </div>
  <div id="view"></div>
</div></main>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script>
const TPL = __TPL__;
const DATA = __DATA__;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = (s) => {
  try { if (window.marked) return window.marked.parse(s, { gfm: true, breaks: true }); } catch (e) { /* plain text below */ }
  return "<p>" + esc(s).replace(/\n/g, "<br>") + "</p>";
};
const KIND = { waiting: "Waiting for you", built: "Built, not released", done: "Done", planned: "Planned", answered: "Answered", working: "Working on it" };
const RESET = ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
DATA.answers = DATA.answers || {};
DATA.read = DATA.read || {}; // num -> when tapped, or false for "mark as unread" (moved into the .md by --absorb)
DATA.notes = DATA.notes || {}; // feature id -> {group, name, text, at}: a comment on a backlog feature (printed by --absorb)
DATA.backlog = DATA.backlog || [];
DATA.mine = DATA.mine || [];
DATA.done = DATA.done || {}; // R-31: num -> when he tapped "I've done it", or false for "Not done yet" (moved into the .md by --absorb)
DATA.chatNames = DATA.chatNames || {}; // R-28: chat as in the .md -> the owner's new name (written into the .md by --absorb)
DATA.moves = DATA.moves || {}; // R-81: feature id -> {group, name, to, at}: his "Move to" pick (written into the .md by --absorb)
// R-81: Planned = Claude may build it; Waiting for you = it needs him.
const MOVE_KIND = { "Planned": "planned", "Waiting for you": "waiting", "Idea": "idea", "Not doing": "no" };
const MOVE_LABEL = { "Planned": "Planned: Claude can build it", "Waiting for you": "Waiting for you: needs me", "Idea": "Idea", "Not doing": "Not doing" };
const BL_KIND = { done: "Live", built: "Next release", waiting: "Waiting for you", planned: "Planned", idea: "Idea", no: "Not doing" };
const BL_ORDER = ["waiting", "planned", "idea", "no", "built", "done"];
const SHIPPED = ["done", "built"];
const TABS = ["home", "waiting", "all", "backlog", "mine"];
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const GO = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const chatLabel = (c) => DATA.chatNames[c] || c;

// Storage can be blocked (private window, preview): every read and write is guarded, and the page works without it.
const store = (kind) => ({
  get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window[kind].setItem(k, v); } catch (e) { /* not kept */ } },
  del(k) { try { window[kind].removeItem(k); } catch (e) { /* not kept */ } },
});
const ss = store("sessionStorage"), ls = store("localStorage");
let chat = ls.get("inbox-chat") || "all";
// A fresh visit opens on Home; the tab is kept only across the reload that follows a save.
let filter = ss.get("inbox-tab") || "home";
if (filter === "shipped") filter = "backlog";
if (!TABS.includes(filter)) filter = "home";
let blKind = null; // a status pill tapped in the backlog: only that status (null = everything not built, Built folded)
let blGroup = "all";
let query = "";
const picks = {}; // num -> {qIndex: key}
try { Object.assign(picks, JSON.parse(ss.get("inbox-picks") || "{}")); } catch (e) { /* none kept */ }
const keepPicks = () => ss.set("inbox-picks", JSON.stringify(picks));
const keepTab = () => ss.set("inbox-tab", filter);
// Which folded "done" boxes are open, so a re-render (and the reload after a save) keeps them as he left them.
const doneOpen = {};
try { Object.assign(doneOpen, JSON.parse(ss.get("inbox-open") || "{}")); } catch (e) { /* all folded */ }
const keepPlace = () => { ss.set("inbox-y", String(Math.round(scrollY))); ss.set("inbox-open", JSON.stringify(doneOpen)); };
const stamp = () => new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The page rebuilt from its template and its data: what a save publishes (never the live DOM).
const enc = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
// The two markers are spelled in pieces here, so filling the template never touches this code.
const MARK_TPL = "__" + "TPL__", MARK_DATA = "__" + "DATA__";
const pageHtml = () => '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET +
  "</style></head><body>" + TPL.replace(new RegExp(MARK_TPL + "|" + MARK_DATA, "g"), (m) => (m === MARK_TPL ? enc(TPL) : enc(DATA))) + "</body></html>";

// #21: "Waiting for you" = a question still to answer, or a task of his; "To read" = an entry not read yet.
// Sending an answer or a reply counts as read.
const sentOf = (e) => DATA.answers[e.num];
const isRead = (e) => Boolean(sentOf(e)) || (e.num in DATA.read ? Boolean(DATA.read[e.num]) : Boolean(e.read));
const needsAnswer = (e) => e.decides.length > 0 && !sentOf(e);
// R-31: tasks waiting on the owner sit under "Waiting for you" next to his decisions.
const tasksOf = (e) => e.tasks || [];
const taskDone = (e) => (e.num in DATA.done ? Boolean(DATA.done[e.num]) : Boolean(e.taskDone));
const needsTask = (e) => tasksOf(e).length > 0 && !taskDone(e);
const needsYou = (e) => needsAnswer(e) || needsTask(e);
// R-173 (owner, 29 Oct 2026): one topic, one place. A backlog row that names "#n" is that question's feature.
// If the feature waits for him, the question lives under Waiting for you (not in Q&A), and the feature is not shown
// a second time. Every question card says where its topic stands in the backlog.
let featMap = null;
const featsOf = (e) => {
  if (!featMap) {
    featMap = {};
    DATA.backlog.forEach((f, i) => (String(f.details + " " + f.how).match(/#(\d{1,4})\b/g) || []).forEach((m) => {
      const n = Number(m.slice(1)); (featMap[n] = featMap[n] || []).push({ f, i });
    }));
  }
  return featMap[e.num] || [];
};
const topicWait = (e) => !needsYou(e) && featsOf(e).some((x) => x.f.kind === "waiting");
const inWaiting = (e) => needsYou(e) || topicWait(e);
const featCovered = (f) => numsIn(f.details + " " + f.how).some((n) => inWaiting(entryOf(n)));
const backlogChips = (e) => {
  const xs = featsOf(e);
  if (!xs.length) return e.kind === "done" ? "" : '<p class="waits">Not in the feature backlog yet: still a discussion.</p>';
  return '<p class="waits">In the backlog: ' + xs.map(({ f }) => '<a class="chipnum" href="#" data-feat="' + esc(f.id) + '"><b>' + esc(f.status) + "</b>" +
    esc(f.name.length > 34 ? f.name.slice(0, 32).replace(/\s+\S*$/, "") + "…" : f.name) + "</a>").join("") + "</p>";
};
const toRead = (e) => !inWaiting(e) && !isRead(e);
const inChat = (e) => chat === "all" || e.chat === chat;
const byNum = (a, b) => b.num - a.num;
// R-172 (owner, 29 Oct 2026): a question he replied to is a thread. When Claude answers his follow-up it jumps to
// the top of Questions & answers, tagged with the reply count; threads from the last 3 days stay on top.
const THREAD_DAYS = 3;
const threadAnswered = (e) => Boolean(e.thread && e.thread.answered);
const threadNew = (e) => threadAnswered(e) && !isRead(e);
const threadWaiting = (e) => Boolean(e.thread && !e.thread.answered) && !sentOf(e);
const threadRecent = (e) => Boolean(e.thread && e.thread.last) && (Date.now() - Date.parse(e.thread.last + "T00:00:00")) / 864e5 <= THREAD_DAYS;
const onTop = (e) => threadRecent(e) && (threadAnswered(e) || threadWaiting(e));
const byThread = (a, b) => (threadNew(b) - threadNew(a)) || (threadWaiting(b) - threadWaiting(a)) || String(b.thread.last).localeCompare(String(a.thread.last)) || byNum(a, b);
const threadTag = (e) => threadNew(e)
  ? '<span class="tag act">New answer' + (e.thread.replies > 1 ? " · reply " + e.thread.replies : " to your reply") + "</span>"
  : threadWaiting(e) ? '<span class="tag new">Claude is answering your reply</span>'
  : threadRecent(e) && threadAnswered(e) ? '<span class="tag new">Your thread · ' + e.thread.replies + (e.thread.replies > 1 ? " replies" : " reply") + "</span>" : "";
const entryOf = (n) => DATA.entries.find((x) => x.num === n);
const maxNum = DATA.entries.reduce((m, e) => Math.max(m, e.num), 0);
// Features waiting for the owner also show in "Waiting for you" (owner, 18 Oct).
const waitingFeats = () => DATA.backlog.map((f, i) => ({ f, i })).filter((x) => x.f.kind === "waiting" && !DATA.notes[x.f.id] && !featCovered(x.f));
const inTab = (f, tab) => (tab === "shipped") === SHIPPED.includes(f.kind);
// R-33 / R-84: Claude's tasks in the order Doing, Blocked (waits for you), To do, Done.
const taskKind = (t) => { const s = String(t.status).toLowerCase(); return s.startsWith("done") ? "done" : s.startsWith("doing") ? "doing" : s.startsWith("blocked") ? "blocked" : "todo"; };
const mineAll = () => DATA.mine.map((t, i) => ({ t, i, k: taskKind(t) }));
// R-96: a pending item's prio is [impact, effort] (High / Medium / Low). The Sort picker orders the four list tabs;
// rated items come first, unrated ones after them in their usual order. The choice is kept on this phone.
const LV = { High: 3, Medium: 2, Low: 1 };
const SORTS = { best: "Best first (high impact, low effort)", impact: "Biggest impact first", quick: "Quickest first", order: "Original order" };
let sortBy = ls.get("inbox-sort");
if (!(sortBy in SORTS)) sortBy = "best";
const priKey = (p) => !p ? null : sortBy === "best" ? [LV[p[0]] - LV[p[1]], LV[p[0]]] : sortBy === "impact" ? [LV[p[0]], -LV[p[1]]] : [-LV[p[1]], LV[p[0]]];
const byPrio = (get, fallback) => (a, b) => {
  if (sortBy === "order") return fallback(a, b);
  const ka = priKey(get(a)), kb = priKey(get(b));
  if (!ka || !kb) return (kb ? 1 : 0) - (ka ? 1 : 0) || fallback(a, b);
  return kb[0] - ka[0] || kb[1] - ka[1] || fallback(a, b);
};
const priHtml = (p) => p ? '<span class="pri i' + LV[p[0]] + '">Impact ' + p[0] + '</span><span class="pri e' + LV[p[1]] + '">Effort ' + p[1] + "</span>" : "";
const sortHtml = () => '<div class="sortbar"><div class="selrow"><label for="sortby">Sort</label><select id="sortby">' +
  Object.keys(SORTS).map((k) => '<option value="' + k + '"' + (k === sortBy ? " selected" : "") + ">" + SORTS[k] + "</option>").join("") + "</select></div>" +
  '<p class="legend"><b>Impact</b> = how much it matters to the gym and its members. <b>Effort</b> = time and tokens to build it (your own task: your time). Only open items have them.</p></div>';
const numsIn = (s) => [...new Set((String(s).match(/#(\d{1,4})\b/g) || []).map((x) => Number(x.slice(1))))].filter((n) => entryOf(n));

function shown(e) {
  if (chat !== "all" && e.chat !== chat) return false;
  // R-108 (owner, 24 Oct): Questions & answers holds only answers; anything that needs him (a pick or a task)
  // lives under "Waiting for you" alone.
  if (filter === "all") return !inWaiting(e);
  if (filter === "waiting") return inWaiting(e);
  return true;
}

const plain = (s) => String(s || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|__|`/g, "");
// One short line for a folded card: the start of "My answer", or else the first paragraph (the .md's own words).
function gistOf(e) {
  const lines = e.body.split("\n");
  // R-172: a thread shows my newest answer (the one under his last follow-up), not the first.
  let k = -1;
  lines.forEach((l, j) => { if (/^\*\*My answer[^*]*:\*\*/.test(l)) k = j; });
  if (k < 0) k = lines.findIndex((l) => l.trim() && !/^\*\*(You asked|Details|DECIDED|YOUR REPLY|BUILT)/.test(l));
  if (k < 0) return "";
  const para = [];
  for (let j = k; j < lines.length; j++) {
    const l = lines[j];
    if (j > k && (!l.trim() || /^(\s*[-*] |\*\*|\||>|#)/.test(l))) break;
    para.push(l.trim());
  }
  const s = plain(para.join(" ")).replace(/^My answer[^:]*:\s*/, "");
  return s.length > 240 ? s.slice(0, 237).replace(/\s+\S*$/, "") + "…" : s;
}
// "STEP 1 BUILT, NOT RELEASED (next release)" -> "Step 1 built, not released (next release)"
const softCaps = (s) => String(s).replace(/^[A-Z0-9][A-Z0-9 ,:;'-]*[A-Z](?![a-z])/, (m) => m.charAt(0) + m.slice(1).toLowerCase());
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");

function answerText(e, a) {
  const lines = a.picks.map((p) => "- " + p.q + ": " + p.key + " (" + p.text + ")");
  const skipped = e.decides.filter((d) => !a.picks.some((p) => p.q === d.q)).map((d) => "- " + d.q + ": no pick yet");
  const note = a.note ? [(e.decides.length ? "Note: " : "Reply: ") + a.note] : [];
  return ["Owner inbox #" + e.num + " (" + e.title + "):", ...lines, ...skipped, ...note].join("\n");
}
function sentHtml(e, sent) {
  return '<div class="sentbox"><p class="sentline">' + CHECK + "Sent " + esc(sent.at) + "</p>" +
    (sent.picks.length ? '<ul class="sentpicks">' + sent.picks.map((p) => "<li><b>" + esc(p.key) + "</b>" + esc(p.text) +
      (e.decides.length > 1 ? ' <span class="small">(' + esc(p.q) + ")</span>" : "") + "</li>").join("") + "</ul>" : "") +
    (sent.note ? '<p class="sentnote">' + (e.decides.length ? "Your comment: " : "Your reply: ") + esc(sent.note) + "</p>" : "") +
    '<p class="small">Claude acts on it the next time it opens your tracker.</p>' +
    '<div class="actions"><button class="btn ghost" data-act="change" data-n="' + e.num + '">' + (e.decides.length ? "Change my answer" : "Write it again") + "</button></div></div>";
}
function formHtml(e) {
  const sent = sentOf(e);
  if (sent) return sentHtml(e, sent);
  if (!e.decides.length) {
    return '<div class="form">' +
      '<label class="notelbl" for="note' + e.num + '">Ask a follow-up, disagree, or add something</label>' +
      '<textarea id="note' + e.num + '" rows="3" placeholder="e.g. Good, but also show it on the watch"></textarea>' +
      '<div class="actions"><button class="btn" data-act="send" data-n="' + e.num + '">Send to Claude</button><span class="msg" id="msg' + e.num + '" role="status"></span></div></div>';
  }
  const mine = picks[e.num] || {};
  const recs = e.decides.map((d) => d.opts.find((o) => o.rec));
  const canAgree = recs.every(Boolean) && !Object.keys(mine).length;
  return '<div class="form">' + e.decides.map((d, qi) =>
    "<fieldset><legend>" + esc(d.q) + "</legend>" + d.opts.map((o) =>
      '<label class="opt' + (mine[qi] === o.key ? " on" : "") + '"><input type="radio" name="q' + e.num + "_" + qi + '" value="' + o.key + '"' +
      (mine[qi] === o.key ? " checked" : "") + ' data-n="' + e.num + '" data-q="' + qi + '"><span class="key">' + o.key + "</span><span>" + esc(o.text) +
      (o.rec ? ' <em class="rec">my pick</em>' : "") + "</span></label>").join("") + "</fieldset>").join("") +
    '<label class="notelbl" for="note' + e.num + '">Comment (optional). You can send just a comment, without picking. Tap a picked answer again to undo it.</label>' +
    '<textarea id="note' + e.num + '" rows="2" placeholder="e.g. Yes, but keep it free for members"></textarea>' +
    '<div class="actions"><button class="btn" data-act="send" data-n="' + e.num + '">Send to Claude</button>' +
    (recs.every(Boolean) ? '<button class="btn ghost" data-act="agree" data-n="' + e.num + '"' + (canAgree ? "" : " hidden") + ">Agree with my pick" +
      (recs.length === 1 ? " (" + recs[0].key + ")" : "s") + "</button>" : "") +
    '<span class="msg" id="msg' + e.num + '" role="status"></span></div></div>';
}
function taskHtml(e) {
  if (!tasksOf(e).length) return "";
  const done = taskDone(e);
  const when = e.num in DATA.done ? DATA.done[e.num] : e.taskDone;
  return '<div class="taskbox' + (done ? " done" : "") + '"><p class="tl">' + (done ? "Done" + (when ? " " + esc(when) : "") + ". Thank you." : "Your task" + (tasksOf(e).length > 1 ? "s" : "")) + "</p>" +
    "<ol>" + tasksOf(e).map((t) => "<li>" + md(t).replace(/^<p>|<\/p>\s*$/g, "") + "</li>").join("") + "</ol>" +
    '<div class="actions">' + (done
      ? '<button class="btn ghost quiet" data-act="undone" data-n="' + e.num + '">Not done yet</button>'
      : '<button class="btn" data-act="done" data-n="' + e.num + '">I have done it</button>') +
    '<span class="msg" id="tmsg' + e.num + '" role="status"></span></div></div>';
}
function readHtml(e) {
  if (sentOf(e) || needsYou(e)) return "";
  return isRead(e)
    ? '<button class="btn ghost quiet readbtn" data-act="unread" data-n="' + e.num + '">Mark as unread</button>'
    : '<button class="btn ghost readbtn" data-act="read" data-n="' + e.num + '">Mark as read</button>';
}
const pbtn = (id, label) => '<button type="button" class="fbtn" data-act="panel" data-p="fp' + id + '" aria-expanded="false" aria-controls="fp' + id + '">' + label + CHEV + "</button>";
function card(e) {
  const sent = sentOf(e);
  const tag = needsAnswer(e) ? '<span class="tag act">To answer</span>' : needsTask(e) ? '<span class="tag act">To do</span>'
    : threadTag(e) || (!isRead(e) ? '<span class="tag new">New</span>' : "");
  const pill = sent ? '<span class="status k-done">' + (e.decides.length ? "Answer sent" : "Reply sent") + "</span>"
    : needsYou(e) ? "" : '<span class="status k-' + e.kind + '">' + KIND[e.kind] + "</span>";
  const showStatus = e.status && norm(e.status) !== norm(KIND[e.kind]) && !["answered", "done", "waitingforyou"].includes(norm(e.status));
  const gist = gistOf(e);
  const act = taskHtml(e) + (e.decides.length || sent ? formHtml(e) : "");
  const fold = filter === "all" && !query && needsYou(e);
  return '<article id="e' + e.num + '"><div class="ch"><span class="num">#' + e.num + "</span><div><h3>" + esc(e.title) + "</h3>" +
    '<p class="meta">' + tag + pill + (needsYou(e) ? priHtml(e.prio) : "") + "<span>" + esc(e.date) + "</span>" +
    (e.chatUrl ? '<a href="' + esc(e.chatUrl) + '" target="_blank" rel="noopener">' + esc(chatLabel(e.chat)) + "</a>" : "<span>" + esc(chatLabel(e.chat)) + "</span>") + "</p>" +
    (showStatus ? '<p class="statusline">' + esc(softCaps(e.status)) + "</p>" : "") +
    backlogChips(e) + (gist ? '<p class="gist">' + esc(gist) + "</p>" : "") + "</div></div>" +
    '<div class="cb">' + (fold ? "" : act) +
    '<div class="fbar">' + (fold ? pbtn("act" + e.num, needsAnswer(e) ? "Answer it" : "Your task" + (tasksOf(e).length > 1 ? "s" : "")) : "") + pbtn("full" + e.num, e.decides.length ? "The full question and my answer" : tasksOf(e).length ? "Why" : "Read the full answer") +
    (e.decides.length || sent ? "" : pbtn("reply" + e.num, "Reply")) + readHtml(e) + "</div>" +
    '<span class="msg" id="rmsg' + e.num + '" role="status"></span>' +
    (fold ? '<div class="fpanel" id="fpact' + e.num + '" hidden>' + act + "</div>" : "") +
    '<div class="fpanel full" id="fpfull' + e.num + '" data-n="' + e.num + '" hidden><div class="body"></div></div>' +
    (e.decides.length || sent ? "" : '<div class="fpanel" id="fpreply' + e.num + '" hidden>' + formHtml(e) + "</div>") + "</div></article>";
}
// The .md wraps its lines at about 110 characters: join a wrapped line to the one before it, so a sentence
// never breaks in the middle on a phone. A list, a bold label line, a table, a quote or a heading still starts a new line.
function unwrap(s) {
  const out = [];
  let fence = false;
  String(s).split("\n").forEach((l) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const prev = out[out.length - 1];
    if (!fence && out.length && prev.trim() && l.trim() && !/^\s*```/.test(prev) && !/^\s*\|/.test(prev) &&
        !/^\s*([-*+] |\d+[.)] |\*\*|\||>|#)/.test(l)) out[out.length - 1] = prev.replace(/\s+$/, "") + " " + l.trim();
    else out.push(l);
  });
  return out.join("\n");
}
// The long answer is drawn only when opened: the page stays quick with 50 entries.
function fillBody(d) {
  const body = d.querySelector(".body");
  if (!body || body.dataset.filled) return;
  const e = entryOf(Number(d.dataset.n));
  if (!e) return;
  // R-174 (owner, 29 Oct 2026): on a thread, his last follow-up and my answer under it are highlighted.
  const text = unwrap(e.body), k = e.thread ? text.lastIndexOf("**YOUR REPLY") : -1;
  body.innerHTML = k < 0 ? md(text) : md(text.slice(0, k)) +
    '<section class="latest" aria-label="Latest on this thread"><p class="latestlbl">Latest on this thread' +
    (e.thread.replies > 1 ? " · reply " + e.thread.replies : "") + "</p>" + md(text.slice(k)) + "</section>";
  body.dataset.filled = "1";
  enhance(body);
}
const doneBox = (key, label, inner) => inner
  ? '<details class="donebox" data-box="' + key + '"' + (doneOpen[key] ? " open" : "") + "><summary>" + esc(label) + CHEV + '</summary><div class="stack">' + inner + "</div></details>"
  : "";
const empty = (title, line) => '<div class="empty"><p><b>' + esc(title) + "</b></p>" + (line ? "<p>" + esc(line) + "</p>" : "") + "</div>";
const rowEntry = (e, sub) => '<li><a class="row" href="#e' + e.num + '" data-goto="' + e.num + '"><span class="rn">#' + e.num + '</span><span class="rb"><span class="rt">' + esc(e.title) + "</span>" +
  (sub ? '<span class="rs">' + sub + "</span>" : "") + "</span>" + GO + "</a></li>";
const rowFeat = (f, sub) => '<li><a class="row" href="#" data-feat="' + esc(f.id) + '"><span class="rn"></span><span class="rb"><span class="rt">' + esc(f.name) + "</span>" +
  '<span class="rs">' + (sub || '<span class="status k-' + f.kind + '">' + esc(f.status) + "</span> " + esc(f.group)) + "</span></span>" + GO + "</a></li>";
const rowTask = (x, sub) => '<li><a class="row" href="#" data-task="' + x.i + '"><span class="rn"></span><span class="rb"><span class="rt">' + esc(x.t.task) + "</span>" +
  '<span class="rs">' + (sub || '<span class="status k-' + x.k + '">' + esc(x.t.status) + "</span>") + "</span></span>" + GO + "</a></li>";
const rows = (items, cap) => {
  if (!cap || items.length <= cap + 2) return '<ul class="rows">' + items.join("") + "</ul>";
  return '<ul class="rows">' + items.slice(0, cap).join("") + '</ul><details class="morelist"><summary>' + (items.length - cap) + " more" + CHEV + '</summary><ul class="rows">' + items.slice(cap).join("") + "</ul></details>";
};

// ---- What changed since he last looked (kept on this phone only; a new visit = 30 minutes since the last open) ----
const snapNow = () => {
  const s = { e: {}, f: {}, t: {} };
  DATA.entries.forEach((e) => { s.e[e.num] = [e.status, e.decides.length, tasksOf(e).length]; });
  DATA.backlog.forEach((f) => { s.f[f.id] = f.status; });
  DATA.mine.forEach((t) => { s.t[t.task] = t.status; });
  return s;
};
let seen = null, firstVisit = false;
(function trackVisit() {
  const now = Date.now(), cur = snapNow();
  try { seen = JSON.parse(ls.get("inbox-seen") || "null"); } catch (e) { seen = null; }
  if (!seen || !seen.base || !seen.last) { seen = { base: cur, baseAt: now, last: cur, lastAt: now }; firstVisit = true; }
  else if (now - seen.lastAt > 30 * 60 * 1000) { seen.base = seen.last; seen.baseAt = seen.lastAt; }
  seen.last = cur; seen.lastAt = now;
  ls.set("inbox-seen", JSON.stringify(seen));
})();
function changes() {
  const base = seen.base, out = [];
  DATA.entries.slice().sort(byNum).forEach((e) => {
    const was = base.e[e.num];
    if (!was) out.push({ w: 0, html: rowEntry(e, '<span class="tag new">New</span>') });
    else if (e.decides.length > was[1]) out.push({ w: 0, html: rowEntry(e, '<span class="tag act">New question</span>') });
    else if (tasksOf(e).length > was[2]) out.push({ w: 1, html: rowEntry(e, '<span class="tag act">New task for you</span>') });
    else if (e.status !== was[0]) out.push({ w: 1, html: rowEntry(e, "Now: " + esc(softCaps(e.status))) });
  });
  DATA.backlog.forEach((f) => {
    if (DATA.moves[f.id]) return; // his own move is not news to him
    const was = base.f[f.id];
    if (was === undefined) out.push({ w: 2, html: rowFeat(f, 'Added: <span class="status k-' + f.kind + '">' + esc(f.status) + "</span>") });
    else if (was !== f.status) out.push({ w: SHIPPED.includes(f.kind) ? 1 : 2, html: rowFeat(f, esc(was) + ' &rarr; <span class="status k-' + f.kind + '">' + esc(f.status) + "</span>") });
  });
  mineAll().forEach((x) => {
    const was = base.t[x.t.task];
    if (was === undefined) out.push({ w: 3, html: rowTask(x, "New task for Claude") });
    else if (was !== x.t.status) out.push({ w: 3, html: rowTask(x, esc(was) + ' &rarr; <span class="status k-' + x.k + '">' + esc(x.t.status) + "</span>") });
  });
  return out.sort((a, b) => a.w - b.w).map((x) => x.html);
}
const since = (t) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const updatedText = () => (DATA.updatedIso ? since(DATA.updatedIso) : DATA.updated);

// ---- Tabs ----
function homeHtml() {
  const qs = DATA.entries.filter(needsAnswer).sort(byNum), ts = DATA.entries.filter(needsTask).sort(byNum);
  const fresh = DATA.entries.filter(toRead).sort(byNum), mine = mineAll();
  const doing = mine.filter((x) => x.k === "doing"), blocked = mine.filter((x) => x.k === "blocked");
  const parts = [];
  if (qs.length) parts.push("<b>" + qs.length + (qs.length === 1 ? " question" : " questions") + "</b>");
  if (ts.length) parts.push("<b>" + ts.length + (ts.length === 1 ? " task" : " tasks") + "</b>");
  const ch = changes();
  return '<div class="home"><h2 class="sr">Home</h2>' +
    '<p class="lead">' + (parts.length ? parts.join(" and ") + " wait for you." : "Nothing waits for you right now.") + "</p>" +
    '<div class="actions">' + (qs.length ? '<button class="btn" data-tab="waiting" data-sec="sec-q">Answer questions</button>' : "") +
    (ts.length ? '<button class="btn ghost" data-tab="waiting" data-sec="sec-t">Your tasks</button>' : "") +
    (fresh.length ? '<button class="btn ghost" data-tab="all">Read ' + fresh.length + " new</button>" : "") + "</div>" +
    '<h3 class="grp">Since you last looked' + (ch.length ? ' <span class="cnt">' + ch.length + "</span>" : "") + "</h3>" +
    (firstVisit ? empty("First visit on this phone.", "From your next visit, this lists what changed: new answers, new questions, features that went live.")
      : ch.length ? rows(ch, 6) + '<div class="actions" style="margin-top:8px"><button class="btn ghost quiet" data-act="seen">Clear this list</button></div>'
      : empty("Nothing changed since " + since(seen.baseAt) + ".")) +
    '<h3 class="grp">Questions for you <span class="cnt">' + qs.length + "</span></h3>" +
    (qs.length ? rows(qs.map((e) => rowEntry(e)), 6) : empty("No questions wait for you.")) +
    (fresh.length ? '<h3 class="grp">New answers to read <span class="cnt">' + fresh.length + "</span></h3>" + rows(fresh.map((e) => rowEntry(e)), 6) : "") +
    '<h3 class="grp">Claude is working on</h3>' +
    (doing.length ? rows(doing.map((x) => rowTask(x, esc(x.t.details.length > 160 ? x.t.details.slice(0, 157).replace(/\s+\S*$/, "") + "…" : x.t.details)))) : empty("Nothing marked Doing right now.")) +
    (blocked.length ? '<p class="hint"><a href="#" data-tab="mine">' + blocked.length + " of Claude's tasks wait for you</a>: each names the # it waits on.</p>" : "") +
    '<p class="foot">Updated ' + esc(updatedText()) + ". Type a number in the box at the top (for example 51) to jump to it, or a word to search everything.</p></div>";
}
function waitingHtml() {
  const list = DATA.entries.filter(shown).sort(byNum);
  const qs = list.filter(needsAnswer).sort(byPrio((e) => e.prio, byNum)), ts = list.filter(needsTask).sort(byPrio((e) => e.prio, byNum));
  const tops = list.filter(topicWait).sort(byNum);
  const feats = waitingFeats().sort(byPrio((x) => x.f.prio, (a, b) => a.i - b.i));
  // Done (folded below): decisions already answered, tasks done, feature yes/no's sent.
  // R-173: answered questions and done tasks live in Q&A only (one topic, one place); here only feature replies just sent.
  const doneList = [];
  const sentFeats = DATA.backlog.map((f, i) => ({ f, i })).filter((x) => x.f.kind === "waiting" && DATA.notes[x.f.id]);
  let out = '<div class="tabhead"><h2>Waiting for you</h2></div>' +
    '<p class="hint">A question: tap an answer, then Send. A task: do it, then tap “I have done it”. Or tell me in chat, for example “49: A”.</p>' + sortHtml();
  if (!qs.length && !ts.length && !tops.length && !feats.length) out += '<div style="margin-top:14px">' + empty("Nothing waits for you.", "When I need a decision or a step from you, it shows up here first.") + "</div>";
  // R-83: the open questions by number first (tap = jump), then the questions, the tasks, the features.
  if (qs.length) out += '<nav class="qindex" aria-label="Questions for you">' + rows(qs.map((e) => rowEntry(e))) + "</nav>" +
    '<h3 class="grp" id="sec-q">Questions for you <span class="cnt">' + qs.length + '</span></h3><div class="stack">' + qs.map(card).join("") + "</div>";
  if (ts.length) out += '<h3 class="grp" id="sec-t">Tasks for you <span class="cnt">' + ts.length + '</span></h3><div class="stack">' + ts.map(card).join("") + "</div>";
  if (tops.length) out += '<h3 class="grp" id="sec-w">Topics waiting for you <span class="cnt">' + tops.length + "</span></h3>" +
    '<p class="hint" style="margin:-4px 0 10px">We discussed these; the feature now needs your yes, money or a step. Tap the backlog chip to answer there.</p>' +
    '<div class="stack">' + tops.map(card).join("") + "</div>";
  if (feats.length) out += '<h3 class="grp" id="sec-f">Features waiting for you <span class="cnt">' + feats.length + "</span></h3>" +
    '<p class="hint" style="margin:-4px 0 10px">Each needs you: an answer, a yes, a purchase or a setup step. Open “Comment” and tell me, for example “Yes, go ahead” or “Not now”.</p>' +
    feats.map(({ f, i }) => featHtml(f, i)).join("");
  const n = doneList.length + sentFeats.length;
  if (n) out += doneBox("waiting", "Answered and done (" + n + ")", doneList.map(card).join("") + sentFeats.map(({ f, i }) => featHtml(f, i)).join(""));
  return out;
}
function qaHtml() {
  // R-96: open questions and tasks first, in the Sort order; then new answers; then the rest by number.
  const sorted = DATA.entries.filter(shown).sort(byPrio((e) => (needsYou(e) ? e.prio : null), (a, b) => (toRead(b) - toRead(a)) || byNum(a, b)));
  const isDone = (e) => isRead(e) && !needsYou(e);
  const top = sorted.filter(onTop).sort(byThread), rest = sorted.filter((e) => !onTop(e));
  const list = rest.filter((e) => !isDone(e)), doneList = rest.filter(isDone);
  const fresh = sorted.filter(toRead);
  const topHtml = top.length ? '<h3 class="grp">Your follow-ups <span class="cnt">' + top.length + "</span></h3>" +
    '<div class="stack">' + top.map(card).join("") + "</div>" + '<h3 class="grp">Other answers</h3>' : "";
  return '<div class="tabhead"><h2>Questions &amp; answers</h2>' +
    (fresh.length > 1 ? '<button class="btn ghost" data-act="readall">Mark all ' + fresh.length + " as read</button>" : "") + "</div>" +
    '<span class="msg" id="rallmsg" role="status"></span>' +
    '<p class="hint">' + "Questions you replied to sit on top; “New answer” means I answered your follow-up. Then other answers, new ones first. Anything you need to pick or do is under Waiting for you." +
    " Open one with “Read the full answer”; tap “Mark as read” when you are done with it.</p>" + sortHtml() + topHtml +
    '<div class="stack" style="margin-top:14px">' + (list.length ? list.map(card).join("") : empty("Nothing new: everything is read.", "Read answers are folded below.")) + "</div>" +
    doneBox("all", "Already read (" + doneList.length + ")", doneList.map(card).join(""));
}
function noteText(f, text) { return "Owner inbox feature backlog: " + f.group + " / " + f.name + ": " + text; }
function featHtml(f, i, withGroup) {
  const sent = DATA.notes[f.id], mv = DATA.moves[f.id], canMove = !SHIPPED.includes(f.kind);
  const btn = (k, label) => '<button type="button" class="fbtn" data-act="panel" data-p="fp' + k + i + '" aria-expanded="false" aria-controls="fp' + k + i + '">' + label + CHEV + "</button>";
  const pri = canMove && f.kind !== "no" ? priHtml(f.prio) : "";
  return '<div class="feat" id="f' + i + '"><div class="fh"><h4 class="name">' + esc(f.name) + '</h4><span class="status k-' + f.kind + '">' + esc(f.status) + "</span></div>" +
    (pri || withGroup ? '<p class="pris">' + pri + (withGroup ? "<span>" + esc(f.group) + "</span>" : "") + "</p>" : "") +
    '<p class="det">' + esc(f.details) + "</p>" +
    (mv ? '<p class="moved">Moved here by you, ' + esc(mv.at) + ".</p>" : "") +
    (sent ? '<div class="sentbox"><p class="sentline">' + CHECK + "Comment sent " + esc(sent.at) + '</p><p class="sentnote">' + esc(sent.text) + "</p>" +
      '<p class="small">Claude acts on it the next time it opens your tracker.</p><div class="actions"><button class="btn ghost" data-act="renote" data-i="' + i + '">Write another</button></div></div>' : "") +
    '<div class="fbar">' + (f.how ? btn("how", "How it will work") : "") + (canMove ? btn("move", "Move to") : "") + (sent ? "" : btn("note", "Comment")) + "</div>" +
    (f.how ? '<div class="fpanel" id="fphow' + i + '" hidden><p class="how"><b>How it will work:</b> ' + esc(f.how) + "</p></div>" : "") +
    (canMove ? '<div class="fpanel" id="fpmove' + i + '" hidden><div class="actions">' +
      Object.keys(MOVE_KIND).filter((to) => to !== f.status).map((to) =>
        '<button class="btn ghost" data-act="move" data-i="' + i + '" data-to="' + esc(to) + '">' + esc(MOVE_LABEL[to]) + "</button>").join("") +
      '<span class="msg" id="mmsg' + i + '" role="status"></span></div></div>' : "") +
    (sent ? "" : '<div class="fpanel" id="fpnote' + i + '" hidden><div class="form"><label class="notelbl" for="fnote' + i + '">Your comment on ' + esc(f.name) + "</label>" +
      '<textarea id="fnote' + i + '" rows="2" placeholder="e.g. Do this one first, members keep asking"></textarea>' +
      '<div class="actions"><button class="btn" data-act="fnote" data-i="' + i + '">Send to Claude</button><span class="msg" id="fmsg' + i + '" role="status"></span></div></div></div>') +
    "</div>";
}
function groupedHtml(items) {
  const count = {};
  items.forEach(({ f }) => { count[f.group] = (count[f.group] || 0) + 1; });
  let out = "", group = null;
  items.forEach(({ f, i }) => {
    if (f.group !== group) { group = f.group; out += '<h3 class="grp">' + esc(group) + ' <span class="cnt">' + count[group] + "</span></h3>"; }
    out += featHtml(f, i);
  });
  return out;
}
function backlogHtml() {
  const all = DATA.backlog.map((f, i) => ({ f, i }));
  const head = '<div class="tabhead"><h2>Feature backlog</h2></div>';
  if (!all.length) return head + '<div style="margin-top:14px">' + empty("Nothing here yet.", "Features show up here once you confirm them.") + "</div>";
  const groups = [...new Set(all.map((x) => x.f.group))];
  if (blGroup !== "all" && !groups.includes(blGroup)) blGroup = "all";
  const inGroup = all.filter((x) => blGroup === "all" || x.f.group === blGroup);
  const counts = {};
  inGroup.forEach((x) => { counts[x.f.kind] = (counts[x.f.kind] || 0) + 1; });
  if (blKind && !counts[blKind]) blKind = null;
  const toBuild = inGroup.filter((x) => !SHIPPED.includes(x.f.kind)).length;
  const rank = (x) => BL_ORDER.indexOf(x.f.kind);
  // Within a group, what needs him first, then Planned, Idea, Not doing (the .md order kept inside each).
  const sortIn = (xs) => xs.slice().sort((a, b) => groups.indexOf(a.f.group) - groups.indexOf(b.f.group) || rank(a) - rank(b) || a.i - b.i);
  const filters = '<div class="filters"><div class="pills" role="group" aria-label="Show features by status">' +
    '<button type="button" class="pill" data-act="blk" data-k="" aria-pressed="' + !blKind + '">Not built yet <b>' + toBuild + "</b></button>" +
    BL_ORDER.filter((k) => counts[k]).map((k) => '<button type="button" class="pill k-' + k + '" data-act="blk" data-k="' + k + '" aria-pressed="' + (blKind === k) + '"><span class="dot"></span>' + BL_KIND[k] + " <b>" + counts[k] + "</b></button>").join("") +
    "</div>" +
    '<div class="selrow"><label for="blgroup">Group</label><select id="blgroup"><option value="all">All groups (' + all.length + ")</option>" +
    groups.map((g) => '<option value="' + esc(g) + '"' + (g === blGroup ? " selected" : "") + ">" + esc(g) + " (" + all.filter((x) => x.f.group === g).length + ")</option>").join("") + "</select></div>" +
    '<p class="legend"><b>Planned</b> = Claude builds it, no need to ask you. <b>Waiting for you</b> = needs your answer, a yes, money or a setup step. Open “Move to” on a feature to change it.</p></div>' + sortHtml();
  // R-96: a Sort other than "Original order" lists the features not built as one list (each card names its group).
  const listed = (xs) => sortBy === "order" ? groupedHtml(sortIn(xs))
    : '<div style="margin-top:14px">' + sortIn(xs).sort(byPrio((x) => (x.f.kind === "no" ? null : x.f.prio), () => 0)).map(({ f, i }) => featHtml(f, i, true)).join("") + "</div>";
  if (blKind) return head + filters + (SHIPPED.includes(blKind) ? groupedHtml(sortIn(inGroup.filter((x) => x.f.kind === blKind))) : listed(inGroup.filter((x) => x.f.kind === blKind)));
  const built = inGroup.filter((x) => SHIPPED.includes(x.f.kind));
  const pending = inGroup.filter((x) => !SHIPPED.includes(x.f.kind));
  return head + filters + (pending.length ? listed(pending) : '<div style="margin-top:14px">' + empty("Everything in this group is built.") + "</div>") +
    doneBox("built", "Built (" + built.length + "): live, or in the next release", groupedHtml(sortIn(built)));
}
function taskRow(x) {
  const waits = x.k === "blocked" ? numsIn(x.t.details) : [];
  const pri = x.k === "done" ? "" : priHtml(x.t.prio);
  return '<div class="feat task" id="t' + x.i + '"><div class="fh"><h4 class="name">' + esc(x.t.task) + '</h4><span class="status k-' + x.k + '">' + esc(x.t.status) + "</span></div>" +
    (pri ? '<p class="pris">' + pri + "</p>" : "") +
    (waits.length ? '<p class="waits">Waits for ' + waits.map((n) => '<a class="chipnum" href="#e' + n + '" data-goto="' + n + '"><b>#' + n + "</b>" + esc(entryOf(n).title.length > 34 ? entryOf(n).title.slice(0, 32).replace(/\s+\S*$/, "") + "…" : entryOf(n).title) + "</a>").join("") + "</p>" : "") +
    (x.t.details ? '<p class="det">' + esc(x.t.details) + "</p>" : "") + "</div>";
}
function mineHtml() {
  const mine = mineAll();
  const head = '<div class="tabhead"><h2>Claude’s tasks</h2></div><p class="hint">What I do myself. Blocked ones wait for you: tap the # to answer it.</p>' + sortHtml();
  if (!mine.length) return head + empty("No tasks yet.");
  const sec = (k, title) => { const xs = mine.filter((x) => x.k === k).sort(byPrio((x) => x.t.prio, (a, b) => a.i - b.i)); return xs.length ? '<h3 class="grp">' + title + ' <span class="cnt">' + xs.length + "</span></h3>" + xs.map(taskRow).join("") : ""; };
  const done = mine.filter((x) => x.k === "done");
  return head + sec("doing", "Doing now") + sec("blocked", "Blocked: waits for you") + sec("todo", "To do next") +
    (mine.some((x) => x.k !== "done") ? "" : empty("Nothing open: all my tasks are done.")) +
    doneBox("mine", "Done (" + done.length + ")", done.map(taskRow).join(""));
}

// ---- Search: words across everything, or a number ----
function searchHtml() {
  const q = query.trim();
  const nm = q.match(/^#?(\d{1,4})$/);
  const tokens = nm ? ["#" + Number(nm[1])] : q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (hay) => tokens.every((t) => hay.includes(t));
  const reTok = new RegExp("(" + tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  const snip = (text) => {
    const low = text.toLowerCase(), at = low.indexOf(tokens[0]);
    if (at < 0) return "";
    const from = Math.max(0, at - 50), s = (from ? "…" : "") + text.slice(from, at + 110).replace(/\s+/g, " ") + (at + 110 < text.length ? "…" : "");
    return esc(s).replace(reTok, "<mark>$1</mark>");
  };
  const es = DATA.entries.map((e) => {
    const text = e.title + " " + softCaps(e.status) + " " + e.decides.map((d) => d.q + " " + d.opts.map((o) => o.key + ": " + o.text).join(" ")).join(" ") + " " + tasksOf(e).join(" ") + " " + plain(e.body);
    return { e, text, hay: ("#" + e.num + " " + chatLabel(e.chat) + " " + text).toLowerCase() };
  }).filter((x) => hit(x.hay)).sort((a, b) => (nm ? (b.e.num === Number(nm[1])) - (a.e.num === Number(nm[1])) : 0) || byNum(a.e, b.e));
  const fs = DATA.backlog.map((f, i) => ({ f, i, text: f.name + " " + f.status + " " + f.details + " " + f.how })).filter((x) => hit((x.f.group + " " + x.text).toLowerCase()));
  const ts = mineAll().map((x) => Object.assign(x, { text: x.t.task + " " + x.t.status + " " + x.t.details })).filter((x) => hit(x.text.toLowerCase()));
  const total = es.length + fs.length + ts.length;
  let out = '<div class="tabhead"><h2>Search: “' + esc(q) + '”</h2><button class="btn ghost quiet" data-act="clearq">Clear</button></div>' +
    '<p class="hint">' + (total ? total + " found" + (nm ? ". Press Go to jump to #" + Number(nm[1]) + "." : ".") : "") + "</p>";
  if (!total) return out + '<div style="margin-top:14px">' + empty("Nothing matches.", "Try one word, or a number like 51.") + "</div>";
  const eRow = (x) => rowEntry(x.e, nm && x.e.num === Number(nm[1]) ? '<span class="tag act">Go to #' + x.e.num + "</span>" : snip(x.text));
  const ew = es.filter((x) => needsYou(x.e)), eq = es.filter((x) => !needsYou(x.e));
  if (ew.length) out += '<h3 class="grp">Waiting for you <span class="cnt">' + ew.length + "</span></h3>" + rows(ew.map(eRow), 12);
  if (eq.length) out += '<h3 class="grp">Questions &amp; answers <span class="cnt">' + eq.length + "</span></h3>" + rows(eq.map(eRow), 12);
  if (fs.length) out += '<h3 class="grp">Feature backlog <span class="cnt">' + fs.length + "</span></h3>" +
    rows(fs.map((x) => rowFeat(x.f, '<span class="status k-' + x.f.kind + '">' + esc(x.f.status) + "</span> " + (snip(x.text) || esc(x.f.group)))), 12);
  if (ts.length) out += '<h3 class="grp">Claude’s tasks <span class="cnt">' + ts.length + "</span></h3>" +
    rows(ts.map((x) => rowTask(x, '<span class="status k-' + x.k + '">' + esc(x.t.status) + "</span> " + snip(x.text))), 12);
  return out;
}

// R-83: "#47" written in an answer becomes a jump link to that entry; tables scroll inside their box.
function enhance(root) {
  root.querySelectorAll(".body table").forEach((t) => { if (t.parentElement.classList.contains("tablebox")) return; const box = document.createElement("div"); box.className = "tablebox"; t.replaceWith(box); box.appendChild(t); });
  root.querySelectorAll(".body a, .taskbox a").forEach((a) => { if (!a.dataset.goto) { a.target = "_blank"; a.rel = "noopener"; } });
  root.querySelectorAll("p, li, td").forEach((el) => {
    if (!/#\d/.test(el.textContent) || el.closest(".row, label, .rows, .waits, pre")) return;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) if (/#\d/.test(walk.currentNode.nodeValue) && !walk.currentNode.parentElement.closest("a, code, button")) nodes.push(walk.currentNode);
    nodes.forEach((t) => {
      const span = document.createElement("span");
      span.innerHTML = esc(t.nodeValue).replace(/#(\d{1,4})\b/g, (m, n) => entryOf(Number(n)) ? '<a class="goto" href="#e' + n + '" data-goto="' + n + '">' + m + "</a>" : m);
      t.replaceWith(span);
    });
  });
}
function renderTabs() {
  const ent = DATA.entries.filter(inChat);
  const wait = ent.filter(inWaiting).length + waitingFeats().length, fresh = ent.filter(toRead).length;
  const toBuild = DATA.backlog.filter((f) => !SHIPPED.includes(f.kind)).length;
  const open = mineAll().filter((x) => x.k !== "done").length;
  const set = (f, n, hot, label) => {
    const b = document.querySelector('.tab[data-f="' + f + '"]');
    b.querySelector(".n").textContent = n;
    b.querySelector(".n").classList.toggle("hot", hot);
    b.setAttribute("aria-label", label);
  };
  set("waiting", wait, wait > 0, "Waiting for you: " + wait + " questions and tasks");
  const qa = ent.filter((e) => !inWaiting(e)).length;
  set("all", fresh || qa, fresh > 0, "Questions and answers: " + (fresh ? fresh + " new" : qa + " in all"));
  set("backlog", toBuild, false, "Feature backlog: " + toBuild + " not built yet");
  set("mine", open, false, "Claude's tasks: " + open + " open");
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", String(!query && b.dataset.f === filter)));
}
function render() {
  renderTabs();
  $("chatbar").hidden = Boolean(query) || !(filter === "waiting" || filter === "all");
  if ($("chatbar").hidden) closeRename();
  const v = $("view");
  v.innerHTML = query ? searchHtml() : filter === "home" ? homeHtml() : filter === "waiting" ? waitingHtml() : filter === "all" ? qaHtml() : filter === "backlog" ? backlogHtml() : mineHtml();
  enhance(v);
}

// One save at a time: each one publishes the whole page, and the view reloads after it.
let saving = false;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, 4000);
}
async function save(change, undo, msg, copyText, doneText) {
  if (saving) return;
  saving = true; // before the await, so a second quick tap can't start a second save
  let artifact = null;
  try { artifact = await claude.use("artifact"); } catch (e) { artifact = null; /* quiet: treated as "not available" below */ }
  if (!artifact) { saving = false; showCopy(msg, "Saving isn't available here.", copyText); return; }
  change();
  msg.textContent = "Saving…";
  try {
    keepPlace(); keepTab();
    if (doneText) ss.set("inbox-toast", JSON.stringify({ text: doneText, at: Date.now() }));
    await artifact.publish(pageHtml()); // this view reloads to the saved page
    // If the view has not reloaded (yet), show the saved state here.
    saving = false;
    render();
    if (doneText) toast(doneText);
  } catch (err) {
    ss.del("inbox-toast");
    undo();
    saving = false;
    const code = err && err.code;
    if (code === "conflict") { msg.textContent = "The page changed meanwhile; it is reloading. Try again after it opens."; return; }
    showCopy(msg, code === "not_writer" || code === "not_granted" ? "This view can't save." : "Couldn't save (" + (code || "error") + ").", copyText);
  }
}
function send(n) {
  const e = entryOf(n);
  const mine = picks[n] || {};
  const msg = $("msg" + n);
  const note = ($("note" + n).value || "").trim().slice(0, 2000);
  const chosen = e.decides.map((d, qi) => ({ q: d.q, key: mine[qi], text: (d.opts.find((o) => o.key === mine[qi]) || {}).text || "" })).filter((p) => p.key);
  if (!chosen.length && !note) { msg.textContent = e.decides.length ? "Pick an answer or write a comment first." : "Write your reply first."; return; }
  const answer = { picks: chosen, note, at: stamp() };
  const kept = picks[n];
  save(() => { DATA.answers[n] = answer; delete picks[n]; keepPicks(); },
    () => { delete DATA.answers[n]; if (kept) picks[n] = kept; keepPicks(); }, msg, answerText(e, answer),
    "Sent to Claude: your " + (e.decides.length ? "answer" : "reply") + " to #" + n + ".");
}
function agree(n) {
  const e = entryOf(n);
  picks[n] = {};
  e.decides.forEach((d, qi) => { const r = d.opts.find((o) => o.rec); if (r) picks[n][qi] = r.key; });
  keepPicks();
  send(n);
}
function markDone(n, on) {
  const had = n in DATA.done, before = DATA.done[n];
  const e = entryOf(n);
  save(() => { DATA.done[n] = on ? stamp() : false; }, () => { if (had) DATA.done[n] = before; else delete DATA.done[n]; },
    $("tmsg" + n), "Owner inbox #" + e.num + " (" + e.title + "): " + (on ? "task done" : "task not done yet"), on ? "Marked #" + n + " as done. Thank you." : "#" + n + " is open again.");
}
function renameChat() {
  const msg = $("renmsg");
  const name = ($("newname").value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) { msg.textContent = "Type a name first."; return; }
  if (/https?:/i.test(name) || name.includes("—")) { msg.textContent = "Leave out links and long dashes."; return; }
  if (name === chatLabel(chat)) { closeRename(); return; }
  if (chats.some((c) => c !== chat && chatLabel(c).toLowerCase() === name.toLowerCase())) { msg.textContent = "Another chat already has this name."; return; }
  const raw = chat, had = raw in DATA.chatNames, before = DATA.chatNames[raw];
  save(() => { DATA.chatNames[raw] = name; }, () => { if (had) DATA.chatNames[raw] = before; else delete DATA.chatNames[raw]; },
    msg, 'Owner inbox: rename the chat "' + chatLabel(raw) + '" to "' + name + '"', "Chat renamed.");
}
function markRead(n, on) {
  const had = n in DATA.read, before = DATA.read[n];
  const e = entryOf(n);
  save(() => { DATA.read[n] = on ? stamp() : false; }, () => { if (had) DATA.read[n] = before; else delete DATA.read[n]; },
    $("rmsg" + n), "Owner inbox #" + e.num + " (" + e.title + "): " + (on ? "read" : "mark as unread"), on ? "#" + n + " marked as read." : "#" + n + " marked as unread.");
}
function markAllRead() {
  const fresh = DATA.entries.filter(inChat).filter(toRead);
  const before = {};
  fresh.forEach((e) => { before[e.num] = e.num in DATA.read ? [DATA.read[e.num]] : null; });
  const when = stamp();
  save(() => { fresh.forEach((e) => { DATA.read[e.num] = when; }); },
    () => { fresh.forEach((e) => { if (before[e.num]) DATA.read[e.num] = before[e.num][0]; else delete DATA.read[e.num]; }); },
    $("rallmsg"), "Owner inbox: read " + fresh.map((e) => "#" + e.num).join(", "), fresh.length + " answers marked as read.");
}
function sendNote(i) {
  const f = DATA.backlog[i];
  const msg = $("fmsg" + i);
  const text = ($("fnote" + i).value || "").trim().slice(0, 2000);
  if (!text) { msg.textContent = "Write your comment first."; return; }
  const had = DATA.notes[f.id];
  save(() => { DATA.notes[f.id] = { group: f.group, name: f.name, text, at: stamp() }; },
    () => { if (had) DATA.notes[f.id] = had; else delete DATA.notes[f.id]; }, msg, noteText(f, text), "Comment sent to Claude.");
}
// R-81 (owner, 22 Oct): he moves a feature between statuses himself; --absorb writes it into the .md.
function moveFeature(i, to) {
  const f = DATA.backlog[i];
  const had = DATA.moves[f.id], before = { status: f.status, kind: f.kind };
  save(() => { DATA.moves[f.id] = { group: f.group, name: f.name, to, at: stamp() }; f.status = to; f.kind = MOVE_KIND[to]; },
    () => { if (had) DATA.moves[f.id] = had; else delete DATA.moves[f.id]; f.status = before.status; f.kind = before.kind; },
    $("mmsg" + i), "Owner inbox feature backlog: " + f.group + " / " + f.name + ": move to " + to, "Moved “" + f.name + "” to " + to + ".");
}
function showCopy(msg, why, text) {
  msg.innerHTML = esc(why) + ' Copy it and paste it in the chat instead: <button class="btn ghost" data-act="copy">Copy</button><pre class="copy">' + esc(text) + "</pre>";
}

// ---- Jumping: R-83 "Go to #51" from anywhere: the right tab, all chats, folded boxes opened ----
function openAround(el) { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true; }
function arrive(el) {
  el.setAttribute("tabindex", "-1");
  el.scrollIntoView({ block: "start" });
  el.focus({ preventScroll: true });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
}
function clearQuery() { query = ""; $("find").value = ""; }
function goTo(n) {
  const msg = $("findmsg");
  const e = entryOf(n);
  if (!e) { msg.textContent = n ? "There is no #" + n + ". The newest is #" + maxNum + "." : "Type a number, for example 51."; return; }
  msg.textContent = "";
  clearQuery();
  chat = "all"; $("chat").value = "all"; syncRename();
  filter = inWaiting(e) ? "waiting" : "all"; blKind = null; keepTab();
  render();
  // In Waiting, the card (not its line in the index at the top).
  const el = document.querySelector("article#e" + n);
  if (!el) return;
  openAround(el);
  const full = el.querySelector(".fpanel.full");
  if (full) { full.hidden = false; fillBody(full); const fb = el.querySelector('[data-p="' + full.id + '"]'); if (fb) fb.setAttribute("aria-expanded", "true"); }
  arrive(el);
}
function goFeat(id) {
  const i = DATA.backlog.findIndex((f) => f.id === id);
  if (i < 0) return;
  clearQuery(); $("findmsg").textContent = "";
  filter = "backlog"; blKind = null; blGroup = "all"; keepTab();
  render();
  const el = $("f" + i);
  if (el) { openAround(el); arrive(el); }
}
function goTask(i) {
  clearQuery(); $("findmsg").textContent = "";
  filter = "mine"; keepTab();
  render();
  const el = $("t" + i);
  if (el) { openAround(el); arrive(el); }
}
function switchTab(f, sec) {
  clearQuery(); $("findmsg").textContent = "";
  filter = f; blKind = null; keepTab();
  render();
  const s = sec && $(sec);
  if (s) s.scrollIntoView({ block: "start" }); else scrollTo(0, 0);
}

// ---- Chats (R-28) ----
const chats = [...new Set(DATA.entries.map((e) => e.chat))];
$("chat").innerHTML = '<option value="all">All chats (' + chats.length + ")</option>" +
  chats.map((c) => '<option value="' + esc(c) + '">' + esc(chatLabel(c)) + "</option>").join("");
if (chat !== "all" && !chats.includes(chat)) chat = "all";
$("chat").value = chat;
// R-28: "Rename" shows for one picked chat (not for "All chats").
function closeRename() { $("renamebox").hidden = true; $("renmsg").textContent = ""; }
function syncRename() { $("rename").hidden = chat === "all"; if (chat === "all") closeRename(); }
syncRename();

// ---- Events ----
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!d.dataset) return;
  if (d.dataset.box) doneOpen[d.dataset.box] = d.open;
}, true);
// R-99 (owner, 24 Oct 2026: "Once I have selected an option, I am unable to de-select"): tapping the
// picked answer again takes the pick back. The browser keeps a radio checked, so it is unchecked after it.
let wasPicked = null;
document.addEventListener("pointerdown", (ev) => {
  const opt = ev.target.closest && ev.target.closest(".opt");
  const r = opt && opt.querySelector('input[type="radio"][data-n]');
  wasPicked = r && r.checked ? r : null;
}, true);
document.addEventListener("click", (ev) => {
  const opt = ev.target.closest && ev.target.closest(".opt");
  if (!opt || !wasPicked || opt.querySelector('input[type="radio"][data-n]') !== wasPicked) return;
  const r = wasPicked, n = Number(r.dataset.n);
  wasPicked = null;
  ev.preventDefault();
  setTimeout(() => { r.checked = false; }, 0);
  if (picks[n]) { delete picks[n][r.dataset.q]; if (!Object.keys(picks[n]).length) delete picks[n]; }
  keepPicks();
  opt.classList.remove("on");
  const ag = document.querySelector('button[data-act="agree"][data-n="' + n + '"]');
  if (ag && !picks[n]) ag.hidden = false;
}, true);
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches('input[type="radio"][data-n]')) {
    const n = Number(t.dataset.n);
    picks[n] = Object.assign(picks[n] || {}, { [t.dataset.q]: t.value });
    keepPicks();
    t.closest("fieldset").querySelectorAll(".opt").forEach((l) => l.classList.toggle("on", l.contains(t)));
    const ag = document.querySelector('button[data-act="agree"][data-n="' + n + '"]');
    if (ag) ag.hidden = true;
  }
  if (t.id === "blgroup") { blGroup = t.value; blKind = null; render(); }
  if (t.id === "sortby" && t.value in SORTS) { sortBy = t.value; ls.set("inbox-sort", sortBy); render(); const s = $("sortby"); if (s) s.focus(); }
});
document.addEventListener("click", (ev) => {
  const g = ev.target.closest("a[data-goto]");
  if (g) { ev.preventDefault(); goTo(Number(g.dataset.goto)); return; }
  const fl = ev.target.closest("a[data-feat]");
  if (fl) { ev.preventDefault(); goFeat(fl.dataset.feat); return; }
  const tl = ev.target.closest("a[data-task]");
  if (tl) { ev.preventDefault(); goTask(Number(tl.dataset.task)); return; }
  const tb = ev.target.closest("[data-tab]");
  if (tb) { ev.preventDefault(); switchTab(tb.dataset.tab, tb.dataset.sec); return; }
  const b = ev.target.closest("button[data-act]");
  if (!b) return;
  const n = Number(b.dataset.n);
  const act = b.dataset.act;
  if (act === "send") send(n);
  if (act === "agree") agree(n);
  if (act === "read") markRead(n, true);
  if (act === "unread") markRead(n, false);
  if (act === "readall") markAllRead();
  if (act === "done") markDone(n, true);
  if (act === "undone") markDone(n, false);
  if (act === "change") { delete DATA.answers[n]; render(); const el = document.querySelector("article#e" + n); if (el) arrive(el); }
  if (act === "fnote") sendNote(Number(b.dataset.i));
  if (act === "move") moveFeature(Number(b.dataset.i), b.dataset.to);
  if (act === "blk") { blKind = b.dataset.k || null; render(); }
  if (act === "renote") { delete DATA.notes[DATA.backlog[Number(b.dataset.i)].id]; render(); }
  if (act === "panel") {
    const p = $(b.dataset.p);
    const open = p.hidden;
    p.hidden = !open;
    b.setAttribute("aria-expanded", String(open));
    if (open && p.classList.contains("full")) fillBody(p);
    // Only a comment or reply panel takes the keyboard; an answer panel opens on its choices.
    if (open && /^fp(note|reply)/.test(p.id)) { const ta = p.querySelector("textarea"); if (ta) ta.focus(); }
  }
  if (act === "seen") { seen.base = snapNow(); seen.baseAt = Date.now(); ls.set("inbox-seen", JSON.stringify(seen)); render(); }
  if (act === "clearq") { clearQuery(); render(); $("find").focus(); }
  if (act === "copy") {
    const pre = b.parentElement.querySelector("pre.copy");
    navigator.clipboard.writeText(pre.textContent).then(() => { b.textContent = "Copied"; }, () => {
      const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "Selected: copy it";
    });
  }
});
let typing = null;
$("find").addEventListener("input", () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    const was = Boolean(query);
    query = $("find").value.trim();
    $("findmsg").textContent = "";
    render();
    if (query || was) scrollTo(0, 0);
  }, 150);
});
$("find").addEventListener("keydown", (ev) => { if (ev.key === "Escape") { clearQuery(); $("findmsg").textContent = ""; render(); } });
$("findform").addEventListener("submit", (ev) => {
  ev.preventDefault();
  clearTimeout(typing);
  const v = $("find").value.trim();
  const nm = v.match(/^#?(\d{1,4})$/);
  if (nm) { $("find").blur(); goTo(Number(nm[1])); return; }
  if (!v) { $("findmsg").textContent = "Type a number (for example 51) or a word."; return; }
  query = v; render(); scrollTo(0, 0); $("find").blur(); // closes the phone keyboard on the results
});
$("chat").addEventListener("change", (ev) => { chat = ev.target.value; ls.set("inbox-chat", chat); syncRename(); render(); });
$("rename").addEventListener("click", () => { $("newname").value = chatLabel(chat); $("renmsg").textContent = ""; $("renamebox").hidden = false; $("newname").focus(); $("newname").select(); });
$("rencancel").addEventListener("click", closeRename);
$("rensave").addEventListener("click", renameChat);
$("newname").addEventListener("keydown", (ev) => { if (ev.key === "Enter") renameChat(); if (ev.key === "Escape") closeRename(); });
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.f)));
// The sticky bar's real height, so a jump lands below it, not under it.
const bar = document.querySelector("header.bar");
const setBar = () => document.documentElement.style.setProperty("--hdr", bar.offsetHeight + "px");
setBar();
if (window.ResizeObserver) new ResizeObserver(setBar).observe(bar);

render();
// After a save the page reloads: back to the same place, with a short "Saved" note.
const keptY = Number(ss.get("inbox-y"));
ss.del("inbox-y");
if (keptY) requestAnimationFrame(() => scrollTo(0, keptY));
try { const t = JSON.parse(ss.get("inbox-toast") || "null"); ss.del("inbox-toast"); if (t && Date.now() - t.at < 20000) toast(t.text); } catch (e) { /* no note */ }
// A link that ends in #51 (or #e51) opens at that entry.
const fromHash = () => { const m = (location.hash || "").match(/^#e?(\d{1,4})$/); if (m) goTo(Number(m[1])); };
if (!keptY) fromHash();
window.addEventListener("hashchange", fromHash);
</script>
"""


def main(argv):
    # Group names hold marks like "↔" that Windows' default console code page cannot print.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) in (3, 4) and argv[1] == "--absorb":
        answers = absorb(open(argv[2], encoding="utf-8").read(), argv[3] if len(argv) == 4 else INBOX)
        print("read taps written into the inbox; answers and replies to act on: " + str(len(answers)))
        for num, a in sorted(answers.items(), key=lambda kv: -int(kv[0])):
            print(json.dumps({"num": int(num), **a}, ensure_ascii=False))
        saved = page_data(open(argv[2], encoding="utf-8").read())
        for old, new in (saved.get("chatNames") or {}).items():
            print("chat renamed in the inbox: " + json.dumps(old, ensure_ascii=False) + " -> " + json.dumps(new, ensure_ascii=False))
        for num, when in (saved.get("done") or {}).items():
            print(f"task #{num}: " + ("done " + str(when) if when else "not done yet") + " (written into the inbox)")
        for fid, mv in (saved.get("moves") or {}).items():
            print("feature moved by the owner (written into the inbox): " + json.dumps({"feature": fid, **mv}, ensure_ascii=False))
        notes = saved.get("notes") or {}
        print("feature comments to act on (write each into the inbox as a new entry): " + str(len(notes)))
        for fid, n in notes.items():
            print(json.dumps({"feature": fid, **n}, ensure_ascii=False))
        return 0
    if len(argv) not in (2, 3):
        print(__doc__)
        return 2
    md_path = argv[2] if len(argv) == 3 else INBOX
    page = build(md_path)
    with open(argv[1], "w", encoding="utf-8") as f:
        f.write(page)
    print("wrote " + argv[1])
    text = open(md_path, encoding="utf-8").read()
    missing, stale = priority_gaps(parse(text), text)
    for k in missing:
        print("R-96: pending, no Impact/Effort in ## Priority: " + k)
    for k in stale:
        print("R-96: ## Priority row matches nothing (renamed or removed?): " + k)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
