/**
 * R-540 (owner, 14 Nov 2026): the demo gym's pretend gym server, so the screens that only work with a server show the
 * sample gym too: Messages & offers, the shop and its orders, Staff & sign-in, Training progress, Member questions,
 * Member messages, Diet plans, measurements, Trainers and bookings, Challenges, Gym timings, Bring a friend, members'
 * requests from the app. Everything is made-up and held in this page's memory (lib/demoLock.ts `serveDemo`): nothing
 * goes to the network, a reload starts it over, and the demo banner stays on every screen.
 *
 * It answers with the rows the real gym server gives (supabase/migrations), so the screens read them through their
 * own code. A call it does not know answers like a server without that feature (PGRST202): the screen hides it, as it
 * does for a real gym before that update. A change it does not act out is turned away with the demo's own words.
 * The common demo taps (send a message, mark an order ready, reply to a member, save a measurement or diet plan,
 * book a PT class, approve a request) do work, in memory, so the owner can show them.
 */

import { DEMO_LOCKED_WORDS, type DemoServer } from '../../lib/demoLock';
import type { CrmSnapshot } from '../data/adapter';
import { addDays, type DateISO } from '../logic/dates';
import { STARTER_DIETS } from '../logic/dietPlans';
import { reminderPayload, defaultReminderSettings } from '../logic/autoReminders';
import type { Member } from '../types';
import { sharedTraining, type SharedTraining, type TrainingStory } from './demoTraining';
import { DEMO_STAFF, type DemoShowcase, type DemoStaff } from './showcase';

type Row = Record<string, unknown>;
export type DemoRole = 'owner' | 'staff';

const KEYS: Record<DemoRole, string> = { owner: 'demo-session-key-owner-0001', staff: 'demo-session-key-desk-00001' };

/** A refusal the way PostgREST sends it, so the screens' own error words apply. */
function refusal(code: string): Error {
  return Object.assign(new Error(code), { code: 'P0001', message: code });
}

const ist = (ms: number): string => new Date(ms).toISOString();

/** Epoch ms for a local wall-clock time on `day`. */
function at(day: DateISO, hour: number, minute = 0): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, minute, 0, 0).getTime();
}

const PRODUCTS: [string, string, number, number, string, string][] = [
  ['Whey protein 1 kg (chocolate)', 'protein', 249900, 14, 'tub', '#5D4037'],
  ['Whey isolate 1 kg', 'protein', 379900, 5, 'tub', '#ECEFF1'],
  ['Mass gainer 3 kg', 'protein', 289900, 4, 'pouch', '#E8661F'],
  ['Protein bars, box of 12', 'protein', 119900, 9, 'barbox', '#C62828'],
  ['Pre-workout 300 g', 'preworkout', 179900, 7, 'jar', '#6A1B9A'],
  ['Creatine monohydrate 250 g', 'creatine', 89900, 12, 'jar', '#1565C0'],
  ['Shaker bottle 700 ml', 'gear', 39900, 22, 'shaker', '#212121'],
  ['Lifting gloves', 'gear', 69900, 8, 'gloves', '#212121'],
  ['Gym towel', 'gear', 29900, 25, 'towel', '#ECEFF1'],
  ['Gym T-shirt', 'clothing', 59900, 15, 'tshirt', '#E8661F'],
  ['Electrolyte drink 500 ml', 'drinks', 6000, 36, 'bottle', '#2E7D32'],
  ['Black coffee, cold brew', 'drinks', 9000, 18, 'bottle', '#5D4037'],
];

/** Who trains, and how, on Training progress (the most regular app members, in this order). */
const STORIES: { story: TrainingStory; strength: number; lean?: number }[] = [
  { story: 'stronger', strength: 1.1 },
  { story: 'steady', strength: 0.9 },
  { story: 'dropping', strength: 1 },
  { story: 'stronger', strength: 0.6 },
  { story: 'steady', strength: 1.2, lean: 2 },
  { story: 'new', strength: 0.7 },
  { story: 'steady', strength: 0.65, lean: 4 },
  { story: 'dropping', strength: 0.8 },
  { story: 'stronger', strength: 0.95 },
];

