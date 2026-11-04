/** F147 Bring a friend: the Gym tab card's words, share text and the server answer reader. */
import { describe, expect, it } from 'vitest';

import { FRIEND_WORDS, friendInviteFrom, friendJoinedLine, friendLink, friendMessage, friendRewardLine } from '@/shop/bringFriend';

describe('member_friend_invite answer', () => {
  it('reads a good answer', () => {
    expect(friendInviteFrom({ ok: true, code: 'ABCD2345', gymName: ' Iron Temple ', rewardDays: 7, joined: 2 })).toEqual({
      code: 'ABCD2345',
      gymName: 'Iron Temple',
      rewardDays: 7,
      joined: 2,
    });
  });
  it('no free days, no joins', () => {
    expect(friendInviteFrom({ ok: true, code: 'ABCD2345', gymName: 'G', rewardDays: null, joined: 0 })).toMatchObject({ rewardDays: null, joined: 0 });
    expect(friendInviteFrom({ ok: true, code: 'ABCD2345', gymName: 'G', rewardDays: 90, joined: -1 })).toMatchObject({ rewardDays: null, joined: 0 });
  });
  it('a member who left, a paused gym or a damaged answer hides the card', () => {
    expect(friendInviteFrom({ error: 'LEFT' })).toBeNull();
    expect(friendInviteFrom({ error: 'SUSPENDED' })).toBeNull();
    expect(friendInviteFrom({ ok: true, code: 'abc' })).toBeNull();
    // 0, 1, I and O are never in a code (easy to misread).
    expect(friendInviteFrom({ ok: true, code: 'ABCD0123' })).toBeNull();
    expect(friendInviteFrom(null)).toBeNull();
    expect(friendInviteFrom([])).toBeNull();
  });
});

describe('the card words', () => {
  it('the share message names the gym and carries the link', () => {
    expect(friendLink('ABCD2345')).toBe('https://app.mettleup.fit/f/ABCD2345');
    expect(friendMessage({ code: 'ABCD2345', gymName: 'Iron Temple' })).toBe(
      'Come and train with me at Iron Temple! Leave your name and number on this page, and the gym will call you: https://app.mettleup.fit/f/ABCD2345',
    );
    expect(friendMessage({ code: 'ABCD2345', gymName: '' })).toContain('at my gym!');
  });
  it('free days line only when the gym gives some', () => {
    expect(friendRewardLine(null)).toBeNull();
    expect(friendRewardLine(1)).toBe('When a friend joins, your gym can add 1 free day to your plan.');
    expect(friendRewardLine(7)).toBe('When a friend joins, your gym can add 7 free days to your plan.');
    expect(friendJoinedLine(3)).toBe('Friends who joined: 3');
  });
  it('plain words: never volume, PR or session', () => {
    const all = [...Object.values(FRIEND_WORDS), friendMessage({ code: 'ABCD2345', gymName: 'G' }), friendRewardLine(5), friendJoinedLine(1)].join(' ');
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession/i);
  });
});
