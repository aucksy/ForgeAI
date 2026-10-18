/**
 * The admin app's exercise list must name exercises exactly as the member app's library does, or a
 * plan's exercise lands on the phone as a new "own" exercise instead of the library one (with its
 * pictures, steps and history). Read from the member app's file itself, as text: the dashboard does
 * not import mobile code.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXERCISE_CATALOG } from '../../src/crm/logic/exerciseCatalog';

const MOBILE = readFileSync(
  fileURLToPath(new URL('../../../mobile/src/tracker/catalog/catalogData.ts', import.meta.url)),
  'utf8',
);
const MUSCLES = readFileSync(fileURLToPath(new URL('../../../mobile/src/tracker/catalog/muscles.ts', import.meta.url)), 'utf8');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `key: 'x'`, `"key": "x"` or `key: "x"`: whatever quoting the generated file uses. */
const field = (name: string, value: string) => new RegExp(`["']?${name}["']?\\s*:\\s*["']${esc(value)}["']`);
const anyKey = /["']?key["']?\s*:\s*["']/g;

/** The text of the mobile entry with this key: from its key up to the next entry's key. */
function mobileEntry(key: string): string | null {
  const m = field('key', key).exec(MOBILE);
  if (!m) return null;
  anyKey.lastIndex = m.index + m[0].length;
  const next = anyKey.exec(MOBILE);
  return MOBILE.slice(m.index, next ? next.index : undefined);
}

describe('the admin app’s exercise list matches the member app’s library', () => {
  it('is a real list (about 60 common lifts), with no key twice', () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(50);
    expect(new Set(EXERCISE_CATALOG.map((e) => e.key)).size).toBe(EXERCISE_CATALOG.length);
    expect(new Set(EXERCISE_CATALOG.map((e) => e.name.toLowerCase())).size).toBe(EXERCISE_CATALOG.length);
  });

  it('every key is in the library, with the same name and a weight-and-reps type', () => {
    const missing: string[] = [];
    for (const e of EXERCISE_CATALOG) {
      const entry = mobileEntry(e.key);
      if (!entry) missing.push(`${e.key}: no such key`);
      else if (!field('name', e.name).test(entry)) missing.push(`${e.key}: name is not "${e.name}"`);
      else if (!field('type', 'weight_reps').test(entry)) missing.push(`${e.key}: not weight_reps`);
    }
    expect(missing).toEqual([]);
  });

  it('every main muscle is a member-app muscle, and the library lists it for that exercise', () => {
    const wrong: string[] = [];
    for (const e of EXERCISE_CATALOG) {
      const entry = mobileEntry(e.key) ?? '';
      const primary = /["']?primary["']?\s*:\s*\[([^\]]*)\]/.exec(entry)?.[1] ?? '';
      const theirs = [...primary.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);
      if (e.primary.length === 0 || JSON.stringify(theirs) !== JSON.stringify(e.primary)) wrong.push(`${e.key}: ${e.primary.join(',')} vs ${theirs.join(',')}`);
      for (const m of e.primary) if (!MUSCLES.includes(`'${m}'`)) wrong.push(`${e.key}: ${m} is not a muscle`);
    }
    expect(wrong).toEqual([]);
  });

  it('every key is one the phone reads (letters, digits and _ only)', () => {
    for (const e of EXERCISE_CATALOG) expect(e.key).toMatch(/^[a-z0-9_]{1,60}$/);
  });
});
