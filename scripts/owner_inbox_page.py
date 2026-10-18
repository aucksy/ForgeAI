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
    if "RESEARCHING" in s:
        return "working"
    return "answered"


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
        decides = []
        for dm in re.finditer(r"^\*\*Decide:\*\* (.+)\n((?:- [A-Z]: .+\n?)+)", body, re.M):
            opts = []
            for om in re.finditer(r"^- ([A-Z]): (.+)$", dm.group(2), re.M):
                said = om.group(2).strip()
                rec = said.endswith("(recommended)")
                opts.append({"key": om.group(1), "text": said[: -len("(recommended)")].strip() if rec else said, "rec": rec})
            decides.append({"q": dm.group(1).strip(), "opts": opts})
        body = re.sub(r"^\*\*Decide:\*\* .+\n(?:- [A-Z]: .+\n?)+", "", body, flags=re.M)
        decided = bool(re.search(r"^\*\*DECIDED", body, re.M))
        entries.append({
            "num": int(h.group(1)),
            "decides": [] if decided else decides,
            "title": h.group(2).strip(),
            "date": h.group(3).strip(),
            "chat": chat,
            "chatUrl": chat_url,
            "status": status,
            "kind": status_kind(status),
            "read": bool(rm),
            "body": body.strip(),
        })
    return {"decisions": decisions, "entries": entries, "backlog": parse_backlog(text)}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def parse_backlog(text):
    """[{id, group, name, status, kind, details}] from the "## Feature backlog" section ([] without one)."""
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
        if not line.strip().startswith("|") or len(cells) != 3 or cells[0] in ("Feature", "") or set(cells[0]) <= set("-: "):
            continue
        fid = slug(group) + "/" + slug(cells[0])
        if fid in seen:
            continue
        seen.add(fid)
        items.append({"id": fid, "group": group, "name": cells[0], "status": cells[1],
                      "kind": BACKLOG_KIND.get(cells[1].lower(), "idea"), "details": cells[2]})
    return items


def build(md_path=INBOX):
    data = parse(open(md_path, encoding="utf-8").read())
    data["updated"] = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    data["answers"] = {}
    data["read"] = {}
    data["notes"] = {}
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
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(text)
    return answers


