#!/usr/bin/env python3
"""Release UAT, the gym half (part "uat", launch polish of 3 Nov 2026): a FRESH online test gym for the
phone's check-in and "Your plan ends on ..." checks. Built on the cross-role journeys' helpers
(xj_server.py: gym_create_online, the state file, the owner's own functions; xc_server.py: the desk's
yes to a typed number), the way qa-journeys and qa-conditions make their own gyms every run.

  setup <slot> <phone-today YYYY-MM-DD> <days-left> <full name> <mobile>
        a fresh gym "QA UAT Gym", and on its desk list <full name> with <mobile> and a plan that
        started 20 days ago (India) and ends <days-left> days after the PHONE's today. Prints
        CODE=<join code> and ENDS=<the day as the app words it: "Friday, 6 Nov">.
  confirm <slot> <+91mobile>   the desk's yes to that typed check-in number (0048), if one waits
  sign-out <slot>              end the owner session

Security (WP6 rules, unchanged): the gym is made by this run; never FORGE1 / RAMS01; the owner session
key lives only in the state file under $XJ_STATE_DIR and is never printed.
"""
import datetime
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xj_server as xj  # noqa: E402
import xc_server as xc  # noqa: E402

GYM_NAME = "QA UAT Gym"
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def app_day_words(d):
    """As src/shop/planEnds.ts says it for 2..7 days away: "Friday, 6 Nov"."""
    return f"{DAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]}"


def add_member_with_plan(st, full_name, mobile, ends_on):
    pulled = xj.rpc("crm_pull", {"p_key": st["key"], "p_since": 0}) or {}
    base = pulled.get("version")
    now_ms = int(time.time() * 1000)
    day = xj.today_ist()
    starts = (datetime.date.fromisoformat(day) - datetime.timedelta(days=20)).isoformat()
    mid = "uat-" + uuid.uuid4().hex[:12]
    gym = st["gymId"]
    recs = [
        {"k": "member", "id": mid, "d": {"id": mid, "gymId": gym, "fullName": full_name,
                                          "phone": "+91" + mobile, "createdAt": now_ms, "joinedOn": starts}},
        {"k": "membership", "id": mid + "-m", "d": {"id": mid + "-m", "gymId": gym, "memberId": mid,
                                                    "planName": "QA Monthly", "startsOn": starts, "endsOn": ends_on,
                                                    "pricePaise": 0, "cancelled": False, "createdAt": now_ms}},
    ]
    v = xj.rpc("crm_push", {"p_key": st["key"], "p_base": base, "p_records": recs, "p_push_id": str(uuid.uuid4())})
    return f"'{full_name}' on the desk list with a plan {starts}..{ends_on} (version {v})"


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, slot = argv[0], argv[1]
    if cmd == "setup":
        phone_today, left, full_name, mobile = argv[2], int(argv[3]), argv[4], argv[5]
        rc = xj.main(["new-gym", slot, GYM_NAME])
        if rc:
            return rc
        st = xj.load(slot)
        ends = datetime.date.fromisoformat(phone_today) + datetime.timedelta(days=left)
        print(add_member_with_plan(st, full_name, mobile, ends.isoformat()))
        print(f"CODE={st['joinCode']}")
        print(f"ENDS={app_day_words(ends)}")
        return 0
    if cmd == "confirm":
        print(xc.confirm_numbers(xj.load(slot), argv[2]))
        return 0
    if cmd == "sign-out":
        return xj.main(["sign-out", slot])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
