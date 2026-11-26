import json, sys, os
base = os.path.dirname(os.path.abspath(__file__))
sm = os.path.dirname(os.path.dirname(base))
groups = [l.strip() for l in open(os.path.join(base, 'cards-03.txt')) if l.strip()]
cards = {c['group']: c for c in json.load(open(os.path.join(base, 'cards.json'), encoding='utf-8'))}
want = set()
for g in groups:
    want.update(cards[g]['members'])
finds = {}
for line in open(os.path.join(sm, 'findings.jsonl'), encoding='utf-8'):
    try:
        o = json.loads(line)
    except Exception:
        continue
    if o.get('id') in want:
        finds[o['id']] = o
ver = {}
for line in open(os.path.join(sm, 'verify-results.jsonl'), encoding='utf-8'):
    try:
        o = json.loads(line)
    except Exception:
        continue
    if o.get('group') in groups:
        ver.setdefault(o['group'], []).append(o)
out = []
for g in groups:
    c = cards[g]
    out.append('=' * 20 + ' ' + g)
    out.append(json.dumps({k: v for k, v in c.items()}, ensure_ascii=False))
    for v in ver.get(g, []):
        out.append('VERIFY: ' + json.dumps({k: v[k] for k in v if k not in ('evidence', 'kind')}, ensure_ascii=False))
    for m in c['members']:
        f = finds.get(m)
        if not f:
            out.append('MISSING ' + m); continue
        out.append('FIND: ' + json.dumps({k: f[k] for k in f if k not in ('evidence', 'kind', 'refs')}, ensure_ascii=False))
open(os.path.join(base, 'rc03_extract.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print(len(out), sum(len(cards[g]['members']) for g in groups))
