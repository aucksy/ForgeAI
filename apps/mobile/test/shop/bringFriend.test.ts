/** F147 Bring a friend: the Gym tab card's words, share text and the server answer reader. */
import { afterEach, describe, expect, it } from 'vitest';

import { FRIEND_LINK_BASE, FRIEND_LINK_BASE_JOIN, FRIEND_WORDS, QA_STAND_IN_NOTE, friendInviteFrom, friendJoinedLine, friendLink, friendLinkBaseFrom, friendMessage, friendRewardLine, hasQaStandIn, qaStandInInvite } from '@/shop/bringFriend';
import { LINKS_URL, friendLinkBase, knownFriendLinkBase, resetFriendLinkBaseForTests } from '@/shop/friendLinkBase';

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

describe('the device-UAT stand-in (QA builds only)', () => {
  it('only a build whose app.json lists it', () => {
    expect(hasQaStandIn({ qaStandIns: ['friendInvite'] })).toBe(true);
    expect(hasQaStandIn({ qaStandIns: ['other'] })).toBe(false);
    expect(hasQaStandIn({ supabaseUrl: 'x' })).toBe(false);
    expect(hasQaStandIn(undefined)).toBe(false);
  });
  it('is a valid invite the reader accepts, and says on screen that it is made up', () => {
    const s = qaStandInInvite('QA UAT Gym');
    expect(friendInviteFrom({ ok: true, ...s })).toEqual(s);
    expect(QA_STAND_IN_NOTE).toMatch(/^Test build: made-up numbers/);
  });
});

describe('R-539: the link on join.mettleup.fit, outside the admin app, once the Worker says so', () => {
  afterEach(() => resetFriendLinkBaseForTests());
  const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it('reads only join.mettleup.fit from /api/links', () => {
    expect(friendLinkBaseFrom({ join: 'https://join.mettleup.fit' })).toBe(FRIEND_LINK_BASE_JOIN);
    for (const bad of [null, undefined, 'x', [], {}, { join: 'https://evil.example' }, { join: 'https://app.mettleup.fit' }]) {
      expect(friendLinkBaseFrom(bad)).toBe(FRIEND_LINK_BASE);
    }
  });

  it('the share message carries the join.mettleup.fit link; an unknown base falls back to app.mettleup.fit', () => {
    expect(friendLink('ABCD2345', FRIEND_LINK_BASE_JOIN)).toBe('https://join.mettleup.fit/f/ABCD2345');
    expect(friendLink('ABCD2345', 'https://evil.example/f/')).toBe('https://app.mettleup.fit/f/ABCD2345');
    expect(friendMessage({ code: 'ABCD2345', gymName: 'Iron Temple' }, FRIEND_LINK_BASE_JOIN)).toMatch(/: https:\/\/join\.mettleup\.fit\/f\/ABCD2345$/);
  });

  it('asks the Worker once and keeps the answer; a failure stays on app.mettleup.fit', async () => {
    let calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ join: 'https://join.mettleup.fit' }) };
    }) as unknown as typeof fetch;
    expect(knownFriendLinkBase()).toBe(FRIEND_LINK_BASE);
    expect(await friendLinkBase(f)).toBe(FRIEND_LINK_BASE_JOIN);
    expect(await friendLinkBase(f)).toBe(FRIEND_LINK_BASE_JOIN);
    expect(knownFriendLinkBase()).toBe(FRIEND_LINK_BASE_JOIN);
    expect(calls).toEqual([LINKS_URL]);
    resetFriendLinkBaseForTests();
    calls = [];
    const down = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await friendLinkBase(down)).toBe(FRIEND_LINK_BASE);
    expect(await friendLinkBase(answer({ join: 'https://join.mettleup.fit' }))).toBe(FRIEND_LINK_BASE);
    resetFriendLinkBaseForTests();
    expect(await friendLinkBase(answer({ join: 'https://join.mettleup.fit' }, false))).toBe(FRIEND_LINK_BASE);
  });
});
