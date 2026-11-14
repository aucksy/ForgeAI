/**
 * Owner rule (14 Nov 2026): no screen an owner, staff member, member or visitor sees may name another gym
 * software ("you have mentioned the name of GGMS on the admin panel ... Ensure that no user facing page
 * mentions GGMS anywhere."). Scans every admin-app source file and every public page. Tests and internal
 * docs may still name the format they test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RIVALS = /\b(ggms|gymmaster|gym ?galaxy|okfit|wellyx|glofox|mindbody|cult\.?fit)\b/i;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(tsx?|jsx?|html|json|md|webmanifest)$/.test(name)) out.push(p);
  }
  return out;
}

describe('no other gym software is named on any user-facing screen', () => {
  for (const sub of ['src', 'public']) {
    it(`${sub}/ names no rival software`, () => {
      const hits = files(join(ROOT, sub)).flatMap((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .map((line, i) => (RIVALS.test(line) ? `${p.slice(ROOT.length)}:${i + 1}: ${line.trim().slice(0, 120)}` : ''))
          .filter(Boolean),
      );
      expect(hits).toEqual([]);
    });
  }
});
