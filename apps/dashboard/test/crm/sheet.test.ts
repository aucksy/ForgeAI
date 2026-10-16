/**
 * The Sheet (every form in the panel): admin audit C7-15 and C7-16 (16 Oct 2026). The test lane has
 * no browser, so the layout rule is read from the style the Sheet uses, and the focus rule from the
 * Sheet's own code.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sheetOverlayStyle } from '../../src/crm/ui/kit';

describe('C7-15: a sheet always fits a 390 px phone', () => {
  it('the overlay grid column can shrink below its widest line (no 595 px Freeze sheet)', () => {
    // A grid column sized "auto" grows to fit the longest unbreakable line, pushing the close
    // button and Save off a phone screen that cannot scroll sideways.
    expect(sheetOverlayStyle(true).gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(sheetOverlayStyle(false).gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(sheetOverlayStyle(true).gridTemplateRows).toBe('minmax(0, 1fr)');
  });
});

describe('C7-16: typing in a sheet keeps its place when the screen redraws', () => {
  const kit = readFileSync(fileURLToPath(new URL('../../src/crm/ui/kit.tsx', import.meta.url)), 'utf8');
  const sheet = kit.slice(kit.indexOf('export function Sheet('), kit.indexOf('export function Sheet(') + 4000);

  it('the focus-moving setup runs once per opening, never again when onClose changes', () => {
    // Every redraw (the 15-second refresh, the shop's 30-second clock) hands the Sheet a new
    // onClose. With [onClose] as the setup's dependency, the setup re-ran and pulled the focus to
    // the sheet panel, closing the phone keyboard mid-amount.
    expect(sheet).toContain('onCloseRef.current = onClose');
    expect(sheet).not.toMatch(/\}, \[onClose\]\);/);
    expect(sheet).toMatch(/onCloseRef\.current\(\)/);
  });
});

describe('money sheets (C7-28, C7-42)', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const sell = read('../../src/crm/ui/forms/SellMembershipSheet.tsx');
  const collect = read('../../src/crm/ui/forms/CollectPaymentSheet.tsx');

  it('C7-28: selling and collecting start on the same method', () => {
    expect(sell).toContain('useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD)');
    expect(collect).toContain('useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD)');
  });

  it('C7-42: with no plans, the front desk is told to ask the owner', () => {
    expect(sell).toContain('Ask the owner to add a plan.');
  });
});
