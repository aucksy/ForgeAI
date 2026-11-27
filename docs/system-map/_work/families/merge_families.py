"""Join the four part-files of cause families into master families, place the owner's notes, write
docs/system-map/FAMILIES.json and FAMILIES.md. Every sub-family lands in exactly one master."""
import json, os, sys, collections

ROOT = sys.argv[1]
FAM = os.path.join(ROOT, "docs", "system-map", "_work", "families")

MASTERS = [
 ("M01", "Release and store truth", "What we say shipped is not checked against the store, and release checks miss paths.",
  "A release cannot be marked shipped until the store shows that version; release checks cover every path.",
  "D-01 A-16 A-44 A-45 A-62 C-34 C-70 B-21 D-43 D-49 D-72 A-56 C-52 D-81 B-41"),
 ("M02", "Privacy promises vs real data flows", "Privacy and legal words are typed by hand, so they drift from what the app really does with data.",
  "Privacy words are built from one list of data flows; a check fails when a flow has no sentence.",
  "A-01 A-07 C-07 D-21 B-03 A-12 C-74"),
 ("M03", "Personal data leaving the system", "Names, ID numbers or gym details go to the AI, to downloads, to logs or to shared links with no filter.",
  "One filter sits on every way out (AI, export, log, share link); tests prove nothing personal passes it.",
  "B-08 A-21 A-37 D-92 A-72 C-82 A-71"),
 ("M04", "Delete, erase, backup and restore scope", "Each delete, erase or restore lists its tables by hand, so copies are missed or deleted accounts come back.",
  "One list of where each person's data lives, used by erase, delete, backup and restore; a round-trip test.",
  "A-05 A-35 B-06 C-04 C-09 D-70 A-17 B-40 A-23 A-08 B-07 C-62 D-19 A-60 A-26 A-24"),
 ("M05", "Identity, sign-in and member photo", "A typed phone number is trusted as identity; sign-ins never expire; people are matched by fragile keys.",
  "Identity comes only from a checked sign-in; one matching rule; sign-ins can expire and be revoked.",
  "A-02 A-42 A-61 C-55 D-17 A-22 B-42 C-97 D-93"),
 ("M06", "Membership and gym billing state", "Membership states (active, paused, ended, PT pack) are changed in many places without one rule.",
  "One state machine for memberships, used by phone, panel and server; pause needs the owner's OK.",
  "A-04 C-12 A-11 C-14 A-54 D-18 C-15 C-81 C-87 D-13 A-68 C-64 B-33 D-90"),
 ("M07", "Payments, receipts and refunds", "A payment request is not one record; there is no refund state; cash and test mode fall through.",
  "One payment record with every state, refund included; money words come from that record.",
  "A-09 A-10 A-13 A-18 A-28 A-59 C-30 C-72 C-88 D-82 D-73 A-67 D-25 B-39"),
 ("M08", "Paid features, limits and AI credits", "Plus, Pro and AI-credit rules are checked per screen or typed by hand; one caller can use up a shared limit.",
  "One server-side check for every paid feature and limit; credits kept in one ledger.",
  "A-06 A-14 A-41 A-40 A-47 B-25 B-26 C-61 C-66 D-60 D-89 A-03 D-75 A-33 B-38"),
 ("M09", "Server trusts the client; roles", "The server accepts what the panel or phone sends and does not shape answers by role.",
  "The server checks role and gym on every call; tests try the call as the wrong person.",
  "A-15 B-36 C-44 A-50 A-48 D-23 A-30 C-13 A-19 D-58 B-29 C-75 D-71 C-16"),
 ("M10", "Same number counted different ways", "The same count (visits, dues, streaks, progress) is worked out separately on each screen.",
  "Each number has one definition in one place; every screen reads it.",
  "A-29 C-05 D-05 D-52 A-32 D-38 A-43 C-71 C-86 D-80 D-79 D-77"),
 ("M11", "Failures hidden from people", "Errors are caught and dropped, or a failed read looks like a real empty answer.",
  "One report helper logs every failure; a failed read shows a clear 'could not load' state.",
  "D-03 D-04 D-08 C-02 C-25 C-28 D-30 D-67 C-06 C-63 B-35 C-98"),
 ("M12", "Jobs, services, storage and load unwatched", "Background jobs, outside services and limits have no alarm; polling and storage have no budget.",
  "Every job and outside service has a health alarm; polling, storage and page size have budgets.",
  "D-06 C-24 D-15 D-35 D-11 D-12 D-14 D-22 D-45 D-74 D-88 D-37 D-29 D-61 D-64 A-51 A-38 D-76 D-86"),
 ("M13", "Test and demo data on the live system", "Test gyms and demo data sit on the live server and are not flagged.",
  "Test data lives only in a test project, or carries a flag every report skips.",
  "C-01 D-68 C-49 B-34 D-87 D-16"),
 ("M14", "Messages, alerts and badges", "Messages are sent without checking reach, can repeat, have no delivery record, and badges use the wrong signal.",
  "One send pipeline: check reach, one request id, record delivery; badges read one state.",
  "D-07 D-09 D-39 C-10 C-26 C-27 C-39 C-40 C-58 C-93 C-94 A-69 D-40 D-57 A-25 B-37 D-10 C-101 C-69 C-32 C-57"),
 ("M15", "Sync between phone, watch, cloud and devices", "State lives on one device, copies go stale, and changes are not pushed to every copy.",
  "One owner for each piece of state; every copy is told of a change; versions are checked.",
  "C-08 D-42 D-24 D-54 D-55 A-58 C-73 D-53 D-56 C-46 C-53 D-46 D-69 C-77 C-76 B-20 A-63 D-62 A-65 D-66 C-79 D-50 D-51 A-34 C-67 C-100 C-80 A-66"),
 ("M16", "Screen words, help and 'say it once'", "Screen words, help articles and messages drift from what the app does, or repeat what the screen shows.",
  "Words come from one word list; help is checked against screens; an 'i' only for an exception.",
  "D-26 B-30 C-21 A-52 C-37 C-90 C-92 C-22 C-19 C-43 C-03 C-96 D-41 C-83 C-89 A-70 C-51 C-78 C-85"),
 ("M17", "Dates, time and the calendar", "Dates show without the year or day; India date rules are copied; date maths assume an easy calendar.",
  "One date helper for India; tests run at fixed times, across midnight and month ends.",
  "A-36 C-95 D-83 A-57 C-42 D-84 D-20"),
 ("M18", "Internal notes, maps and dead code", "Internal notes and the feature map are typed by hand; retired features leave dead code.",
  "Notes and the map are built from the code; dead code is removed with a plan.",
  "A-27 D-33 C-29 A-55 A-46 D-27 C-68 D-36 C-59"),
 ("M19", "Touch, reading and accessibility", "Tap areas are small, text does not grow, meaning is shown only by colour, and forms lose input.",
  "Shared controls with minimum size, big-font and contrast checks; forms keep input on close.",
  "C-17 C-20 C-23 C-31 C-33 C-38 C-41 C-45 C-47 C-48 C-91 D-47 D-48 C-65 C-99 A-64 C-35 D-34 C-50 C-56 D-63 C-84 C-54 C-36 C-60 D-59 D-78"),
 ("M20", "Shared rules copied per feature", "Gym locks, gym settings and member preferences are read separately by each feature.",
  "One reader for gym settings, locks and preferences; every feature uses it.",
  "D-31 D-32 D-44"),
 ("M21", "Owner operations and keys", "Accounts and keys have one owner; HQ hand-work has no queue; outside assets have no rights record.",
  "A second owner on every account; one HQ queue; a rights register for pictures and media.",
  "C-18 C-11 A-31 A-49 D-85"),
 ("M22", "Consent, age and terms", "Consent and age are not recorded; the under-18 stop leaves saved data; terms acceptance has no history.",
  "One consent record with date and version; the under-18 stop removes server data too.",
  "D-02 A-20 D-65"),
 ("M23", "iPhone port", "The iPhone build carries Android assumptions and misses the invite path.",
  "An iPhone check list run on every iPhone change.",
  "A-39 D-91"),
 ("M24", "The test system itself", "Screens, roles, failures and refusals are never driven by a test; some tests cannot fail.",
  "Shared test tools for phone, panel, watch and server; a test that cannot fail is itself a failure.",
  "B-01 B-02 B-04 B-05 B-09 B-10 B-11 B-12 B-13 B-14 B-15 B-16 B-17 B-18 B-19 B-22 B-23 B-24 B-27 B-28 B-31 B-32 D-28 A-53 B-43"),
 ("M25", "Owner feature requests", "New features and ideas from the owner's notes (not audit defects).",
  "Each one goes through the No Gaps design gate before any build.", ""),
]

