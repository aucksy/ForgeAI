/** Fresh eyes (14 Nov 2026): Today shows one set-up card at a time (logic/setupCards.ts). */
import { describe, expect, it } from 'vitest';

import { SETUP_ORDER, setupTurn } from '../../src/crm/logic/setupCards';

describe('one set-up card on Today at a time', () => {
  it('Get started first, then alerts, then the admin app on the phone', () => {
    expect(SETUP_ORDER).toEqual(['get-started', 'alerts', 'install']);
    expect(setupTurn({ 'get-started': true, alerts: true, install: true })).toBe('get-started');
    expect(setupTurn({ 'get-started': false, alerts: true, install: true })).toBe('alerts');
    expect(setupTurn({ alerts: false, install: true })).toBe('install');
  });
  it('none when no card wants to show', () => {
    expect(setupTurn({})).toBeNull();
    expect(setupTurn({ 'get-started': false, alerts: false, install: false })).toBeNull();
  });
});
