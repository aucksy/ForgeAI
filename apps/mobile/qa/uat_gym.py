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
  make-pass <slot> <full name> <company>
        F123: that desk-list member becomes a pass member of <company> (FITPASS) from today, and their
        plan is cancelled (a pass member has no plan), as the admin app's member form would save it.
        Until the live server has 0055 it cannot say "pass member", so the member also gets a running
        plan named "QA pass stand-in: <company>": the old server lets their check-in through (as 0055
        does), and only a QA build (extra.qaStandIns has passMember) reads it as the pass
        (src/shop/membership.ts withQaPassStandIn). With 0055 live the server's own answer wins.
  own-code <slot>              R-458: a one-time sign-in code the owner makes for HIMSELF (owner_make_signin_code), for
                               the member app's "Do you run a gym on MettleUp?". Prints ::add-mask:: and OWNCODE=<6 digits>.
  answer <slot> <text>         R-533: the gym (the owner's session) answers the newest open question in "Ask about your
                               workout" (owner_questions -> owner_answer_question, as the admin app's Member questions
                               page does). Prints ANSWERED=1, or NO_OPEN_QUESTION when none waits (0053 not live, or
                               the phone sent none).
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


def make_pass(st, full_name, company):
    pulled = xj.rpc("crm_pull", {"p_key": st["key"], "p_since": 0}) or {}
    base = pulled.get("version")
    rows = [r for r in pulled.get("records") or [] if not r.get("x") and r.get("d") is not None]
    member = next((r["d"] for r in rows if r["k"] == "member" and r["d"].get("fullName") == full_name), None)
    if not member:
        return f"NO MEMBER '{full_name}' on the desk list"
    now_ms = int(time.time() * 1000)
    recs = [{"k": "member", "id": member["id"],
             "d": {**member, "passCompany": company, "passSince": xj.today_ist(), "updatedAt": now_ms}}]
    for r in rows:
        if r["k"] == "membership" and r["d"].get("memberId") == member["id"]:
            recs.append({"k": "membership", "id": r["id"], "d": {**r["d"], "cancelled": True, "updatedAt": now_ms}})
    cancelled = len(recs) - 1
    today = datetime.date.fromisoformat(xj.today_ist())
    sid = member["id"] + "-qa-pass"
    recs.append({"k": "membership", "id": sid, "d": {
        "id": sid, "gymId": st["gymId"], "memberId": member["id"], "planName": "QA pass stand-in: " + company,
        "startsOn": (today - datetime.timedelta(days=1)).isoformat(),
        "endsOn": (today + datetime.timedelta(days=30)).isoformat(),
        "pricePaise": 0, "cancelled": False, "createdAt": now_ms}})
    v = xj.rpc("crm_push", {"p_key": st["key"], "p_base": base, "p_records": recs, "p_push_id": str(uuid.uuid4())})
    return f"'{full_name}' is now a {company} pass member, {cancelled} plan(s) cancelled, stand-in plan added (version {v})"


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
    if cmd == "make-pass":
        print(make_pass(xj.load(slot), argv[2], argv[3]))
        return 0
    if cmd == "own-code":
        st = xj.load(slot)
        staff = (st.get("person") or {}).get("staffId")
        made = xj.rpc("owner_make_signin_code", {"p_key": st["key"], "p_staff": staff}) or {}
        code = str(made.get("code") or "")
        if len(code) != 6:
            print("OWN CODE FAILED (no code in the answer)")
            return 1
        print(f"::add-mask::{code}")
        print(f"OWNCODE={code}")
        return 0
    if cmd == "answer":
        st = xj.load(slot)
        got = xj.rpc("owner_questions", {"p_key": st["key"]}) or {}
        waiting = [q for q in (got.get("questions") or []) if q.get("open")]
        if not waiting:
            print("NO_OPEN_QUESTION")
            return 0
        done = xj.rpc("owner_answer_question", {"p_key": st["key"], "p_id": waiting[0]["id"], "p_answer": argv[2]}) or {}
        if done.get("ok") is not True:
            print(f"ANSWER FAILED: {str(done)[:160]}")
            return 1
        print("ANSWERED=1")
        return 0
    if cmd == "sign-out":
        return xj.main(["sign-out", slot])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
