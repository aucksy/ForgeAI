#!/usr/bin/env python3
"""The phone test's OWN gyms (9 Nov 2026): every run makes the gyms it needs on the LIVE server at the
start, and lists / ends them at the end. Replaces the two fixed test gyms FORGE1 ("ForgeAI Test Gym")
and RAMS01 ("RAM'S FITNESS CLUB IMPACT"), which were deleted with every other test gym on 9 Nov 2026.

  make <slot> shop <name>    a fresh gym with the sample shop (demo_start_gym: the same 12 products the
                             old FORGE1 had, whey with its flavours, the shaker with 25 in stock), unbranded
  make <slot> brand <name>   the same, then branded as RAMS01 was: yellow #F7D411 on #0A0A0C, bold-italic
                             headings, and a sample logo (so the home-screen icon pop-up shows)
                             Both print CODE=<join code> and NAME=<gym name>.
  register <slot> <code> <name> [session]
                             a gym the run made another way (INV-e's demo gym, INV-f's online gym), so
                             the clean-up lists it; with "session", the session key is read from stdin
                             and ended at the clean-up
  cleanup                    at the end of the run, pass or fail: every session the run opened is ended
                             (staff_sign_out) and every gym the run made is written to the run's
                             evidence as qa-gyms-left.txt (join code + name only, never a key).

Deleting: the server has NO path a test can use to delete its own gym. The only delete is HQ's
hq_delete_gym (0027): service_role only, after a written request, a call and a reminder. So the clean-up
cannot delete; instead every gym made here is named "QA ..." so HQ's list hides it with the other test
gyms (apps/hq/public/logic.js testKind: names starting "QA ") and qa-gyms-left.txt lists what to sweep.

Security: owner keys and session keys live only in the state files under $XJ_STATE_DIR (mode 600,
outside the evidence); nothing here prints one, not even as a mask line.
"""
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xj_server as xj  # noqa: E402  (rpc, state files, config)
import uat_logo  # noqa: E402  (the sample logo and its upload)

BRAND = {"p_accent": "#F7D411", "p_bg": "#0A0A0C", "p_heading": "bold-italic"}


def made_list():
    return xj.state_dir() / "made-gyms.jsonl"


def remember(slot, code, name, kind):
    with open(made_list(), "a", encoding="utf-8") as f:
        f.write(json.dumps({"slot": slot, "joinCode": code, "name": name, "kind": kind}) + "\n")


def make(slot, kind, name):
    if not name.startswith("QA "):
        print(f"MAKE FAILED ({slot}): a run's gym must be named 'QA ...' so HQ hides it, not '{name}'")
        return 1
    g = xj.rpc("demo_start_gym", {"p_name": name}) or {}
    key = g.get("ownerKey") or ""
    if len(key) < 16 or not g.get("joinCode"):
        safe = {k: v for k, v in g.items() if k != "ownerKey"}
        print(f"MAKE FAILED ({slot}): demo_start_gym answered {json.dumps(safe)[:160]}")
        return 1
    # No mask line: the key is never printed, and a mask line would itself carry the key into the
    # timeline (run 42588121791 printed two that way, prefixed so the runner did not hide them).
    st = {"slot": slot, "gymId": g["gymId"], "name": g.get("name") or name, "joinCode": g["joinCode"],
          "key": key, "kind": kind, "session": False, "orders": {}}
    xj.save(slot, st)
    remember(slot, st["joinCode"], st["name"], kind)
    shop = xj.rpc("owner_products", {"p_key": key}) or []
    said = f"{len(shop)} products"
    if kind == "brand":
        url, anon = xj.config()
        ticket = str(xj.rpc("owner_photo_ticket", {"p_key": key}))
        path = f"{ticket}/logo-{uuid.uuid4().hex}.png"
        uat_logo.upload(url, anon, path, uat_logo.sample_logo_png())
        link = f"{url}/storage/v1/object/public/gym-logos/{path}"
        b = (xj.rpc("owner_set_brand", {"p_key": key, "p_logo_url": link, **BRAND}) or {}).get("brand") or {}
        if (b.get("accent") or "").upper() != BRAND["p_accent"] or b.get("logoUrl") != link:
            print(f"MAKE FAILED ({slot}): the brand did not stick ({json.dumps(b)[:160]})")
            return 1
        said += f", brand {b.get('accent')} on {b.get('bg')}, logo set"
    print(f"QA GYM {slot}: '{st['name']}' code {st['joinCode']} ({said})")
    print(f"CODE={st['joinCode']}")
    print(f"NAME={st['name']}")
    return 0


