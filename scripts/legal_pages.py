#!/usr/bin/env python3
"""Build the public privacy and terms pages from the finished documents (launch plan D1/D2, 21 Oct 2026).

  python scripts/legal_pages.py          -> apps/dashboard/public/privacy.html and terms.html

Sources: docs/launch/PRIVACY-NOTICE.md (the part under "## ForgeAI privacy notice"),
PRIVACY-NOTICE-HI.md (Hindi, below the English), TERMS.md. The admin app serves them as static files
(forgeai.aakashpahuja.in/privacy.html, /terms.html); the member app links to them when joining a gym.
CONTACT_NAME / CONTACT_EMAIL fill the documents' [OWNER NAME] / [CONTACT EMAIL] blanks. While they are
empty the pages go to docs/launch/preview/ instead (to look at), and public/ gets a short holding page
at each address that says the page is being finished, so an admin deploy can never publish a page with
blanks, and the member app's links never land on the admin app (R-76: the site sends any address it
does not have to the admin app, and the join screen's links did exactly that).
A tiny Markdown subset only: ## / ### headings, paragraphs, "- " lists, | tables |, **bold**.
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs", "launch")
OUT = os.path.join(ROOT, "apps", "dashboard", "public")

# Owner inbox #37: the complaints contact. Empty until he gives it.
CONTACT_NAME = ""
CONTACT_EMAIL = ""


def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    return t


def md_to_html(md):
    out, para, items, rows = [], [], [], []

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join("<li>" + inline(i) + "</li>" for i in items) + "</ul>")
            items.clear()
        if rows:
            head, body = rows[0], [r for r in rows[1:] if not set("".join(r)) <= set("-: ")]
            out.append('<div class="t"><table><thead><tr>' + "".join("<th>" + inline(c) + "</th>" for c in head) +
                       "</tr></thead><tbody>" + "".join("<tr>" + "".join("<td>" + inline(c) + "</td>" for c in r) + "</tr>" for r in body) +
                       "</tbody></table></div>")
            rows.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("|"):
            if para or items:
                flush()
            rows.append([c.strip() for c in line.strip().strip("|").split("|")])
            continue
        if rows:
            flush()
        m = re.match(r"^(#{2,3}) (.+)$", line)
        if m:
            flush()
            lvl = "h1" if len(m.group(1)) == 2 else "h2"
            out.append(f"<{lvl}>{inline(m.group(2))}</{lvl}>")
        elif re.match(r"^\s*- ", line):
            if para:
                out.append("<p>" + inline(" ".join(para)) + "</p>")
                para.clear()
            items.append(re.sub(r"^\s*- ", "", line))
        elif re.match(r"^\s*\d+\. ", line):
            if para:
                out.append("<p>" + inline(" ".join(para)) + "</p>")
                para.clear()
            items.append(re.sub(r"^\s*", "", line))
        elif not line.strip():
            flush()
        elif items and raw.startswith("  "):
            items[-1] += " " + line.strip()
        else:
            para.append(line.strip())
    flush()
    return "\n".join(out)


def section(md, start, stop=None):
    i = md.index(start)
    j = md.find(stop, i + len(start)) if stop else -1
    return md[i: j if j != -1 else len(md)]


def fill(md):
    if CONTACT_NAME:
        md = md.replace("[OWNER NAME]", CONTACT_NAME)
    if CONTACT_EMAIL:
        md = md.replace("[CONTACT EMAIL]", CONTACT_EMAIL)
    return md


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — ForgeAI</title><style>
:root{{color-scheme:light dark;--bg:#fff;--ink:#1b1f27;--muted:#5b6372;--line:#dde1e8;--accent:#c4501a}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1218;--ink:#e9ebf0;--muted:#a0a7b5;--line:#2c313b;--accent:#f08a4b}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:760px;margin:0 auto;padding:24px 16px 64px}}h1{{font-size:1.6rem;line-height:1.25}}h2{{font-size:1.15rem;margin-top:1.6em}}
.t{{overflow-x:auto}}table{{border-collapse:collapse;font-size:.92rem}}th,td{{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
a{{color:var(--accent)}}nav{{font-size:.9rem;color:var(--muted)}}hr{{border:0;border-top:1px solid var(--line);margin:40px 0}}
</style></head><body><main><nav><a href="/privacy.html">Privacy notice</a> · <a href="/terms.html">Terms</a></nav>
{body}
</main></body></html>
"""


HOLD = """<h1>{title}</h1>
<p>This page is being finished and will be here soon.</p>
<section lang="hi"><p>यह पेज तैयार किया जा रहा है और जल्द ही यहाँ होगा।</p></section>
"""


def main():
    priv = fill(open(os.path.join(DOCS, "PRIVACY-NOTICE.md"), encoding="utf-8").read())
    hindi = fill(open(os.path.join(DOCS, "PRIVACY-NOTICE-HI.md"), encoding="utf-8").read())
    terms = fill(open(os.path.join(DOCS, "TERMS.md"), encoding="utf-8").read())
    en = section(priv, "## ForgeAI privacy notice", "\n---")
    hi = hindi.split("\n---\n", 1)[1] if "\n---\n" in hindi else hindi
    tm = section(terms, "## A. For members")
    pages = {
        "privacy.html": PAGE.format(title="Privacy notice", body=md_to_html(en) + '\n<hr><section lang="hi"><h1>गोपनीयता सूचना (हिंदी)</h1>\n' + md_to_html(hi) + "</section>"),
        "terms.html": PAGE.format(title="Terms of use", body="<h1>ForgeAI terms of use</h1>\n" + md_to_html(tm)),
    }
    left = sorted(set(re.findall(r"\[(?:OWNER NAME|CONTACT EMAIL)\]", "".join(pages.values()))))
    out = os.path.join(DOCS, "preview") if left else OUT
    os.makedirs(out, exist_ok=True)
    for name, text in pages.items():
        with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("wrote", os.path.relpath(os.path.join(out, name), ROOT))
        if left:
            title = "ForgeAI privacy notice" if name == "privacy.html" else "ForgeAI terms of use"
            short = "Privacy notice" if name == "privacy.html" else "Terms of use"
            with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
                f.write(PAGE.format(title=short, body=HOLD.format(title=title)))
            print("wrote a holding page", os.path.relpath(os.path.join(OUT, name), ROOT), "(blanks: never the real page)")
    if left:
        print("NOT READY TO DEPLOY: blanks left: " + ", ".join(left) + " (owner inbox #37)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
