/**
 * #49 step 1, item 6: "Check workout code". The desk types the code from the member's app; each
 * workout day is matched against this gym's own check-ins.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeClaim, encodeClaim } from '../../src/crm/logic/claimCode';
import { checkClaim, claimSummary } from '../../src/crm/logic/claimMatch';
import type { Visit } from '../../src/crm/types';

const TODAY = '2026-10-22';
const visit = (visitedOn: string, source: Visit['source'] = 'desk'): Visit =>
  ({ gymId: 'g', id: `v-${visitedOn}-${source}`, memberId: 'm1', visitedOn, checkedInAt: 0, source }) as Visit;

describe('the code is the member app’s own', () => {
  it('this copy is word for word the member app’s (apps/mobile/src/shop/claimCode.ts)', () => {
    const here = readFileSync(resolve(__dirname, '../../src/crm/logic/claimCode.ts'), 'utf8').replace(/\r\n/g, '\n');
    const app = readFileSync(resolve(__dirname, '../../../mobile/src/shop/claimCode.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(here).toBe(app);
  });

  it('reads a code made by the member app', () => {
    const code = encodeClaim(TODAY, ['2026-10-22', '2026-10-20']);
    expect(decodeClaim(code, TODAY)).toEqual({ ok: true, madeOn: TODAY, days: ['2026-10-20', '2026-10-22'] });
  });
});

describe('matching the days against check-ins', () => {
  const days = ['2026-10-22', '2026-10-20', '2026-10-18', '2026-10-15', '2026-10-01'];
  const visits = [visit('2026-10-22'), visit('2026-10-20', 'app'), visit('2026-10-20'), visit('2026-10-18', 'app'), visit('2026-10-14')];

  it('only a day with a check-in counts; a desk check-in wins over an app one', () => {
    const c = checkClaim(encodeClaim(TODAY, days), visits, TODAY);
    if (!c.ok) throw new Error('should read');
    expect(c.days).toEqual([
      { day: '2026-10-01', checkIn: null },
      { day: '2026-10-15', checkIn: null },
      { day: '2026-10-18', checkIn: 'app' },
      { day: '2026-10-20', checkIn: 'desk' },
      { day: '2026-10-22', checkIn: 'desk' },
    ]);
    expect([c.matched, c.atDesk, c.inApp, c.old]).toEqual([3, 2, 1, false]);
    expect(claimSummary(c)).toBe('3 of 5 workouts match a check-in (2 at the desk, 1 in the app).');
  });

  it('an old code says so; an empty code says so; a sofa-only code matches nothing', () => {
    const old = checkClaim(encodeClaim('2026-10-15', ['2026-10-15']), [], TODAY);
    expect(old.ok && old.old).toBe(true);
    const empty = checkClaim(encodeClaim(TODAY, []), visits, TODAY);
    expect(empty.ok && claimSummary(empty)).toBe('This code has no workouts in its 30 days.');
    const sofa = checkClaim(encodeClaim(TODAY, ['2026-10-21']), visits, TODAY);
    expect(sofa.ok && claimSummary(sofa)).toBe('0 of 1 workout matches a check-in.');
  });

  it('a mistyped or short code gets plain words', () => {
    const code = encodeClaim(TODAY, days).replace('-', '');
    const slip = code.slice(0, 6) + (code[6] === '7' ? '8' : '7') + code.slice(7);
    expect(checkClaim(slip, visits, TODAY)).toEqual({ ok: false, problem: 'That code has a typing mistake. Check it against the member’s phone.' });
    expect(checkClaim('K3Q9', visits, TODAY)).toEqual({ ok: false, problem: 'A workout code has 10 letters and numbers, like K3Q9P-X2M7A.' });
  });
});
