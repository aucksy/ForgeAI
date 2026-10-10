"""
Merge, check and generate the bundled exercise library (Phase 2).

  python scripts/build-exercise-catalog.py <parts-dir> [--out-json <merged.json>]

Reads part_*.json from <parts-dir> (written to docs/exercise-library/SPEC.md), checks every
rule the app relies on, and writes src/tracker/catalog/catalogData.ts. Fails loudly (exit 1)
on any problem so a bad entry can never reach the app:
  - unique keys, unique names and link names (ignoring case and spaces), across ALL parts
  - only known muscles, types, equipment and load modes; caps only where they mean something
  - every easier/harder link points at an entry that exists
  - 2–4 steps, each at most 110 characters; lowercase aliases
  - one name style (EX-20): "Pull-Up", "Close-Grip Bench Press" — never "Pull-up" / "Close Grip"
  - every one of ForgeAI's ~40 original exercise names maps to exactly one entry
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TS = os.path.join(ROOT, 'src', 'tracker', 'catalog', 'catalogData.ts')
SEED = os.path.join(ROOT, 'src', 'db', 'seed', 'exercises.ts')

MUSCLES = {'chest', 'front_delts', 'side_delts', 'rear_delts', 'lats', 'upper_back', 'traps', 'lower_back', 'biceps',
           'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'adductors', 'abductors',
           'calves', 'cardio'}
TYPES = {'weight_reps', 'reps', 'weighted', 'assisted', 'time', 'distance', 'time_distance'}
EQUIP = {'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'}
LOAD = {'one', 'both', 'side', 'both_side'}
BW_FAMILY = re.compile(r'pull_up|chin_up|muscle_up|^(chest|triceps|assisted|weighted|ring|parallel_bar)_dip$')


def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', s.strip().lower())


def seed_names() -> list:
    src = open(SEED, encoding='utf-8').read()
    return re.findall(r"name: '([^']+)'", src)


def main() -> None:
    parts_dir = sys.argv[1]
    out_json = sys.argv[sys.argv.index('--out-json') + 1] if '--out-json' in sys.argv else None
    entries = []
    for path in sorted(glob.glob(os.path.join(parts_dir, 'part_*.json'))):
        part = json.load(open(path, encoding='utf-8'))
        for e in part:
            e['_part'] = os.path.basename(path)
        entries += part
    problems = []
    keys, names = {}, {}
    for e in entries:
        k = e.get('key', '')
        where = f"{e.get('_part')}:{k}"
        if not re.fullmatch(r'[a-z][a-z0-9_]*', k):
            problems.append(f'{where}: bad key')
        if k in keys:
            problems.append(f'{where}: duplicate key (also in {keys[k]})')
        keys[k] = e['_part']
        for n in [e['name']] + list(e.get('linkNames') or []):
            nn = norm(n)
            if nn in names and names[nn] != k:
                problems.append(f'{where}: name/linkName "{n}" also used by {names[nn]}')
            names[nn] = k
        if e.get('equipment') not in EQUIP:
            problems.append(f'{where}: equipment {e.get("equipment")}')
        if e.get('type') not in TYPES:
            problems.append(f'{where}: type {e.get("type")}')
        if e.get('loadMode', 'one') not in LOAD:
            problems.append(f'{where}: loadMode {e.get("loadMode")}')
        prim = e.get('primary') or []
        sec = e.get('secondary') or []
        if not prim or any(m not in MUSCLES for m in prim + sec):
            problems.append(f'{where}: muscles {prim} {sec}')
        if set(prim) & set(sec):
            problems.append(f'{where}: a primary muscle repeated as secondary')
        steps = e.get('steps') or []
        if not 2 <= len(steps) <= 4 or any(len(s) > 110 or not s.strip() for s in steps):
            problems.append(f'{where}: steps {len(steps)} / lengths {[len(s) for s in steps]}')
        # EX-20: one name style — Title Case, hyphenated compounds ("Pull-Up", "Close-Grip").
        if re.search(r'-up', e['name']) or re.search(r'(Close|Wide|Neutral|Reverse|Narrow) Grip', e['name']):
            problems.append(f'{where}: name "{e["name"]}" — write "-Up" and "Close-Grip" style')
        if any(a != a.lower() for a in e.get('aliases') or []):
            problems.append(f'{where}: aliases must be lowercase')
        if (e.get('bwShare') or 0) > 0 and not BW_FAMILY.search(k):
            problems.append(f'{where}: bwShare outside the pull-up/dip families')
        if e.get('repCap') and e.get('type') != 'reps':
            problems.append(f'{where}: repCap on a non-reps type')
        if e.get('holdCapSec') and e.get('type') != 'time':
            problems.append(f'{where}: holdCapSec on a non-time type')
        if e.get('type') in ('distance', 'time_distance') and e.get('distUnit') not in ('km', 'm'):
            problems.append(f'{where}: distance type needs distUnit km or m')
        if not isinstance(e.get('incrementKg'), (int, float)) or e['incrementKg'] <= 0:
            problems.append(f'{where}: incrementKg must be > 0')
    for e in entries:
        for f in ('easier', 'harder'):
            if e.get(f) and e[f] not in keys:
                problems.append(f"{e['_part']}:{e['key']}: {f} -> unknown key {e[f]}")
    eks = {}
    for e in entries:
        if e.get('ek'):
            if e['ek'] in eks:
                problems.append(f"{e['key']}: drawing {e['ek']} also used by {eks[e['ek']]}")
            eks[e['ek']] = e['key']
    for n in seed_names():
        if norm(n) not in names:
            problems.append(f'original exercise "{n}" maps to no entry')
    if problems:
        print('\n'.join(problems))
        print(f'{len(problems)} problem(s) in {len(entries)} entries')
        sys.exit(1)

    def ts(v):
        return json.dumps(v, ensure_ascii=False)

    lines = [
        '/**',
        ' * GENERATED by scripts/build-exercise-catalog.py from docs/exercise-library/ — do not edit by hand.',
        ' * Text (names, steps) is ForgeAI\'s own. Pictures: see media.ts.',
        ' */',
        "import type { CatalogEntry } from './types';",
        '',
        'export const CATALOG: readonly CatalogEntry[] = [',
    ]
    for e in sorted(entries, key=lambda x: x['key']):
        obj = {
            'key': e['key'], 'name': e['name'], 'aliases': e.get('aliases') or [],
        }
        if e.get('linkNames'):
            obj['linkNames'] = e['linkNames']
        obj.update({
            'equipment': e['equipment'], 'primary': e['primary'], 'secondary': e.get('secondary') or [],
            'type': e['type'], 'compound': bool(e.get('compound')), 'incrementKg': e['incrementKg'],
        })
        if e.get('loadMode', 'one') != 'one':
            obj['loadMode'] = e['loadMode']
        if e.get('bwShare'):
            obj['bwShare'] = e['bwShare']
        obj['steps'] = e['steps']
        for f in ('easier', 'harder', 'repCap', 'holdCapSec', 'distUnit'):
            if e.get(f):
                obj[f] = e[f]
        lines.append(f'  {ts(obj)},')
    lines += ['];', '']
    with open(TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    if out_json:
        clean = [{k: v for k, v in e.items() if not k.startswith('_')} for e in entries]
        json.dump(sorted(clean, key=lambda x: x['key']), open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with_pic = sum(1 for e in entries if e.get('ek'))
    print(f'OK: {len(entries)} entries, {with_pic} with a drawing, {len(entries) - with_pic} steps only')


if __name__ == '__main__':
    main()
