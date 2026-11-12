// F201 screen step (R-471): every word the assistant's screens show has its Hinglish, and the small pure
// helpers the screens use (dates, the credit history words, the voice clock, the button words) say the right thing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXAMPLES, PAGES } from '../../../src/crm/assistant/catalogue';
import { CARD_TITLE, SAVE_WORDS, confirmWords } from '../../../src/crm/assistant/conversation';
import type { Draft } from '../../../src/crm/assistant/plan';
import { GROUP_WORDS, PLANS_ON, STATUS_WORDS, historyWhen } from '../../../src/crm/assistant/ui/AssistantHome';
import { KIND_WORDS, pageName } from '../../../src/crm/assistant/ui/Cards';
import { monthEndWords, walletRowWords } from '../../../src/crm/assistant/ui/CreditsSheet';
import { hasDevanagari } from '../../../src/crm/assistant/ui/useConversation';
import { clockWords } from '../../../src/crm/assistant/ui/VoiceSheet';
import { HINGLISH } from '../../../src/crm/lang/hinglish';
import type { AiWalletRow } from '../../../src/crm/assistant/api';

const ASSISTANT = fileURLToPath(new URL('../../../src/crm/assistant', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** "{amount}" alone, or "{day} · {n}": nothing to translate. */
const onlyValues = (s: string) => !/[a-z]/i.test(s.replace(/\{\w+\}/g, ''));

describe('the assistant speaks Hinglish too', () => {
  it("every line('…') the assistant builds has its Hinglish (a gap would show English mid-card)", () => {
    const keys = new Set<string>();
    for (const f of files(ASSISTANT)) {
      for (const m of noComments(readFileSync(f, 'utf8')).matchAll(/\bline\(\s*(?:'([^'\n]+)'|"([^"\n]+)")\s*[,)]/g)) keys.add(m[1] ?? m[2]!);
    }
    expect(keys.size).toBeGreaterThan(60);
    expect([...keys].filter((k) => !onlyValues(k) && !(k in HINGLISH))).toEqual([]);
  });

  it('the words drawn through t(variable): card titles, buttons, message types, example groups, history status', () => {
    const dynamic = [
      ...Object.values(CARD_TITLE),
      ...Object.values(SAVE_WORDS),
      ...Object.values(KIND_WORDS),
      ...Object.values(GROUP_WORDS),
      ...Object.values(STATUS_WORDS),
      'Send the message',
      'Schedule the message',
      'Send to 1 member',
      'Schedule for 1 member',
      'Send to {n} members',
      'Schedule for {n} members',
      'Get credits to send',
    ];
    expect(dynamic.filter((k) => !(k in HINGLISH))).toEqual([]);
  });

  it('the page an answer or a "where to do it" card opens is named in the owner’s language where the panel has the word', () => {
    expect(pageName('/money/dues')).toBe(PAGES.find((p) => p.path === '/money/dues')?.name ?? 'the page');
    expect(pageName('/nowhere/at/all')).toBe('the page');
    expect(HINGLISH['the page']).toBe('page');
    expect(HINGLISH['Open {page}']).toBe('{page} kholo');
  });

  it('the "Try saying" examples name no dated festival (they would go stale)', () => {
    const dated = /\b(diwali|holi|eid|navratri|christmas|chhath|dussehra|raksha|lohri|pongal|onam)\b/i;
    expect(EXAMPLES.filter((e) => dated.test(e.text)).map((e) => e.text)).toEqual([]);
  });

  it('workout and diet plans stay off until the server has an AI writer (R-471: never sell a template as AI)', () => {
    expect(PLANS_ON).toBe(false);
  });
});

describe('the button on a card', () => {
  const msg = { tool: 'draft_message', credits: 1, sendAt: '' } as unknown as Draft;
  const later = { tool: 'draft_message', credits: 1, sendAt: '2026-11-13T09:00' } as unknown as Draft;
  const expense = { tool: 'add_expense', credits: 1 } as unknown as Draft;

  it('says one member, not "1 members", and shows the price', () => {
    expect(confirmWords(msg, 1, 20)).toEqual({ action: { text: 'Send to 1 member' }, credits: 1, needCredits: false });
    expect(confirmWords(later, 1, 20).action).toEqual({ text: 'Schedule for 1 member' });
    expect(confirmWords(msg, 4, 20).action).toEqual({ text: 'Send to {n} members', vars: { n: 4 } });
    expect(confirmWords(msg, null, 20).action).toEqual({ text: 'Send the message' });
    expect(confirmWords(expense, null, 20).action).toEqual({ text: 'Save expense' });
  });

  it('at 0 credits it says "Get credits to send" and no price', () => {
    expect(confirmWords(msg, 3, 0)).toEqual({ action: { text: 'Get credits to send' }, credits: null, needCredits: true });
    // Balance not known yet: the price shows, the server decides.
    expect(confirmWords(msg, 3, null).needCredits).toBe(false);
  });
});

describe('small helpers on the screens', () => {
  it('the free credits end on the last day of the month', () => {
    expect(monthEndWords('2026-11')).toBe('30 Nov');
    expect(monthEndWords('2028-02')).toBe('29 Feb');
    expect(monthEndWords('2026-12')).toBe('31 Dec');
    expect(monthEndWords('')).toBe('');
    expect(monthEndWords('2026-13')).toBe('');
  });

  it('each credit change reads as plain words; the server’s note wins for a spend or a grant', () => {
    const row = (reason: string, note = ''): AiWalletRow => ({ at: 0, delta: 1, reason, note, task_id: null }) as unknown as AiWalletRow;
    expect(walletRowWords(row('welcome'))).toBe('Starter credits');
    expect(walletRowWords(row('monthly'))).toBe('Free credits for this month');
    expect(walletRowWords(row('expire'))).toBe('Unused free credits ended');
    expect(walletRowWords(row('purchase'))).toBe('Credits bought');
    expect(walletRowWords(row('refund'))).toBe('Credits given back');
    expect(walletRowWords(row('grant'))).toBe('Credits from MettleUp');
    expect(walletRowWords(row('spend', 'Message to 12 members'))).toBe('Message to 12 members');
    expect(walletRowWords(row('spend'))).toBe('A task');
  });

  it('the voice clock and the history time (India time, even on a UTC machine)', () => {
    expect(clockWords(6.9)).toBe('0:06');
    expect(clockWords(75)).toBe('1:15');
    expect(clockWords(-3)).toBe('0:00');
    expect(historyWhen(Date.parse('2026-11-12T03:35:00Z'))).toBe('12 Nov, 9:05 am');
    expect(historyWhen(Date.parse('2026-11-12T18:29:00Z'))).toBe('12 Nov, 11:59 pm');
    expect(historyWhen(Date.parse('2026-11-12T06:30:00Z'))).toBe('12 Nov, 12:00 pm');
    expect(historyWhen(0)).toBe('');
  });

  it('a request typed in Hindi letters is answered in Hindi', () => {
    expect(hasDevanagari('राहुल का प्लान बढ़ाओ')).toBe(true);
    expect(hasDevanagari('Rahul ka plan badhao')).toBe(false);
  });
});
