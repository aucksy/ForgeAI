/**
 * Invite link + front-desk QR (14 Oct 2026): one link per gym, the WhatsApp words, and wa.me links
 * that never go to the wrong country. The app reads the same link (apps/mobile pendingInvite.ts).
 */
import { describe, expect, it } from 'vitest';

import { firstName, inviteLink, inviteMessage, whatsAppHref } from '../../src/crm/shop/invite';
import { POSTER, qrModules } from '../../src/crm/shop/InviteScreen';

describe('invite link', () => {
  it('is the gym code under /j/ on the panel site, in capitals', () => {
    expect(inviteLink('rams01')).toBe('https://forgeai.aakashpahuja.in/j/RAMS01');
    expect(inviteLink(' FORGE1 ')).toBe('https://forgeai.aakashpahuja.in/j/FORGE1');
  });

  it('carries no name or number', () => {
    const msg = inviteMessage("RAM'S FITNESS CLUB", 'RAMS01', 'Rahul Sharma');
    const link = msg.split('\n').find((l) => l.startsWith('https://'));
    expect(link).toBe('https://forgeai.aakashpahuja.in/j/RAMS01');
  });
});

describe('the WhatsApp message', () => {
  it('greets by first name, link on its own line, code last', () => {
    const msg = inviteMessage("RAM'S FITNESS CLUB", 'RAMS01', '  Rahul  Sharma ');
    const lines = msg.split('\n');
    expect(lines[0]).toBe('Hi Rahul!');
    expect(msg).toContain("Join RAM'S FITNESS CLUB in the ForgeAI app");
    expect(lines).toContain('https://forgeai.aakashpahuja.in/j/RAMS01');
    expect(lines[lines.length - 1]).toBe('Gym code: RAMS01');
  });

  it('works with no member name', () => {
    expect(inviteMessage('Iron Temple', 'IRON01').split('\n')[0]).toBe('Hi!');
    expect(firstName(null)).toBe('');
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
    const q = qrModules('https://forgeai.aakashpahuja.in/j/RAMS01');
    expect(q.size).toBeGreaterThanOrEqual(21);
    expect(q.path.length).toBeGreaterThan(100);
  });

  it('names the code', () => {
    expect(POSTER.codeLine('RAMS01')).toContain('RAMS01');
  });
});
