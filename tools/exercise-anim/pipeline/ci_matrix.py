"""Print the GitHub Actions matrix line for exercise-clips.yml: keys=["a","b",...]."""
import sys, os, json, glob

SPECS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "specs")
asked = [k.strip() for k in (sys.argv[1] if len(sys.argv) > 1 else "").split(",") if k.strip()]
have = sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(SPECS, "*.json")))
missing = [k for k in asked if k not in have]
if missing:
    sys.exit("no recipe for: " + ", ".join(missing))
print("keys=" + json.dumps(asked or have))
