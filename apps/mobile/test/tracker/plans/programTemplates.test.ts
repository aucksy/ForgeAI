/**
 * OWNER-INBOX #19: the admin app's ready-made plans (apps/dashboard/src/crm/logic/programTemplates.json)
 * are the member app's gym programs, with the same days, exercises, sets and rep ranges. A trainer who
 * starts from "Push Pull Legs" sends exactly what a member would get by picking it here.
 * Rebuild the file after changing a gym program: GEN_TEMPLATES=1 npx vitest run test/tracker/plans/programTemplates.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROGRAMS, programMeta, programRoutines } from '@/tracker/plans/programs';

const FILE = resolve(__dirname, '../../../../dashboard/src/crm/logic/programTemplates.json');

function templates() {
  return PROGRAMS.filter((p) => p.equipment === 'gym').map((p) => ({
    key: p.key,
    name: p.name,
    meta: programMeta(p),
    summary: p.summary,
    routines: programRoutines(p).map((r) => ({
      name: r.name,
      dayType: r.dayType,
      exercises: r.exercises.map((e) => ({ key: e.key, sets: e.sets, repMin: e.repMin, repMax: e.repMax })),
    })),
  }));
}

describe('admin ready-made plans', () => {
  it('match the member app gym programs', () => {
    const want = templates();
    if (process.env.GEN_TEMPLATES === '1') writeFileSync(FILE, `${JSON.stringify(want, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(want);
  });

  it('every rep range runs from low to high', () => {
    for (const p of templates()) for (const r of p.routines) for (const e of r.exercises) expect(e.repMin).toBeLessThanOrEqual(e.repMax);
  });
});
