#!/usr/bin/env python3
"""Cross-role journeys (UAT work package 6): the server half, on the LIVE server.

Called by run-journeys.sh between the member app (Maestro) and the admin app (Playwright) steps:

  new-gym <slot> <gym name>       make a FRESH online gym (gym_create_online, the way part INV-f
                                  does) and keep its owner session in <state dir>/<slot>.json
  check <slot> <what> [args...]   read the gym's state through the owner's own functions and
                                  assert one hand-off (see CHECKS below); prints "CHECK OK ..." or
                                  "CHECK FAILED ...", exit 0 / 1
  sign-out <slot>                 end the owner session at the end of the run (staff_sign_out)
  code <slot>                     print the gym's join code (for the phone steps)

Security (hard rules of WP6): never a key for the shared test gyms FORGE1 / RAMS01 (this file only
ever makes its own gyms); the session key is written ONLY to the state file (mode 600, outside the
uploaded evidence), never printed; on GitHub Actions it is also masked in the log.

State dir: $XJ_STATE_DIR (run-journeys.sh puts it under $RUNNER_TEMP, never under qa-out).
Server: apps/mobile/app.json (expo.extra.supabaseUrl / supabasePublishableKey), the same
publishable key the app ships with.
"""
import datetime
import json
import os
import stat
import sys
import urllib.error
import urllib.request
from pathlib import Path

QA_DIR = Path(__file__).resolve().parent
OWNER_PHONE = "9876500001"  # the same made-up owner mobile part INV-f uses


def config():
    extra = json.loads((QA_DIR.parent / "app.json").read_text(encoding="utf-8"))["expo"]["extra"]
    return extra["supabaseUrl"].rstrip("/"), extra["supabasePublishableKey"]


def rpc(fn, args):
    url, key = config()
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/{fn}",
        data=json.dumps(args).encode("utf-8"),
        headers={"apikey": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"{fn} answered {e.code}: {detail}") from None
    return json.loads(body) if body.strip() else None


def state_dir():
    d = Path(os.environ.get("XJ_STATE_DIR") or (Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "xj-state"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def state_path(slot):
    return state_dir() / f"{slot}.json"


def load(slot):
    return json.loads(state_path(slot).read_text(encoding="utf-8"))


def save(slot, st):
    p = state_path(slot)
    p.write_text(json.dumps(st), encoding="utf-8")
    try:
        os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def mask(secret):
    if os.environ.get("GITHUB_ACTIONS") == "true" and secret:
        print(f"::add-mask::{secret}", flush=True)


def today_ist():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)).date().isoformat()


# ---------------------------------------------------------------- reading the gym
def products(st):
    return rpc("owner_products", {"p_key": st["key"]}) or []


def product(st, name):
    found = [p for p in products(st) if p.get("name") == name]
    return found[0] if found else None


def orders_with(st, name):
    """The gym's orders holding product `name`, newest first."""
    rows = rpc("owner_orders", {"p_key": st["key"]}) or []
    return [o for o in rows if any(l.get("name") == name for l in (o.get("lines") or []))]


def records(st):
    """The gym's online records (crm_pull from 0): {kind: {id: data}}."""
    out = {}
    for r in (rpc("crm_pull", {"p_key": st["key"], "p_since": 0}) or {}).get("records") or []:
        if r.get("x") or r.get("d") is None:
            continue
        out.setdefault(r["k"], {})[r["id"]] = r["d"]
    return out


def member_by_name(recs, name):
    found = [m for m in recs.get("member", {}).values() if m.get("fullName") == name]
    return found[0] if found else None


def messages(st):
    return rpc("owner_messages", {"p_key": st["key"]}) or []


# ---------------------------------------------------------------- the checks
class Fail(Exception):
    pass


def need(ok, what):
    if not ok:
        raise Fail(what)


def check_stock(st, name, n):
    p = product(st, name)
    need(p is not None, f"product '{name}' is not in the gym's shop")
    need(int(p.get("stock", -1)) == int(n), f"'{name}' stock is {p.get('stock')}, expected {n}")
    return f"'{name}' stock {p.get('stock')}"


def check_order(st, name, status, qty, by="-", remember=""):
    """The NEWEST order holding `name`: its status, the quantity of `name` in it, and for a
    cancelled order who cancelled it (member / gym). `remember` keeps its number in the state for
    the admin step that follows (it taps "Mark ready, order N")."""
    rows = orders_with(st, name)
    need(rows, f"no order holds '{name}'")
    o = rows[0]
    q = sum(int(l.get("qty") or 0) for l in o.get("lines") or [] if l.get("name") == name)
    need(o.get("status") == status, f"order {o.get('order_no')} is '{o.get('status')}', expected '{status}'")
    need(q == int(qty), f"order {o.get('order_no')} has {q} x '{name}', expected {qty}")
    if by != "-":
        need(o.get("cancelled_by") == by, f"order {o.get('order_no')} cancelled by '{o.get('cancelled_by')}', expected '{by}'")
    if remember:
        st.setdefault("orders", {})[remember] = o.get("order_no")
    return f"order {o.get('order_no')}: {q} x '{name}', {o.get('status')}" + (f" by {o.get('cancelled_by')}" if by != "-" else "")