def register(slot, code, name, with_session):
    st = {"slot": slot, "name": name, "joinCode": code, "kind": "other", "session": with_session}
    if with_session:
        key = sys.stdin.read().strip()
        if len(key) < 16:
            print(f"REGISTER FAILED ({slot}): no session key on stdin")
            return 1
        st["key"] = key
    xj.save(slot, st)
    remember(slot, code, name, st["kind"])
    print(f"QA GYM {slot}: '{name}' code {code} registered for the clean-up")
    return 0


def cleanup(out_dir):
    ended, lines = [], []
    for p in sorted(xj.state_dir().glob("*.json")):
        try:
            st = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        # A gym_create_online gym (xj_server / uat_gym) or one registered with its session: end the session.
        if st.get("key") and st.get("session", True) and not st.get("signedOut"):
            try:
                xj.rpc("staff_sign_out", {"p_key": st["key"]})
                ended.append(f"{st.get('joinCode')}")
            except RuntimeError as e:
                ended.append(f"{st.get('joinCode')} (already ended or refused: {str(e)[:60]})")
            st["signedOut"] = True
            xj.save(st.get("slot") or p.stem, st)
    seen = set()
    if made_list().exists():
        for row in made_list().read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(row)
            except ValueError:
                continue
            if r.get("joinCode") in seen:
                continue
            seen.add(r.get("joinCode"))
            lines.append(f"{r.get('joinCode')}\t{r.get('name')}\t{r.get('kind')}")
    # The uat part's own gym (uat_gym.py) is made through xj_server: listed from its state file.
    for p in sorted(xj.state_dir().glob("*.json")):
        try:
            st = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if st.get("joinCode") and st["joinCode"] not in seen:
            seen.add(st["joinCode"])
            lines.append(f"{st['joinCode']}\t{st.get('name')}\tonline")
    text = ("# Gyms this run made on the LIVE server (join code, name, kind). No delete path exists for a test\n"
            "# (only HQ's hq_delete_gym), so they stay; every name starts 'QA ', which HQ hides as a test gym.\n"
            + "".join(l + "\n" for l in lines))
    if out_dir:
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        (Path(out_dir) / "qa-gyms-left.txt").write_text(text, encoding="utf-8")
    print(f"QA GYMS CLEAN-UP: {len(ended)} session(s) ended ({', '.join(ended) or 'none'}); "
          f"{len(lines)} gym(s) made by this run left on the server, named 'QA ...' "
          f"(no delete path for a test): {', '.join(l.split(chr(9))[0] for l in lines) or 'none'}")
    return 0


def main(argv):
    try:
        if len(argv) == 4 and argv[0] == "make" and argv[2] in ("shop", "brand"):
            return make(argv[1], argv[2], argv[3])
        if len(argv) in (4, 5) and argv[0] == "register":
            return register(argv[1], argv[2], argv[3], len(argv) == 5 and argv[4] == "session")
        if len(argv) in (1, 2) and argv[0] == "cleanup":
            return cleanup(argv[1] if len(argv) == 2 else os.environ.get("QA_OUT", ""))
    except (RuntimeError, OSError, ValueError, KeyError) as e:
        print(f"QA GYMS FAILED ({' '.join(argv[:2])}): {type(e).__name__}: {e}")
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
