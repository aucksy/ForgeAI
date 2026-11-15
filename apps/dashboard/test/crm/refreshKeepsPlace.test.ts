/**
 * Fresh-eyes review (15 Nov 2026): the top bar's Refresh (R-561) must not cost the owner their place. Training progress
 * kept a list on screen only on its first read: a Refresh blanked it, jumped to the top and closed an open member,
 * though What's new promises "without losing your place". All branches read every other branch on Refresh even while
 * it showed "One branch". These read the screens' code, the way the other screen checks here do.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(fileURLToPath(new URL(`../../src/crm/${p}`, import.meta.url)), 'utf8');

describe('the top bar Refresh keeps the owner’s place', () => {
  it('Training progress keeps its list on screen while it reads it again, as Questions does', () => {
    for (const screen of ['ui/screens/MyMembers.tsx', 'ui/screens/Questions.tsx']) {
      const code = src(screen);
      expect(code, screen).toContain("setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));");
      // Never an unconditional "Loading…" inside the read that Refresh runs.
      expect(code, screen).not.toMatch(/fetchList = useCallback\(async \(\): Promise<boolean> => \{\s*if \(!key\) return true;\s*setLoad\(\{ state: 'loading' \}\)/);
    }
  });

  it('All branches reads the other branches on Refresh only while it shows them', () => {
    const code = src('branches/AllBranches.tsx');
    expect(code).toContain('usePanelRefresh(load, multi && canOpenOthers);');
    expect(code).not.toMatch(/usePanelRefresh\(load\);/);
  });
});
