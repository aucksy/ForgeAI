/**
 * Messages & offers step 1 (22 Oct 2026): the ready messages, their boxes, English · हिन्दी · Both,
 * and the server's letter limits (60 / 300, 0008_gym_messages.sql) with the boxes filled in.
 */
import { describe, expect, it } from 'vitest';

import {
  BROADCAST_TEMPLATES,
  FESTIVALS,
  PERSONAL_TEMPLATES,
  TEMPLATE_GROUPS,
  bothTitle,
  composeWords,
  fillWords,
  missingSlots,
  slotWords,
  templateById,
  templatesIn,
  whatsAppWords,
  type BroadcastTemplate,
  type Slot,
} from '../../src/crm/logic/messageTemplates';
import { dayMonth, formatDayHi, lengthState, lengthWords, letterCount, timeWords, weekdayDayMonth } from '../../src/crm/logic/messageWords';
import { BODY_MAX, MESSAGE_KINDS, TITLE_MAX, draftProblem } from '../../src/crm/shop/messages';

/** The longest realistic thing each box can hold. */
function longest(t: BroadcastTemplate): Record<string, string> {
  const v: Record<string, string> = {};
  for (const s of t.slots) {
    switch (s.kind) {
      case 'day':
      case 'date':
        v[s.key] = '2026-09-30'; // Wednesday, September: the longest names in both languages
        break;
      case 'time':
        v[s.key] = '18:30';
        break;
      case 'choice': {
        // The option with the longest words in either language.
        const best = [...(s.options ?? [])].sort((a, b) => Math.max(letterCount(b.en), letterCount(b.hi)) - Math.max(letterCount(a.en), letterCount(a.hi)))[0]!;
        v[s.key] = best.id;
        break;
      }
      case 'amount':
        v[s.key] = '12500';
        break;
      case 'discount':
        v[s.key] = '1500';
        v[`${s.key}.unit`] = '₹';
        break;
      case 'days':
        v[s.key] = '15';
        break;
      case 'number':
        v[s.key] = '12';
        break;
      case 'plan':
        v[s.key] = 'Half-yearly';
        break;
      case 'text':
        v[s.key] = 'Ladies strength batch'; // 21 letters: a name, a machine, an event
        break;
    }
  }
  return v;
}

describe('the ready messages', () => {
  it('come in the four groups, every one with English and Hindi words', () => {
    expect(TEMPLATE_GROUPS.map((g) => g.label)).toEqual(['Gym news', 'Offers', 'Events', 'Personal']);
    expect(templatesIn('news').map((t) => t.label)).toEqual([
      'Closed for a festival',
      'Closed today',
      'New timings',
      'Festival timings',
      'Machine under repair',
      'New batch',
      'New trainer',
      'A request to everyone',
    ]);
    expect(templatesIn('offers')).toHaveLength(6);
    expect(templatesIn('events')).toHaveLength(2);
    expect(PERSONAL_TEMPLATES.map((t) => t.waKind)).toEqual(['ending', 'ended', 'birthday', 'away']);
    for (const t of BROADCAST_TEMPLATES) {
      for (const w of [t.en.title, t.en.body, t.hi.title, t.hi.body]) expect(w.trim(), t.id).not.toBe('');
      // Every {box} in the words is a box of the template, in both languages.
      const keys = new Set(t.slots.map((s) => s.key));
      for (const w of [t.en.title, t.en.body, t.hi.title, t.hi.body]) {
        for (const m of w.matchAll(/\{(\w+)\}/g)) expect(keys.has(m[1]!), `${t.id}: {${m[1]}}`).toBe(true);
      }
      // The Hindi is Devanagari, not Hinglish.
      expect(t.hi.body, t.id).toMatch(/[ऀ-ॿ]/);
    }
  });

  it('offers and events are the capped kinds; gym news never is', () => {
    for (const t of templatesIn('offers')) expect((t as BroadcastTemplate).kind).toBe('offer');
    for (const t of templatesIn('events')) expect((t as BroadcastTemplate).kind).toBe('event');
    for (const t of templatesIn('news')) expect(['closed', 'timing', 'announcement']).toContain((t as BroadcastTemplate).kind);
  });

  it('every title fits 60 letters and every message 300, in English, Hindi and Both, filled with long words', () => {
    for (const t of BROADCAST_TEMPLATES) {
      const v = longest(t);
      expect(missingSlots(t, v), t.id).toEqual([]);
      for (const lang of ['en', 'hi', 'both'] as const) {
        const w = composeWords(t, v, lang);
        expect(letterCount(w.title), `${t.id} ${lang} title: ${w.title}`).toBeLessThanOrEqual(TITLE_MAX);
        expect(letterCount(w.body), `${t.id} ${lang} body: ${w.body}`).toBeLessThanOrEqual(BODY_MAX);
        expect(draftProblem({ kind: t.kind, ...w }), `${t.id} ${lang}`).toBeNull();
      }
    }
  });
});

