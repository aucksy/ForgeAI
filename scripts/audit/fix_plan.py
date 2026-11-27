"""Sort the audit's 309 cause families into lanes by real risk, then into batches that can run side by side.

Owner, 27 Nov 2026: "A: re-sort first". Reads docs/system-map/FAMILIES.json and findings.jsonl; writes
docs/system-map/FIX-PLAN.json and FIX-PLAN.md. Re-runnable: the plan is derived, never typed by hand.

Lanes (No Gaps framework, skill change-360):
  full     - design note, goldfish review, his yes before build. Any S1; or S2 in a risky family
             (privacy, personal data, delete/restore, sign-in, billing, paid limits, payments, roles, consent).
  standard - design note + one fresh review. Other S2; a large fix; S3 in a risky family.
  light    - batched: tests where behaviour changes, one fresh review per batch.
A family with a finding that needs his call is listed under "his calls" too; its build waits only for that answer.

Batches: light and standard families of the same master family and main surface, up to BATCH_MAX findings.
Waves: batches whose files do not overlap, so up to WAVE_WIDTH helpers can run at once without touching
the same files. Order: the member app first (phone, watch), then server, web, panel, HQ.
"""
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAP = ROOT / 'docs' / 'system-map'
RISKY = {'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M22'}
SEV = {'S1': 1, 'S2': 2, 'S3': 3, 'S4': 4}
SURFACE_ORDER = ['phone', 'watch', 'server', 'web', 'panel', 'hq']
BATCH_MAX = 40
WAVE_WIDTH = 4


def main() -> None:
    fam = json.loads((MAP / 'FAMILIES.json').read_text(encoding='utf-8'))
    rows = {}
    for line in (MAP / 'findings.jsonl').read_text(encoding='utf-8').splitlines():
        if line.strip():
            r = json.loads(line)
            rows[r['id']] = r

    groups = []
    for m in fam['masters']:
        for s in m['sub_families']:
            members = [rows[i] for i in s['members'] if i in rows and rows[i].get('status') == 'open']
            if not members:
                continue
            worst = min((SEV.get(r['severity'], 4) for r in members), default=4)
            large = any(r.get('fix_size') == 'large' for r in members)
            risky = m['id'] in RISKY
            if worst == 1 or (worst == 2 and risky):
                lane = 'full'
            elif worst == 2 or large or (risky and worst == 3):
                lane = 'standard'
            else:
                lane = 'light'
            surf = collections.Counter(r['surface'] for r in members).most_common(1)[0][0]
            files = sorted({e.split(':')[0] for r in members for e in r.get('evidence', []) if '/' in e})
            groups.append({
                'id': s['id'], 'master': m['id'], 'master_title': m['title'], 'cause': s['cause'], 'guard': s.get('guard', ''),
                'findings': len(members), 'worst': f'S{worst}', 'old_lane': s.get('lane'), 'lane': lane, 'surface': surf,
                'his_call': [r['id'] for r in members if r.get('needs_him')], 'files': files,
            })

    def surf_rank(g):
        return SURFACE_ORDER.index(g['surface']) if g['surface'] in SURFACE_ORDER else len(SURFACE_ORDER)

    # Batches: same lane kind (light or standard), master, surface; capped by findings.
    batches = []
    for lane in ('standard', 'light'):
        pool = collections.defaultdict(list)
        for g in groups:
            if g['lane'] == lane:
                pool[(surf_rank(g), g['master'], g['surface'])].append(g)
        for key in sorted(pool):
            cur, n = [], 0
            for g in sorted(pool[key], key=lambda x: (SEV[x['worst']], -x['findings'])):
                if cur and n + g['findings'] > BATCH_MAX:
                    batches.append((lane, key, cur))
                    cur, n = [], 0
                cur.append(g)
                n += g['findings']
            if cur:
                batches.append((lane, key, cur))
    out_batches = []
    for i, (lane, key, gs) in enumerate(batches, 1):
        out_batches.append({
            'id': f'B{i:02d}', 'lane': lane, 'master': key[1], 'surface': key[2], 'families': [g['id'] for g in gs],
            'findings': sum(g['findings'] for g in gs), 'files': sorted({f for g in gs for f in g['files']}),
        })

    # Waves: greedy, member app first; no two batches in a wave share a file.
    order = sorted(out_batches, key=lambda b: (0 if b['lane'] == 'standard' else 1, SURFACE_ORDER.index(b['surface']) if b['surface'] in SURFACE_ORDER else 9))
    waves = []
    for b in order:
        for w in waves:
            if len(w) < WAVE_WIDTH and all(not (set(b['files']) & set(o['files'])) for o in w):
                w.append(b)
                break
        else:
            waves.append([b])
    for n, w in enumerate(waves, 1):
        for b in w:
            b['wave'] = n

    full = sorted([g for g in groups if g['lane'] == 'full'], key=lambda g: (SEV[g['worst']], surf_rank(g)))
    plan = {
        'made': '2026-11-27', 'rules': __doc__.strip(),
        'counts': {
            'families': len(groups), 'findings': sum(g['findings'] for g in groups),
            'lanes_before': dict(collections.Counter(g['old_lane'] for g in groups)),
            'lanes_after': dict(collections.Counter(g['lane'] for g in groups)),
            'findings_by_lane': {k: sum(g['findings'] for g in groups if g['lane'] == k) for k in ('full', 'standard', 'light')},
            'his_call_findings': sum(len(g['his_call']) for g in groups),
            'his_call_families': sum(1 for g in groups if g['his_call']),
            'batches': len(out_batches), 'waves': len(waves),
        },
        'full': full, 'batches': out_batches, 'groups': groups,
    }
    (MAP / 'FIX-PLAN.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')

    c = plan['counts']
    md = ['# Fix plan (derived by scripts/audit/fix_plan.py, 27 Nov 2026)', '',
          f"{c['families']} families, {c['findings']} open findings.", '',
          f"Lanes before: {c['lanes_before']}. After: {c['lanes_after']}.",
          f"Findings by lane: {c['findings_by_lane']}.",
          f"Need his call: {c['his_call_findings']} findings in {c['his_call_families']} families.",
          f"{c['batches']} batches in {c['waves']} waves of up to {WAVE_WIDTH} side by side.", '',
          '## Full lane (one at a time, his yes)', '']
    for g in full:
        md.append(f"- {g['id']} ({g['master']} {g['master_title']}, {g['worst']}, {g['surface']}, {g['findings']} findings): {g['cause']}")
    md += ['', '## Batches', '']
    for b in sorted(out_batches, key=lambda b: (b['wave'], b['id'])):
        md.append(f"- wave {b['wave']} {b['id']} {b['lane']} {b['master']} {b['surface']}: {b['findings']} findings, families {', '.join(b['families'])}")
    (MAP / 'FIX-PLAN.md').write_text('\n'.join(md) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(c, indent=1))


if __name__ == '__main__':
    sys.exit(main())