OBS = {  # owner observation -> master
 "O-01": "M15", "O-02": "M15", "O-05": "M15", "O-03": "M25", "O-04": "M25", "O-06": "M25", "O-08": "M16",
 "O-09": "M16", "O-10": "M16", "O-11": "M10", "O-12": "M16", "O-14": "M05", "O-15": "M16", "O-16": "M16",
 "O-17": "M05", "O-18": "M06", "O-19": "M25", "O-20": "M06", "O-21": "M25", "O-22": "M14", "O-23": "M25",
 "O-24": "M02", "O-25": "M12", "O-26": "M14", "O-27": "M21", "O-28": "M03", "O-29": "M25", "O-30": "M25",
 "O-31": "M25", "O-32": "M25", "O-33": "M25", "O-35": "M25", "O-36": "M16", "O-37": "M25", "O-38": "M05",
}
CLOSED_OBS = {"O-07": "built (row redesign is O-36)", "O-13": "done (0.80.0)", "O-34": "not MettleUp"}
SEV = {"S1": 1, "S2": 2, "S3": 3, "S4": 4}

subs = {}
for p in "ABCD":
    for line in open(os.path.join(FAM, f"out-{p}.jsonl"), encoding="utf-8"):
        if line.strip():
            f = json.loads(line)
            subs[f["family"]] = f
