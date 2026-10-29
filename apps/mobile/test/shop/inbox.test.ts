/**
 * Gym messages, Phase 1 (14 Oct 2026): the member's inbox — the server's rows, the bell's count,
 * a "seen" that survives a failed call, and a list that never shows to another member link.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

import { inboxFromRows, kindWord, mergeSeen, sentText, unreadCount } from '@/shop/inbox';
import { cleanInboxBlob, inboxFor, useGymInbox } from '@/shop/inboxStore';

const ROWS = [
  { id: 'a', kind: 'closed', title: 'Gym closed on Sunday', body: 'Diwali. Open Monday 6 am.', createdAt: '2026-10-12T04:00:00Z', seen: true },
  { id: 'b', kind: 'offer', title: 'Offer: 10% off whey', body: 'Till 20 Oct.', createdAt: '2026-10-14T04:00:00Z', seen: false },
  { id: 'c', kind: 'nonsense', title: 'x', createdAt: '2026-10-14T04:00:00Z' },
  { id: 'd', kind: 'event', title: '  ', createdAt: '2026-10-14T04:00:00Z' },
];

describe('inbox rows', () => {
  it('reads the good rows, newest first, and drops damaged ones', () => {
    const list = inboxFromRows(ROWS);
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
    expect(unreadCount(list)).toBe(1);
    expect(inboxFromRows(null)).toEqual([]);
  });

  it('reads the quiet mark (0042): only a true one is kept, and it still counts as unread', () => {
    const list = inboxFromRows([
      { id: 'q', kind: 'timing', title: 'New timings', createdAt: '2026-10-14T05:00:00Z', seen: false, quiet: true },
      { id: 'n', kind: 'timing', title: 'Old timings', createdAt: '2026-10-14T04:00:00Z', seen: false, quiet: false },
    ]);
    expect(list.map((m) => `${m.id}:${String(m.quiet)}`)).toEqual(['q:true', 'n:undefined']);
    expect(unreadCount(list)).toBe(2);
  });

  it('keeps what this phone saw even before the server heard', () => {
    const list = mergeSeen(inboxFromRows(ROWS), new Set(['b']));
    expect(unreadCount(list)).toBe(0);
  });

  it('words', () => {
    expect(kindWord('closed')).toBe('Gym closed');
    expect(kindWord('timing')).toBe('New timings');
    const now = Date.parse('2026-10-14T10:00:00Z');
    expect(sentText('2026-10-14T09:59:30Z', now)).toBe('Just now');
    expect(sentText('2026-10-14T09:15:00Z', now)).toBe('45 min ago');
    expect(sentText('not a date', now)).toBe('');
  });
});

describe('inbox store', () => {
  beforeEach(() => {
    mem.clear();
    useGymInbox.getState().clear();
  });

  it('shows the list only to the member it belongs to', () => {
    useGymInbox.getState().setList('m1', inboxFromRows(ROWS));
    expect(inboxFor(useGymInbox.getState(), 'm1')).toHaveLength(2);
    expect(inboxFor(useGymInbox.getState(), 'm2')).toHaveLength(0);
    expect(inboxFor(useGymInbox.getState(), null)).toHaveLength(0);
  });

  it('a seen mark stays until the server takes it, across a refresh', () => {
    const s = useGymInbox.getState();
    s.setList('m1', inboxFromRows(ROWS));
    s.markSeen('m1', ['b']);
    expect(useGymInbox.getState().unsent).toEqual(['b']);
    // The server still says unseen (the call failed): the phone keeps it seen.
    useGymInbox.getState().setList('m1', inboxFromRows(ROWS));
    expect(unreadCount(useGymInbox.getState().messages)).toBe(0);
    useGymInbox.getState().confirmSeen(['b']);
    expect(useGymInbox.getState().unsent).toEqual([]);
  });

  it('an empty inbox is the same list every time (a fresh [] makes the screen loop)', () => {
    expect(inboxFor(useGymInbox.getState(), 'm9')).toBe(inboxFor(useGymInbox.getState(), null));
  });

  it('a late list from before the "seen" reached the server does not bring "new" back', () => {
    const s = useGymInbox.getState();
    s.setList('m1', inboxFromRows(ROWS));
    s.markSeen('m1', ['b']);
    useGymInbox.getState().confirmSeen(['b']);
    useGymInbox.getState().setList('m1', inboxFromRows(ROWS));
    expect(unreadCount(useGymInbox.getState().messages)).toBe(0);
  });

  it('another member link starts clean', () => {
    useGymInbox.getState().setList('m1', inboxFromRows(ROWS));
    useGymInbox.getState().markSeen('m1', ['b']);
    useGymInbox.getState().setList('m2', inboxFromRows(ROWS));
    expect(useGymInbox.getState().unsent).toEqual([]);
    expect(unreadCount(useGymInbox.getState().messages)).toBe(1);
  });

  it('a damaged saved copy comes back empty', () => {
    expect(cleanInboxBlob({ memberId: '', messages: [{}] }).messages).toEqual([]);
    expect(cleanInboxBlob({ memberId: 'm1', messages: ROWS, unsent: ['b', 3] })).toMatchObject({ memberId: 'm1', unsent: ['b'] });
  });
});
