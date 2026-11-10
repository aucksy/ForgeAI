#!/usr/bin/env python3
"""Build the public legal pages from their one source (R-445, 10 Nov 2026).

  python scripts/legal_pages.py          -> apps/dashboard/public/privacy.html, terms.html, data-agreement.html
  python scripts/legal_pages.py --check  -> exit 1 if a published page is not exactly what the source builds

THE SOURCE (the owner approved these words "all as recommended" on 10 Nov 2026, R-443/R-445):
  docs/legal/privacy.body.html      the English privacy notice (everything inside <main> after the menu)
  docs/legal/privacy-hi.body.html   its Hindi version, shown below the English ("English wins if they differ")
  docs/legal/terms.body.html        the terms of use (A members, B gyms)
  docs/legal/data-agreement.body.html  the gym data agreement; its "Version YYYY-MM-DD." line must equal
                                    TERMS_VERSION in apps/dashboard/src/crm/auth/terms.ts and the newest
                                    entry of _terms_versions() in supabase/migrations (tests check both)
Change the words ONLY in those files, then run this script. Never hand-edit the pages in public/:
apps/dashboard/test/crm/legalPages.test.ts fails when a published page and its source differ.
(Until 10 Nov 2026 the source was docs/launch/PRIVACY-NOTICE.md, TERMS.md and DATA-AGREEMENT.md; the
live page had been hand-edited past them, so rebuilding would have dropped approved lines. They are
retired: each now points here.)

The admin app's site serves the pages as static files (mettleup.fit/privacy, app.mettleup.fit/privacy.html,
the old forgeai.aakashpahuja.in too; deploy/panel/hosts.js). The member app links to the privacy notice
and terms; the admin app's "I agree" box to the terms and the data agreement. No script on the pages
(the site's security policy runs none). public/delete-account.html is hand-written (Google Play's
account-deletion page) and is not built here.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "legal")
OUT = os.path.join(ROOT, "apps", "dashboard", "public")

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — MettleUp</title><style>
:root{{color-scheme:light dark;--bg:#fff;--ink:#1b1f27;--muted:#5b6372;--line:#dde1e8;--accent:#c4501a}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1218;--ink:#e9ebf0;--muted:#a0a7b5;--line:#2c313b;--accent:#f08a4b}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:760px;margin:0 auto;padding:24px 16px 64px}}h1{{font-size:1.6rem;line-height:1.25}}h2{{font-size:1.15rem;margin-top:1.8em}}h3{{font-size:1rem;margin-top:1.4em}}
.t{{overflow-x:auto}}table{{border-collapse:collapse;font-size:.92rem}}th,td{{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
a{{color:var(--accent)}}nav{{font-size:.9rem;color:var(--muted)}}hr{{border:0;border-top:1px solid var(--line);margin:40px 0}}
blockquote{{border-left:4px solid var(--line);margin:0;padding:4px 14px}}
.sum{{border-left:4px solid var(--accent);padding:4px 0 4px 14px}}.sum li{{margin:4px 0}}.muted{{color:var(--muted);font-size:.92rem}}
.toc{{font-size:.92rem;columns:2;column-gap:24px;padding-left:20px}}@media (max-width:520px){{.toc{{columns:1}}}}
</style></head><body><main>
<nav><a href="/privacy.html">Privacy notice</a> · <a href="/terms.html">Terms</a> · <a href="/data-agreement.html">Data agreement</a> · <a href="/delete-account.html">Delete your account</a></nav>
{body}</main></body></html>
"""


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        text = f.read().replace("\r\n", "\n")
    # ([Gym name] in the data agreement's short notice is a blank for the gym to fill: it stays.)
    if re.search(r"<script|\[(?:OWNER NAME|CONTACT EMAIL)\]|DRAFT", text):
        raise SystemExit(f"{name}: a script, a blank or a DRAFT mark is left; fix the source first")
    return text.rstrip() + "\n"


def pages():
    da = read("data-agreement.body.html")
    if not re.search(r"<strong>Version \d{4}-\d{2}-\d{2}\.</strong>", da):
        raise SystemExit("data-agreement.body.html: no 'Version YYYY-MM-DD.' line")
    return {
        "privacy.html": PAGE.format(title="Privacy notice", body=read("privacy.body.html") + "\n<hr>\n" + read("privacy-hi.body.html")),
        "terms.html": PAGE.format(title="Terms of use", body=read("terms.body.html")),
        "data-agreement.html": PAGE.format(title="Data agreement", body=da),
    }


def main(argv):
    check = "--check" in argv
    bad = 0
    for name, text in pages().items():
        path = os.path.join(OUT, name)
        if check:
            with open(path, encoding="utf-8") as f:
                same = f.read() == text
            print(("same  " if same else "DIFFERS ") + os.path.relpath(path, ROOT))
            bad += 0 if same else 1
        else:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            print("wrote", os.path.relpath(path, ROOT))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