where = {}
for mid, *_rest in MASTERS:
    for sid in _rest[-1].split():
        if sid in where:
            sys.exit(f"{sid} in {where[sid]} and {mid}")
        if sid not in subs:
            sys.exit(f"unknown {sid}")
        where[sid] = mid
left = sorted(set(subs) - set(where))
if left:
    sys.exit("not placed: " + " ".join(left))

out, all_ids = [], []
for mid, title, cause, guard, ids in MASTERS:
    ss = [subs[s] for s in ids.split()]
    members = [m for s in ss for m in s["members"]]
    all_ids += members
    worst = min([s["worst"] for s in ss], key=lambda x: SEV.get(x[:2], 9)) if ss else "-"
    lanes = collections.Counter(s["lane"] for s in ss)
    out.append({"id": mid, "title": title, "cause": cause, "guard": guard, "worst": worst[:2],
                "findings": len(members), "sub_families": [
                    {"id": s["family"], "cause_key": s["cause_key"], "cause": s["cause"], "size": len(s["members"]),
                     "worst": s["worst"], "lane": s["lane"], "guard": s.get("guard", ""), "members": s["members"]}
                    for s in ss],
                "lanes": dict(lanes), "owner_notes": sorted(k for k, v in OBS.items() if v == mid)})
assert len(all_ids) == len(set(all_ids)) == 2511, (len(all_ids), len(set(all_ids)))
order = sorted(out[:-1], key=lambda m: (SEV.get(m["worst"], 9), -m["findings"])) + [out[-1]]
json.dump({"made": "2026-11-27", "findings": len(all_ids), "sub_families": len(subs), "masters": order,
           "closed_owner_notes": CLOSED_OBS}, open(os.path.join(ROOT, "docs", "system-map", "FAMILIES.json"), "w",
           encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)

L = ["# Problem families (No Gaps, gate G0)", "",
     f"Made 27 Nov 2026 from the full audit: {len(all_ids)} findings (raw, before duplicates) in {len(subs)} cause "
     f"families, joined into {len(MASTERS)} master families. Each finding is in exactly one family. The owner's notes "
     "(docs/OWNER-OBSERVATIONS.md) are placed too. Data: FAMILIES.json.", "",
     "A fix is always made for a whole sub-family, with its guard, never for one finding alone.", "",
     "| Id | Family | Worst | Findings | Sub-families | Owner notes |", "|---|---|---|---|---|---|"]
for m in order:
    L.append(f"| {m['id']} | {m['title']} | {m['worst']} | {m['findings']} | {len(m['sub_families'])} | "
             f"{', '.join(m['owner_notes']) or '-'} |")
for m in order:
    L += ["", f"## {m['id']} {m['title']} (worst {m['worst']}, {m['findings']} findings)", "",
          f"**Cause:** {m['cause']}", "", f"**Guard that closes it:** {m['guard']}", ""]
    if m["owner_notes"]:
        L += [f"**Owner notes:** {', '.join(m['owner_notes'])}", ""]
    if m["sub_families"]:
        L += ["| Sub | Cause | Size | Worst | Lane |", "|---|---|---|---|---|"]
        for s in sorted(m["sub_families"], key=lambda s: (SEV.get(s["worst"][:2], 9), -s["size"])):
            L.append(f"| {s['id']} | {s['cause'].replace('|', '/')} | {s['size']} | {s['worst']} | {s['lane']} |")
L += ["", "Closed owner notes: " + "; ".join(f"{k} {v}" for k, v in CLOSED_OBS.items()) + "."]
open(os.path.join(ROOT, "docs", "system-map", "FAMILIES.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
for m in order:
    print(m["id"], m["worst"], m["findings"], len(m["sub_families"]), m["title"])
