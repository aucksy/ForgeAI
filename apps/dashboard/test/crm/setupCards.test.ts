/** Fresh eyes (14 Nov 2026): Today shows one set-up card at a time (logic/setupCards.ts). */
import { describe, expect, it } from 'vitest';

import { SETUP_ORDER, setupTurn } from '../../src/crm/logic/setupCards';

describe('one set-up card on Today at a time', () => {
  it('alerts first, then the admin app on the phone (R-526: Get started has its own page now)', () => {
    expect(SETUP_ORDER).toEqual(['alerts', 'install']);
    expect(setupTurn({ alerts: true, install: true })).toBe('alerts');
    expect(setupTurn({ alerts: false, install: true })).toBe('install');
  });
  it('none when no card wants to show', () => {
    expect(setupTurn({})).toBeNull();
    expect(setupTurn({ alerts: false, install: false })).toBeNull();
  });
});