def enc(value):
    """JSON safe inside <script>: the page's own rebuild (fill in the template's JS) does the same."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def fill(tpl, data):
    # One pass over the template only, so a token inside the filled-in text is never replaced again.
    return re.sub(r"__TPL__|__DATA__", lambda m: enc(tpl) if m.group(0) == "__TPL__" else enc(data), tpl)


TEMPLATE = r"""<title>Owner Inbox</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* Layout: one reading column; a sticky bar with the chat picker and filters; decisions first, then entries newest first. */
:root {
  --bg: #f4f5f7; --surface: #ffffff; --ink: #1b1f27; --muted: #5b6372; --line: #dde1e8;
  --accent: #d4581c; --accent-soft: #fbe7dc;
  --wait: #9a5b00; --wait-bg: #fff1d6; --built: #1d5fa8; --built-bg: #e2eefc;
  --done: #23733f; --done-bg: #e0f3e6; --plain: #4b5262; --plain-bg: #eceef2;
  --f-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
  --f-body: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  --f-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121419; --surface: #1b1e25; --ink: #e9ebf0; --muted: #a0a7b5; --line: #2c313b;
  --accent: #f08a4b; --accent-soft: #3a2418;
  --wait: #f2c36b; --wait-bg: #3a2c10; --built: #8fbaf2; --built-bg: #16283f;
  --done: #7fd39b; --done-bg: #13301e; --plain: #b9bfcc; --plain-bg: #262a33; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #121419; --surface: #1b1e25; --ink: #e9ebf0; --muted: #a0a7b5; --line: #2c313b;
  --accent: #f08a4b; --accent-soft: #3a2418;
  --wait: #f2c36b; --wait-bg: #3a2c10; --built: #8fbaf2; --built-bg: #16283f;
  --done: #7fd39b; --done-bg: #13301e; --plain: #b9bfcc; --plain-bg: #262a33; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font-family: var(--f-body); font-size: 16px; line-height: 1.55; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--surface); }
.wrap { max-width: 760px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--surface); border-bottom: 1px solid var(--line); }
header.bar .wrap { display: flex; flex-direction: column; gap: 10px; padding-block: 14px 12px; }
.titlerow { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h1 { font-family: var(--f-display); font-weight: 700; font-size: 1.6rem; letter-spacing: -0.01em; margin: 0; }
h1 span { color: var(--accent); }
.updated { font-family: var(--f-mono); font-size: 0.75rem; color: var(--muted); }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label.lbl { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
select { font: inherit; font-size: 0.95rem; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; max-width: 100%; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: inherit; font-size: 0.85rem; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.chip:focus-visible, select:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main .wrap { display: flex; flex-direction: column; gap: 22px; padding-block: 20px 48px; }
h2 { font-family: var(--f-display); font-weight: 600; font-size: 1.15rem; margin: 0 0 10px; text-wrap: balance; }
.decide { background: var(--accent-soft); border-radius: 12px; padding: 16px; }
.decide ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.decide li { display: grid; grid-template-columns: 3.2em 1fr; gap: 10px; align-items: start; }
.num { font-family: var(--f-mono); font-variant-numeric: tabular-nums; color: var(--accent); font-size: 0.9rem; padding-top: 2px; }
.pick { display: block; margin-top: 2px; font-size: 0.85rem; color: var(--muted); }
.pick b { color: var(--ink); }
.none { color: var(--muted); font-style: italic; }
.entries { display: flex; flex-direction: column; gap: 12px; }
article { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 0; }
article header { display: grid; grid-template-columns: 3.2em 1fr; gap: 10px; }
article h3 { font-family: var(--f-display); font-weight: 600; font-size: 1.05rem; line-height: 1.3; margin: 0; text-wrap: balance; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin-top: 6px; font-size: 0.82rem; color: var(--muted); }
.status { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 6px; padding: 2px 8px; }
.k-waiting { color: var(--wait); background: var(--wait-bg); }
.k-built { color: var(--built); background: var(--built-bg); }
.k-done { color: var(--done); background: var(--done-bg); }
.k-planned, .k-answered, .k-working, .k-idea, .k-no { color: var(--plain); background: var(--plain-bg); }
.k-no { text-decoration: line-through; }
button.status { font-family: inherit; border: 1px solid transparent; cursor: pointer; }
button.status[aria-pressed="true"] { border-color: currentColor; box-shadow: 0 0 0 1px currentColor; }
.bl-sum { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin: 0 0 14px; font-size: 0.85rem; color: var(--muted); }
.bl-group { margin: 18px 0 8px; font-family: var(--f-display); font-weight: 600; font-size: 1rem; }
.feat { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; min-width: 0; }
.feat .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; justify-content: space-between; }
.feat .name { font-weight: 700; overflow-wrap: anywhere; }
.feat .det { margin: 4px 0 0; color: var(--muted); font-size: 0.92rem; overflow-wrap: anywhere; }
.feat details { margin-top: 6px; }
details { margin-top: 10px; }
summary { cursor: pointer; color: var(--accent); font-size: 0.9rem; }
.body { margin-top: 8px; min-width: 0; overflow-wrap: anywhere; }
.body p, .body ul, .body ol { margin: 0 0 10px; }
.body ul, .body ol { padding-left: 1.3em; }
.body li { margin-bottom: 4px; }
.body code { font-family: var(--f-mono); font-size: 0.85em; background: var(--plain-bg); border-radius: 4px; padding: 1px 4px; }
.body a, a { color: var(--accent); }
.body table { border-collapse: collapse; font-size: 0.9rem; }
.tablebox { overflow-x: auto; margin-bottom: 10px; }
.body th, .body td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
.count { font-size: 0.85rem; color: var(--muted); }
.form { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: 10px; background: var(--bg); }
fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
legend { font-weight: 700; margin-bottom: 4px; }
.opt { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: start; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); cursor: pointer; }
.opt.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.opt input { margin: 4px 0 0; accent-color: var(--accent); }
.key { font-family: var(--f-mono); color: var(--accent); }
.rec { font-style: normal; font-size: 0.75rem; font-weight: 700; color: var(--done); background: var(--done-bg); border-radius: 4px; padding: 1px 6px; }
.notelbl { font-size: 0.85rem; color: var(--muted); }
textarea { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; width: 100%; box-sizing: border-box; resize: vertical; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.btn { font: inherit; font-weight: 700; color: #fff; background: var(--accent); border: 0; border-radius: 8px; padding: 9px 16px; cursor: pointer; }
.btn.ghost { color: var(--accent); background: transparent; border: 1px solid var(--accent); font-weight: 400; padding: 5px 12px; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn:focus-visible, textarea:focus-visible, .opt:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.msg { font-size: 0.9rem; color: var(--muted); min-width: 0; }
.sent { border: 1px solid var(--done); }
.sentline { margin: 0; color: var(--done); font-weight: 700; }
article.unread { border-left: 4px solid var(--accent); }
.new { font-size: 0.75rem; font-weight: 700; color: #fff; background: var(--accent); border-radius: 6px; padding: 2px 8px; }
.readrow { margin-top: 10px; }
.btn.ghost.quiet { color: var(--muted); border-color: var(--line); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--f-mono); font-size: 0.8rem; margin: 6px 0 0; }
.decide a { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<header class="bar"><div class="wrap">
  <div class="titlerow"><h1>Owner <span>Inbox</span></h1><span class="updated" id="updated"></span></div>
  <div class="controls">
    <label class="lbl" for="chat">Chat</label>
    <select id="chat"></select>
  </div>
  <div class="chips" role="group" aria-label="Show">
    <button class="chip" data-f="waiting" aria-pressed="false">Waiting for you</button>
    <button class="chip" data-f="all" aria-pressed="true">Questions &amp; answers</button>
    <button class="chip" data-f="backlog" aria-pressed="false">Feature backlog</button>
    <button class="chip" data-f="shipped" aria-pressed="false">Built</button>
  </div>
</div></header>

<main><div class="wrap">
  <section id="entrybox" aria-labelledby="eh">
    <h2 id="eh"><span id="tabname">Your ideas and my answers</span> <span class="count" id="count"></span></h2>
    <p class="pick" id="tabhint"></p>
    <div class="entries" id="entries"></div>
  </section>
  <section id="backlogbox" aria-labelledby="bh" hidden>
    <h2 id="bh">Feature backlog</h2>
    <div id="backlog"></div>
  </section>
</div></main>

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
let chat = "all", filter = "all";
let blKind = null; // a status pill tapped in the backlog / built tab: only that status (null = all)
const picks = {}; // num -> {qIndex: key}
try { chat = localStorage.getItem("inbox-chat") || "all"; filter = localStorage.getItem("inbox-filter") || "all"; } catch (e) { /* storage blocked: defaults */ }
// Owner rule (18 Oct 2026): five tabs only; a tab kept from an older page falls back to Questions & answers.
// Owner (18 Oct): "To read" merged into Questions & answers (unread ones on top, tagged New).
if (!["waiting", "all", "backlog", "shipped"].includes(filter)) filter = "all";
try { Object.assign(picks, JSON.parse(sessionStorage.getItem("inbox-picks") || "{}")); } catch (e) { /* none kept */ }
const keepPicks = () => { try { sessionStorage.setItem("inbox-picks", JSON.stringify(picks)); } catch (e) { /* not kept */ } };
// A save reloads this view: keep the reading place across it.
try { const y = Number(sessionStorage.getItem("inbox-y")); sessionStorage.removeItem("inbox-y"); if (y) requestAnimationFrame(() => scrollTo(0, y)); } catch (e) { /* starts at the top */ }
const keepPlace = () => { try { sessionStorage.setItem("inbox-y", String(Math.round(scrollY))); } catch (e) { /* starts at the top */ } };
const stamp = () => new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The page rebuilt from its template and its data: what a save publishes (never the live DOM).
const enc = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
// The two markers are spelled in pieces here, so filling the template never touches this code.
const MARK_TPL = "__" + "TPL__", MARK_DATA = "__" + "DATA__";
const pageHtml = () => '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET +
  "</style></head><body>" + TPL.replace(new RegExp(MARK_TPL + "|" + MARK_DATA, "g"), (m) => (m === MARK_TPL ? enc(TPL) : enc(DATA))) + "</body></html>";

// #21: "Waiting for you" = a question still to answer (decisions only); "To read" = an entry not read yet.
// Sending an answer or a reply counts as read.
const sentOf = (e) => DATA.answers[e.num];
const isRead = (e) => Boolean(sentOf(e)) || (e.num in DATA.read ? Boolean(DATA.read[e.num]) : Boolean(e.read));
const needsAnswer = (e) => e.decides.length > 0 && !sentOf(e);
const pending = (e) => needsAnswer(e) || !isRead(e);
const toRead = (e) => !needsAnswer(e) && !isRead(e);

$("updated").textContent = "Updated " + DATA.updated;
const chats = [...new Set(DATA.entries.map((e) => e.chat))];
$("chat").innerHTML = '<option value="all">All chats (' + chats.length + ")</option>" +
  chats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
if (chat !== "all" && !chats.includes(chat)) chat = "all";
$("chat").value = chat;

// #21 follow-up (owner, 18 Oct): each tab shows only its own content: no boxes above the tabs.
const TAB = { all: "Questions and answers", waiting: "Waiting for your decision" };
const HINT = {
  waiting: 'Tap a question, pick an answer (or just write a comment), press Send. Or reply in chat, e.g. "#13: A".',
  all: "New answers come first, marked \u201cNew\u201d. \u201cMark as read\u201d when you're done with one.",
};

function answerText(e, a) {
  const lines = a.picks.map((p) => "- " + p.q + ": " + p.key + " (" + p.text + ")");
  const skipped = e.decides.filter((d) => !a.picks.some((p) => p.q === d.q)).map((d) => "- " + d.q + ": no pick yet");
  const note = a.note ? [(e.decides.length ? "Note: " : "Reply: ") + a.note] : [];
  return ["Owner inbox #" + e.num + " (" + e.title + "):", ...lines, ...skipped, ...note].join("\n");
}
const sendRow = (e) => '<div class="actions"><button class="btn" data-act="send" data-n="' + e.num + '">Send to Claude</button><span class="msg" id="msg' + e.num + '" role="status"></span></div>';
function formHtml(e) {
  const sent = sentOf(e);
  if (sent) {
    return '<div class="form sent"><p class="sentline">Sent ' + esc(sent.at) + ". Claude acts on it next time it looks at your inbox.</p>" +
      "<pre>" + esc(answerText(e, sent)) + "</pre>" +
      '<div class="actions"><button class="btn ghost" data-act="change" data-n="' + e.num + '">' + (e.decides.length ? "Change my answer" : "Write it again") + "</button></div></div>";
  }
  if (!e.decides.length) {
    return '<details class="reply"><summary>Reply to Claude</summary><div class="form">' +
      '<label class="notelbl" for="note' + e.num + '">Ask a follow-up, disagree, or add something</label>' +
      '<textarea id="note' + e.num + '" rows="3" placeholder="e.g. Good, but also show it on the watch"></textarea>' + sendRow(e) + "</div></details>";
  }
  const mine = picks[e.num] || {};
  return '<div class="form">' + e.decides.map((d, qi) =>
    '<fieldset><legend>' + esc(d.q) + "</legend>" + d.opts.map((o) =>
      '<label class="opt' + (mine[qi] === o.key ? " on" : "") + '"><input type="radio" name="q' + e.num + "_" + qi + '" value="' + o.key + '"' +
      (mine[qi] === o.key ? " checked" : "") + ' data-n="' + e.num + '" data-q="' + qi + '"><span class="key">' + o.key + "</span><span>" + esc(o.text) +
      (o.rec ? ' <em class="rec">my pick</em>' : "") + "</span></label>").join("") + "</fieldset>").join("") +
    '<label class="notelbl" for="note' + e.num + '">Your comment. You can send just a comment, without picking.</label>' +
    '<textarea id="note' + e.num + '" rows="2" placeholder="e.g. Yes, but keep it free for members"></textarea>' + sendRow(e) + "</div>";
}
function readHtml(e) {
  if (sentOf(e)) return "";
  return '<div class="actions readrow">' + (isRead(e)
    ? '<button class="btn ghost quiet" data-act="unread" data-n="' + e.num + '">Mark as unread</button>'
    : '<button class="btn ghost" data-act="read" data-n="' + e.num + '">Mark as read</button>') +
    '<span class="msg" id="rmsg' + e.num + '" role="status"></span></div>';
}
function shown(e) {
  if (chat !== "all" && e.chat !== chat) return false;
  if (filter === "all") return true;
  if (filter === "waiting") return needsAnswer(e);
  if (filter === "other") return ["planned", "answered", "working"].includes(e.kind);
  return e.kind === filter;
}
const BL_KIND = { done: "Live", built: "Next release", waiting: "Waiting for you", planned: "Planned", idea: "Idea", no: "Not doing" };
function noteText(f, text) { return "Owner inbox feature backlog: " + f.group + " / " + f.name + ": " + text; }
// "Feature backlog" = what is not built yet; "Built" = live, or built and in the next release.
const SHIPPED = ["done", "built"];
const inTab = (f, tab) => (tab === "shipped") === SHIPPED.includes(f.kind);
function backlogHtml(tab) {
  const all = DATA.backlog.map((f, i) => ({ f, i })).filter((x) => inTab(x.f, tab));
  if (!all.length) return '<p class="none">Nothing here yet.</p>';
  const counts = {};
  all.forEach((x) => { counts[x.f.kind] = (counts[x.f.kind] || 0) + 1; });
  if (blKind && !counts[blKind]) blKind = null;
  // Owner (18 Oct): the status pills are filters: tap "Live" to see only Live; tap it again for all.
  const sum = '<p class="bl-sum">' + Object.keys(BL_KIND).filter((k) => counts[k]).map((k) =>
      '<button type="button" class="status k-' + k + '" data-act="blk" data-k="' + k + '" aria-pressed="' + (blKind === k) + '">' + BL_KIND[k] + " " + counts[k] + "</button>").join("") +
    "<span>" + (blKind ? "Showing " + BL_KIND[blKind] + " only. Tap it again to see all." : "Tap a status to see only those. Tap \u201cComment\u201d to send me a note.") + "</span></p>";
  const items = blKind ? all.filter((x) => x.f.kind === blKind) : all;
  let out = sum, group = null;
  items.forEach(({ f, i }) => {
    if (f.group !== group) { group = f.group; out += '<h3 class="bl-group">' + esc(group) + "</h3>"; }
    out += featHtml(f, i);
  });
  return out;
}
function featHtml(f, i) {
    const sent = DATA.notes[f.id];
    return '<div class="feat"><div class="row"><span class="name">' + esc(f.name) + '</span><span class="status k-' + f.kind + '">' + esc(f.status) + "</span></div>" +
      '<p class="det">' + esc(f.details) + "</p>" +
      (sent
        ? '<div class="form sent"><p class="sentline">Comment sent ' + esc(sent.at) + ". Claude acts on it next time it looks at your inbox.</p><pre>" + esc(sent.text) + "</pre>" +
          '<div class="actions"><button class="btn ghost" data-act="renote" data-i="' + i + '">Write another</button></div></div>'
        : '<details><summary>Comment</summary><div class="form"><label class="notelbl" for="fnote' + i + '">Your comment on ' + esc(f.name) + "</label>" +
          '<textarea id="fnote' + i + '" rows="2" placeholder="e.g. Do this one first, members keep asking"></textarea>' +
          '<div class="actions"><button class="btn" data-act="fnote" data-i="' + i + '">Send to Claude</button><span class="msg" id="fmsg' + i + '" role="status"></span></div></div></details>') +
      "</div>";
}
// Features waiting for the owner also show in the main "Waiting for you" tab (owner, 18 Oct).
const waitingFeats = () => DATA.backlog.map((f, i) => ({ f, i })).filter((x) => x.f.kind === "waiting" && !DATA.notes[x.f.id]);
function render() {
  const bl = filter === "backlog" || filter === "shipped";
  $("entrybox").hidden = bl;
  $("backlogbox").hidden = !bl;
  document.querySelector('.chip[data-f="backlog"]').textContent = "Feature backlog (" + DATA.backlog.filter((f) => inTab(f, "backlog")).length + ")";
  document.querySelector('.chip[data-f="shipped"]').textContent = "Built (" + DATA.backlog.filter((f) => inTab(f, "shipped")).length + ")";
  const fresh = DATA.entries.filter(toRead).length;
  document.querySelector('.chip[data-f="all"]').textContent = "Questions & answers (" + DATA.entries.length + (fresh ? " \u00b7 " + fresh + " new" : "") + ")";
  if (bl) {
    $("bh").textContent = filter === "shipped" ? "Built" : "Feature backlog";
    $("backlog").innerHTML = backlogHtml(filter);
    document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
    return;
  }
  $("tabname").textContent = TAB[filter] || TAB.all;
  $("tabhint").textContent = HINT[filter] || "";
  $("tabhint").hidden = !HINT[filter];
  // Unread first (newest first within each), so new answers are at the top of the list.
  const list = DATA.entries.filter(shown).sort((a, b) => (toRead(b) - toRead(a)) || (b.num - a.num));
  $("count").textContent = "· " + list.length + " of " + DATA.entries.length;
  const mineChat = DATA.entries.filter((e) => chat === "all" || e.chat === chat);
  document.querySelector('.chip[data-f="waiting"]').textContent = "Waiting for you (" + (mineChat.filter(needsAnswer).length + waitingFeats().length) + ")";
  $("entries").innerHTML = list.length ? list.map((e) =>
    '<article id="e' + e.num + '"' + (pending(e) ? ' class="unread"' : "") + '><header><span class="num">#' + e.num + "</span><div><h3>" + esc(e.title) + "</h3>" +
    '<div class="meta">' + (needsAnswer(e) ? '<span class="new">To answer</span>' : !isRead(e) ? '<span class="new">New</span>' : "") +
    '<span class="status k-' + e.kind + '">' + (sentOf(e) ? (e.decides.length ? "Answer sent" : "Reply sent") : KIND[e.kind]) + "</span><span>" + esc(e.date) + "</span>" +
    (e.chatUrl ? '<a href="' + esc(e.chatUrl) + '" target="_blank" rel="noopener">' + esc(e.chat) + "</a>" : "<span>" + esc(e.chat) + "</span>") +
    "</div></div></header>" +
    (e.status ? '<p class="pick">' + esc(e.status) + "</p>" : "") +
    (e.decides.length ? formHtml(e) : "") +
    "<details" + (e.decides.length || !isRead(e) ? " open" : "") + "><summary>" + (e.decides.length ? "The full question and my answer" : "The answer") + "</summary>" +
    '<div class="body">' + md(e.body) + "</div></details>" +
    (e.decides.length ? "" : formHtml(e)) + readHtml(e) + "</article>").join("")
    : filter === "waiting" && waitingFeats().length ? "" : '<p class="none">' + (filter === "waiting" ? "No decisions waiting for you." : "No questions yet.") + "</p>";
  if (filter === "waiting" && waitingFeats().length) {
    $("entries").innerHTML += '<h3 class="bl-group">Features waiting for you</h3><p class="pick">Each needs your yes (most cost money or need something bought). Tap \u201cComment\u201d and tell me, e.g. \u201cYes, go ahead\u201d or \u201cNot now\u201d.</p>' +
      waitingFeats().map(({ f, i }) => featHtml(f, i)).join("");
  }
  document.querySelectorAll(".body table").forEach((t) => { const box = document.createElement("div"); box.className = "tablebox"; t.replaceWith(box); box.appendChild(t); });
  document.querySelectorAll(".body a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
}

// One save at a time: each one publishes the whole page, and the view reloads after it.
let saving = false;
async function save(change, undo, msg, copyText) {
  if (saving) return;
  saving = true; // before the await, so a second quick tap can't start a second save
  let artifact = null;
  try { artifact = await claude.use("artifact"); } catch (e) { artifact = null; /* quiet: treated as "not available" below */ }
  if (!artifact) { saving = false; showCopy(msg, "Saving isn't available here.", copyText); return; }
  change();
  msg.textContent = "Saving…";
  try {
    keepPlace();
    await artifact.publish(pageHtml()); // this view reloads to the saved page
  } catch (err) {
    undo();
    saving = false;
    const code = err && err.code;
    if (code === "conflict") { msg.textContent = "The page changed meanwhile; it is reloading. Try again after it opens."; return; }
    showCopy(msg, code === "not_writer" || code === "not_granted" ? "This view can't save." : "Couldn't save (" + (code || "error") + ").", copyText);
  }
}
function send(n) {
  const e = DATA.entries.find((x) => x.num === n);
  const mine = picks[n] || {};
  const msg = $("msg" + n);
  const note = ($("note" + n).value || "").trim().slice(0, 2000);
  const chosen = e.decides.map((d, qi) => ({ q: d.q, key: mine[qi], text: (d.opts.find((o) => o.key === mine[qi]) || {}).text || "" })).filter((p) => p.key);
  if (!chosen.length && !note) { msg.textContent = e.decides.length ? "Pick an answer or write a comment first." : "Write your reply first."; return; }
  const answer = { picks: chosen, note, at: stamp() };
  const kept = picks[n];
  save(() => { DATA.answers[n] = answer; delete picks[n]; keepPicks(); },
    () => { delete DATA.answers[n]; if (kept) picks[n] = kept; keepPicks(); }, msg, answerText(e, answer));
}
function markRead(n, on) {
  const had = n in DATA.read, before = DATA.read[n];
  const e = DATA.entries.find((x) => x.num === n);
  save(() => { DATA.read[n] = on ? stamp() : false; }, () => { if (had) DATA.read[n] = before; else delete DATA.read[n]; },
    $("rmsg" + n), "Owner inbox #" + e.num + " (" + e.title + "): " + (on ? "read" : "mark as unread"));
}
function sendNote(i) {
  const f = DATA.backlog[i];
  const msg = $("fmsg" + i);
  const text = ($("fnote" + i).value || "").trim().slice(0, 2000);
  if (!text) { msg.textContent = "Write your comment first."; return; }
  const had = DATA.notes[f.id];
  save(() => { DATA.notes[f.id] = { group: f.group, name: f.name, text, at: stamp() }; },
    () => { if (had) DATA.notes[f.id] = had; else delete DATA.notes[f.id]; }, msg, noteText(f, text));
}
function showCopy(msg, why, text) {
  msg.innerHTML = esc(why) + ' Copy it and paste it in the chat instead: <button class="btn ghost" data-act="copy">Copy</button><pre class="copy">' + esc(text) + "</pre>";
}

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches('input[type="radio"][data-n]')) {
    const n = Number(t.dataset.n);
    picks[n] = Object.assign(picks[n] || {}, { [t.dataset.q]: t.value });
    keepPicks();
    t.closest("fieldset").querySelectorAll(".opt").forEach((l) => l.classList.toggle("on", l.contains(t)));
  }
});
document.addEventListener("click", (ev) => {
  // A link to an entry the current filter hides (or the backlog view): show all entries first.
  const g = ev.target.closest("a[data-goto]");
  if (g) {
    const e = DATA.entries.find((x) => x.num === Number(g.dataset.goto));
    if (filter === "backlog" || filter === "shipped" || (e && !shown(e))) { filter = "all"; render(); }
  }
  const b = ev.target.closest("button[data-act]");
  if (!b) return;
  const n = Number(b.dataset.n);
  if (b.dataset.act === "send") send(n);
  if (b.dataset.act === "read") markRead(n, true);
  if (b.dataset.act === "unread") markRead(n, false);
  if (b.dataset.act === "change") { delete DATA.answers[n]; render(); }
  if (b.dataset.act === "fnote") sendNote(Number(b.dataset.i));
  if (b.dataset.act === "blk") { blKind = blKind === b.dataset.k ? null : b.dataset.k; render(); }
  if (b.dataset.act === "renote") { delete DATA.notes[DATA.backlog[Number(b.dataset.i)].id]; render(); }
  if (b.dataset.act === "copy") {
    const pre = b.parentElement.querySelector("pre.copy");
    navigator.clipboard.writeText(pre.textContent).then(() => { b.textContent = "Copied"; }, () => {
      const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "Selected: copy it";
    });
  }
});
$("chat").addEventListener("change", (ev) => { chat = ev.target.value; try { localStorage.setItem("inbox-chat", chat); } catch (e) { /* not kept */ } render(); });
document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.f;
  blKind = null;
  try { localStorage.setItem("inbox-filter", filter); } catch (e) { /* not kept */ }
  render();
  scrollTo(0, 0);
}));
render();
</script>
"""


def main(argv):
    if len(argv) in (3, 4) and argv[1] == "--absorb":
        answers = absorb(open(argv[2], encoding="utf-8").read(), argv[3] if len(argv) == 4 else INBOX)
        print("read taps written into the inbox; answers and replies to act on: " + str(len(answers)))
        for num, a in sorted(answers.items(), key=lambda kv: -int(kv[0])):
            print(json.dumps({"num": int(num), **a}, ensure_ascii=False))
        notes = page_data(open(argv[2], encoding="utf-8").read()).get("notes") or {}
        print("feature comments to act on (write each into the inbox as a new entry): " + str(len(notes)))
        for fid, n in notes.items():
            print(json.dumps({"feature": fid, **n}, ensure_ascii=False))
        return 0
    if len(argv) not in (2, 3):
        print(__doc__)
        return 2
    page = build(argv[2] if len(argv) == 3 else INBOX)
    with open(argv[1], "w", encoding="utf-8") as f:
        f.write(page)
    print("wrote " + argv[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