describe('filling the boxes', () => {
  const closed = templateById('closed-festival') as BroadcastTemplate;
  const filled = { closedOn: '2026-11-08', festival: 'diwali', openOn: '2026-11-09', openAt: '06:00' };

  it('says a day with its weekday, a time the way members say it, the festival in each language', () => {
    expect(composeWords(closed, filled, 'en')).toEqual({
      title: 'Gym closed on Sunday 8 Nov',
      body: 'The gym is closed on Sunday 8 Nov for Diwali. We open again on Monday 9 Nov at 6 am. Happy Diwali!',
    });
    expect(composeWords(closed, filled, 'hi')).toEqual({
      title: 'रविवार 8 नवंबर को जिम बंद रहेगा',
      body: 'दिवाली के कारण रविवार 8 नवंबर को जिम बंद रहेगा। सोमवार 9 नवंबर को सुबह 6 बजे से फिर खुलेगा। दिवाली की शुभकामनाएँ!',
    });
  });

  it('"Both" puts the Hindi under the English; the title carries both only when they fit', () => {
    const both = composeWords(closed, filled, 'both');
    expect(both.body).toBe(`${composeWords(closed, filled, 'en').body}\n\n${composeWords(closed, filled, 'hi').body}`);
    // "Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा" is exactly 60 letters: it fits.
    expect(both.title).toBe('Gym closed on Sunday 8 Nov / रविवार 8 नवंबर को जिम बंद रहेगा');
    expect(letterCount(both.title)).toBe(60);
    // A Wednesday is longer: the title falls back to the English, the Hindi is in the message.
    const wed = composeWords(closed, { ...filled, closedOn: '2026-11-11' }, 'both');
    expect(wed.title).toBe('Gym closed on Wednesday 11 Nov');
    expect(wed.body).toContain('बुधवार 11 नवंबर को जिम बंद रहेगा।');
    expect(bothTitle('x'.repeat(40), 'य'.repeat(20))).toBe('x'.repeat(40));
    expect(bothTitle('Short', 'छोटा')).toBe('Short / छोटा');
  });

  it('a box left empty stays as [its label] and is named in "Fill in"', () => {
    const half = { closedOn: '2026-11-08' };
    expect(composeWords(closed, half, 'en').body).toBe(
      'The gym is closed on Sunday 8 Nov for [Festival]. We open again on [Open again on] at [Open again at]. Happy [Festival]!',
    );
    expect(missingSlots(closed, half).map((s) => s.label)).toEqual(['Festival', 'Open again on', 'Open again at']);
    expect(draftProblem({ kind: 'closed', ...composeWords(closed, half, 'en') })).toMatch(/brackets/);
  });

  it('an optional sentence goes when its boxes are empty (Sunday timings)', () => {
    const t = templateById('new-timings') as BroadcastTemplate;
    const week = { from: '2026-11-01', opens: '05:00', closes: '22:00' };
    expect(missingSlots(t, week)).toEqual([]);
    expect(composeWords(t, week, 'en').body).toBe('From 1 Nov the gym is open 5 am to 10 pm.');
    expect(composeWords(t, week, 'hi').body).toBe('1 नवंबर से जिम सुबह 5 बजे से रात 10 बजे तक खुलेगा।');
    const sunday = { ...week, sunOpens: '07:00', sunCloses: '12:00' };
    expect(composeWords(t, sunday, 'en').body).toBe('From 1 Nov the gym is open 5 am to 10 pm. Sunday: 7 am to 12 noon.');
    expect(composeWords(t, sunday, 'hi').body).toBe('1 नवंबर से जिम सुबह 5 बजे से रात 10 बजे तक खुलेगा। रविवार: सुबह 7 बजे से दोपहर 12 बजे तक।');
  });

  it('an English title starts with a capital; the owner\'s own words are used as typed', () => {
    const t = templateById('repair') as BroadcastTemplate;
    const w = composeWords(t, { machine: '  treadmill  ', till: '2026-10-30' }, 'en');
    expect(w.title).toBe('Treadmill under repair');
    expect(w.body).toBe('The treadmill is under repair till 30 Oct. Sorry for the trouble. Ask a trainer for another exercise.');
  });

  it('a list box takes "Other" with the owner\'s words, in every language', () => {
    const slot: Slot = { key: 'festival', label: 'Festival', kind: 'choice', options: FESTIVALS };
    expect(slotWords(slot, { festival: 'new-year' }, 'hi')).toBe('नए साल');
    expect(slotWords(slot, { festival: 'other', 'festival.other': ' Guru Purab ' }, 'en')).toBe('Guru Purab');
    expect(slotWords(slot, { festival: 'other', 'festival.other': ' Guru Purab ' }, 'hi')).toBe('Guru Purab');
    expect(slotWords(slot, { festival: 'other' }, 'en')).toBeNull();
    expect(slotWords(slot, { festival: 'nonsense' }, 'en')).toBeNull();
  });

  it('money, discounts, days and plans', () => {
    const offer = templateById('festival-offer') as BroadcastTemplate;
    const v = { festival: 'holi', discount: '20', by: '2026-03-10', plan: 'Quarterly Plan' };
    expect(composeWords(offer, v, 'en')).toEqual({
      title: 'Holi offer: 20% off',
      body: 'Join or renew by 10 Mar and get 20% off the Quarterly plan. Ask at the desk.',
    });
    expect(composeWords(offer, { ...v, 'discount.unit': '₹', discount: '1500' }, 'hi').title).toBe('होली ऑफ़र: ₹1,500 की छूट');
    const pct: Slot = { key: 'd', label: 'Discount', kind: 'discount' };
    expect(slotWords(pct, { d: '150' }, 'en')).toBeNull(); // over 100%
    expect(slotWords(pct, { d: '0' }, 'en')).toBeNull();
    const renew = templateById('renew-early') as BroadcastTemplate;
    expect(composeWords(renew, { days: '1', till: '2026-11-15' }, 'en').title).toBe('Renew early, get 1 day free');
    expect(composeWords(renew, { days: '5', till: '2026-11-15' }, 'hi').title).toBe('जल्दी रिन्यू करें, 5 दिन मुफ़्त');
    const amount: Slot = { key: 'p', label: 'Price', kind: 'amount' };
    expect(slotWords(amount, { p: '999' }, 'hi')).toBe('₹999');
    expect(slotWords(amount, { p: '12.5' }, 'en')).toBeNull();
  });

  it('a WhatsApp copy: bold title, the message, the gym signs it', () => {
    expect(whatsAppWords({ title: 'Gym closed today', body: 'Sorry.' }, '– Iron Temple')).toBe('*Gym closed today*\nSorry.\n– Iron Temple');
    // A {name} with no box is never sent as is: it reads as a blank to fill.
    expect(fillWords('{x} and {y}', [{ key: 'x', label: 'X', kind: 'text' }], { x: 'a' }, 'en')).toBe('a and [y]');
  });

  it('the "Write my own" starting words are kept, and still need their [brackets] filled', () => {
    expect(MESSAGE_KINDS.map((k) => k.kind)).toEqual(['announcement', 'closed', 'timing', 'offer', 'event', 'reminder']);
  });
});

