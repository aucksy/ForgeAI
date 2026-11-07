/**
 * F105 trainer pages and personal-training bookings (logic/trainerSchedule.ts): the clash rules the desk sees
 * before pressing Book, working hours, the day's grid, a trainer's personal-training members, and reading the
 * server's answer (0065, NOT APPLIED).
 */
import { describe, expect, it } from 'vitest';

import {
  canCancel,
  canEditProfile,
  checkBooking,
  classesLeftWords,
  dayGrid,
  formFromHours,
  hoursFromForm,
  hoursLine,
  hoursSet,
  indiaMinutes,
  insideHours,
  isoWeekday,
  mondayOf,
  nameMeansTrainer,
  scheduleErrorWords,
  scheduleFrom,
  timeWords,
  trainerPtMembers,
  weekDays,
  type BookingTry,
  type PtBooking,
  type TrainerProfile,
} from '../../src/crm/logic/trainerSchedule';
import { makeMember, makeMembership } from './fixtures';

// Saturday 17 Oct 2026; Monday is 12 Oct. Tomorrow (Sunday) and Monday 19 Oct are used for bookings.
const TODAY = '2026-10-17';
const MON = '2026-10-19';

const rohit: TrainerProfile = {
  id: 'st-rohit',
  name: 'Rohit Sharma',
  teaches: 'Strength',
  // Monday to Saturday 6-10 am and 5-9 pm; Sunday off.
  hours: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, [[360, 600], [1020, 1260]]])) as TrainerProfile['hours'],
  photo: null,
};
const meena: TrainerProfile = { id: 'st-meena', name: 'Meena', teaches: null, hours: {}, photo: null };

const booking = (over: Partial<PtBooking>): PtBooking => ({
  id: 'b1', trainerId: rohit.id, memberId: 'm-asha', day: MON, start: 420, length: 60, byName: 'Ravi', ...over,
});
const names = (id: string) => ({ 'm-asha': 'Asha Verma', 'm-bilal': 'Bilal Khan' })[id] ?? 'A member';
const ask = (over: Partial<BookingTry> = {}): BookingTry => ({
  trainer: rohit, memberId: 'm-bilal', memberName: 'Bilal Khan', day: MON, start: 480, length: 60, left: 5, booked: 0, ...over,
});

