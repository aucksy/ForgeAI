/**
 * R-334 (owner, 5 Nov 2026): a new menu tab "My members" sat next to "Members" and the owner could not tell them
 * apart. Two menu names must never say the same thing: once "my", "your", "our", "all" and a plural "s" are taken
 * away, every name in the admin app's menus (side bar, bottom bar, More) must still be different.
 * Reads the label strings straight from the source, so a new tab is checked the day it is added.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src', 'crm');
const FILES = ['CrmApp.tsx', join('ui', 'screens', 'More.tsx')];
const FILLER = new Set(['my', 'your', 'our', 'all', 'the', 'mere', 'apne']);

/** Every `label: t('...')` or `label: '...'` in the menu files. */
function menuLabels(): string[] {
  const out = new Set<string>();
  for (const f of FILES) {
    const text = readFileSync(join(SRC, f), 'utf8');
    for (const m of text.matchAll(/label:\s*(?:t\()?'([^']+)'/g)) out.add(m[1]);
  }
  return [...out];
}

/** "My members" -> "member"; "Members" -> "member". PURE. */
export function sameMeaningKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z& ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

describe('admin app menu names', () => {
  it('finds the menu names (the reader still matches the source)', () => {
    const labels = menuLabels();
    expect(labels).toContain('Members');
    expect(labels).toContain('Training progress');
    expect(labels.length).toBeGreaterThan(12);
  });

  it('never has two names that mean the same thing', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const label of menuLabels()) {
      const key = sameMeaningKey(label);
      const other = seen.get(key);
      if (other && other !== label) clashes.push(`"${other}" and "${label}"`);
      seen.set(key, label);
    }
    expect(clashes).toEqual([]);
  });

  it('catches the case the owner found', () => {
    expect(sameMeaningKey('My members')).toBe(sameMeaningKey('Members'));
    expect(sameMeaningKey('Training progress')).not.toBe(sameMeaningKey('Members'));
  });
});