describe('dates, times and letters', () => {
  it('days, dates and times in English and Hindi', () => {
    expect(weekdayDayMonth('2026-11-08', 'en')).toBe('Sunday 8 Nov');
    expect(weekdayDayMonth('2026-11-08', 'hi')).toBe('रविवार 8 नवंबर');
    expect(dayMonth('2026-02-01', 'hi')).toBe('1 फ़रवरी');
    expect(dayMonth('2026-02-30', 'en')).toBeNull();
    expect(formatDayHi('2026-07-26')).toBe('26 जुलाई 2026');
    expect(timeWords('06:00', 'en')).toBe('6 am');
    expect(timeWords('18:30', 'en')).toBe('6:30 pm');
    expect(timeWords('12:00', 'en')).toBe('12 noon');
    expect(timeWords('00:00', 'en')).toBe('12 midnight');
    expect(timeWords('06:00', 'hi')).toBe('सुबह 6 बजे');
    expect(timeWords('13:15', 'hi')).toBe('दोपहर 1:15 बजे');
    expect(timeWords('18:30', 'hi')).toBe('शाम 6:30 बजे');
    expect(timeWords('22:00', 'hi')).toBe('रात 10 बजे');
    expect(timeWords('25:00', 'en')).toBeNull();
  });

  it('counts letters the way the server does, and warns before the limit', () => {
    expect(letterCount('  नमस्ते  ')).toBe(6);
    expect(letterCount('💪 Go')).toBe(4); // the browser's .length says 5
    expect(lengthState(53, 60)).toBe('ok');
    expect(lengthState(54, 60)).toBe('near');
    expect(lengthState(60, 60)).toBe('near');
    expect(lengthState(61, 60)).toBe('over');
    expect(lengthState(270, 300)).toBe('near');
    expect(lengthWords(54, 60)).toBe('54 of 60 letters · 6 left');
    expect(lengthWords(64, 60)).toBe('64 of 60 letters · 4 too many');
  });

  it('a title of exactly 60 Hindi letters goes; 61 does not', () => {
    expect(draftProblem({ kind: 'announcement', title: 'क'.repeat(60), body: '' })).toBeNull();
    expect(draftProblem({ kind: 'announcement', title: 'क'.repeat(61), body: '' })).toMatch(/60/);
  });
});
