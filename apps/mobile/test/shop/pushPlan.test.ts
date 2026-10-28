import { describe, expect, it } from 'vitest';

import { planPushToken, PUSH_REFRESH_MS, pushFromData, savedPushFrom } from '@/shop/pushPlan';

const NOW = 1_800_000_000_000;
const saved = { memberKey: 'key-a', token: 'tok-1', savedAt: NOW - 1000 };
const base = { linkKey: 'key-a', switchOn: true, allowed: true, token: 'tok-1', saved: null, now: NOW };

describe('planPushToken: when the push address is saved, cleared or forgotten', () => {
  it('saves it in a gym, with the switch on and notifications allowed', () => {
    expect(planPushToken(base)).toEqual({ kind: 'save', key: 'key-a', token: 'tok-1' });
  });
  it('does nothing when the same address was saved for the same member this week', () => {
    expect(planPushToken({ ...base, saved })).toEqual({ kind: 'none' });
  });
  it('saves again after a week, for a new address, or for another member', () => {
    expect(planPushToken({ ...base, saved: { ...saved, savedAt: NOW - PUSH_REFRESH_MS - 1 } }).kind).toBe('save');
    expect(planPushToken({ ...base, saved, token: 'tok-2' })).toEqual({ kind: 'save', key: 'key-a', token: 'tok-2' });
    expect(planPushToken({ ...base, saved, linkKey: 'key-b' })).toEqual({ kind: 'save', key: 'key-b', token: 'tok-1' });
    // A clock that went back: saved "in the future" is not trusted.
    expect(planPushToken({ ...base, saved: { ...saved, savedAt: NOW + 60_000 } }).kind).toBe('save');
  });
  it('waits when Firebase gave no address yet', () => {
    expect(planPushToken({ ...base, token: null })).toEqual({ kind: 'none' });
  });
  it('clears it on the server when the switch or the phone notifications go off', () => {
    expect(planPushToken({ ...base, saved, switchOn: false })).toEqual({ kind: 'clear', key: 'key-a', token: 'tok-1' });
    expect(planPushToken({ ...base, saved, allowed: false })).toEqual({ kind: 'clear', key: 'key-a', token: 'tok-1' });
  });
  it('only forgets it after leaving the gym or erasing (the server deleted it on leave)', () => {
    expect(planPushToken({ ...base, saved, linkKey: null, token: null })).toEqual({ kind: 'forget' });
    expect(planPushToken({ ...base, saved, linkKey: 'key-b', switchOn: false })).toEqual({ kind: 'forget' });
  });
  it('does nothing when nothing was saved and nothing is wanted', () => {
    expect(planPushToken({ ...base, switchOn: false })).toEqual({ kind: 'none' });
    expect(planPushToken({ ...base, linkKey: null })).toEqual({ kind: 'none' });
  });
});

describe('savedPushFrom', () => {
  it('reads what was saved and refuses damaged values', () => {
    expect(savedPushFrom(saved)).toEqual(saved);
    expect(savedPushFrom(null)).toBeNull();
    expect(savedPushFrom({ memberKey: 'k', token: '', savedAt: 1 })).toBeNull();
    expect(savedPushFrom({ memberKey: 'k', token: 't', savedAt: 'x' })).toBeNull();
  });
});

describe('pushFromData: what a push carried, in every shape the library hands over', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const body = JSON.stringify({ kind: 'gym-message', route: '/shop/inbox', push: 'message', noticeId: id, gymId: 'g1' });
  const want = { push: 'message', noticeId: id, gymId: 'g1', tag: `gym-notice-${id}` };

  it('the raw data map (background task)', () => {
    expect(pushFromData({ data: { title: 'Gym', message: 'Closed', body, push: 'message', noticeId: id, gymId: 'g1' }, notification: null })).toEqual(want);
  });
  it('only the JSON body / dataString', () => {
    expect(pushFromData({ data: { dataString: body } })).toEqual(want);
    expect(pushFromData(body)).toEqual(want);
  });
  it('a notification (content.data)', () => {
    expect(pushFromData({ request: { content: { data: JSON.parse(body) } } })).toEqual(want);
  });
  it('an offer gets its own pop-up id', () => {
    expect(pushFromData({ push: 'offer', noticeId: id, gymId: 'g1' })?.tag).toBe(`gym-offer-${id}`);
  });
  it('anything else is not ours', () => {
    expect(pushFromData(null)).toBeNull();
    expect(pushFromData({ data: { kind: 'rest' } })).toBeNull();
    expect(pushFromData({ push: 'message', noticeId: '../../x' })).toBeNull();
    expect(pushFromData('not json')).toBeNull();
  });
});
