/**
 * MettleUp's new address (R-105): the old address moves a desk only when it is safe, and carries
 * only the sign-in keys (src/crm/move/move.ts; the server half is deploy/panel/hosts.js).
 */
import { describe, expect, it } from 'vitest';

import {
  MOVE_KEYS,
  NEW_ORIGIN,
  isBrowserOnlyGym,
  moveState,
  moveWords,
  movePath,
  movePayload,
  type MoveFacts,
} from '../../src/crm/move/move';
import { serverBase } from '../../src/lib/serverAddress';

const safe: MoveFacts = {
  onOldHost: true,
  serverSaysMove: true,
  online: true,
  waiting: 0,
  held: 0,
  signedIn: true,
  browserOnlyGym: false,
  newAddressUp: true,
};

describe('when the old address moves a desk', () => {
  it('moves only when nothing waits, online, the server says so and the new address answers', () => {
    expect(moveState(safe)).toEqual({ kind: 'go' });
    expect(moveState({ ...safe, signedIn: false })).toEqual({ kind: 'go' });
  });

  it('never on the new address or any other, nor when the server says no', () => {
    expect(moveState({ ...safe, onOldHost: false })).toEqual({ kind: 'stay' });
    expect(moveState({ ...safe, serverSaysMove: false, waiting: 3 })).toEqual({ kind: 'stay' });
  });

  it('things waiting to be sent keep the desk here, and say why', () => {
    expect(moveState({ ...safe, waiting: 3 })).toEqual({ kind: 'waiting', n: 3 });
    expect(moveState({ ...safe, waiting: 3, online: false })).toEqual({ kind: 'waiting', n: 3 });
    expect(moveState({ ...safe, waiting: 2, signedIn: false })).toEqual({ kind: 'signIn', n: 2 });
    expect(moveState({ ...safe, waiting: 2, held: 1 })).toEqual({ kind: 'held', n: 1 });
  });

  it('a gym kept only in this browser never moves away from its records', () => {
    expect(moveState({ ...safe, browserOnlyGym: true })).toEqual({ kind: 'browserOnly' });
  });

  it('offline, or the new address not answering: stays quietly and asks again later', () => {
    expect(moveState({ ...safe, online: false })).toEqual({ kind: 'stay' });
    expect(moveState({ ...safe, newAddressUp: false })).toEqual({ kind: 'stay' });
  });

  it('the words name the new address and what to do', () => {
    expect(moveWords({ kind: 'stay' })).toBeNull();
    expect(moveWords({ kind: 'waiting', n: 1 })).toContain('sending 1 item saved on it first');
    expect(moveWords({ kind: 'waiting', n: 3 })).toContain('3 items');
    expect(moveWords({ kind: 'held', n: 2 })).toContain('First fix the 2 items shown in yellow');
    expect(moveWords({ kind: 'signIn', n: 2 })).toContain('Sign in here first');
    expect(moveWords({ kind: 'browserOnly' })).toContain('Settings → “Put your gym online”');
    for (const k of ['waiting', 'held', 'signIn', 'browserOnly', 'go'] as const) {
      expect(moveWords({ kind: k, n: 1 } as never)).toContain('app.mettleup.fit');
      expect(moveWords({ kind: k, n: 1 } as never)).not.toMatch(/ForgeAI|sync|outbox/i);
    }
  });
});

describe('records kept only in this browser', () => {
  const blob = (snapshot: object) => JSON.stringify({ v: 1, snapshot });
  it('a real gym with members, plans, payments or visits is kept here', () => {
    expect(isBrowserOnlyGym(blob({ gym: { gymId: 'gym_local' }, members: [{ id: 'm1' }], plans: [] }))).toBe(true);
    expect(isBrowserOnlyGym(blob({ gym: { gymId: 'gym_local' }, members: [], plans: [{ id: 'p' }] }))).toBe(true);
  });
  it('nothing, an empty gym or the made-up demo gym is not', () => {
    expect(isBrowserOnlyGym(null)).toBe(false);
    expect(isBrowserOnlyGym(blob({ gym: { gymId: 'gym_local' }, members: [], plans: [] }))).toBe(false);
    expect(isBrowserOnlyGym(blob({ gym: { gymId: 'gym_demo' }, members: [{ id: 'm1' }] }))).toBe(false);
  });
  it('an unreadable copy counts as records (never moved away from)', () => {
    expect(isBrowserOnlyGym('{nope')).toBe(true);
  });
});

describe('what goes along to the new address', () => {
  const store: Record<string, string> = {
    'forgeai.cloudGym.v1': JSON.stringify({ gymId: 'g1', ownerKey: 'k'.repeat(32), name: 'Shakti Gym ॐ' }),
    'forgeai.branchKeys.v1': '{"g2":"key2"}',
    'forgeai.theme.v1': 'light',
    'forgeai-crm-v1': '{"secret":"records"}',
    'forgeai.sendQueue.g1': '{}',
  };
  const read = (k: string) => store[k] ?? null;
  const decode = (m: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));

  it('only the sign-in, branch keys and dark/light, as base64url (safe in a form, any language)', () => {
    const m = movePayload(read);
    expect(m).toMatch(/^[A-Za-z0-9_-]+$/);
    const keys = decode(m);
    expect(Object.keys(keys).sort()).toEqual([...MOVE_KEYS].sort());
    expect(keys['forgeai.cloudGym.v1']).toBe(store['forgeai.cloudGym.v1']);
    expect(JSON.parse(keys['forgeai.cloudGym.v1']).name).toBe('Shakti Gym ॐ');
  });

  it('nobody signed in: nothing goes (a plain move)', () => {
    expect(movePayload((k) => (k === 'forgeai.theme.v1' ? 'light' : null))).toBe('');
  });

  it('opens the same page on the new address, never another site', () => {
    expect(movePath('/start', '')).toBe('/start');
    expect(movePath('/members/abc', '?x=1')).toBe('/members/abc?x=1');
    expect(movePath('//evil.example', '')).toBe('/');
    expect(NEW_ORIGIN).toBe('https://app.mettleup.fit');
  });

  it('the new address reaches the gym server through its own /sb', () => {
    expect(serverBase('app.mettleup.fit', NEW_ORIGIN, 'https://x.supabase.co')).toBe(`${NEW_ORIGIN}/sb`);
  });
});
