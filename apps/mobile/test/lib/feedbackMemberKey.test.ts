// F209 (owner 14 Nov 2026): a member's help question is paid from the gym's AI credits, so the help box gets the
// member's gym key with it. A member with no gym sends none (answered as before), and nothing else changes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: Record<string, unknown>[] = [];

vi.mock('@/lib/fetchTimeout', () => ({
  fetchWithTimeout: async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true, id: 4, answer: 'From the help pages.', ai: false, credits: 'no_credits' }), { status: 201 });
  },
}));
vi.mock('@/lib/helpHistoryStore', () => ({ useHelpHistory: { getState: () => ({ add: async () => undefined, settle: async () => undefined }) } }));
vi.mock('@/db', () => ({ getMeta: async () => 'install-12345678', setMeta: async () => undefined }));
vi.mock('@/db/writeQueue', () => ({ enqueueWrite: async (fn: () => Promise<void>) => fn() }));
vi.mock('@/shop/noticeAlertsRun', () => ({ gymPopupsLine: async () => '' }));
// react-native and async-storage are both the one native stub here (vitest.config.ts), so one mock serves both.
vi.mock('react-native', () => ({
  Platform: { OS: 'android', constants: { Model: 'Pixel 8', Brand: 'google', Release: '15' } },
  default: { getItem: async () => null },
}));

import { sendFeedback } from '@/lib/feedback';

beforeEach(() => {
  sent.length = 0;
});

describe("help questions on the gym's AI credits (F209)", () => {
  it("sends the member's gym key with the question", async () => {
    const r = await sendFeedback('How do I join my gym?', { gym: 'ABC123', memberKey: 'member-key-abcdefghijklmnop' });
    expect(sent[0]).toMatchObject({ source: 'member', gym: 'ABC123', memberKey: 'member-key-abcdefghijklmnop' });
    // The help pages' answer shows like any other.
    expect(r).toMatchObject({ ok: true, reply: { id: 4, text: 'From the help pages.', ai: false } });
  });

  it('a member with no gym sends no key', async () => {
    await sendFeedback('How do I start a workout?', { gym: '', memberKey: '' });
    await sendFeedback('How do I start a workout?', {});
    expect(sent.map((b) => 'memberKey' in b)).toEqual([false, false]);
  });
});
