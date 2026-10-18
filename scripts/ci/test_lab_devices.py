#!/usr/bin/env python3
"""Pick the phones for a Firebase Test Lab robot crawl (UAT WP15, owner R-29, 18 Oct 2026).

Reads `gcloud firebase test android models list --format=json` on stdin and prints one
`--device model=<id>,version=<api>,locale=en_IN,orientation=portrait` argument per line.

Free (Spark) plan: 5 test runs a day on real phones, 10 on virtual ones. So: up to 5 real phones,
one per brand, in the order Indian gym members are most likely to own them (Samsung, Xiaomi /
Redmi / POCO, vivo, OPPO / realme, OnePlus, Google, Motorola), each on its newest Android; plus 2
virtual phones: the oldest Android we can get (>= MIN_API) and a current one. The model list
changes over time, which is why the phones are chosen from it on each run instead of hard-coded.

  python3 scripts/ci/test_lab_devices.py [--physical N] [--virtual N] < models.json
"""
import json
import sys

MIN_API = 26
BRANDS = [
    ("samsung",),
    ("xiaomi", "redmi", "poco"),
    ("vivo",),
    ("oppo", "realme"),
    ("oneplus",),
    ("google",),
    ("motorola",),
]


def apis(model):
    """Android versions this model can run for us: >= MIN_API, numeric, and not tagged
    "deprecated=<version>" (Test Lab's way of saying that version is going away)."""
    gone = {str(t).split("=", 1)[1] for t in model.get("tags") or [] if str(t).lower().startswith("deprecated=")}
    out = []
    for v in model.get("supportedVersionIds") or []:
        if str(v) in gone:
            continue
        try:
            out.append(int(v))
        except ValueError:
            continue  # quiet: a preview id such as "Baklava" has no number
    return sorted(a for a in out if a >= MIN_API)


def is_phone(model):
    return (model.get("formFactor") or "").upper() == "PHONE"


def brand_rank(model):
    text = " ".join(str(model.get(k) or "") for k in ("brand", "manufacturer", "name")).lower()
    for i, names in enumerate(BRANDS):
        if any(n in text for n in names):
            return i
    return None


def device_arg(model_id, api):
    return f"model={model_id},version={api},locale=en_IN,orientation=portrait"


def pick(models, physical=5, virtual=2):
    """[(model_id, api, form)] PURE. Deprecated versions are skipped (see apis)."""
    usable = [m for m in models if is_phone(m) and apis(m)]
    chosen = []
    real = [m for m in usable if (m.get("form") or "").upper() == "PHYSICAL" and brand_rank(m) is not None]
    by_brand = {}
    for m in real:
        r = brand_rank(m)
        best = by_brand.get(r)
        # Newest Android first; then the model id, so the pick is stable between runs.
        if best is None or (max(apis(m)), m.get("id", "")) > (max(apis(best)), best.get("id", "")):
            by_brand[r] = m
    for r in sorted(by_brand)[:physical]:
        m = by_brand[r]
        chosen.append((m["id"], max(apis(m)), "PHYSICAL"))
    virt = sorted((m for m in usable if (m.get("form") or "").upper() in ("VIRTUAL", "EMULATOR")), key=lambda m: m.get("id", ""))
    if virtual >= 1 and virt:
        low = min(virt, key=lambda m: (min(apis(m)), m.get("id", "")))
        chosen.append((low["id"], min(apis(low)), "VIRTUAL"))
    if virtual >= 2 and virt:
        high = max(virt, key=lambda m: (max(apis(m)), m.get("id", "")))
        pair = (high["id"], max(apis(high)), "VIRTUAL")
        if pair not in chosen:
            chosen.append(pair)
    return chosen


def main(argv):
    physical, virtual = 5, 2
    if "--physical" in argv:
        physical = int(argv[argv.index("--physical") + 1])
    if "--virtual" in argv:
        virtual = int(argv[argv.index("--virtual") + 1])
    models = json.load(sys.stdin)
    chosen = pick(models, physical, virtual)
    if not chosen:
        print("no usable phones in the Test Lab model list", file=sys.stderr)
        return 1
    for model_id, api, form in chosen:
        print(f"{form.lower()} {model_id} {api}", file=sys.stderr)
        print(device_arg(model_id, api))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