def check_message(st, title, seen, withdrawn):
    rows = [m for m in messages(st) if m.get("title") == title]
    need(rows, f"no message titled '{title}'")
    m = rows[0]
    need(int(m.get("seen") or 0) == int(seen), f"'{title}' seen by {m.get('seen')}, expected {seen}")
    w = "yes" if m.get("withdrawn") else "no"
    need(w == withdrawn, f"'{title}' withdrawn={w}, expected {withdrawn}")
    return f"'{title}': {m.get('recipients')} recipient(s), seen {m.get('seen')}, withdrawn {w}"


def check_app_members(st, n):
    rows = rpc("owner_app_members", {"p_key": st["key"]}) or []
    need(len(rows) == int(n), f"{len(rows)} app member(s), expected {n}")
    return f"{len(rows)} app member(s)"


def check_plan_today(st, name):
    recs = records(st)
    m = member_by_name(recs, name)
    need(m is not None, f"no roster member '{name}'")
    day = today_ist()
    plans = [x for x in recs.get("membership", {}).values()
             if x.get("memberId") == m.get("id") and not x.get("cancelled")
             and str(x.get("startsOn")) <= day <= str(x.get("endsOn"))]
    need(plans, f"'{name}' has no plan covering {day}")
    return f"'{name}' plan {plans[0].get('startsOn')}..{plans[0].get('endsOn')} covers {day}"


def check_roster(st, n):
    recs = records(st)
    live = [m for m in recs.get("member", {}).values() if not m.get("archived")]
    need(len(live) == int(n), f"{len(live)} roster member(s), expected {n}")
    return f"{len(live)} roster member(s): " + ", ".join(sorted(m.get("fullName", "?") for m in live))


def check_visit(st, name, source):
    recs = records(st)
    m = member_by_name(recs, name)
    need(m is not None, f"no roster member '{name}'")
    day = today_ist()
    vs = [v for v in recs.get("visit", {}).values() if v.get("memberId") == m.get("id") and v.get("visitedOn") == day]
    need(len(vs) == 1, f"'{name}' has {len(vs)} visit(s) on {day}, expected 1")
    need((vs[0].get("source") or "desk") == source, f"the visit's source is '{vs[0].get('source')}', expected '{source}'")
    return f"'{name}' visited {day}, source {vs[0].get('source')}"


def check_visits_total(st, n):
    day = today_ist()
    vs = [v for v in records(st).get("visit", {}).values() if v.get("visitedOn") == day]
    need(len(vs) == int(n), f"{len(vs)} visit(s) on {day}, expected {n}")
    return f"{len(vs)} visit(s) on {day}"


def check_brand(st, accent):
    g = rpc("owner_gym", {"p_key": st["key"]}) or {}
    a = ((g.get("brand") or {}).get("accent") or "").upper()
    need(a == accent.upper(), f"brand accent is '{a}', expected '{accent.upper()}'")
    return f"brand accent {a}"


CHECKS = {
    "stock": (check_stock, "<product> <n>"),
    "order": (check_order, "<product> <status> <qty> [cancelled-by|-] [remember-as]"),
    "message": (check_message, "<title> <seen> <withdrawn yes|no>"),
    "app-members": (check_app_members, "<n>"),
    "plan-today": (check_plan_today, "<member name>"),
    "roster": (check_roster, "<n>"),
    "visit": (check_visit, "<member name> <source app|desk|import>"),
    "visits-today": (check_visits_total, "<n>"),
    "brand": (check_brand, "<#RRGGBB>"),
}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, slot = argv[0], argv[1]
    if cmd == "new-gym":
        name = argv[2] if len(argv) > 2 else "QA Journey Gym"
        g = rpc("gym_create_online", {"p_gym_name": name, "p_name": "QA Owner", "p_phone": OWNER_PHONE,
                                      "p_device": "QA journeys (run-journeys.sh)"})
        key = (g or {}).get("sessionKey") or ""
        if len(key) < 16 or not g.get("joinCode"):
            # The answer without the key: never print a session.
            safe = {k: v for k, v in (g or {}).items() if k != "sessionKey"}
            print(f"NEW GYM FAILED ({slot}): {json.dumps(safe)[:160]}")
            return 1
        mask(key)
        save(slot, {"slot": slot, "gymId": g["gymId"], "name": g.get("name") or name, "joinCode": g["joinCode"],
                    "key": key, "person": g.get("person"), "orders": {}})
        print(f"NEW GYM {slot}: '{g.get('name') or name}' code {g['joinCode']} (online, owner session kept in the state file only)")
        return 0
    st = load(slot)
    # Nothing below prints the key, so nothing below masks it either: a mask line on stdout would
    # itself carry the key into whatever captures this output (run 38965066052 caught the join code
    # that way, the key with it, in the summary; those sessions were already signed out).
    if cmd == "code":
        print(st["joinCode"])
        return 0
    if cmd == "sign-out":
        try:
            rpc("staff_sign_out", {"p_key": st["key"]})
            print(f"SIGNED OUT {slot}: the owner session of '{st['name']}' ({st['joinCode']}) is ended")
        except RuntimeError as e:
            print(f"SIGN-OUT FAILED {slot}: {e}")
            return 1
        return 0
    if cmd == "check":
        what = argv[2]
        fn, usage = CHECKS[what]
        try:
            said = fn(st, *argv[3:])
            save(slot, st)
            print(f"CHECK OK {slot} {what}: {said}")
            return 0
        except Fail as e:
            print(f"CHECK FAILED {slot} {what}: {e}")
            return 1
        except (RuntimeError, TypeError, KeyError, ValueError) as e:
            print(f"CHECK FAILED {slot} {what} ({usage}): {type(e).__name__}: {e}")
            return 1
    print(f"unknown command {cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
