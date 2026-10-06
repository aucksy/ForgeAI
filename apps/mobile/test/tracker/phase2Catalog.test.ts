/**
 * Phase 2 — the bundled library (400+ exercises) and how a member's existing library is
 * brought up to it without re-reading anyone's history differently.
 */
import { describe, expect, it } from 'vitest';

import { EXERCISES } from '@/db/seed/exercises';
import { linkLogType, planCatalogSync, type SyncRow } from '@/tracker/catalog/catalogSync';
import { CATALOG, catalogEntry, catalogEntryByName, normName } from '@/tracker/catalog/exerciseCatalog';
import { EXERCISE_MEDIA } from '@/tracker/catalog/media';
import { isMuscle } from '@/tracker/catalog/muscles';
import { isLogType } from '@/tracker/engine/logTypes';

const row = (name: string, sets = 0, over: Partial<SyncRow> = {}): SyncRow => ({
  id: `id-${name}`,
  name,
  catalogKey: null,
  logType: null,
  loadMode: null,
  sets: { count: sets, anyPositive: false, anyNegative: false },
  ...over,
});

describe('the library itself', () => {
  it('has 400+ exercises with unique keys and names', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(400);
    expect(new Set(CATALOG.map((e) => e.key)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((e) => normName(e.name))).size).toBe(CATALOG.length);
  });
  it('every entry has 2–4 short steps, real muscles and a real type', () => {
    for (const e of CATALOG) {
      expect(e.steps.length, e.key).toBeGreaterThanOrEqual(2);
      expect(e.steps.length, e.key).toBeLessThanOrEqual(4);
      for (const s of e.steps) expect(s.length, `${e.key}: ${s}`).toBeLessThanOrEqual(110);
      expect(e.primary.length, e.key).toBeGreaterThan(0);
      for (const m of [...e.primary, ...e.secondary]) expect(isMuscle(m), `${e.key}: ${m}`).toBe(true);
      expect(isLogType(e.type), e.key).toBe(true);
    }
  });
  it('every easier / harder link points at a real entry', () => {
    for (const e of CATALOG) {
      if (e.easier) expect(catalogEntry(e.easier), `${e.key} → ${e.easier}`).not.toBeNull();
      if (e.harder) expect(catalogEntry(e.harder), `${e.key} → ${e.harder}`).not.toBeNull();
    }
  });
  it('body weight counts only for the pull-up and dip families', () => {
    const counted = CATALOG.filter((e) => (e.bwShare ?? 0) > 0).map((e) => e.key);
    expect(counted).toContain('pull_up');
    expect(counted).toContain('chest_dip');
    expect(counted).not.toContain('push_up');
    for (const k of counted) expect(k).toMatch(/pull_up|chin_up|muscle_up|_dip$/);
  });
  it('the version chains from the research exist (push-ups, pull-ups, planks)', () => {
    expect(catalogEntry('push_up')?.harder).toBeTruthy();
    expect(catalogEntry('push_up')?.easier).toBeTruthy();
    expect(catalogEntry('assisted_pull_up')?.harder).toBe('pull_up');
    expect(catalogEntry('plank')?.type).toBe('time');
    expect(catalogEntry('plank')?.holdCapSec).toBe(60);
  });
  it('every bundled picture belongs to a library entry', () => {
    for (const k of Object.keys(EXERCISE_MEDIA)) expect(catalogEntry(k), k).not.toBeNull();
  });
});

describe('ForgeAI\'s original ~40 exercises all land on a library entry', () => {
  it('each old name is an entry name or link name — so nobody gets a duplicate', () => {
    for (const ex of EXERCISES) expect(catalogEntryByName(ex.name), ex.name).not.toBeNull();
  });
  it('the demo links every seed row and inserts the rest of the library', () => {
    const rows = EXERCISES.map((ex) => row(ex.name, 10));
    const plan = planCatalogSync(rows, { demo: true });
    expect(plan.links).toHaveLength(EXERCISES.length);
    expect(plan.inserts.length).toBe(CATALOG.length - EXERCISES.length);
    // The demo logs one dumbbell's weight, so its dumbbell lifts take "kg each".
    expect(plan.links.every((l) => !l.freezeLoadMode)).toBe(true);
  });
});

describe('a member\'s own history is never re-read differently', () => {
  it('owner\'s Hevy titles land on the library (Pull Up → pull_up as bodyweight reps)', () => {
    const plan = planCatalogSync([row('Pull Up', 145), row('Chest Dip', 266)], { demo: false });
    const byId = new Map(plan.links.map((l) => [l.id, l]));
    expect(byId.get('id-Pull Up')?.key).toBe('pull_up');
    expect(byId.get('id-Pull Up')?.logType).toBe('reps');
    expect(byId.get('id-Chest Dip')?.key).toBe('chest_dip');
  });
  it('his dumbbell history keeps "weight as typed" (his Hammer Curl 25 kg next to 12.5 kg one-arm curls = both dumbbells typed as one)', () => {
    const plan = planCatalogSync([row('Lateral Raise (Dumbbell)', 479)], { demo: false });
    expect(plan.links[0]?.freezeLoadMode).toBe(true);
    const fresh = planCatalogSync([row('Lateral Raise (Dumbbell)', 0)], { demo: false });
    expect(fresh.links[0]?.freezeLoadMode).toBe(false);
  });
  it('a weight × reps history never turns into a timed exercise; added weight keeps its column', () => {
    const plank = catalogEntry('plank')!;
    expect(linkLogType(plank, { count: 3, anyPositive: false, anyNegative: false })).toBeNull();
    expect(linkLogType(plank, { count: 0, anyPositive: false, anyNegative: false })).toBe('time');
    const pull = catalogEntry('pull_up')!;
    expect(linkLogType(pull, { count: 5, anyPositive: true, anyNegative: false })).toBe('weighted');
  });
  it('the row with history wins a shared name; a custom exercise with an entry\'s exact name is left alone', () => {
    const plan = planCatalogSync([row('Pull-up', 0), row('Pull Up', 145)], { demo: false });
    expect(plan.links.find((l) => l.key === 'pull_up')?.id).toBe('id-Pull Up');
    expect(plan.inserts.some((e) => e.key === 'pull_up')).toBe(false);
  });
});
