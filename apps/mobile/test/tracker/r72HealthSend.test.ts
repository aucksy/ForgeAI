/**
 * R-72 (owner, 22 Oct 2026): "Send past workouts ... sent it without confirmation and without telling
 * what it will do ... I am not even sure if it's working". It now asks first (how many, from when to
 * when, where they go), counts while it sends, and keeps a "Last sent" line.
 */
import { describe, expect, it } from 'vitest';

import { lastSentText, pastSendAsk, sendProgressText, SEE_THEM_IN_GOOGLE_HEALTH } from '@/tracker/phone/healthConnect';

const TODAY = '2026-10-22';

describe('R-72: Send past workouts asks first', () => {
  it('says how many, from when to when, and where they go', () => {
    const ask = pastSendAsk({ count: 480, firstISO: '2024-03-02', lastISO: '2026-10-21', demo: false }, TODAY);
    expect(ask).toEqual({
      title: 'Send 480 workouts to Health Connect?',
      body:
        'Your workouts from 2 Mar 2024 to 21 Oct go in as strength training, each with its time and calories (an estimate). ' +
        'Google Health, Samsung Health and other apps you allow there can show them. Sending again replaces them, so nothing is counted twice.',
      confirm: 'Send 480 workouts',
    });
    const one = pastSendAsk({ count: 1, firstISO: '2026-10-20', lastISO: '2026-10-20', demo: false }, TODAY);
    expect(one).toMatchObject({ title: 'Send 1 workout to Health Connect?', confirm: 'Send 1 workout' });
    expect('body' in one && one.body.startsWith('Your workout of 20 Oct goes in as strength training')).toBe(true);
    // Review: several workouts on one day say so.
    const sameDay = pastSendAsk({ count: 3, firstISO: '2026-10-20', lastISO: '2026-10-20', demo: false }, TODAY);
    expect('body' in sameDay && sameDay.body.startsWith('Your 3 workouts of 20 Oct go in as strength training')).toBe(true);
  });

  it('nothing to send, or demo data: a plain notice, never a question', () => {
    expect(pastSendAsk({ count: 0, firstISO: null, lastISO: null, demo: false }, TODAY)).toEqual({ notice: 'No workouts to send yet.' });
    expect(pastSendAsk({ count: 30, firstISO: '2026-09-01', lastISO: '2026-10-01', demo: true }, TODAY)).toEqual({
      notice: 'Nothing to send: workouts on demo data never leave your phone.',
    });
  });

  it('counts while it sends, then keeps when it last sent', () => {
    expect(sendProgressText(200, 480)).toBe('Sending… 200 of 480');
    expect(sendProgressText(0, 0)).toBe('Sending…');
    const at = new Date(2026, 9, 22, 10, 40).getTime();
    expect(lastSentText({ at, count: 480, past: true }, TODAY)).toBe('Last sent: Today, 10:40 · 480 past workouts');
    expect(lastSentText({ at: new Date(2026, 9, 21, 18, 5).getTime(), count: 1, past: false }, TODAY)).toBe('Last sent: Yesterday, 18:05 · 1 workout');
    expect(lastSentText(null, TODAY)).toBeNull();
    expect(lastSentText({ at, count: 0, past: true }, TODAY)).toBeNull();
  });

  it('member words never say volume, PR or session', () => {
    const ask = pastSendAsk({ count: 3, firstISO: '2026-10-01', lastISO: '2026-10-20', demo: false }, TODAY);
    for (const w of [JSON.stringify(ask), SEE_THEM_IN_GOOGLE_HEALTH, sendProgressText(1, 3)]) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
