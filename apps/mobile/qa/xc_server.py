#!/usr/bin/env python3
"""Real-life phone conditions (UAT work package 7): the server half, on the LIVE server.

Called by run-conditions.sh between the phone steps. It reuses the cross-role journeys' server
helper (xj_server.py: the fresh online gym, the owner's own functions, the state file) and adds the
owner actions this package needs without the admin app, plus the checks that count what the server
holds after a phone went offline, slow or was cut off mid-request:

  new-gym <slot> <gym name>              a FRESH online gym (xj_server new-gym)
  code <slot> / sign-out <slot>          as xj_server
  add-product <slot> <name> <rupees> <stock>
                                         the owner adds a product (owner_save_product)
  add-roster <slot> <full name> <mobile> the owner's desk list gets a member with that mobile and
                                         a plan covering today (crm_push, as the admin app saves)
  set-orders <slot> <status>             every open order (ordered / ready) moves to <status>
                                         (owner_set_order_status: collected, cancelled, ...)
  check <slot> <what> [args...]          one assertion; prints "CHECK OK ..." / "CHECK FAILED ..."
  wait <slot> <seconds> <what> [args...] the same check, asked again every 5 s until it passes

Security (WP6 rules, unchanged): the gym is made by this run; never FORGE1 / RAMS01; the owner
session key lives only in the state file under $XJ_STATE_DIR (outside the evidence) and is never
printed; the session is signed out at the end of the run.
"""
import datetime
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xj_server as xj  # noqa: E402  (the shared helper: rpc, state file, checks)


def today_ist():
    return xj.today_ist()


def add_product(st, name, rupees, stock):
    p = {"name": name, "priceP": int(float(rupees) * 100), "stock": int(stock), "description": "QA conditions"}
    row = xj.rpc("owner_save_product", {"p_key": st["key"], "p": p}) or {}
    if isinstance(row, list):
        row = row[0] if row else {}
    if row.get("name") != name:
        raise xj.Fail(f"owner_save_product answered without the product: {json.dumps({k: row.get(k) for k in ('name', 'stock')})}")
    return f"'{name}' Rs {rupees}, stock {row.get('stock')}"


def add_roster(st, full_name, mobile):
    """A desk member with this mobile and a plan from today for 30 days, saved the way the admin app
    saves records (crm_push on the gym's current version)."""
    pulled = xj.rpc("crm_pull", {"p_key": st["key"], "p_since": 0}) or {}
    # As crm_pull gave it (crm_push refuses any other base as STALE).
    base = pulled.get("version")
    now_ms = int(time.time() * 1000)
    day = today_ist()
    end = (datetime.date.fromisoformat(day) + datetime.timedelta(days=29)).isoformat()
    mid = "xc-" + uuid.uuid4().hex[:12]
    gym = st["gymId"]
    recs = [
        {"k": "member", "id": mid, "d": {"id": mid, "gymId": gym, "fullName": full_name,
                                          "phone": "+91" + mobile, "createdAt": now_ms, "joinedOn": day}},
        {"k": "membership", "id": mid + "-m", "d": {"id": mid + "-m", "gymId": gym, "memberId": mid,
                                                    "planName": "QA Monthly", "startsOn": day, "endsOn": end,
                                                    "pricePaise": 0, "cancelled": False, "createdAt": now_ms}},
    ]
    v = xj.rpc("crm_push", {"p_key": st["key"], "p_base": base, "p_records": recs, "p_push_id": str(uuid.uuid4())})
    return f"'{full_name}' on the desk list with a plan {day}..{end} (version {v})"


def set_orders(st, status):
    rows = xj.rpc("owner_orders", {"p_key": st["key"]}) or []
    moved = []
    for o in rows:
        if o.get("status") in ("ordered", "ready"):
            xj.rpc("owner_set_order_status", {"p_key": st["key"], "p_order": o["order_id"], "p_status": status})
            moved.append(str(o.get("order_no")))
    return f"{len(moved)} open order(s) -> {status}: {', '.join(moved) or 'none'}"


# ---------------------------------------------------------------- checks (besides xj_server's)
def check_orders_count(st, name, n):
    """Exactly n orders on the server hold `name` (any status): the no-duplicate check."""
    rows = xj.orders_with(st, name)
    desc = ", ".join(f"{o.get('order_no')}:{o.get('status')}" for o in rows) or "none"
    xj.need(len(rows) == int(n), f"{len(rows)} order(s) hold '{name}' ({desc}), expected exactly {n}")
    return f"{len(rows)} order(s) hold '{name}' ({desc})"


def check_open_orders(st, n):
    rows = [o for o in (xj.rpc("owner_orders", {"p_key": st["key"]}) or []) if o.get("status") in ("ordered", "ready")]
    xj.need(len(rows) == int(n), f"{len(rows)} open order(s), expected {n}")
    return f"{len(rows)} open order(s)"


CHECKS = dict(xj.CHECKS)
CHECKS.update({
    "orders-count": (check_orders_count, "<product> <n>"),
    "open-orders": (check_open_orders, "<n>"),
})


def run_check(slot, what, args):
    st = xj.load(slot)
    fn, usage = CHECKS[what]
    try:
        said = fn(st, *args)
        xj.save(slot, st)
        return True, f"CHECK OK {slot} {what}: {said}"
    except xj.Fail as e:
        return False, f"CHECK FAILED {slot} {what}: {e}"
    except (RuntimeError, TypeError, KeyError, ValueError) as e:
        return False, f"CHECK FAILED {slot} {what} ({usage}): {type(e).__name__}: {e}"


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, slot = argv[0], argv[1]
    if cmd in ("new-gym", "code", "sign-out"):
        return xj.main(argv)
    if cmd in ("add-product", "add-roster", "set-orders"):
        st = xj.load(slot)
        try:
            if cmd == "add-product":
                said = add_product(st, argv[2], argv[3], argv[4])
            elif cmd == "add-roster":
                said = add_roster(st, argv[2], argv[3])
            else:
                said = set_orders(st, argv[2])
            print(f"OWNER {slot} {cmd}: {said}")
            return 0
        except (xj.Fail, RuntimeError, KeyError, ValueError, IndexError) as e:
            print(f"OWNER FAILED {slot} {cmd}: {type(e).__name__}: {e}")
            return 1
    if cmd == "check":
        ok, line = run_check(slot, argv[2], argv[3:])
        print(line)
        return 0 if ok else 1
    if cmd == "wait":
        limit = float(argv[2])
        t0 = time.time()
        while True:
            ok, line = run_check(slot, argv[3], argv[4:])
            if ok or time.time() - t0 >= limit:
                print(f"{line} (after {time.time() - t0:.0f}s)")
                return 0 if ok else 1
            time.sleep(5)
    print(f"unknown command {cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
