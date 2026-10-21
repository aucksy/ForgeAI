#!/usr/bin/env python3
"""Leads from the landing page's "free demo" form (launch I3; deploy/panel/leads.js).

  python scripts/leads.py                          -> the new leads, oldest first
  python scripts/leads.py all [N]                  -> the last N leads (default 50)
  python scripts/leads.py mark <id> <status> <note> -> status: called | demo | won | lost
  python scripts/leads.py purge                    -> delete leads older than 12 months that were not won

Personal data (a gym owner's mobile number): read it here, never paste it into a public place,
and never send it anywhere but the call back. Same Cloudflare sign-in as scripts/feedback.py.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANEL = os.path.join(ROOT, "deploy", "panel")
STATUSES = ("called", "demo", "won", "lost")


def sql_text(v):
    return "'" + str(v).replace("'", "''") + "'"


def d1(sql):
    env = dict(os.environ)
    node = os.path.join(env.get("LOCALAPPDATA", ""), "nodejs")
    env["PATH"] = node + os.pathsep + env.get("PATH", "")
    out = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "forgeai-web", "--remote", "--json", "--command", sql],
        cwd=PANEL, env=env, capture_output=True, text=True, encoding="utf-8", shell=os.name == "nt", timeout=180,
    )
    if out.returncode != 0:
        sys.exit("wrangler failed:\n" + out.stderr[-2000:])
    start = out.stdout.find("[")
    return json.loads(out.stdout[start:])[0].get("results", [])


def show(rows):
    for r in rows:
        print(f"#{r['id']}  {r['at'][:16]}  {r['phone']}  {r['gym']} ({r['city']})  size {r['size'] or '-'}  today {r['today'] or '-'}  {r['lang']}  [{r['status']}] {r['note']}")
    print(f"({len(rows)} lead(s))")


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "new"
    if cmd == "new":
        show(d1("SELECT * FROM leads WHERE status = 'new' ORDER BY id"))
    elif cmd == "all":
        n = int(argv[2]) if len(argv) > 2 else 50
        show(d1(f"SELECT * FROM leads ORDER BY id DESC LIMIT {n}"))
    elif cmd == "mark" and len(argv) >= 5:
        lid, status, note = int(argv[2]), argv[3], " ".join(argv[4:])
        if status not in STATUSES:
            sys.exit(f"status must be one of {', '.join(STATUSES)}")
        d1(f"UPDATE leads SET status = {sql_text(status)}, note = {sql_text(note[:500])} WHERE id = {lid}")
        print(f"#{lid} -> {status}")
    elif cmd == "purge":
        d1("DELETE FROM leads WHERE status <> 'won' AND at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 months')")
        print("leads older than 12 months (not won): deleted")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
