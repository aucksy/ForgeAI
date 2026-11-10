/**
 * R-448 (10 Nov 2026): the offline copy's plain words, the "Choose a new PIN?" offer after a code sign-in, and
 * the WhatsApp page's "Checking your message…" after coming back from WhatsApp.
 */
import { describe, expect, it } from 'vitest';

import { CHECK_MS, waitPhase } from '../../src/crm/auth/WhatsAppVerify';
import { shortInboundText } from '../../src/crm/auth/phoneCode';
import { askPinFor, askPinKind, forgetAskPin, rememberAskPin, shouldOfferNewPin, shouldOfferPin } from '../../src/crm/auth/pinPrompt';
import { CLEAR_DEVICE_WORDS, clearDeviceWaitingWords, clearDeviceYes } from '../../src/crm/ui/offline';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('the offline copy on this device (was "Clear this device\'s saved data")', () => {
  it('says what it deletes, what it does NOT delete, and when to use it', () => {
    expect(CLEAR_DEVICE_WORDS.what).toContain('deletes only that copy');
    expect(CLEAR_DEVICE_WORDS.what).toContain('Your gym’s records online stay safe');
    expect(CLEAR_DEVICE_WORDS.what).toContain('fresh copy downloads');
    expect(CLEAR_DEVICE_WORDS.when).toMatch(/^Use it only while the internet is working/);
    expect(CLEAR_DEVICE_WORDS.askNothingWaiting).toContain('Nothing is deleted from your gym’s records online.');
    expect(CLEAR_DEVICE_WORDS.button).toBe('Clear offline copy');
    // The old scary name is gone from every line.
    for (const w of Object.values(CLEAR_DEVICE_WORDS)) expect(w).not.toMatch(/saved data/);
  });

  it('with something waiting, the confirm names it and says it is lost; the rest stays safe', () => {
    expect(clearDeviceWaitingWords(1, 0, 0)).toBe(
      '1 waiting to send from this device. It is not in your gym’s records yet. Clearing deletes it for good. Everything else in your gym’s records stays safe online.',
    );
    const many = clearDeviceWaitingWords(3, 2, 250000);
    expect(many).toMatch(/^3 waiting to send from this device, including 2 payments of ₹2,500\. They are not in your gym’s records yet\. Clearing deletes them for good\./);
    expect(clearDeviceYes(0)).toBe('Yes, clear it');
    expect(clearDeviceYes(1)).toBe('Delete it and clear');
    expect(clearDeviceYes(3)).toBe('Delete all 3 and clear');
  });
});

describe('"Choose a new PIN?" after a code sign-in', () => {
  it('offers a new PIN to someone who HAS one; "Set your own PIN" stays for someone with none', () => {
    expect(shouldOfferNewPin({ via: 'code', hasPin: true })).toBe(true);
    expect(shouldOfferNewPin({ via: 'pin', hasPin: true })).toBe(false);
    expect(shouldOfferNewPin({ via: 'code', hasPin: false })).toBe(false);
    expect(shouldOfferNewPin({})).toBe(false);
    expect(shouldOfferPin({ via: 'code', hasPin: true })).toBe(false);
  });

  it('remembers which prompt, for that person only, and forgets it after once', () => {
    const s = memory();
    rememberAskPin('s1', s, 'new');
    expect(askPinKind('s1', s)).toBe('new');
    expect(askPinFor('s1', s)).toBe(true);
    expect(askPinKind('s2', s)).toBe(null);
    rememberAskPin('s1', s);
    expect(askPinKind('s1', s)).toBe('set');
    forgetAskPin(s);
    expect(askPinKind('s1', s)).toBe(null);
  });
});

describe('the WhatsApp page after coming back', () => {
  it('waiting until they leave; "checking" for 20 seconds after they come back; then the calm hint', () => {
    expect(CHECK_MS).toBe(20_000);
    expect(waitPhase(null, 1_000_000)).toBe('waiting');
    expect(waitPhase(1_000_000, 1_000_000)).toBe('checking');
    expect(waitPhase(1_000_000, 1_000_000 + 19_999)).toBe('checking');
    expect(waitPhase(1_000_000, 1_000_000 + 20_000)).toBe('slow');
  });

  it('the part of the message to type by hand is only the code line', () => {
    expect(shortInboundText('482913')).toBe('MettleUp code 482913');
  });
});
