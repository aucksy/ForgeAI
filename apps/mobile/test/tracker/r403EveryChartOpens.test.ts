/**
 * F199 / R-403 (owner, 8 Nov 2026: "every chart behaves the same"): every dated line chart a member
 * can see opens what is behind its picked point. The Body chart opens that day's own entry (a gym
 * entry is read-only, so it opens nothing); the strength line opens that day's workout. PURE.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { entryToOpen } from '@/tracker/lib/measuresView';

const SRC = join(__dirname, '..', '..', 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });

/** Not on any screen (nothing imports them); left as they were, listed in R-403's notes. */
const NOT_SHOWN = new Set([
  'components/analytics/BodyWeightSection.tsx',
  'components/analytics/CaloriesSection.tsx',
  'components/analytics/LiftsSection.tsx',
  'components/analytics/ProteinSection.tsx',
  'components/exercise/ExerciseCharts.tsx',
]);

describe('the Body chart opens the picked day’s own entry', () => {
  const rows = [
    { id: 'a', dateISO: '2026-11-01' },
    { id: 'g', dateISO: '2026-11-03', gym: { by: 'trainer' } },
    { id: 'b', dateISO: '2026-11-05' },
  ];
  it('a day with the member’s own entry opens it', () => {
    expect(entryToOpen(rows, '2026-11-05')?.id).toBe('b');
  });
  it('a gym-recorded day opens nothing, and so does a day with no entry', () => {
    expect(entryToOpen(rows, '2026-11-03')).toBeNull();
    expect(entryToOpen(rows, '2026-11-04')).toBeNull();
    expect(entryToOpen([], '2026-11-01')).toBeNull();
  });
});

describe('[source-text check] every dated chart on a screen has a box that opens', () => {
  const users = walk(SRC)
    .map((p) => ({ f: relative(SRC, p).replace(/\\/g, '/'), s: readFileSync(p, 'utf8') }))
    .filter(({ f, s }) => s.includes('<DateLineChart') && f !== 'tracker/components/DateLineChart.tsx');
  it('finds the charts', () => {
    expect(users.map((u) => u.f)).toContain('app/measures/index.tsx');
  });
  it('each one passes onOpenPicked, unless it is on no screen at all', () => {
    const missing = users.filter(({ f, s }) => !NOT_SHOWN.has(f) && !s.includes('onOpenPicked='));
    expect(missing.map((u) => u.f)).toEqual([]);
  });
  it('a file listed as not shown is really imported by nothing', () => {
    const all = walk(SRC).map((p) => readFileSync(p, 'utf8')).join('\n');
    const barrel = readFileSync(join(SRC, 'components', 'analytics', 'index.ts'), 'utf8');
    for (const f of NOT_SHOWN) {
      const name = f.split('/').pop()!.replace('.tsx', '');
      const imports = all.match(new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from`, 'g')) ?? [];
      expect(imports, f).toEqual([]);
      expect(barrel.includes(name) || f.startsWith('components/exercise/'), f).toBe(true);
    }
  });
  it('the strength line opens its day with the shared opener', () => {
    const s = readFileSync(join(SRC, 'components', 'analytics', 'StrengthSection.tsx'), 'utf8');
    expect(s).toContain('onOpenPicked={(p) => openPeriod(p.x)}');
    const hook = readFileSync(join(SRC, 'tracker', 'components', 'useOpenPeriod.ts'), 'utf8');
    expect(hook).toMatch(/periodTarget\(range, ids\)/);
    expect(hook).toMatch(/void getWorkoutIdsBetween/);
  });
});
