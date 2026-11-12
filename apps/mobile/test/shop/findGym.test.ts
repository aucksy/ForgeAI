/**
 * "Find my gym with my number" (R-458 + F56 R-461): the WhatsApp check's answers, the gym server's 0068 answers
 * (anything odd dropped, never trusted), the words for each problem (a Worker without the 'member' check says
 * "not open yet", never "wrong number"), "Tell my gym" (a ready message, the lead without the member's number),
 * and no banned word.
 */
import { describe, expect, it } from 'vitest';

import { BANNED_MEMBER_WORDS } from '@/lib/words';
import {
  checkProblemFrom,
  checkProblemWords,
  checkStartFrom,
  checkStatusFrom,
  claimAnswerFrom,
  FIND_GYM,
  findAnswerFrom,
  findProblemWords,
  firstNameOf,
  leadFrom,
  showWaNumber,
  stateWords,
  tellGymMessage,
  whatsAppLink,
} from '@/shop/findGym';

const ID = '0f8b2c4e-1a2b-4c3d-9e8f-0123456789ab';

describe('the WhatsApp check', () => {
  it('a start is used only when every part is there', () => {
    const s = { id: ID, code: '482913', waNumber: '919000099999', waText: 'MettleUp code 482913. After you send this, go back to the MettleUp app.', expiresAt: 1 };
    expect(checkStartFrom(s)).toEqual(s);
    expect(checkStartFrom({ ...s, waNumber: '+91 90000' })).toBeNull();
    expect(checkStartFrom({ ...s, id: 'x' })).toBeNull();
    expect(checkStartFrom(null)).toBeNull();
  });
  it('a status: odd = still waiting; the proof only when real', () => {
    expect(checkStatusFrom({ state: 'verified', proof: 'p.member.9876500461.111.nonce' })).toEqual({ state: 'verified', proof: 'p.member.9876500461.111.nonce' });
    expect(checkStatusFrom({ state: 'party' })).toEqual({ state: 'waiting' });
    expect(checkStatusFrom({ state: 'waiting', hint: 'no_code' })).toEqual({ state: 'waiting', hint: 'no_code' });
    expect(checkStatusFrom('x')).toEqual({ state: 'waiting' });
  });
  it('a Worker without the member check (400 BAD_REQUEST, 404, 503) is "not open yet"', () => {
    expect(checkProblemFrom(400, { error: 'BAD_REQUEST' })).toBe('NOT_AVAILABLE');
    expect(checkProblemFrom(503, { error: 'NOT_AVAILABLE' })).toBe('NOT_AVAILABLE');
    expect(checkProblemFrom(404, null)).toBe('NOT_AVAILABLE');
    expect(checkProblemFrom(400, { error: 'BAD_PHONE' })).toBe('BAD_PHONE');
    expect(checkProblemFrom(429, { error: 'TOO_SOON', retryAfter: 40 })).toBe('TOO_SOON');
    expect(checkProblemFrom(500, {})).toBe('TRY_AGAIN');
    expect(checkProblemWords('NOT_AVAILABLE')).toMatch(/^Finding your gym by number is not open yet\. /);
  });
  it('the WhatsApp link and the number', () => {
    expect(whatsAppLink({ waNumber: '919000099999', waText: 'MettleUp code 1 & 2' })).toBe('https://wa.me/919000099999?text=MettleUp%20code%201%20%26%202');
    expect(showWaNumber('919000099999')).toBe('+91 90000 99999');
  });
  it('words for each way it can end', () => {
    expect(stateWords('wrong_number')).toMatch(/different number/);
    expect(stateWords('expired')).toMatch(/Start again/);
    expect(stateWords('waiting')).toBeNull();
    expect(stateWords('waiting', 'no_code')).toMatch(/without its code/);
  });
});

