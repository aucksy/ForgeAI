/**
 * 0048 (R-287): "Numbers to confirm" on Today. Reading the server, the words, the card staying hidden
 * until the server has 0048, and the card sitting on Today.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import {
  linkErrorWords,
  linkQuestion,
  linkWho,
  pendingLinks,
  PHONE_LINK_WORDS,
  phoneLinkRowFrom,
  phoneLinkRowsFrom,
  type PhoneLinkRow,
} from '../../src/crm/logic/phoneLinks';
import { decidePhoneLink, listPhoneLinks, phoneLinkServer, resetPhoneLinksForTest } from '../../src/crm/shop/phoneLinkApi';

const row = (over: Partial<PhoneLinkRow> = {}): PhoneLinkRow => ({
  id: 'l1', rosterId: 'mem_1', phone: '+919829048001', status: 'pending', memberName: 'Asha Verma', appName: 'Asha app',
  createdAt: 10, decidedAt: null, decidedBy: null, ...over,
});

describe('reading the server', () => {
  it('keeps the rows it can read', () => {
    const rows = phoneLinkRowsFrom([
      { id: 'a', rosterId: 'm1', phone: '+919829048001', status: 'pending', memberName: 'Asha Verma', appName: 'Asha', createdAt: 5 },
      { id: 'b', rosterId: 'm2', phone: '+919829048002', status: 'approved', memberName: '', appName: null, createdAt: 1, decidedAt: 9, decidedBy: 'Ravi' },
      { id: 'c', rosterId: 'm3', phone: '+919829048003', status: 'maybe' },
      { id: 'd', phone: '+919829048004', status: 'pending' },
      { id: 'e', rosterId: 'm5', status: 'pending' },
      'junk',
      null,
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ memberName: 'Asha Verma', appName: 'Asha', createdAt: 5, decidedAt: null, decidedBy: null });
    expect(rows[1]).toMatchObject({ memberName: 'A member', appName: '', decidedAt: 9, decidedBy: 'Ravi' });
    expect(phoneLinkRowsFrom(null)).toEqual([]);
    expect(phoneLinkRowsFrom({ id: 'a' })).toEqual([]);
    expect(phoneLinkRowFrom([])).toBeNull();
  });

  it('the card shows only the ones still waiting, oldest first', () => {
    const rows = [row({ id: 'new', createdAt: 30 }), row({ id: 'done', status: 'approved', createdAt: 1 }), row({ id: 'old', createdAt: 20 }), row({ id: 'no', status: 'declined' })];
    expect(pendingLinks(rows).map((r) => r.id)).toEqual(['old', 'new']);
    expect(pendingLinks([])).toEqual([]);
  });
});

describe('the words', () => {
  it('says who, the number, and asks plainly', () => {
    expect(linkWho(row())).toBe('Asha Verma · +91 98290 48001');
    expect(linkQuestion(row())).toBe('The app user “Asha app” typed this number at check-in. Is it their number?');
    expect(linkQuestion(row({ appName: '' }))).toBe('Someone in the app typed this number at check-in. Is it their number?');
    expect(PHONE_LINK_WORDS.title).toBe('Numbers to confirm');
    expect(PHONE_LINK_WORDS.yes).toBe('Yes, it’s theirs');
    expect(PHONE_LINK_WORDS.no).toBe('No');
    expect(PHONE_LINK_WORDS.why).toContain('someone else’s number');
  });

  it('turns the server’s refusals into plain words', () => {
    expect(linkErrorWords(new Error('ALREADY_DECIDED'))).toContain('already answered');
    expect(linkErrorWords({ message: 'GONE' })).toContain('no longer there');
    expect(linkErrorWords('SUSPENDED')).toContain('on hold');
    expect(linkErrorWords(new Error('BAD_KEY'))).toContain('signed out');
    expect(linkErrorWords(new Error('INVALID'))).toBe(PHONE_LINK_WORDS.failed);
    expect(linkErrorWords(new TypeError('Failed to fetch'))).toBe(PHONE_LINK_WORDS.failed);
  });

  it('never uses the words members must not see', () => {
    const all = [...Object.values(PHONE_LINK_WORDS), linkQuestion(row()), linkQuestion(row({ appName: '' }))];
    expect(all.filter((s) => /\b(volume|PR|session)\b/i.test(s))).toEqual([]);
  });
});

describe('the server calls', () => {
  beforeEach(() => {
    callMock.mockReset();
    resetPhoneLinksForTest();
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads the list with the key', async () => {
    callMock.mockResolvedValueOnce([{ id: 'a', rosterId: 'm1', phone: '+919829048001', status: 'pending' }]);
    const r = await listPhoneLinks('k1');
    expect(callMock).toHaveBeenCalledWith('owner_phone_links', { p_key: 'k1' });
    expect(r).not.toBe('missing');
    expect((r as PhoneLinkRow[]).map((x) => x.id)).toEqual(['a']);
    expect(phoneLinkServer()).toBe('yes');
  });

  it('before 0048 is live: hidden quietly, and not asked again', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    callMock.mockRejectedValueOnce({ code: 'PGRST202', message: 'Could not find the function public.owner_phone_links(p_key)' });
    expect(await listPhoneLinks('k1')).toBe('missing');
    expect(phoneLinkServer()).toBe('no');
    expect(await listPhoneLinks('k1')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('any other failure is thrown and asked again next time', async () => {
    callMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(listPhoneLinks('k1')).rejects.toThrow('Failed to fetch');
    expect(phoneLinkServer()).toBe('unknown');
    callMock.mockResolvedValueOnce([]);
    expect(await listPhoneLinks('k1')).toEqual([]);
  });

  it('sends the desk’s yes or no', async () => {
    callMock.mockResolvedValue({ id: 'l1', status: 'approved' });
    await decidePhoneLink('k1', 'l1', 'approved');
    await decidePhoneLink('k1', 'l1', 'declined');
    expect(callMock.mock.calls).toEqual([
      ['owner_decide_phone_link', { p_key: 'k1', p_link: 'l1', p_decision: 'approved' }],
      ['owner_decide_phone_link', { p_key: 'k1', p_link: 'l1', p_decision: 'declined' }],
    ]);
  });
});

describe('the card', () => {
  const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('sits on Today, after the app requests', () => {
    const today = src('../../src/crm/ui/screens/Today.tsx');
    expect(today).toContain('<PhoneLinksCard />');
    expect(today.indexOf('<PhoneLinksCard />')).toBeGreaterThan(today.indexOf('<PlanRequestsCard />'));
  });

  it('shows pending ones only, hides itself when there are none, and is read again with Today', () => {
    const card = src('../../src/crm/ui/PhoneLinksCard.tsx');
    expect(card).toContain('pendingLinks(r)');
    expect(card).toContain("if (!key || !rows || rows.length === 0) return null;");
    expect(card).toContain("usePoll(load, 60_000, key !== null && phoneLinkServer() !== 'no')");
    // Owner and desk alike: no role check.
    expect(card).not.toMatch(/useRole|canEdit|role ===/);
  });

  it('the server file answers what the card reads', () => {
    const sql = src('../../../../supabase/migrations/0048_security_fixes.sql');
    for (const k of ["'id'", "'rosterId'", "'phone'", "'status'", "'memberName'", "'appName'", "'createdAt'", "'decidedAt'", "'decidedBy'"]) {
      expect(sql).toContain(k);
    }
    expect(sql).toMatch(/owner_decide_phone_link\(p_key text, p_link uuid, p_decision text\)/);
  });
});
