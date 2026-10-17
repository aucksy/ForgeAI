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

Usage: owner_inbox_page.py <output.html> [<inbox.md>]
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, "docs", "OWNER-INBOX.md")

ENTRY_RE = re.compile(r"^## (\d+)\. (.+?) — (.+)$", re.M)


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
            "body": body.strip(),
        })
    return {"decisions": decisions, "entries": entries}


def build(md_path=INBOX):
    data = parse(open(md_path, encoding="utf-8").read())
    data["updated"] = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    data["answers"] = {}
    return fill(TEMPLATE, data)


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
.k-planned, .k-answered, .k-working { color: var(--plain); background: var(--plain-bg); }
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
    <button class="chip" data-f="all" aria-pressed="true">All</button>
    <button class="chip" data-f="waiting" aria-pressed="false">Waiting for you</button>
    <button class="chip" data-f="built" aria-pressed="false">Built, not released</button>
    <button class="chip" data-f="done" aria-pressed="false">Done</button>
    <button class="chip" data-f="other" aria-pressed="false">Answered / planned</button>
  </div>
</div></header>

<main><div class="wrap">
  <section class="decide" aria-labelledby="dh">
    <h2 id="dh">Waiting for your decision</h2>
    <ol id="decisions"></ol>
    <p class="pick">Tap a question, pick an answer, press Send. Or reply in chat, e.g. "#13: A".</p>
  </section>
  <section aria-labelledby="eh">
    <h2 id="eh">Your ideas and my answers <span class="count" id="count"></span></h2>
    <div class="entries" id="entries"></div>
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
let chat = "all", filter = "all";
const picks = {}; // num -> {qIndex: key}
try { chat = localStorage.getItem("inbox-chat") || "all"; filter = localStorage.getItem("inbox-filter") || "all"; } catch (e) { /* storage blocked: defaults */ }
try { Object.assign(picks, JSON.parse(sessionStorage.getItem("inbox-picks") || "{}")); } catch (e) { /* none kept */ }
const keepPicks = () => { try { sessionStorage.setItem("inbox-picks", JSON.stringify(picks)); } catch (e) { /* not kept */ } };

// The page rebuilt from its template and its data: what a save publishes (never the live DOM).
const enc = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
// The two markers are spelled in pieces here, so filling the template never touches this code.
const MARK_TPL = "__" + "TPL__", MARK_DATA = "__" + "DATA__";
const pageHtml = () => '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET +
  "</style></head><body>" + TPL.replace(new RegExp(MARK_TPL + "|" + MARK_DATA, "g"), (m) => (m === MARK_TPL ? enc(TPL) : enc(DATA))) + "</body></html>";

$("updated").textContent = "Updated " + DATA.updated;
const chats = [...new Set(DATA.entries.map((e) => e.chat))];
$("chat").innerHTML = '<option value="all">All chats (' + chats.length + ")</option>" +
  chats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
if (chat !== "all" && !chats.includes(chat)) chat = "all";
$("chat").value = chat;

const open = DATA.entries.filter((e) => e.decides.length);
const waitingCount = open.filter((e) => !DATA.answers[e.num]).length;
$("decisions").innerHTML = open.length
  ? open.map((e) => '<li><span class="num">#' + e.num + '</span><div><a href="#e' + e.num + '">' + esc(e.title) + "</a>" +
      '<span class="pick">' + (DATA.answers[e.num] ? "Sent, waiting for Claude to act" : e.decides.length + (e.decides.length > 1 ? " choices" : " choice") + " to make") + "</span></div></li>").join("")
  : '<li class="none">Nothing waiting for you.</li>';
$("dh").textContent = "Waiting for your decision (" + waitingCount + ")";

