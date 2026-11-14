/**
 * R-549 (owner, 14 Nov 2026, option A): ONE "Message your gym" row and page for the gym (0069) and a trainer (0053).
 * The pure rules (src/shop/gymMessages.ts) and how the row, the page and the old addresses use them:
 *  - which sides show (the gym only, a trainer only, both, none), and that "A trainer" needs a running paid plan;
 *  - Feedback and Complaint never go to a trainer; the gym owner is not a person in the trainer list;
 *  - one list, newest first; one red count from both sides;
 *  - /shop/ask and /shop/message still open the page, on the right side.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ASK_WORDS, askShown, type AskChoices, type AskQuestion } from '@/shop/askTrainer';
import {
  MSG_WORDS,
  kindsFor,
  mergeMessages,
  messageSides,
  messagesIntro,
  messagesRowSub,
  messagesUnread,
  questionHint,
  sendTarget,
  sideForRoute,
  startSide,
  trainerChips,
} from '@/shop/gymMessages';
import { TALK_KINDS, TALK_WORDS, type TalkThread } from '@/shop/gymTalk';

const SRC = join(__dirname, '..', '..', 'src');
const read = (...p: string[]): string => readFileSync(join(SRC, ...p), 'utf8');

const thread = (id: string, lastAt: number, o: Partial<TalkThread> = {}): TalkThread => ({
  id,
  kind: 'question',
  anonymous: false,
  createdAt: lastAt,
  lastAt,
  done: false,
  seenByGym: false,
  unread: false,
  messages: [{ id: `${id}-m`, fromGym: false, who: null, text: 'Hi', at: lastAt }],
  ...o,
});
const question = (id: string, askedAt: number, answeredAt: number | null = null): AskQuestion => ({
  id,
  question: 'How many rest days?',
  trainer: null,
  askedAt,
  answer: answeredAt ? 'Two.' : null,
  answeredBy: answeredAt ? 'Rohit' : null,
  answeredAt,
  withdrawn: false,
  open: !answeredAt,
});

describe('which sides show', () => {
  it('both, the gym only, a trainer only, or none (then no row)', () => {
    expect(messageSides(true, true)).toEqual(['gym', 'trainer']);
    expect(messageSides(true, false)).toEqual(['gym']);
    expect(messageSides(false, true)).toEqual(['trainer']);
    expect(messageSides(false, false)).toEqual([]);
  });
  it('"A trainer" only for a member who may ask today (R-505): a running paid plan, never a pass, no plan or an ended plan', () => {
    const trainerOn = (access: Parameters<typeof askShown>[1], known = true): boolean => askShown(known, access)?.kind === 'open';
    expect(messageSides(true, trainerOn({ kind: 'open' }))).toEqual(['gym', 'trainer']);
    expect(messageSides(true, trainerOn({ kind: 'locked', renew: true }))).toEqual(['gym']);
    expect(messageSides(true, trainerOn({ kind: 'hidden' }))).toEqual(['gym']);
    expect(messageSides(true, trainerOn(null))).toEqual(['gym']);
    expect(messageSides(true, trainerOn({ kind: 'open' }, false))).toEqual(['gym']);
  });
  it('one side only: no choice, that side opens; the address picks between two', () => {
    expect(startSide(['gym'], 'trainer')).toBe('gym');
    expect(startSide(['trainer'], 'gym')).toBe('trainer');
    expect(startSide(['gym', 'trainer'], 'trainer')).toBe('trainer');
    expect(startSide(['gym', 'trainer'], 'gym')).toBe('gym');
    expect(startSide(['gym', 'trainer'], undefined)).toBe('gym');
    expect(startSide([], 'gym')).toBeNull();
  });
  it('the row reads what the open sides offer', () => {
    expect(messagesRowSub(['gym', 'trainer'], 0, false)).toBe('Ask your gym or a trainer, share feedback or make a complaint');
    expect(messagesRowSub(['gym'], 0, false)).toBe(TALK_WORDS.rowSub);
    expect(messagesRowSub(['trainer'], 0, false)).toBe('Ask a trainer about your workout');
    expect(messagesIntro(['gym', 'trainer'])).toBe(MSG_WORDS.introBoth);
    expect(messagesIntro(['gym'])).toBe(TALK_WORDS.intro);
    expect(messagesIntro(['trainer'])).toBe(ASK_WORDS.intro);
  });
});

describe('Feedback and Complaint never go to a trainer', () => {
  it('only a question on the trainer side goes to the trainers (0053); everything else to the gym (0069)', () => {
    expect(sendTarget('trainer', 'question')).toBe('ask');
    expect(sendTarget('trainer', 'feedback')).toBe('talk');
    expect(sendTarget('trainer', 'complaint')).toBe('talk');
    for (const k of TALK_KINDS) expect(sendTarget('gym', k)).toBe('talk');
  });
  it('the trainer side offers no Feedback or Complaint; the gym side all three', () => {
    expect(kindsFor('trainer')).toEqual(['question']);
    expect(kindsFor('gym')).toEqual(['question', 'feedback', 'complaint']);
  });
  it('the page sends through sendTarget and shows the gym types through kindsFor', () => {
    const src = read('shop', 'GymTalkScreen.tsx');
    expect(src).toMatch(/sendTarget\(side, side === 'trainer' \? 'question' : kind\) === 'ask'/);
    expect(src).toMatch(/kindsFor\('gym'\)\.map/);
    expect(src).not.toMatch(/TALK_KINDS\.map/);
  });
});

describe('the trainer list', () => {
  const choices = (mine: string | null): AskChoices => ({
    mine,
    open: false,
    trainers: [
      { id: 't1', name: 'Rohit S.', owner: false },
      { id: 'o1', name: 'Owner S.', owner: true },
      { id: 't2', name: 'Meera K.', owner: false },
    ],
  });
  it('the gym owner is not a person in it (the owner is "The gym" now)', () => {
    expect(trainerChips(choices(null)).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(trainerChips(choices('t1')).map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('unless the gym made the owner this member’s own trainer', () => {
    expect(trainerChips(choices('o1')).map((t) => t.id)).toEqual(['t1', 'o1', 't2']);
  });
  it('"Any trainer or the owner" stays as it was', () => {
    expect(ASK_WORDS.anyTrainer).toBe('Any trainer or the owner');
    expect(read('shop', 'GymTalkScreen.tsx')).toMatch(/trainerChips\(ask\.choices\)\.map/);
  });
});

describe('one list, newest first', () => {
  it('messages to the gym and workout questions together, by their newest change', () => {
    const list = mergeMessages([thread('a', 100), thread('b', 500)], [question('q1', 200), question('q2', 50, 600)]);
    expect(list.map((i) => i.id)).toEqual(['ask:q2', 'talk:b', 'ask:q1', 'talk:a']);
  });
  it('a reply moves an old question up', () => {
    expect(mergeMessages([thread('a', 300)], [question('q', 100, 400)])[0].id).toBe('ask:q');
  });
  it('either half missing (that server is not there): the other half alone; both missing: empty', () => {
    expect(mergeMessages(null, [question('q', 1)]).map((i) => i.id)).toEqual(['ask:q']);
    expect(mergeMessages([thread('a', 1)], null).map((i) => i.id)).toEqual(['talk:a']);
    expect(mergeMessages(null, null)).toEqual([]);
  });
  it('the same time: the same order every read', () => {
    const one = mergeMessages([thread('a', 5)], [question('q', 5)]).map((i) => i.id);
    const two = mergeMessages([thread('a', 5)], [question('q', 5)]).map((i) => i.id);
    expect(one).toEqual(['talk:a', 'ask:q']);
    expect(two).toEqual(one);
  });
});

describe('one red count from both sides', () => {
  it('the gym’s replies plus the trainers’ replies', () => {
    expect(messagesUnread(2, 1)).toBe(3);
    expect(messagesUnread(0, 0)).toBe(0);
    expect(messagesUnread(-1, 1)).toBe(1);
  });
  it('the row says a reply waits, whichever side sent it; else a waiting question; else the invitation', () => {
    expect(messagesRowSub(['gym', 'trainer'], 1, true)).toBe('Your gym replied. Tap to read it.');
    expect(messagesRowSub(['gym', 'trainer'], 3, false)).toBe('Your gym replied to 3 messages. Tap to read them.');
    expect(messagesRowSub(['gym', 'trainer'], 0, true)).toBe(ASK_WORDS.rowWaiting);
    // A plan that ended: no "A trainer", so no "waiting" line from it either.
    expect(messagesRowSub(['gym'], 0, true)).toBe(TALK_WORDS.rowSub);
  });
  it('the row and the Gym tab add the same two counts', () => {
    const row = read('shop', 'GymTalkRow.tsx');
    expect(row).toMatch(/messagesUnread\(talkUnread, askUnread\)/);
    expect(row).toMatch(/talkUnreadFor\(s, link\.memberId\)/);
    expect(row).toMatch(/askUnreadFor\(s, link\.memberId\)/);
    const tab = read('tracker', 'components', 'TrackerTabBar.tsx');
    expect(tab).toMatch(/talkUnreadFor\(s, memberId\)/);
    expect(tab).toMatch(/askUnreadFor\(s, memberId\)/);
  });
});

describe('one row on the Gym tab', () => {
  it('the Gym tab draws only "Message your gym"; the old "Ask about your workout" row and page are gone', () => {
    const shop = read('shop', 'ShopScreen.tsx');
    expect(shop).toMatch(/<GymTalkRow /);
    expect(shop).not.toMatch(/AskTrainerRow/);
    expect(() => read('shop', 'AskTrainerRow.tsx')).toThrow();
    expect(() => read('shop', 'AskTrainerScreen.tsx')).toThrow();
  });
  it('the row shows "A trainer" through the one R-505 check (askShown)', () => {
    expect(read('shop', 'GymTalkRow.tsx')).toMatch(/askShown\(!!choices, access\)/);
    expect(read('shop', 'GymTalkScreen.tsx')).toMatch(/askShown\(true, access\)\?\.kind === 'open'/);
  });
});

describe('the old addresses still land on the right side', () => {
  it('/shop/ask (a trainer reply’s notification, Settings) opens "A trainer"; /shop/message "The gym"', () => {
    expect(sideForRoute('/shop/ask')).toBe('trainer');
    expect(sideForRoute('/shop/ask/')).toBe('trainer');
    expect(sideForRoute('/shop/ask?from=push')).toBe('trainer');
    expect(sideForRoute('/shop/message')).toBe('gym');
    expect(read('app', 'shop', 'ask.tsx')).toMatch(/<GymTalkScreen start="trainer" \/>/);
    expect(read('app', 'shop', 'message.tsx')).toMatch(/<GymTalkScreen start="gym" \/>/);
  });
  it('a member who may not ask (a pass, an ended plan) and taps an old trainer link lands on "The gym"', () => {
    expect(startSide(messageSides(true, false), sideForRoute('/shop/ask'))).toBe('gym');
  });
});

describe('member words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?|chat|thread|ticket|anonymous|submit)\b/i;
  const lines: string[] = [
    MSG_WORDS.rowSubBoth,
    MSG_WORDS.rowSubTrainer,
    MSG_WORDS.introBoth,
    MSG_WORDS.toLabel,
    MSG_WORDS.askHint,
    MSG_WORDS.askTag,
    ...Object.values(MSG_WORDS.side),
    ...Object.values(MSG_WORDS.sideHint),
    questionHint('question', true),
  ];
  it('plain words, none of the banned ones, short, full sentences end with a full stop', () => {
    for (const l of lines) {
      expect(l, l).not.toMatch(BANNED);
      expect(l.length, l).toBeLessThanOrEqual(120);
    }
    for (const l of [MSG_WORDS.introBoth, MSG_WORDS.askHint, ...Object.values(MSG_WORDS.sideHint)]) expect(l, l).toMatch(/\.$/);
  });
  it('the Question hint names "A trainer" only when it is there; feedback and complaint never mention it', () => {
    expect(questionHint('question', true)).toBe('Ask about timings, fees, classes and more. For workout help, pick "A trainer" above.');
    expect(questionHint('question', false)).toBe('Ask about timings, fees, classes and more.');
    for (const k of TALK_KINDS) expect(questionHint(k, false)).not.toMatch(/trainer/i);
    expect(questionHint('feedback', true)).toBe(TALK_WORDS.kindHint.feedback);
    expect(questionHint('complaint', true)).toBe(TALK_WORDS.kindHint.complaint);
  });
  it('R-552: the gym side no longer says trainers read feedback; who reads each type is said under the type', () => {
    expect(MSG_WORDS.sideHint.gym).toBe('Send your gym a question, feedback or a complaint.');
    expect(MSG_WORDS.sideHint.gym).not.toMatch(/trainer/i);
    expect(TALK_WORDS.intro).not.toMatch(/trainer/i);
  });
  it('the chips read the way the hint names them', () => {
    expect(MSG_WORDS.side.trainer).toBe('A trainer');
    expect(MSG_WORDS.askHint).toContain(`"${MSG_WORDS.side.trainer}"`);
    expect(MSG_WORDS.rowTitle).toBe('Message your gym');
  });
});
