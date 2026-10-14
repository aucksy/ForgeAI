/**
 * Invite link (14 Oct 2026): the gym's link opens "Join <gym>". The pure half (which URLs are a
 * gym's, what gym_preview's answer means, where the phone stands) and the switch's order: a phone
 * in another gym joins the new one FIRST and lets the old key go only after it worked.
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
const calls: string[] = [];
let joinAnswer: unknown = null;
vi.mock('@/shop/gymApi', () => ({
  apiJoin: async (code: string) => {
    calls.push(`join ${code}`);
    return joinAnswer ?? { ok: false, error: { kind: 'offline' } };
  },
  apiLeaveQuietly: async (key: string) => void calls.push(`leave ${key.slice(0, 3)}`),
}));
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));

import { codeFromInvite, inviteStanding, linkFromJoin, previewErrorText, previewFromRow } from '@/shop/gym';
import { joinFromInvite } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { inviteCodeFromUrl, setPendingInvite, takePendingInvite } from '@/shop/pendingInvite';

describe('invite URLs', () => {
  it('reads the code from the gym link and the app link', () => {
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/j/RAMS01')).toBe('RAMS01');
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/j/rams01?utm=wa')).toBe('RAMS01');
    expect(inviteCodeFromUrl('https://FORGEAI.aakashpahuja.in/j/FORGE1/')).toBe('FORGE1');
    expect(inviteCodeFromUrl('forgeai://j/FORGE1')).toBe('FORGE1');
  });

  it('ignores links that are not a gym invite', () => {
    expect(inviteCodeFromUrl(null)).toBeNull();
    expect(inviteCodeFromUrl('https://evil.example/j/RAMS01')).toBeNull();
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in.evil.example/j/RAMS01')).toBeNull();
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/members/RAMS01')).toBeNull();
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/j/RAMS0')).toBeNull();
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/j/RAMS01X')).toBeNull();
    expect(inviteCodeFromUrl('forgeai://workout')).toBeNull();
  });

  it('keeps a code for after the welcome flow, handed out once', () => {
    setPendingInvite('RAMS01');
    expect(takePendingInvite()).toBe('RAMS01');
    expect(takePendingInvite()).toBeNull();
  });
});

describe('the invite screen, pure parts', () => {
  it('cleans the route code like a typed one, and refuses what cannot be a code', () => {
    expect(codeFromInvite('rams01')).toBe('RAMS01');
    expect(codeFromInvite(['FORGE1'])).toBe('FORGE1');
    expect(codeFromInvite('AB')).toBeNull();
    expect(codeFromInvite(undefined)).toBeNull();
  });

  it("reads gym_preview's answer; null is an unknown code", () => {
    const p = previewFromRow({ gymName: " RAM'S FITNESS CLUB ", joinCode: 'RAMS01', brand: { accent: '#F7D411', bg: '#0A0A0C', logoUrl: null, heading: 'bold-italic', updatedAt: null } });
    expect(p?.gymName).toBe("RAM'S FITNESS CLUB");
    expect(p?.joinCode).toBe('RAMS01');
    expect(p?.brand?.accent).toBe('#F7D411');
    expect(previewFromRow(null)).toBeNull();
    expect(previewFromRow({ gymName: 'X' })).toBeNull();
  });

  it('knows where the phone stands', () => {
    expect(inviteStanding(null, 'RAMS01')).toBe('fresh');
    expect(inviteStanding({ joinCode: 'rams01' }, 'RAMS01')).toBe('same');
    expect(inviteStanding({ joinCode: 'FORGE1' }, 'RAMS01')).toBe('other');
  });

  it('says plainly when the gym cannot be asked', () => {
    expect(previewErrorText({ kind: 'offline' })).toMatch(/internet/);
    expect(previewErrorText({ kind: 'other' })).toMatch(/Couldn't reach your gym/);
  });
});

describe('switching gyms from an invite', () => {
  const OLD = linkFromJoin({ memberKey: 'old'.padEnd(48, 'x'), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple', joinCode: 'IRON01', name: 'Asha' })!;
  beforeEach(() => {
    calls.length = 0;
    joinAnswer = null;
    mem.clear();
    useGymShop.getState().setLink(OLD);
  });

  it('a failed join leaves the member in their old gym, old key untouched', async () => {
    const words = await joinFromInvite('RAMS01', 'Asha');
    expect(words).toMatch(/internet/);
    expect(calls).toEqual(['join RAMS01']);
    expect(useGymShop.getState().link?.gymName).toBe('Iron Temple');
  });

  it('a good join moves to the new gym, then lets the old key go', async () => {
    joinAnswer = { ok: true, data: linkFromJoin({ memberKey: 'new'.padEnd(48, 'y'), memberId: 'm2', gymId: 'g2', gymName: "RAM'S", joinCode: 'RAMS01', name: 'Asha' }) };
    const words = await joinFromInvite('RAMS01', 'Asha');
    expect(words).toBeNull();
    expect(calls).toEqual(['join RAMS01', 'leave old']);
    expect(useGymShop.getState().link?.joinCode).toBe('RAMS01');
  });

  it('a phone in no gym just joins', async () => {
    useGymShop.getState().unlink(null);
    joinAnswer = { ok: true, data: linkFromJoin({ memberKey: 'new'.padEnd(48, 'y'), memberId: 'm2', gymId: 'g2', gymName: "RAM'S", joinCode: 'RAMS01', name: 'Asha' }) };
    expect(await joinFromInvite('RAMS01', 'Asha')).toBeNull();
    expect(calls).toEqual(['join RAMS01']);
  });
});