describe('the gym server (0068)', () => {
  it('found gyms, checked; odd lines dropped; a pass has no end', () => {
    const a = findAnswerFrom({
      ok: true,
      gyms: [
        { gymId: 'g1', gymName: 'Iron Temple', joinCode: 'iron01', endsOn: '2026-12-31', pass: false },
        { gymId: 'g2', gymName: 'Pass Gym', joinCode: 'PASS02', endsOn: null, pass: true },
        { gymId: 'g3', gymName: 'Bad', joinCode: 'no' },
        'junk',
      ],
    });
    expect(a).toEqual({
      ok: true,
      gyms: [
        { gymId: 'g1', gymName: 'Iron Temple', joinCode: 'IRON01', endsOn: '2026-12-31', pass: false },
        { gymId: 'g2', gymName: 'Pass Gym', joinCode: 'PASS02', endsOn: null, pass: true },
      ],
    });
    expect(findAnswerFrom({ ok: true, gyms: [] })).toEqual({ ok: true, gyms: [] });
  });
  it('refusals', () => {
    expect(findAnswerFrom({ error: 'BAD_PROOF' })).toEqual({ ok: false, problem: 'BAD_PROOF' });
    expect(findAnswerFrom({ error: 'TOO_MANY' })).toEqual({ ok: false, problem: 'TOO_MANY' });
    expect(findAnswerFrom({ error: 'WHAT' })).toEqual({ ok: false, problem: 'OTHER' });
    expect(findProblemWords('NAME_NEEDED')).toBe('Type your first name, as your gym has it.');
    expect(claimAnswerFrom({ ok: true, gymName: 'Iron Temple' })).toEqual({ ok: true, gymName: 'Iron Temple' });
    expect(claimAnswerFrom({ error: 'NAME_MISMATCH', gymName: 'Iron Temple' })).toEqual({ ok: false, problem: 'NAME_MISMATCH' });
    expect(claimAnswerFrom(null)).toEqual({ ok: false, problem: 'OTHER' });
  });
  it('the first name the list is matched on', () => {
    expect(firstNameOf('  Asha   Rao ')).toBe('Asha');
    expect(firstNameOf(null)).toBe('');
  });
});

describe('found, not found, Tell my gym', () => {
  it("the owner's words: member of the gym, every feature free, join through your gym", () => {
    expect(FIND_GYM.foundTitle('Iron Temple')).toBe('You are a member of Iron Temple');
    expect(FIND_GYM.foundBody('Iron Temple')).toBe('Iron Temple gives you every MettleUp feature free while your gym plan is active. Join through your gym to get them.');
    expect(FIND_GYM.join('Iron Temple')).toBe('Join Iron Temple');
    expect(FIND_GYM.notFoundBody).toMatch(/^You can unlock every feature free if your gym uses MettleUp\./);
    expect(FIND_GYM.tell).toBe('Tell my gym');
    expect(FIND_GYM.skip).toBe('Skip');
  });
  it('the share message names the gym when typed and carries the link', () => {
    expect(tellGymMessage('')).toMatch(/^Our gym could use MettleUp\. .*https:\/\/gyms\.mettleup\.fit\/\?from=member$/);
    expect(tellGymMessage(' Iron Temple ')).toMatch(/^Iron Temple could use MettleUp\. /);
  });
  it('the lead: only a typed gym name (and city); never the member number', () => {
    expect(leadFrom('', 'Pune')).toBeNull();
    expect(leadFrom(' Iron  Temple ', ' Pune ')).toEqual({ gym: 'Iron Temple', city: 'Pune' });
  });
  it('never a banned word', () => {
    const all = [
      ...Object.values(FIND_GYM).filter((v): v is string => typeof v === 'string'),
      FIND_GYM.foundTitle('X'),
      FIND_GYM.foundBody('X'),
      FIND_GYM.foundEnds('1 Dec 2026'),
      tellGymMessage('X'),
      ...(['BAD_PHONE', 'TOO_SOON', 'TOO_MANY', 'NOT_AVAILABLE', 'OFFLINE', 'TRY_AGAIN'] as const).map(checkProblemWords),
    ].join(' ');
    for (const b of BANNED_MEMBER_WORDS) expect(b.re.test(all), b.word).toBe(false);
  });
});