/** The demo's pretend server for one page: `showcase` is the sample gym the page shows. */
export function makeDemoServer(showcase: DemoShowcase, today: DateISO, now: () => number = () => Date.now()): DemoServer & { setRole(role: DemoRole): void; role(): DemoRole } {
  const snap: CrmSnapshot = showcase.snapshot;
  const gym = snap.gym;
  let role: DemoRole = 'owner';
  const me = (): DemoStaff => (role === 'owner' ? DEMO_STAFF.owner : DEMO_STAFF.desk);
  const memberById = new Map(snap.members.map((m) => [m.id, m]));
  const app = showcase.appMembers;
  const appIdOf = (m: Member) => m.appUserId ?? `user_${m.id}`;
  const ten = (phone: string) => phone.replace(/\D/g, '').slice(-10);
  let seq = 0;
  const newId = (p: string) => `${p}-demo-${(seq += 1)}`;
  const day = (ago: number) => addDays(today, -ago);

  // ---------------------------------------------------------------- staff
  const trainers = new Set<string>([DEMO_STAFF.trainerA.staffId, DEMO_STAFF.trainerB.staffId]);
  const staff: DemoStaff[] = [DEMO_STAFF.owner, DEMO_STAFF.desk, DEMO_STAFF.trainerA, DEMO_STAFF.trainerB, DEMO_STAFF.manager];
  const lastSeen: Record<string, number> = {
    [DEMO_STAFF.owner.staffId]: now(),
    [DEMO_STAFF.desk.staffId]: at(today, 7, 2),
    [DEMO_STAFF.trainerA.staffId]: at(day(1), 18, 40),
    [DEMO_STAFF.trainerB.staffId]: at(today, 10, 15),
    [DEMO_STAFF.manager.staffId]: at(day(3), 12, 0),
  };

  // ---------------------------------------------------------------- training progress
  const trained = app.slice(0, STORIES.length);
  const training = new Map<string, SharedTraining>();
  const assigned: Record<string, string> = {};
  for (const [i, m] of trained.entries()) {
    const s = STORIES[i]!;
    training.set(m.id, sharedTraining(s.story, today, m.gender === 'female' ? s.strength * 0.6 : s.strength, s.lean ?? 0));
    assigned[m.id] = i % 2 === 0 ? DEMO_STAFF.trainerA.staffId : DEMO_STAFF.trainerB.staffId;
  }
  for (const pt of showcase.ptMemberships) assigned[pt.memberId] = pt.trainer === DEMO_STAFF.trainerB.name ? DEMO_STAFF.trainerB.staffId : DEMO_STAFF.trainerA.staffId;
  const helpFrom = trained[6];
  const staffName = (id: string | undefined) => staff.find((p) => p.staffId === id)?.name ?? null;

  const trainerMember = (m: Member): Row => {
    const t = training.get(m.id)!;
    return {
      appId: appIdOf(m),
      memberId: m.id,
      name: m.fullName,
      phone: m.phone,
      trainerId: assigned[m.id] ?? null,
      trainerName: staffName(assigned[m.id]),
      summary: t.summary,
      updatedAt: t.updatedAt,
      helpAt: helpFrom && m.id === helpFrom.id ? at(day(1), 19, 45) : null,
    };
  };

  // ---------------------------------------------------------------- member questions ("Ask about your workout")
  const questions: Row[] = [];
  const ask = (m: Member | undefined, text: string, ago: number, hour: number, trainer: DemoStaff | null, answer: string | null = null): void => {
    if (!m) return;
    const askedAt = at(day(ago), hour, 12);
    questions.push({
      id: newId('q'),
      appId: appIdOf(m),
      memberId: m.id,
      name: m.fullName,
      phone: m.phone,
      trainerId: trainer?.staffId ?? null,
      trainerName: trainer?.name ?? null,
      trainerLive: true,
      question: text,
      askedAt,
      answer,
      answeredBy: answer ? (trainer ?? DEMO_STAFF.trainerA).name : null,
      answeredAt: answer ? askedAt + 3 * 3600_000 : null,
      withdrawn: false,
      open: !answer,
    });
  };
  ask(trained[1], 'My lower back hurts a little after deadlifts. Should I stop them for a while?', 0, 7, DEMO_STAFF.trainerA);
  ask(trained[3], 'How much protein should I eat in a day? I am vegetarian.', 1, 21, null);
  ask(trained[0], 'Can I train legs two days in a row?', 4, 18, DEMO_STAFF.trainerA, 'Better not. Give legs 48 hours. Do upper body on the second day, and walk 20 minutes.');
  ask(trained[4], 'Is it ok to do cardio before weights?', 9, 6, DEMO_STAFF.trainerB, 'Do 5 to 10 minutes as a warm-up, then weights. Longer cardio after the weights.');

  // ---------------------------------------------------------------- member messages ("Message your gym")
  type Line = { id: string; fromGym: boolean; who: string | null; text: string; at: number };
  const threads: (Row & { messages: Line[] })[] = [];
  const thread = (kind: 'question' | 'feedback' | 'complaint', m: Member | undefined, lines: [boolean, string, number][], done = false, anonymous = false): void => {
    if (!m && !anonymous) return;
    const messages: Line[] = lines.map(([fromGym, text, ms]) => ({ id: newId('l'), fromGym, who: fromGym ? DEMO_STAFF.desk.name : null, text, at: ms }));
    threads.push({
      id: newId('t'),
      kind,
      anonymous,
      appId: anonymous || !m ? null : appIdOf(m),
      memberId: anonymous || !m ? null : m.id,
      name: anonymous || !m ? null : m.fullName,
      phone: anonymous || !m ? null : m.phone,
      createdAt: messages[0]!.at,
      lastAt: messages[messages.length - 1]!.at,
      done,
      doneAt: done ? messages[messages.length - 1]!.at : null,
      doneBy: done ? DEMO_STAFF.desk.name : null,
      readByMember: done,
      messages,
    });
  };
  thread('complaint', app[10], [[false, 'The AC on the cardio side has not been working since Monday evening. It gets very hot after 7 pm.', at(day(0), 8, 40)]]);
  thread('question', app[12], [[false, 'Will the gym be open on Sunday for Guru Nanak Jayanti?', at(day(1), 20, 5)]]);
  thread('feedback', app[14], [[false, 'Kavita ma’am’s ladies batch is very good. Thank you!', at(day(5), 12, 30)], [true, 'Thank you! We will tell her.', at(day(5), 13, 10)]], true);
  thread('feedback', undefined, [[false, 'Please keep the changing room cleaner in the evening.', at(day(3), 21, 15)]], false, true);
  thread('question', app[16], [[false, 'Can I freeze my plan for 10 days? I am going home for a wedding.', at(day(6), 9, 0)], [true, 'Yes. Send it from the app under My plan > Pause, and we will approve it.', at(day(6), 10, 20)]], true);

  // ---------------------------------------------------------------- messages & offers
  const recipients = app.length;
  const sent: Row[] = [];
  const message = (kind: string, title: string, body: string, ago: number, hour: number, seenShare: number, extra: Row = {}): void => {
    sent.push({ id: newId('msg'), kind, title, body, createdAt: ist(at(day(ago), hour, 0)), recipients, seen: Math.round(recipients * seenShare), withdrawn: false, sendAt: null, toGroup: false, quiet: false, ...extra });
  };
  message('event', 'New Zumba batch from Monday', 'Zumba with Kavita ma’am, Monday, Wednesday and Friday at 7 pm. Free for all members. Book your spot at the desk.', 1, 11, 0.71);
  message('offer', 'Bring a friend, get 7 free days', 'Every friend who joins gives you 7 days free on your plan. Share your invite from the app.', 6, 10, 0.84);
  message('closed', 'Gym closed on Diwali', 'The gym is closed on Diwali day. Happy Diwali to you and your family!', 18, 9, 0.93);
  message('timing', 'Sunday timings', 'From this Sunday the gym opens 6 am to 11 am only.', 26, 18, 0.88);
  message('announcement', 'New dumbbell rack', 'New dumbbells from 2.5 kg to 30 kg are here. Please put them back after use.', 34, 12, 0.79);
  sent.sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
  let reminders: Row = reminderPayload({ ...defaultReminderSettings() });
  for (const k of ['plan_ends_soon', 'plan_ends_today', 'plan_ended', 'birthday', 'welcome', 'miss_you', 'pt_low']) {
    if (reminders[k] && typeof reminders[k] === 'object') reminders[k] = { ...(reminders[k] as Row), on: true };
  }
  let remindersAt = ist(at(day(40), 11, 30));
  const offer = {
    id: 'offer-demo-1',
    title: 'Train 12 days in November, get 3 free days',
    workouts: 12,
    windowDays: 30,
    rewardDays: 3,
    minMinutes: 30,
    minSets: 6,
    startsOn: day(13),
    joinUntil: addDays(today, 10),
    countAppCheckins: true,
    autoGive: false,
    createdAt: ist(at(day(13), 10, 0)),
    createdByName: DEMO_STAFF.owner.name,
    stoppedAt: null,
  };
  const offerMembers = app.slice(0, 14).map((m, i) => {
    const counted = i < 3 ? 12 : Math.max(2, 11 - i);
    return {
      offerId: offer.id,
      rosterId: m.id,
      joinedOn: day(13 - (i % 5)),
      windowEndsOn: addDays(day(13 - (i % 5)), 29),
      counted,
      deskDays: Math.ceil(counted * 0.7),
      appDays: Math.floor(counted * 0.3),
      left: false,
      earnedAt: counted >= 12 ? ist(at(day(i), 19, 0)) : null,
      givenAt: i === 0 ? ist(at(day(0), 9, 30)) : null,
      givenAuto: i === 0 ? false : null,
      givenByName: i === 0 ? DEMO_STAFF.desk.name : null,
      givenDays: i === 0 ? 3 : null,
      oldEnd: null,
      newEnd: null,
      undoneAt: null,
      undoneByName: null,
    };
  });

  // ---------------------------------------------------------------- the shop
  const products: Row[] = PRODUCTS.map(([name, category, priceP, stock, art, tint], i) => ({
    product_id: `prod-demo-${i + 1}`,
    name,
    category,
    description: '',
    price_p: priceP,
    option_name: null,
    options: [],
    stock,
    active: true,
    art_kind: art,
    art_tint: tint,
    sort: i,
    updated_at: ist(at(day(20), 12)),
    image_url: null,
  }));
  const orders: Row[] = [];
  const order = (m: Member | undefined, items: [number, number][], status: string, ago: number, hour: number): void => {
    if (!m) return;
    const lines = items.map(([p, qty]) => ({ productId: products[p]!.product_id, optionId: null, name: products[p]!.name, qty, unitPriceP: products[p]!.price_p }));
    const made = at(day(ago), hour, 20);
    orders.push({
      order_id: newId('ord'),
      order_no: 0,
      member_name: m.fullName,
      lines,
      total_p: lines.reduce((s, l) => s + (l.unitPriceP as number) * l.qty, 0),
      status,
      cancelled_by: status === 'cancelled' ? 'member' : null,
      created_at: ist(made),
      updated_at: ist(made + (status === 'ordered' ? 0 : 2 * 3600_000)),
    });
  };
  order(app[2], [[0, 1], [6, 1]], 'ordered', 0, 9);
  order(app[7], [[10, 2]], 'ordered', 0, 7);
  order(app[5], [[3, 1]], 'ready', 0, 6);
  order(app[9], [[5, 1]], 'collected', 1, 19);
  order(app[11], [[0, 1]], 'collected', 2, 18);
  order(app[1], [[9, 1], [8, 1]], 'collected', 4, 20);
  order(app[13], [[4, 1]], 'collected', 6, 7);
  order(app[3], [[11, 3]], 'collected', 8, 8);
  order(app[15], [[1, 1]], 'collected', 11, 19);
  order(app[8], [[2, 1]], 'cancelled', 12, 21);
  order(app[6], [[0, 1], [5, 1]], 'collected', 15, 18);
  orders.sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1)).forEach((o, i) => (o.order_no = 101 + i));
  orders.reverse();

  // ---------------------------------------------------------------- measurements and diet plans
  const measures: Row[] = [];
  const measured = [...new Set([...trained.slice(0, 4), ...showcase.ptMemberships.map((p) => memberById.get(p.memberId)).filter((m): m is Member => Boolean(m))])];
  for (const [i, m] of measured.entries()) {
    const female = m.gender === 'female';
    const start = (female ? 68 : 84) + (i % 3) * 4;
    for (let k = 3; k >= 0; k -= 1) {
      const weightKg = Math.round((start - (3 - k) * (i % 2 === 0 ? 1.4 : 0.6)) * 10) / 10;
      measures.push({
        id: newId('mea'),
        memberId: m.id,
        date: day(k * 28 + 3 + (i % 4)),
        weightKg,
        bodyFat: Math.round(((female ? 31 : 25) - (3 - k) * (i % 2 === 0 ? 0.9 : 0.3)) * 10) / 10,
        tape: { waist: Math.round(((female ? 84 : 92) - (3 - k) * (i % 2 === 0 ? 1.5 : 0.5)) * 10) / 10, chest: female ? 90 : 101, arm: female ? 28 : 34 },
        note: k === 3 ? 'First check at joining' : null,
        byName: i % 2 === 0 ? DEMO_STAFF.trainerA.name : DEMO_STAFF.trainerB.name,
        updatedAt: at(day(k * 28 + 3 + (i % 4)), 11),
      });
    }
  }
  const diets: Row[] = [];
  const pick = (key: string) => STARTER_DIETS.find((d) => d.key.startsWith(key)) ?? STARTER_DIETS[0]!;
  const diet = (from: (typeof STARTER_DIETS)[number], memberIds: string[], by: DemoStaff, ago: number): void => {
    diets.push({
      id: newId('diet'),
      title: from.title,
      goal: from.goal,
      kcal: from.kcal,
      proteinG: from.proteinG,
      meals: from.meals,
      notes: from.notes,
      assign: { memberIds, planIds: [] },
      withdrawn: false,
      byName: by.name,
      createdAt: at(day(ago), 12),
      updatedAt: at(day(ago), 12),
    });
  };
  diet(pick('fat-loss-veg'), measured.filter((_, i) => i % 2 === 0).map((m) => m.id), DEMO_STAFF.trainerB, 40);
  diet(pick('muscle-gain-non-veg'), measured.filter((_, i) => i % 2 === 1).map((m) => m.id), DEMO_STAFF.trainerA, 33);
  diet(pick('maintenance-veg'), trained.slice(4, 7).map((m) => m.id), DEMO_STAFF.trainerB, 12);

  // ---------------------------------------------------------------- trainers' pages and PT bookings
  const hours = (a: number, b: number, c: number, d: number) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((w) => [String(w), [[a, b], [c, d]]]));
  const profiles: Record<string, Row> = {
    [DEMO_STAFF.trainerA.staffId]: { teaches: 'Strength, muscle gain, powerlifting', hours: hours(360, 660, 1020, 1260), photo: null },
    [DEMO_STAFF.trainerB.staffId]: { teaches: 'Fat loss, ladies batch, Zumba', hours: hours(420, 720, 960, 1200), photo: null },
  };
  const bookings: Row[] = [];
  for (const [i, pt] of showcase.ptMemberships.entries()) {
    const trainerId = assigned[pt.memberId]!;
    for (let k = -3; k <= 4; k += 1) {
      if ((k + i) % 2 !== 0) continue;
      bookings.push({ id: newId('pt'), trainerId, memberId: pt.memberId, day: addDays(today, k), start: [390, 1080, 1140][i] ?? 420, length: 60, byName: DEMO_STAFF.desk.name });
    }
  }

  // ---------------------------------------------------------------- challenges
  const board = (list: Member[], value: (i: number) => number) => ({ top: list.slice(0, 10).map((m, i) => ({ rank: i + 1, memberId: m.id, name: m.fullName, phone: m.phone, value: value(i), hidden: false })) });
  const month1 = `${today.slice(0, 7)}-01` as DateISO;
  const lastMonthEnd = addDays(month1, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01` as DateISO;
  const challenges: Row[] = [
    {
      id: 'ch-demo-now',
      title: '20 workouts this month',
      measure: 'workouts',
      goal: 20,
      startsOn: month1,
      endsOn: addDays(`${addDays(month1, 32).slice(0, 7)}-01` as DateISO, -1),
      prizeDays: 5,
      createdByName: DEMO_STAFF.owner.name,
      createdAt: at(addDays(month1, -3), 11),
      cancelledAt: null,
      status: 'running',
      entrants: Math.round(app.length * 0.8),
      hitters: [],
    },
    {
      id: 'ch-demo-last',
      title: '16 workouts in a month',
      measure: 'workouts',
      goal: 16,
      startsOn: lastMonthStart,
      endsOn: lastMonthEnd,
      prizeDays: 3,
      createdByName: DEMO_STAFF.owner.name,
      createdAt: at(addDays(lastMonthStart, -4), 11),
      cancelledAt: null,
      status: 'ended',
      entrants: Math.round(app.length * 0.7),
      hitters: app.slice(0, 7).map((m, i) => ({ memberId: m.id, name: m.fullName, phone: m.phone, value: 22 - i, reward: { state: 'added', reason: null, days: 3, newEnd: null } })),
    },
  ];

  // ---------------------------------------------------------------- members' requests from the app
  const views = snap.members.filter((m) => !m.archived);
  const ending = views.filter((m) => app.includes(m) && !trained.includes(m)).slice(0, 2);
  const quarterly = snap.plans.find((p) => p.name === 'Quarterly');
  const requests: Row[] = [];
  if (ending[0] && quarterly) requests.push({ id: 'req-demo-1', kind: 'renew', from: null, to: null, planId: quarterly.id, planName: quarterly.name, status: 'pending', createdAt: at(day(0), 6, 50), decidedAt: null, rosterId: ending[0].id, memberName: ending[0].fullName, decidedBy: null, membershipId: null, startsOn: null, endsOn: null });
  if (ending[1]) requests.push({ id: 'req-demo-2', kind: 'freeze', from: addDays(today, 3), to: addDays(today, 12), planId: null, planName: null, status: 'pending', createdAt: at(day(1), 21, 30), decidedAt: null, rosterId: ending[1].id, memberName: ending[1].fullName, decidedBy: null, membershipId: null, startsOn: null, endsOn: null });

  // ---------------------------------------------------------------- the gym's timings
  const range = (open: string, close: string) => ({ open, close });
  let timings: Row = {
    hours: {
      week: {
        mon: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        tue: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        wed: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        thu: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        fri: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        sat: { kind: 'hours', ranges: [range('05:00', '11:00'), range('16:00', '22:00')] },
        sun: { kind: 'hours', ranges: [range('06:00', '11:00')] },
      },
      special: [],
      note: 'Ladies batch 11 am to 12 noon, Monday to Saturday.',
    },
    updatedAt: at(day(26), 18),
    updatedByName: DEMO_STAFF.owner.name,
  };

  // ---------------------------------------------------------------- the answers
  const ownerOnly = () => {
    if (role !== 'owner') throw refusal('OWNER_ONLY');
  };
  const appMemberRow = (m: Member, i: number): Row => ({
    member_id: appIdOf(m),
    name: m.fullName,
    phone: ten(m.phone),
    joined_at: ist(at(addDays(m.joinedOn > day(120) ? m.joinedOn : day(120 - i * 3), 1), 19)),
    last_seen: ist(at(day(i % 9), 20)),
    orders: orders.filter((o) => o.member_name === m.fullName && o.status === 'collected').length,
    spent_p: orders.filter((o) => o.member_name === m.fullName && o.status === 'collected').reduce((s, o) => s + (o.total_p as number), 0),
  });
  const weekSchedule = (monday: DateISO): Row => {
    const ahead: Record<string, number> = {};
    for (const b of bookings) if ((b.day as string) >= today) ahead[b.memberId as string] = (ahead[b.memberId as string] ?? 0) + 1;
    return {
      ok: true,
      me: me().staffId,
      owner: role === 'owner',
      week: monday,
      trainers: [DEMO_STAFF.trainerA, DEMO_STAFF.trainerB].map((t) => ({ id: t.staffId, name: t.name, ...profiles[t.staffId] })),
      assigned: Object.entries(assigned).map(([memberId, trainerId]) => ({ memberId, trainerId })),
      bookings: bookings.filter((b) => (b.day as string) >= monday && (b.day as string) <= addDays(monday, 6)),
      ahead,
    };
  };
  const setupRow = (): Row => ({
    people: staff.map((p) => ({ id: p.staffId, name: p.name, role: p.role, trainer: trainers.has(p.staffId) })),
    assigned: Object.entries(assigned).map(([memberId, trainerId]) => ({ memberId, trainerId })),
  });
  const threadOut = (t: Row) => ({ ...t, waiting: t.done !== true && !(t.messages as Line[]).at(-1)!.fromGym });

  async function answer(fn: string, args: Record<string, unknown>): Promise<unknown> {
    switch (fn) {
      case 'owner_gym':
        return { gymId: gym.gymId, name: gym.name, joinCode: gym.joinCode, brand: null };

      // Staff & sign-in
      case 'owner_people':
        ownerOnly();
        return staff.map((p) => ({ staffId: p.staffId, name: p.name, phone: p.phone, role: p.role, me: p.staffId === me().staffId, devices: p.staffId === me().staffId ? 2 : 1, lastSeenAt: ist(lastSeen[p.staffId] ?? now()), codeUntil: null, hasPin: true, pinLockedUntil: null, job: p.job }));
      case 'staff_pin_status':
        return { canSet: true, hasPin: true, setAt: ist(at(day(60), 10)), needsCurrent: true, lockedUntil: null };

      // Training progress
      case 'owner_trainer_members':
        if (role !== 'owner') throw refusal('TRAINER_ONLY');
        return { ok: true, role: 'owner', members: trained.map(trainerMember) };
      case 'owner_trainer_setup':
        ownerOnly();
        return setupRow();
      case 'owner_set_trainer':
        ownerOnly();
        if (args.p_on === true) trainers.add(String(args.p_staff));
        else trainers.delete(String(args.p_staff));
        return setupRow();
      case 'owner_assign_trainer':
        ownerOnly();
        if (typeof args.p_staff === 'string' && args.p_staff) assigned[String(args.p_member)] = args.p_staff;
        else delete assigned[String(args.p_member)];
        return setupRow();
      case 'owner_member_progress': {
        if (role !== 'owner') return { ok: true, allowed: false };
        const t = training.get(String(args.p_member));
        if (!t) return { ok: true, allowed: true, shared: false };
        return { ok: true, allowed: true, shared: true, summary: t.summary, recent: t.recent, hasRecent: true, updatedAt: t.updatedAt };
      }

      // Member questions
      case 'owner_question_count':
        if (role !== 'owner') throw refusal('TRAINER_ONLY');
        return { ok: true, open: questions.filter((q) => q.open === true).length };
      case 'owner_questions':
        if (role !== 'owner') throw refusal('TRAINER_ONLY');
        return { ok: true, role: 'owner', open: questions.filter((q) => q.open === true).length, questions };
      case 'owner_answer_question': {
        const q = questions.find((x) => x.id === args.p_id);
        if (!q) throw refusal('NOT_FOUND');
        if (!q.open) throw refusal('ALREADY_ANSWERED');
        Object.assign(q, { answer: String(args.p_answer ?? '').trim(), answeredBy: me().name, answeredAt: now(), open: false });
        return { ok: true, question: q };
      }

      // Member messages
      case 'owner_talk_count':
        return { ok: true, waiting: threads.map(threadOut).filter((t) => t.waiting).length };
      case 'owner_talk_list':
        return { ok: true, role: role === 'owner' ? 'owner' : 'staff', threads: threads.filter((t) => role === 'owner' || t.kind !== 'complaint').map(threadOut) };
      case 'owner_talk_reply': {
        const t = threads.find((x) => x.id === args.p_thread);
        if (!t) throw refusal('NOT_FOUND');
        t.messages.push({ id: newId('l'), fromGym: true, who: me().name, text: String(args.p_text ?? '').trim(), at: now() });
        t.lastAt = now();
        t.readByMember = false;
        return { ok: true, thread: threadOut(t) };
      }
      case 'owner_talk_done': {
        const t = threads.find((x) => x.id === args.p_thread);
        if (!t) throw refusal('NOT_FOUND');
        Object.assign(t, args.p_done === true ? { done: true, doneAt: now(), doneBy: me().name } : { done: false, doneAt: null, doneBy: null });
        return { ok: true, thread: threadOut(t) };
      }

      // Messages & offers
      case 'owner_app_members':
        return app.map(appMemberRow);
      case 'owner_messages':
        return sent;
      case 'owner_send_message': {
        ownerOnly();
        const to = Array.isArray(args.p_to) ? args.p_to.length : recipients;
        const row: Row = { id: newId('msg'), kind: args.p_kind, title: args.p_title, body: args.p_body, createdAt: ist(now()), recipients: to, seen: 0, withdrawn: false, sendAt: typeof args.p_send_at === 'string' ? args.p_send_at : null, toGroup: Array.isArray(args.p_to), quiet: false };
        sent.unshift(row);
        return row;
      }
      case 'owner_withdraw_message': {
        ownerOnly();
        const m = sent.find((x) => x.id === args.p_message);
        if (m) m.withdrawn = true;
        return null;
      }
      case 'owner_auto_reminders':
        return { settings: reminders, updatedAt: remindersAt, updatedByName: DEMO_STAFF.owner.name, canEdit: role === 'owner' };
      case 'owner_save_auto_reminders':
        ownerOnly();
        reminders = (args.p_settings as Row) ?? reminders;
        remindersAt = ist(now());
        return { settings: reminders, updatedAt: remindersAt, updatedByName: me().name, canEdit: true };
      case 'owner_offers': {
        const ms = offerMembers;
        return {
          today,
          offers: [{ ...offer, open: true, joined: ms.length, inNow: ms.filter((m) => !m.earnedAt).length, ready: ms.filter((m) => m.earnedAt && !m.givenAt).length, given: ms.filter((m) => m.givenAt).length }],
          members: ms,
        };
      }

      // The shop
      case 'owner_products':
        return products;
      case 'owner_orders':
        return orders;
      case 'owner_set_order_status': {
        const o = orders.find((x) => x.order_id === args.p_order);
        if (!o) throw refusal('GONE');
        o.status = args.p_status;
        o.updated_at = ist(now());
        if (args.p_status === 'cancelled') o.cancelled_by = 'gym';
        return o;
      }

      // Measurements and diet plans
      case 'owner_member_measurements':
        return measures.filter((x) => x.memberId === args.p_member).sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
      case 'owner_save_measurement': {
        const e = (args.p_entry ?? {}) as Row;
        const old = typeof e.id === 'string' ? measures.find((x) => x.id === e.id) : undefined;
        const row: Row = { ...(old ?? {}), ...e, id: old?.id ?? newId('mea'), memberId: args.p_member, byName: me().name, updatedAt: now() };
        if (old) Object.assign(old, row);
        else measures.push(row);
        return row;
      }
      case 'owner_delete_measurement': {
        const i = measures.findIndex((x) => x.id === args.p_id);
        if (i >= 0) measures.splice(i, 1);
        return null;
      }
      case 'owner_diet_plans':
        return diets;
      case 'owner_save_diet_plan': {
        const p = (args.p_plan ?? {}) as Row;
        const old = typeof p.id === 'string' ? diets.find((x) => x.id === p.id) : undefined;
        const row: Row = { ...(old ?? {}), ...p, id: old?.id ?? newId('diet'), withdrawn: false, byName: old?.byName ?? me().name, createdAt: old?.createdAt ?? now(), updatedAt: now() };
        if (old) Object.assign(old, row);
        else diets.unshift(row);
        return row;
      }
      case 'owner_withdraw_diet_plan': {
        const d = diets.find((x) => x.id === args.p_id);
        if (!d) throw refusal('NOT_FOUND');
        d.withdrawn = true;
        return d;
      }

      // Trainers and PT bookings
      case 'owner_trainer_schedule':
        return weekSchedule(String(args.p_week) as DateISO);
      case 'owner_book_pt': {
        const row: Row = { id: newId('pt'), trainerId: args.p_staff, memberId: args.p_member, day: args.p_day, start: args.p_start, length: args.p_length, byName: me().name };
        bookings.push(row);
        return row;
      }
      case 'owner_cancel_pt': {
        const i = bookings.findIndex((b) => b.id === args.p_booking);
        if (i < 0) throw refusal('NOT_FOUND');
        bookings.splice(i, 1);
        return { ok: true, id: args.p_booking };
      }

      // Challenges
      case 'owner_challenges':
        return { canEdit: role === 'owner', autoRewards: true, challenges };
      case 'owner_board': {
        const regulars = [...app].sort((a, b) => (training.has(b.id) ? 1 : 0) - (training.has(a.id) ? 1 : 0));
        return { canEdit: role === 'owner', members: Math.round(app.length * 0.8), workouts: board(regulars, (i) => 17 - i), kg: board(regulars, (i) => 48_000 - i * 3_700), hiddenMembers: [] };
      }

      // Gym timings
      case 'owner_gym_timings':
        return { ...timings, canEdit: role === 'owner' };
      case 'owner_save_gym_timings':
        ownerOnly();
        timings = { hours: args.p_hours ?? null, updatedAt: now(), updatedByName: me().name };
        return { ...timings, canEdit: true };

      // Bring a friend
      case 'owner_friend_summary': {
        const friends = snap.enquiries.filter((e) => e.referral);
        return { ok: true, links: friends.length * 3 + 5, asked: friends.length, joined: friends.filter((e) => e.status === 'joined').length };
      }

      // Members' "Renew my plan" / "Pause my plan" from the app
      case 'owner_plan_requests':
        return requests;
      case 'owner_decide_plan_request': {
        const r = requests.find((x) => x.id === args.p_request);
        if (!r) throw refusal('NOT_FOUND');
        Object.assign(r, { status: args.p_decision, decidedAt: now(), decidedBy: me().name, membershipId: args.p_membership ?? null });
        return r;
      }
    }
    // A change the demo does not act out: the demo's own words.
    if (/_(save|set|add|remove|delete|make|send|give|undo|stop|cancel|book|decide|rename|withdraw|retire|sign|accept|request|report|confirm|hide|queue|clear|grant|end|go_online|push|create)/.test(fn) || fn.startsWith('staff_')) {
      throw new Error(DEMO_LOCKED_WORDS);
    }
    // Anything else answers like a gym server without that feature: the screen hides it.
    throw Object.assign(new Error(`Could not find the function public.${fn} in the schema cache`), { code: 'PGRST202' });
  }

  return {
    answer,
    session: () => ({
      gymId: gym.gymId,
      ownerKey: KEYS[role],
      joinCode: gym.joinCode,
      name: gym.name,
      // The demo gym: Settings offers no "put online", billing and the plan lapse never ask.
      demo: true,
      online: true,
      person: { staffId: me().staffId, name: me().name, phone: me().phone, role: me().role },
    }),
    setRole: (r: DemoRole) => {
      role = r;
    },
    role: () => role,
  };
}
