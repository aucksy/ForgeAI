/**
 * Messages & offers step 1 (22 Oct 2026): the WhatsApp "send to next" list — its order, who is left
 * out, and the memory of who was done (cleared when the message changes) — and the remembered
 * language.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  clearDone,
  messageSignature,
  nextNotDone,
  queueList,
  readDone,
  readLang,
  saveDone,
  saveLang,
  type KeyValueStore,
} from '../../src/crm/logic/sendQueue';
import type { MemberView } from '../../src/crm/types';

function store(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const view = (id: string, fullName: string, phone: string) => ({ member: { id, fullName, phone } }) as MemberView;

describe('the order of the list', () => {
  const group = [
    view('3', 'rahul Sharma', '+919829011111'),
    view('1', 'Aarav Mehta', '+919829022222'),
    view('5', 'Neha Kapoor', '98290'), // not a full number
    view('2', 'Meera Iyer', '+919829033333'),
    view('4', 'Sunil Iyer', '+91 98290 33333'), // shares Meera's number (a family)
    view('6', 'Aarav Mehta', '+919829044444'), // same name, another person
  ];

  it('A to Z by name (any case), then by record; no full number left out; a shared number once', () => {
    const q = queueList(group);
    expect(q.people.map((v) => v.member.id)).toEqual(['1', '6', '2', '3']);
    expect(q.noPhone).toBe(1);
    expect(q.sharedPhone).toBe(1);
  });

  it('a personal message (own name and dates) goes to each member on a shared number (review fix)', () => {
    const q = queueList(group, false);
    expect(q.people.map((v) => v.member.id)).toEqual(['1', '6', '2', '3', '4']);
    expect(q.sharedPhone).toBe(0);
    expect(q.noPhone).toBe(1);
  });

  it('moves to the next one not done, and says when the list has run out', () => {
    const people = queueList(group).people; // 1, 6, 2, 3
    expect(nextNotDone(people, new Set(), 0)).toBe(0);
    expect(nextNotDone(people, new Set(['1', '6']), 0)).toBe(2);
    expect(nextNotDone(people, new Set(['2']), 2)).toBe(3);
    expect(nextNotDone(people, new Set(['3']), 3)).toBe(4); // past the end
    expect(nextNotDone(people, new Set(['1', '6', '2', '3']), 0)).toBe(4);
    expect(nextNotDone(people, new Set(), -3)).toBe(0);
  });
});

describe('remembering who was done', () => {
  const sig = messageSignature('*Gym closed on Sunday 8 Nov*\nThe gym is closed.\n– Iron Temple');

  it('is kept per gym for the same words', () => {
    const s = store();
    saveDone(s, 'gym_1', sig, ['1', '2']);
    expect([...readDone(s, 'gym_1', sig)]).toEqual(['1', '2']);
    expect(readDone(s, 'gym_2', sig).size).toBe(0);
  });

  it('starts again when the words change, and another message never wipes this one (review fix)', () => {
    const s = store();
    saveDone(s, 'gym_1', sig, ['1', '2'], 1000);
    const changed = messageSignature('*Gym closed on Sunday 8 Nov*\nThe gym is closed!\n– Iron Temple');
    expect(changed).not.toBe(sig);
    expect(readDone(s, 'gym_1', changed).size).toBe(0);
    // "Plan ending" half done, then a birthday wish: back on "Plan ending", the 2 done stay done.
    saveDone(s, 'gym_1', changed, ['3'], 2000);
    expect([...readDone(s, 'gym_1', sig)]).toEqual(['1', '2']);
    expect([...readDone(s, 'gym_1', changed)]).toEqual(['3']);
  });

  it('keeps the newest 20 lists', () => {
    const s = store();
    for (let i = 0; i < 25; i += 1) saveDone(s, 'gym_1', `sig${i}`, [`m${i}`], 1000 + i);
    expect(readDone(s, 'gym_1', 'sig4').size).toBe(0);
    expect([...readDone(s, 'gym_1', 'sig5')]).toEqual(['m5']);
    expect([...readDone(s, 'gym_1', 'sig24')]).toEqual(['m24']);
  });

  it('reads a list remembered by the first version (one list per gym)', () => {
    const s = store();
    s.map.set('forgeai.sendQueue.gym_1', JSON.stringify({ sig, done: ['7', 8, '9'] }));
    expect([...readDone(s, 'gym_1', sig)]).toEqual(['7', '9']);
    saveDone(s, 'gym_1', 'other', ['1'], 5);
    expect([...readDone(s, 'gym_1', sig)]).toEqual(['7', '9']);
  });

  it('"Start the list again" forgets only that message', () => {
    const s = store();
    saveDone(s, 'gym_1', sig, ['1'], 1);
    saveDone(s, 'gym_1', 'other', ['2'], 2);
    clearDone(s, 'gym_1', sig);
    expect(readDone(s, 'gym_1', sig).size).toBe(0);
    expect([...readDone(s, 'gym_1', 'other')]).toEqual(['2']);
  });

  it('damaged or blocked storage just starts the list again, with a warning in the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = store();
    s.map.set('forgeai.sendQueue.gym_1', '{not json');
    expect(readDone(s, 'gym_1', sig).size).toBe(0);
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readDone(blocked, 'gym_1', sig).size).toBe(0);
    expect(() => saveDone(blocked, 'gym_1', sig, ['1'])).not.toThrow();
    expect(() => clearDone(blocked, 'gym_1', sig)).not.toThrow();
    expect(readDone(null, 'gym_1', sig).size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a signature is short and changes with any letter', () => {
    expect(messageSignature('a')).not.toBe(messageSignature('b'));
    expect(messageSignature('नमस्ते')).toBe(messageSignature('नमस्ते'));
    expect(messageSignature('x'.repeat(5000)).length).toBeLessThan(20);
  });
});

describe('the language of member messages', () => {
  it('is English until the owner picks another, then remembered per gym', () => {
    const s = store();
    expect(readLang(s, 'gym_1')).toBe('en');
    saveLang(s, 'gym_1', 'hi');
    expect(readLang(s, 'gym_1')).toBe('hi');
    expect(readLang(s, 'gym_2')).toBe('en');
    saveLang(s, 'gym_1', 'both');
    expect(readLang(s, 'gym_1')).toBe('both');
    s.map.set('forgeai.messageLang.gym_1', 'fr');
    expect(readLang(s, 'gym_1')).toBe('en');
    expect(readLang(null, 'gym_1')).toBe('en');
  });
});
