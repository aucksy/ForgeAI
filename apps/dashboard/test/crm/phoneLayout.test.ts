/**
 * UAT U-A15 (17 Oct 2026): layout guards that only a drawn page can fully prove (e2e J28 draws them
 * in a wide font). These source checks stop the two fixes from being undone quietly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

describe('U-A15: nothing on a phone is wider than the phone in a wider font', () => {
  it('the page header puts its buttons in a wrapping row on a phone, each growing to share its line', () => {
    const kit = src('crm/ui/kit.tsx');
    const header = kit.slice(kit.indexOf('export function PageHeader'), kit.indexOf('export function SectionTitle'));
    expect(header).toMatch(/className="page-actions"[^\n]*flexWrap: 'wrap'/);
    expect(header).not.toMatch(/gridAutoFlow: 'column'/);
    expect(src('index.css')).toMatch(/\.page-actions > \*\s*\{\s*flex: 1 1 auto;/);
  });

  it('"Your gym is already online? Sign in instead" may wrap (both cards)', () => {
    const card = src('crm/auth/GoOnlineCard.tsx');
    const label = 'Your gym is already online? Sign in instead';
    const at: number[] = [];
    for (let i = card.indexOf(label); i >= 0; i = card.indexOf(label, i + 1)) at.push(i);
    expect(at).toHaveLength(2);
    for (const i of at) {
      const open = card.lastIndexOf('<Button', i);
      expect(card.slice(open, i)).toMatch(/<Button variant="quiet" wrap /);
    }
  });
});
