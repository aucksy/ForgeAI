/**
 * R-631 (owner yes, 27 Nov 2026): the phone never sends the old "member summary" (name, body weight,
 * calories, protein, streaks) to the server again. Nothing read it, and restore does not use it.
 * Plain Node (fs): reads the app's own source.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the old member summary upload is gone (R-631)', () => {
  it('no app code writes to or reads the member_summary table', () => {
    const hits = files(SRC).filter((f) => /from\(\s*['"`]member_summary['"`]\s*\)/.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the summary builder is deleted', () => {
    expect(fs.existsSync(path.join(SRC, 'cloud', 'summary.ts'))).toBe(false);
  });

  it('the outbox only empties its table and never goes to the network', () => {
    const outbox = fs.readFileSync(path.join(SRC, 'cloud', 'outbox.ts'), 'utf8');
    expect(outbox).not.toMatch(/getSupabase|upsert|fetch\(/);
    expect(outbox).toMatch(/DELETE FROM sync_outbox/);
  });
});
