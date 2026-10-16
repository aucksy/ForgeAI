"""Readable one-page card of a research file (for the owner's review): python research_card.py <key> <out.md>"""
import sys, os, json
key, out = sys.argv[1], sys.argv[2]
r = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "research", f"{key}.json"), encoding="utf-8"))
e = r["exercise"]; L = []
def t(cols, rows):
    L.append("| " + " | ".join(cols) + " |"); L.append("|" + "---|" * len(cols))
    for x in rows: L.append("| " + " | ".join(str(v).replace("|", "/").replace("\n", " ") for v in x) + " |")
    L.append("")
L += [f"# {e['name']} — research card", "", f"Status: **{e['status']}** · clip v{e.get('version')} · evidence grade {e.get('evidence_grade')}", "",
      e.get("one_line_summary", ""), "", "## Muscles (what lights up)"]
t(["Muscle", "Tier", "Glow", "EMG", "Why", "Grade"], [(m["muscle"], m["tier"], m["glow"], m.get("emg", ""), m.get("role", ""), m.get("grade", "")) for m in r["muscles"]])
L.append("## Movement"); t(["Joint", "Start", "End", "Allowed", "Grade"], [(m["joint"], m["start"], m["end"], m.get("tolerance", ""), m.get("grade", "")) for m in r["movement"]])
L.append("## Setup"); t(["Item", "Target", "Grade"], [(s["item"], s["target"], s.get("grade", "")) for s in r["setup"]])
tp = r["tempo"]; L += ["## Tempo", "", f"Up {tp['up_s']} s · hold {tp['hold_top_s']} s · down {tp['down_s']} s · pause {tp['pause_bottom_s']} s · loop {tp['loop_s']} s", ""]
L.append("## Clip check (measured on the clip)"); t(["Check", "Target", "Measured", "Pass"], [(c["check"], c["target"], c.get("measured"), c.get("pass")) for c in r["clip_check"]])
L.append("## Mistakes the clip avoids"); t(["Mistake", "Why it matters"], [(m["mistake"], m.get("why it matters", m.get("why_it_matters", ""))) for m in r["mistakes"]])
L.append("## Sources"); t(["Id", "Source", "Type"], [(s["id"], s["citation"], s.get("type", "")) for s in r["sources"]])
open(out, "w", encoding="utf-8").write("\n".join(L))
print(out, len(L))