describe('times and weeks', () => {
  it('reads weekdays and Mondays', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(mondayOf(TODAY)).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(mondayOf(MON)).toBe(MON);
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('says times the Indian way', () => {
    expect(timeWords(360)).toBe('6:00 am');
    expect(timeWords(750)).toBe('12:30 pm');
    expect(timeWords(0)).toBe('12:00 am');
    expect(timeWords(1380)).toBe('11:00 pm');
  });

  it('turns the clock into India minutes (UTC + 5:30), across midnight', () => {
    expect(indiaMinutes(Date.parse('2026-10-17T04:30:00Z'))).toBe(600);
    expect(indiaMinutes(Date.parse('2026-10-17T18:45:00Z'))).toBe(15);
  });
});

describe('working hours', () => {
  it('is open all the time with no hours set, and a day with no shift is off', () => {
    expect(hoursSet(meena.hours)).toBe(false);
    expect(insideHours(meena.hours, '2026-10-18', 1320, 60)).toBe(true);
    expect(insideHours(rohit.hours, '2026-10-18', 420, 60)).toBe(false);
    expect(hoursLine(rohit.hours, 7)).toBe('Day off');
    expect(hoursLine(meena.hours, 1)).toBe('Working hours not set');
    expect(hoursLine(rohit.hours, 1)).toBe('6:00 am to 10:00 am, 5:00 pm to 9:00 pm');
  });

  it('needs the whole booking inside one shift', () => {
    expect(insideHours(rohit.hours, MON, 540, 60)).toBe(true);
    expect(insideHours(rohit.hours, MON, 570, 60)).toBe(false);
    expect(insideHours(rohit.hours, MON, 600, 30)).toBe(false);
  });

  it('builds hours from the form and refuses bad ones', () => {
    const ok = hoursFromForm([1, 3, 5], [{ from: '17:00', to: '21:00' }, { from: '06:00', to: '10:00' }]);
    expect(ok).toEqual({ ok: true, hours: { 1: [[360, 600], [1020, 1260]], 3: [[360, 600], [1020, 1260]], 5: [[360, 600], [1020, 1260]] } });
    expect(hoursFromForm([], [{ from: '', to: '' }])).toEqual({ ok: true, hours: {} });
    expect(hoursFromForm([1], [{ from: '', to: '' }, { from: '', to: '' }]).ok).toBe(false);
    expect(hoursFromForm([1], [{ from: '06:15', to: '10:00' }])).toEqual({ ok: false, words: 'Use times on the hour or half hour, like 6:00 or 6:30.' });
    expect(hoursFromForm([1], [{ from: '04:00', to: '10:00' }]).ok).toBe(false);
    expect(hoursFromForm([1], [{ from: '10:00', to: '06:00' }])).toEqual({ ok: false, words: 'Each shift must end after it starts.' });
    expect(hoursFromForm([1], [{ from: '06:00', to: '10:00' }, { from: '09:00', to: '12:00' }])).toEqual({ ok: false, words: 'The two shifts overlap. Change one of them.' });
  });

  it('fills the form back from saved hours', () => {
    expect(formFromHours(rohit.hours)).toEqual({ days: [1, 2, 3, 4, 5, 6], shifts: [{ from: '06:00', to: '10:00' }, { from: '17:00', to: '21:00' }] });
    expect(formFromHours({})).toEqual({ days: [], shifts: [{ from: '', to: '' }, { from: '', to: '' }] });
  });
});

describe('checkBooking: the clashes', () => {
  const week = [booking({})];

  it('books a free trainer and member inside the hours', () => {
    expect(checkBooking(ask(), week, names, TODAY, 600)).toEqual({ ok: true, outsideHours: false });
  });

  it('refuses a trainer who already has someone, naming who and when', () => {
    const r = checkBooking(ask({ start: 450, length: 30 }), week, names, TODAY, 600);
    expect(r).toEqual({ ok: false, code: 'TRAINER_BUSY', words: 'Rohit Sharma already has Asha Verma at 7:00 am. Pick another time.' });
  });

  it('allows back to back, and ignores cancelled (absent) and other days', () => {
    expect(checkBooking(ask({ start: 360, length: 60 }), week, names, TODAY, 600).ok).toBe(true);
    expect(checkBooking(ask({ start: 420, day: '2026-10-20' }), week, names, TODAY, 600).ok).toBe(true);
  });

  it('refuses a member already booked with another trainer at that time', () => {
    const r = checkBooking(ask({ trainer: meena, memberId: 'm-asha', memberName: 'Asha Verma', start: 450, length: 45 }), week, names, TODAY, 600);
    expect(r).toEqual({ ok: false, code: 'MEMBER_BUSY', words: 'Asha Verma is already booked at 7:00 am that day. Pick another time.' });
  });

  it('warns (does not refuse) outside working hours, and on a day off', () => {
    expect(checkBooking(ask({ start: 690 }), week, names, TODAY, 600)).toEqual({ ok: true, outsideHours: true });
    expect(checkBooking(ask({ day: '2026-10-18', start: 420 }), week, names, TODAY, 600)).toEqual({ ok: true, outsideHours: true });
    expect(checkBooking(ask({ trainer: meena, start: 1320 }), week, names, TODAY, 600)).toEqual({ ok: true, outsideHours: false });
  });

  it('refuses a member with no classes left, or with every class left already booked', () => {
    expect(checkBooking(ask({ left: 0 }), week, names, TODAY, 600)).toMatchObject({ ok: false, code: 'NO_CLASSES', words: 'Bilal Khan has no personal-training classes left. Sell a personal-training plan first.' });
    expect(checkBooking(ask({ left: 2, booked: 2 }), week, names, TODAY, 600)).toMatchObject({ ok: false, code: 'NO_CLASSES' });
    expect(checkBooking(ask({ left: 3, booked: 2 }), week, names, TODAY, 600).ok).toBe(true);
  });

  it('refuses the past (earlier today included), too far ahead, and odd times', () => {
    expect(checkBooking(ask({ day: '2026-10-16' }), week, names, TODAY, 600)).toMatchObject({ code: 'PAST' });
    expect(checkBooking(ask({ day: TODAY, start: 600 }), week, names, TODAY, 600)).toMatchObject({ code: 'PAST' });
    expect(checkBooking(ask({ day: TODAY, start: 1020 }), week, names, TODAY, 600).ok).toBe(true);
    expect(checkBooking(ask({ day: '2026-11-17' }), week, names, TODAY, 600).ok).toBe(true);
    expect(checkBooking(ask({ day: '2026-11-18' }), week, names, TODAY, 600)).toMatchObject({ code: 'TOO_FAR' });
    expect(checkBooking(ask({ start: 495 }), week, names, TODAY, 600)).toMatchObject({ code: 'BAD_TIME' });
    expect(checkBooking(ask({ length: 120 }), week, names, TODAY, 600)).toMatchObject({ code: 'BAD_TIME' });
    expect(checkBooking(ask({ start: 1350, length: 60 }), week, names, TODAY, 600)).toMatchObject({ code: 'BAD_TIME' });
  });
});

describe('who may do what', () => {
  it('the owner edits any page; a trainer only their own; the desk none', () => {
    expect(canEditProfile({ owner: true, me: null }, rohit.id)).toBe(true);
    expect(canEditProfile({ owner: false, me: rohit.id }, rohit.id)).toBe(true);
    expect(canEditProfile({ owner: false, me: rohit.id }, meena.id)).toBe(false);
    expect(canEditProfile({ owner: false, me: 'st-desk' }, rohit.id)).toBe(false);
  });

  it('anyone cancels before it starts; only the owner after', () => {
    const b = booking({ day: TODAY, start: 600 });
    expect(canCancel(false, b, TODAY, 599)).toBe(true);
    expect(canCancel(false, b, TODAY, 600)).toBe(false);
    expect(canCancel(true, b, TODAY, 900)).toBe(true);
  });
});

describe('the day grid', () => {
  it('runs from the earliest shift to the latest end, one cell per trainer', () => {
    const rows = dayGrid(MON, [rohit, meena], [booking({ start: 420, length: 90 })], TODAY, 600);
    // Meena has no hours (6 am to 10 pm), so the grid runs to 10 pm.
    expect(rows[0]!.min).toBe(360);
    expect(rows.at(-1)!.min).toBe(1290);
    const at = (m: number) => rows.find((r) => r.min === m)!.cells.map((c) => (c.kind === 'booked' ? `booked${c.first ? '*' : ''}` : c.kind));
    expect(at(360)).toEqual(['free', 'free']);
    expect(at(420)).toEqual(['booked*', 'free']);
    expect(at(450)).toEqual(['booked', 'free']);
    expect(at(480)).toEqual(['booked', 'free']);
    expect(at(510)).toEqual(['free', 'free']);
    expect(at(660)).toEqual(['off', 'free']);
  });

  it('greys out today’s past half hours, and shows 6 am to 10 pm when no one has hours', () => {
    const rows = dayGrid(TODAY, [meena], [], TODAY, 600);
    expect(rows[0]!.min).toBe(360);
    expect(rows.at(-1)!.min).toBe(1290);
    expect(rows.find((r) => r.min === 600)!.cells[0]!.kind).toBe('off');
    expect(rows.find((r) => r.min === 630)!.cells[0]!.kind).toBe('free');
  });

  it('shows 6 am to 10 pm on a day off, widened to show a booking made anyway', () => {
    const rows = dayGrid('2026-10-18', [rohit], [booking({ day: '2026-10-18', start: 1290, length: 60 })], TODAY, 600);
    expect(rows[0]!.min).toBe(360);
    expect(rows.at(-1)!.min).toBe(1320);
    expect(rows.find((r) => r.min === 1290)!.cells[0]).toMatchObject({ kind: 'booked', first: true });
    expect(rows.find((r) => r.min === 420)!.cells[0]!.kind).toBe('off');
  });
});

describe('a trainer’s personal-training members', () => {
  const asha = makeMember({ id: 'm-asha', fullName: 'Asha Verma' });
  const bilal = makeMember({ id: 'm-bilal', fullName: 'Bilal Khan' });
  const zoya = makeMember({ id: 'm-zoya', fullName: 'Zoya Ali' });
  const gone = makeMember({ id: 'm-gone', fullName: 'Gone Away', archived: true });
  const pack = (memberId: string, used: number, trainer: string | null) =>
    makeMembership({ memberId, planName: 'PT 10', startsOn: '2026-10-01', endsOn: '2026-11-30', ptSessions: 10, trainer, ptLog: Array.from({ length: used }, () => '2026-10-05') });

  it('takes the owner’s pick and packs typed with the trainer’s name or first name; fewest left first', () => {
    const rows = trainerPtMembers(
      rohit,
      [asha, bilal, zoya, gone],
      [pack('m-asha', 4, 'Rohit'), pack('m-bilal', 10, null), pack('m-zoya', 1, 'Meena'), pack('m-gone', 0, 'Rohit')],
      { 'm-bilal': rohit.id },
      { 'm-asha': 2 },
      TODAY,
    );
    expect(rows).toEqual([
      { memberId: 'm-bilal', name: 'Bilal Khan', left: 0, booked: 0 },
      { memberId: 'm-asha', name: 'Asha Verma', left: 6, booked: 2 },
    ]);
  });

  it('matches names loosely but never a different person', () => {
    expect(nameMeansTrainer(' rohit  sharma', 'Rohit Sharma')).toBe(true);
    expect(nameMeansTrainer('Rohit', 'Rohit Sharma')).toBe(true);
    expect(nameMeansTrainer('Rohan', 'Rohit Sharma')).toBe(false);
    expect(nameMeansTrainer('', 'Rohit Sharma')).toBe(false);
  });

  it('never says "session" to the reader', () => {
    expect(classesLeftWords(0)).toBe('No personal-training classes left');
    expect(classesLeftWords(1)).toBe('1 personal-training class left');
    expect(classesLeftWords(6)).toBe('6 personal-training classes left');
  });
});

describe('the server’s answer', () => {
  it('reads a good answer and drops what it cannot read', () => {
    const s = scheduleFrom(
      {
        ok: true, me: 'st-rohit', owner: false, week: MON,
        trainers: [
          { id: 'st-rohit', name: 'Rohit Sharma', teaches: ' Strength ', hours: { 1: [[360, 600]], 2: [[100, 200]], 9: [[360, 400]] }, photo: '/9j/4AAQ' },
          { id: 'st-meena', name: 'Meena', teaches: null, hours: null, photo: 'javascript:alert(1)' },
          { name: 'no id' },
        ],
        assigned: [{ memberId: 'm-bilal', trainerId: 'st-rohit' }, { memberId: 'x' }],
        bookings: [booking({}), { id: 'bad', day: 'tomorrow' }],
        ahead: { 'm-asha': 2, 'm-bilal': -1 },
      },
      '2026-10-12',
    );
    expect(s.me).toBe('st-rohit');
    expect(s.owner).toBe(false);
    expect(s.week).toBe(MON);
    expect(s.trainers.map((t) => [t.id, t.teaches, t.photo])).toEqual([['st-rohit', 'Strength', '/9j/4AAQ'], ['st-meena', null, null]]);
    expect(s.trainers[0]!.hours).toEqual({ 1: [[360, 600]] });
    expect(s.assigned).toEqual({ 'm-bilal': 'st-rohit' });
    expect(s.bookings).toHaveLength(1);
    expect(s.ahead).toEqual({ 'm-asha': 2 });
    expect(scheduleFrom(null, '2026-10-12')).toMatchObject({ owner: false, week: '2026-10-12', trainers: [], bookings: [] });
  });

  it('turns the server’s refusals into plain words', () => {
    expect(scheduleErrorWords(new Error('TRAINER_BUSY'), 'Rohit')).toBe('Rohit was just booked at this time on another screen. Pick another time.');
    expect(scheduleErrorWords({ message: 'OWNER_ONLY' })).toBe('Only the gym owner can do this.');
    expect(scheduleErrorWords(new Error('Failed to fetch'))).toBeNull();
  });
});
