/**
 * Invite link + front-desk QR (14 Oct 2026): one link per gym, the WhatsApp words, and wa.me links
 * that never go to the wrong country. The app reads the same link (apps/mobile pendingInvite.ts).
 */
import { describe, expect, it } from 'vitest';

import { APP_LINK, appLinkMessage, firstName, inviteLink, inviteMessage, whatsAppHref } from '../../src/crm/shop/invite';
import { POSTER, qrModules } from '../../src/crm/shop/InviteScreen';

describe('invite link', () => {
  it('is the gym code under /j/ on the panel site, in capitals', () => {
    expect(inviteLink('rams01')).toBe('https://app.mettleup.fit/j/RAMS01');
    expect(inviteLink(' FORGE1 ')).toBe('https://app.mettleup.fit/j/FORGE1');
  });

  it('carries no name or number', () => {
    const msg = inviteMessage("RAM'S FITNESS CLUB", 'RAMS01', 'Rahul Sharma');
    const link = msg.split('\n').find((l) => l.startsWith('https://'));
    expect(link).toBe('https://app.mettleup.fit/j/RAMS01');
  });
});

describe('the WhatsApp message', () => {
  it('greets by first name, link on its own line, code last', () => {
    const msg = inviteMessage("RAM'S FITNESS CLUB", 'RAMS01', '  Rahul  Sharma ');
    const lines = msg.split('\n');
    expect(lines[0]).toBe('Hi Rahul!');
    expect(msg).toContain("Join RAM'S FITNESS CLUB in the MettleUp app");
    expect(lines).toContain('https://app.mettleup.fit/j/RAMS01');
    expect(lines[lines.length - 1]).toBe('Gym code: RAMS01');
  });

  it('works with no member name', () => {
    expect(inviteMessage('Iron Temple', 'IRON01').split('\n')[0]).toBe('Hi!');
    expect(firstName(null)).toBe('');
  });
});

// R-579: the member page's "Share app link": the smart link, the gym code, words for a member already on the app.
describe('Share app link message (owner, 25 Nov 2026: the store link, then the phone number connects the gym)', () => {
  it('a member not on the app gets the store link, the phone-number step and the code as a fallback', () => {
    const lines = appLinkMessage('Shakti Gym', 'qa0002', 'Ravi Kumar', false).split('\n');
    expect(lines[0]).toBe('Hi Ravi!');
    expect(lines[1]).toBe('Get the free MettleUp app from Shakti Gym to track your workouts.');
    expect(lines).toContain('https://app.mettleup.fit/app');
    expect(lines).toContain('Then open the app, tap "Continue with your phone number" and use this same number. The app connects you to Shakti Gym by itself.');
    expect(lines[lines.length - 1]).toBe('Gym code, only if the app asks for it: QA0002');
  });

  it('never the old gym page link (it showed a web page before the store)', () => {
    for (const onApp of [false, true]) expect(appLinkMessage('Shakti Gym', 'QA0002', 'Ravi', onApp)).not.toMatch(/\/j\//);
  });

  it('a member already on the app gets words for a new phone or a reinstall, with the same link and steps', () => {
    const lines = appLinkMessage('Shakti Gym', 'QA0002', 'Ravi Kumar', true).split('\n');
    expect(lines[1]).toBe('Here is the MettleUp app link from Shakti Gym, in case you need to install the app again or use a new phone.');
    expect(lines).toContain(APP_LINK);
    expect(lines.join(' ')).toMatch(/Continue with your phone number/);
    expect(lines.join(' ')).not.toMatch(/Join Shakti Gym/);
  });

  it('a gym that is not online yet shares the plain app link, with no code and no phone step', () => {
    expect(APP_LINK).toBe('https://app.mettleup.fit/app');
    for (const onApp of [false, true]) {
      const msg = appLinkMessage('Shakti Gym', null, 'Ravi', onApp);
      expect(msg.split('\n')).toContain(APP_LINK);
      expect(msg).not.toMatch(/Gym code|phone number|\/j\//);
    }
  });

  it('carries no name or number in the link', () => {
    for (const onApp of [false, true]) {
      const msg = appLinkMessage('Shakti Gym', 'QA0002', 'Ravi Kumar', onApp);
      expect(msg.split('\n').find((l) => l.startsWith('https://'))).toBe(APP_LINK);
    }
  });
});

describe('wa.me links', () => {
  it('goes to the member when the number has its country code', () => {
    const href = whatsAppHref('hello there', '+919876543210');
    expect(href).toBe('https://wa.me/919876543210?text=hello%20there');
  });

  it('leaves out a number without a country code instead of sending it abroad', () => {
    expect(whatsAppHref('x', '9876543210')).toBe('https://wa.me/?text=x');
    expect(whatsAppHref('x', '+91123')).toBe('https://wa.me/?text=x');
    expect(whatsAppHref('x', null)).toBe('https://wa.me/?text=x');
  });

  it('keeps line breaks and apostrophes in the message', () => {
    const href = whatsAppHref(inviteMessage("RAM'S", 'RAMS01'));
    expect(decodeURIComponent(href.split('?text=')[1])).toBe(inviteMessage("RAM'S", 'RAMS01'));
  });
});

describe('QR poster', () => {
  it('encodes the link into a scannable grid', () => {
    const q = qrModules('https://app.mettleup.fit/j/RAMS01');
    expect(q.size).toBeGreaterThanOrEqual(21);
    expect(q.path.length).toBeGreaterThan(100);
  });

  it('names the code', () => {
    expect(POSTER.codeLine('RAMS01')).toContain('RAMS01');
  });
});