function answerText(e, a) {
  const lines = a.picks.map((p) => "- " + p.q + ": " + p.key + " (" + p.text + ")");
  return "Owner inbox #" + e.num + " (" + e.title + "):\n" + lines.join("\n") + (a.note ? "\nNote: " + a.note : "");
}
function formHtml(e) {
  const sent = DATA.answers[e.num];
  if (sent) {
    return '<div class="form sent"><p class="sentline">Sent ' + esc(sent.at) + ". Claude acts on it next time it looks at your inbox.</p>" +
      "<pre>" + esc(answerText(e, sent)) + "</pre>" +
      '<div class="actions"><button class="btn ghost" data-act="change" data-n="' + e.num + '">Change my answer</button></div></div>';
  }
  const mine = picks[e.num] || {};
  return '<div class="form">' + e.decides.map((d, qi) =>
    '<fieldset><legend>' + esc(d.q) + "</legend>" + d.opts.map((o) =>
      '<label class="opt' + (mine[qi] === o.key ? " on" : "") + '"><input type="radio" name="q' + e.num + "_" + qi + '" value="' + o.key + '"' +
      (mine[qi] === o.key ? " checked" : "") + ' data-n="' + e.num + '" data-q="' + qi + '"><span class="key">' + o.key + "</span><span>" + esc(o.text) +
      (o.rec ? ' <em class="rec">my pick</em>' : "") + "</span></label>").join("") + "</fieldset>").join("") +
    '<label class="notelbl" for="note' + e.num + '">Anything to add? (optional)</label>' +
    '<textarea id="note' + e.num + '" rows="2" placeholder="e.g. Yes, but keep it free for members"></textarea>' +
    '<div class="actions"><button class="btn" data-act="send" data-n="' + e.num + '">Send to Claude</button><span class="msg" id="msg' + e.num + '" role="status"></span></div></div>';
}
function shown(e) {
  if (chat !== "all" && e.chat !== chat) return false;
  if (filter === "all") return true;
  if (filter === "other") return ["planned", "answered", "working"].includes(e.kind);
  return e.kind === filter;
}
function render() {
  const list = DATA.entries.filter(shown);
  $("count").textContent = "· " + list.length + " of " + DATA.entries.length;
  $("entries").innerHTML = list.length ? list.map((e) =>
    '<article id="e' + e.num + '"><header><span class="num">#' + e.num + "</span><div><h3>" + esc(e.title) + "</h3>" +
    '<div class="meta"><span class="status k-' + e.kind + '">' + (DATA.answers[e.num] ? "Answer sent" : KIND[e.kind]) + "</span><span>" + esc(e.date) + "</span>" +
    (e.chatUrl ? '<a href="' + esc(e.chatUrl) + '" target="_blank" rel="noopener">' + esc(e.chat) + "</a>" : "<span>" + esc(e.chat) + "</span>") +
    "</div></div></header>" +
    (e.status ? '<p class="pick">' + esc(e.status) + "</p>" : "") +
    (e.decides.length ? formHtml(e) : "") +
    "<details" + (e.decides.length ? " open" : "") + "><summary>" + (e.decides.length ? "The full question and my answer" : "The answer") + "</summary>" +
    '<div class="body">' + md(e.body) + "</div></details></article>").join("")
    : '<p class="none">No entries match. Pick "All".</p>';
  document.querySelectorAll(".body table").forEach((t) => { const box = document.createElement("div"); box.className = "tablebox"; t.replaceWith(box); box.appendChild(t); });
  document.querySelectorAll(".body a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
}

async function send(n, btn) {
  const e = DATA.entries.find((x) => x.num === n);
  const mine = picks[n] || {};
  const missing = e.decides.findIndex((d, qi) => !mine[qi]);
  const msg = $("msg" + n);
  if (missing >= 0) { msg.textContent = "Pick an answer for: " + e.decides[missing].q; return; }
  const note = ($("note" + n).value || "").trim().slice(0, 1000);
  const at = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const answer = { picks: e.decides.map((d, qi) => ({ q: d.q, key: mine[qi], text: (d.opts.find((o) => o.key === mine[qi]) || {}).text || "" })), note, at };
  btn.disabled = true;
  msg.textContent = "Sending…";
  const artifact = await claude.use("artifact");
  if (!artifact) { showCopy(n, answer, "Saving isn't available here."); btn.disabled = false; return; }
  DATA.answers[n] = answer;
  try {
    delete picks[n]; keepPicks();
    await artifact.publish(pageHtml()); // this view reloads to the saved page
  } catch (err) {
    delete DATA.answers[n];
    btn.disabled = false;
    const code = err && err.code;
    if (code === "conflict") { msg.textContent = "The page changed meanwhile; it is reloading. Send again after it opens."; return; }
    showCopy(n, answer, code === "not_writer" || code === "not_granted" ? "This view can't save answers." : "Couldn't save the answer (" + (code || "error") + ").");
  }
}
function showCopy(n, answer, why) {
  const e = DATA.entries.find((x) => x.num === n);
  const text = answerText(e, answer);
  $("msg" + n).innerHTML = esc(why) + ' Copy it and paste it in the chat instead: <button class="btn ghost" data-act="copy">Copy</button><pre class="copy">' + esc(text) + "</pre>";
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
  const b = ev.target.closest("button[data-act]");
  if (!b) return;
  if (b.dataset.act === "send") send(Number(b.dataset.n), b);
  if (b.dataset.act === "change") { delete DATA.answers[Number(b.dataset.n)]; render(); }
  if (b.dataset.act === "copy") {
    const pre = b.parentElement.querySelector("pre.copy");
    navigator.clipboard.writeText(pre.textContent).then(() => { b.textContent = "Copied"; }, () => {
      const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "Selected: copy it";
    });
  }
});
$("chat").addEventListener("change", (ev) => { chat = ev.target.value; try { localStorage.setItem("inbox-chat", chat); } catch (e) { /* not kept */ } render(); });
document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; try { localStorage.setItem("inbox-filter", filter); } catch (e) { /* not kept */ } render(); }));
render();
</script>
"""


def main(argv):
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
