/**
 * Audit Phase 7 review: the text-size cap reaches every screen by swapping two exact lines in
 * React Native's own index.js (scripts/metro-text-scale.cjs). A React Native upgrade that
 * rewrites those lines would switch the cap off silently — every screen back to unlimited
 * growth, no error anywhere. This reads the INSTALLED React Native and fails loudly instead.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ENTRIES } = require('../../../scripts/metro-text-scale.cjs') as { ENTRIES: Record<string, string> };

// The real package on disk (hoisted to the repo root by npm workspaces), not the test alias.
const rnDir = path.dirname(require.resolve('react-native/package.json'));
const read = (rel: string): string => fs.readFileSync(path.join(rnDir, rel), 'utf8');

describe('React Native still serves Text and TextInput the way the swap expects', () => {
  it('index.js requires exactly the two paths the bundler redirects', () => {
    const index = read('index.js');
    for (const request of Object.keys(ENTRIES)) {
      expect(index, `react-native/index.js no longer has require('${request}')`).toContain(`require('${request}')`);
    }
    expect(Object.keys(ENTRIES).sort()).toEqual(['./Libraries/Components/TextInput/TextInput', './Libraries/Text/Text']);
  });

  it('those are the getters for Text and TextInput (not some other export)', () => {
    const index = read('index.js');
    expect(index).toMatch(/get Text\(\)[^}]*require\('\.\/Libraries\/Text\/Text'\)\.default/);
    expect(index).toMatch(/get TextInput\(\)[^}]*require\('\.\/Libraries\/Components\/TextInput\/TextInput'\)\.default/);
  });

  it('the real files the capped versions import exist, with a default export', () => {
    for (const rel of ['Libraries/Text/Text.js', 'Libraries/Components/TextInput/TextInput.js']) {
      expect(fs.existsSync(path.join(rnDir, rel)), rel).toBe(true);
      expect(read(rel), rel).toMatch(/export default/);
    }
  });

  it('the "inside another Text" context the capped Text reads still exists and is what Text uses', () => {
    const ctx = read('Libraries/Text/TextAncestorContext.js');
    expect(ctx).toMatch(/createContext\(false\)/);
    expect(ctx).toMatch(/export default TextAncestorContext/);
    expect(read('Libraries/Text/Text.js')).toMatch(/import TextAncestorContext from '\.\/TextAncestorContext'/);
    // …reached through its public (unstable_) name, which the capped Text imports.
    expect(read('index.js')).toMatch(/get unstable_TextAncestorContext\(\)[^}]*require\('\.\/Libraries\/Text\/TextAncestorContext'\)\.default/);
  });
});
