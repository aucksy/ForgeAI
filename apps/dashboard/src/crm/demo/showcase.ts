/**
 * R-540 (owner, 14 Nov 2026): "ensure that the demo gym has enough data so all the functionalities can be shown in all
 * its glory ... with the kind of data that does show them there is a potential of increased revenue or convenience".
 *
 * The SALES demo (app.mettleup.fit/demo, demo/DemoApp.tsx) is the sample gym of data/demo.ts with the rest of a
 * running gym's records added on top: people who asked about joining (every stage, friends brought in by members,
 * people who filled the "Become a member" page or asked on the web page), what the gym spends each month, the
 * trainers' workout plans and personal-training packs, members on the MettleUp app, and today's own money (an early
 * renewal, a fee paid after the reminder, a new member). The made-up staff live here too, shared with the demo's
 * pretend server (demo/demoServer.ts).
 *
 * data/demo.ts itself is NOT changed: it is also "Start demo" on the welcome screen and the fixture hundreds of tests
 * read, so every one of its members, plans, receipts and visits stays exactly as it was. This file draws from its OWN
 * random numbers (fixed seed, the same gym every time), and every date is counted from `today`, so the demo never
 * goes stale. PURE.
 */

import { demoSnapshot } from '../data/demo';
import type { CrmSnapshot } from '../data/adapter';
import { addDays, diffDays, type DateISO } from '../logic/dates';
import { buildMemberView, endDateForPlan } from '../logic/membership';
import { nextReceiptNo } from '../logic/receipts';
import type {
  Enquiry,
  EnquiryLostReason,
  EnquirySource,
  Expense,
  ExpenseCategory,
  Member,
  MemberView,
  Membership,
  Payment,
  PaymentMethod,
  Plan,
  Visit,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutRoutine,
} from '../types';

/** The made-up people who work at the demo gym (Staff & sign-in, trainers, "collected by"). */
// R-555: the public /demo shows these numbers, so they are the plainly made-up 98765 00xxx kind (never a real person's).
export const DEMO_STAFF = {
  owner: { staffId: 'demo-owner', name: 'Vikram Rathore', phone: '9876500101', role: 'owner' as const, job: null },
  desk: { staffId: 'demo-desk', name: 'Sunita Joshi', phone: '9876500102', role: 'staff' as const, job: null },
  trainerA: { staffId: 'demo-trainer-a', name: 'Arjun Rawat', phone: '9876500103', role: 'staff' as const, job: null },
  trainerB: { staffId: 'demo-trainer-b', name: 'Kavita Shekhawat', phone: '9876500104', role: 'staff' as const, job: null },
  manager: { staffId: 'demo-manager', name: 'Manoj Saini', phone: '9876500105', role: 'staff' as const, job: 'Manager' },
};

export type DemoStaff = (typeof DEMO_STAFF)[keyof typeof DEMO_STAFF];

/** Fixed-seed PRNG (the same one data/demo.ts uses), so the showcase is the same every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Epoch ms for a local wall-clock time on `day`. */
function at(day: DateISO, hour: number, minute = 0): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
}

/** People who asked about joining and are not members (yet): not one of them is on the member list. */
const ENQUIRY_NAMES = [
  'Harsh Choudhary', 'Pallavi Rathore', 'Mohit Saini', 'Tanya Khandelwal', 'Gaurav Meena', 'Ankit Jain',
  'Deepika Sharma', 'Lokesh Kumawat', 'Shalini Agarwal', 'Rajat Bansal', 'Nidhi Goyal', 'Kunal Tak',
  'Megha Sethi', 'Sandeep Jangid', 'Payal Mathur', 'Vishal Yadav', 'Komal Bhati', 'Abhishek Pareek',
  'Ritika Soni', 'Naveen Gurjar', 'Sakshi Vyas', 'Hemant Dadhich', 'Jyoti Purohit', 'Pankaj Swami',
] as const;

const INTERESTS = [
  '3 months, evening batch',
  'Weight loss, wants a trainer',
  'Annual plan if the price is right',
  'Monthly first, then decide',
  'Ladies batch, morning',
  'Personal training for 1 month',
  'Student, asked for a discount',
  'Couple membership, 6 months',
] as const;

export interface DemoShowcase {
  snapshot: CrmSnapshot;
  /** Members who use the MettleUp app (their app id is `appUserId`), most active first. */
  appMembers: Member[];
  /** The personal-training packs sold in the showcase. */
  ptMemberships: Membership[];
}

/**
 * The sales demo's whole gym. `today` drives every date. PURE: no storage, no clock beyond `today`.
 */
export function buildShowcase(today: DateISO): DemoShowcase {
  const snap = demoSnapshot(today);
  const rnd = mulberry32(0x5110ca5e);
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const gymId = snap.gym.gymId;
  let seq = 0;
  const id = (prefix: string) => `${prefix}_sc${(seq += 1).toString(36).padStart(3, '0')}`;
  const createdAt = at(today, 9);

  snap.gym.friendRewardDays = 7;

  const views = new Map<string, MemberView>();
  for (const m of snap.members) {
    views.set(m.id, buildMemberView(m, snap.memberships.filter((x) => x.memberId === m.id), snap.payments.filter((p) => p.memberId === m.id), snap.visits.filter((v) => v.memberId === m.id), today));
  }
  const viewOf = (m: Member) =>
    buildMemberView(m, snap.memberships.filter((x) => x.memberId === m.id), snap.payments.filter((p) => p.memberId === m.id), snap.visits.filter((v) => v.memberId === m.id), today);

  // ---------------------------------------------------------------- one count of active members
  // The sample gym has members archived in the middle of a running plan (one renewed for six months just before).
  // Today and Members leave archived members out; Your growth counts every running plan, archived or not (on purpose:
  // logic/businessGrowth.ts keeps the past honest). So the demo said 92 active on Today and 95 on Your growth. A gym
  // archives someone after they stop paying, so here only members whose plans are over stay archived.
  for (const m of snap.members) {
    const state = views.get(m.id)?.state;
    if (m.archived && (state === 'active' || state === 'expiring')) m.archived = false;
  }

  // ---------------------------------------------------------------- renewals due this week
  // The sample gym has almost nobody whose plan ends in the next 7 days, and that is the list a desk works from
  // ("Ending this week", the renewal reminders). Eight members whose plan ends in 8-30 days are moved earlier, all
  // their plans and fees by the same number of days (their visits stay), so their plans end today to 7 days out.
  // Two of them renew early below, which leaves about six on the list.
  const laterThisMonth = snap.members
    .filter((m) => !m.archived)
    .filter((m) => {
      const d = views.get(m.id)?.daysRemaining;
      return d !== null && d !== undefined && d >= 8 && d <= 30;
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 8);
  for (const [i, m] of laterThisMonth.entries()) {
    const shift = i - views.get(m.id)!.daysRemaining!; // ends i days from today
    for (const ms of snap.memberships) {
      if (ms.memberId !== m.id) continue;
      ms.startsOn = addDays(ms.startsOn, shift);
      ms.endsOn = addDays(ms.endsOn, shift);
    }
    for (const p of snap.payments) {
      if (p.memberId !== m.id) continue;
      p.paidOn = addDays(p.paidOn, shift);
      p.createdAt += shift * 86_400_000;
    }
    m.joinedOn = addDays(m.joinedOn, shift);
    views.set(m.id, viewOf(m));
  }
  // A birthday today (the "Birthdays today" tile and the birthday wish reminder).
  const birthdayMember = snap.members.find((m) => !m.archived && views.get(m.id)?.state === 'active' && !laterThisMonth.includes(m));
  if (birthdayMember) birthdayMember.dateOfBirth = `${Number(today.slice(0, 4)) - 28}${today.slice(4)}` as DateISO;

  const live = snap.members.filter((m) => !m.archived);
  const covered = live.filter((m) => {
    const v = views.get(m.id);
    return v && (v.state === 'active' || v.state === 'expiring');
  });
  const visitsOf = (memberId: string) => snap.visits.filter((v) => v.memberId === memberId && diffDays(v.visitedOn, today) <= 30).length;

  // ---------------------------------------------------------------- members on the MettleUp app
  // About a third of the members with a running plan, the regulars first (they are the ones who install it).
  const byHabit = [...covered].sort((a, b) => visitsOf(b.id) - visitsOf(a.id) || a.id.localeCompare(b.id));
  const appMembers: Member[] = [];
  for (const [i, m] of byHabit.entries()) {
    if (i % 3 === 2 && i > 12) continue;
    if (appMembers.length >= 38) break;
    if (!m.appUserId) m.appUserId = `user_demo_sc${i}`;
    appMembers.push(m);
  }
  // The six data/demo.ts already linked stay linked (some may have no running plan).
  for (const m of snap.members) if (m.appUserId && !appMembers.includes(m)) appMembers.push(m);

  // ---------------------------------------------------------------- personal training
  const ptPlan: Plan = {
    id: 'plan_pt12',
    gymId,
    name: 'Personal training · 12 sessions',
    durationUnit: 'month',
    durationCount: 1,
    priceP: 600_000,
    joiningFeeP: 0,
    description: 'One-on-one with a trainer, 12 sessions in a month.',
    active: true,
    sortOrder: 6,
    ptSessions: 12,
    trainer: DEMO_STAFF.trainerA.name,
    createdAt,
    updatedAt: createdAt,
  };
  snap.plans.push(ptPlan);

  const newPayments: Payment[] = [];
  const pay = (memberId: string, membershipId: string, amountP: number, paidOn: DateISO, method: PaymentMethod, by: DemoStaff, note: string | null = null): Payment => {
    const p: Payment = {
      id: id('pay'),
      gymId,
      memberId,
      membershipId,
      amountP,
      method,
      paidOn,
      receiptNo: '',
      reference: method === 'upi' ? `UPI${int(100000, 999999)}` : null,
      note,
      voided: false,
      voidReason: null,
      collectedBy: by.staffId,
      collectedByName: by.name,
      createdAt: at(paidOn, int(7, 20), int(0, 59)),
      gstinAtSale: snap.gym.gstin,
    };
    newPayments.push(p);
    return p;
  };
  const sell = (member: Member, plan: Plan, startsOn: DateISO, by: DemoStaff, extra: Partial<Membership> = {}): Membership => {
    const ms: Membership = {
      id: id('ms'),
      gymId,
      memberId: member.id,
      planId: plan.id,
      planName: plan.name,
      priceP: plan.priceP,
      joiningFeeP: 0,
      listPriceP: plan.priceP,
      startsOn,
      endsOn: endDateForPlan(startsOn, plan),
      cancelled: false,
      notes: null,
      soldBy: by.staffId,
      soldByName: by.name,
      createdAt,
      updatedAt: createdAt,
      ...extra,
    };
    snap.memberships.push(ms);
    return ms;
  };

  // Three PT packs: one just started, one half used, one with 2 sessions left (Today says "PT ending").
  const ptMemberships: Membership[] = [];
  const ptBuyers = byHabit.filter((m) => views.get(m.id)?.state === 'active').slice(1, 12).filter((_, i) => i % 4 === 0).slice(0, 3);
  const ptShape = [
    { ago: 6, used: 2, trainer: DEMO_STAFF.trainerA },
    { ago: 15, used: 6, trainer: DEMO_STAFF.trainerB },
    { ago: 26, used: 10, trainer: DEMO_STAFF.trainerA },
  ];
  for (const [i, m] of ptBuyers.entries()) {
    const shape = ptShape[i]!;
    const startsOn = addDays(today, -shape.ago);
    const log: DateISO[] = [];
    for (let k = 0; k < shape.used; k += 1) log.push(addDays(startsOn, Math.floor(((k + 0.5) * shape.ago) / shape.used)));
    const ms = sell(m, ptPlan, startsOn, DEMO_STAFF.desk, { ptSessions: 12, trainer: shape.trainer.name, ptLog: log.filter((d) => d <= today) });
    pay(m.id, ms.id, ptPlan.priceP, startsOn, i === 1 ? 'card' : 'upi', DEMO_STAFF.desk);
    ptMemberships.push(ms);
  }

  // ---------------------------------------------------------------- today's own money
  const monthly = snap.plans.find((p) => p.name === 'Quarterly') ?? snap.plans[0]!;
  // An early renewal: a member whose plan ends in a few days renewed this morning (they leave the "ending" tiles).
  const endingSoon = covered
    .filter((m) => {
      const v = views.get(m.id)!;
      return v.daysRemaining !== null && v.daysRemaining >= 2 && v.daysRemaining <= 6 && !ptBuyers.includes(m);
    })
    .slice(0, 2);
  for (const [i, m] of endingSoon.entries()) {
    const v = views.get(m.id)!;
    const plan = snap.plans.find((p) => p.id === v.current?.planId) ?? monthly;
    const ms = sell(m, plan, addDays(v.coversUntil!, 1), i === 0 ? DEMO_STAFF.desk : DEMO_STAFF.owner, { notes: 'Renewed early' });
    pay(m.id, ms.id, ms.priceP, today, i === 0 ? 'upi' : 'cash', i === 0 ? DEMO_STAFF.desk : DEMO_STAFF.owner);
  }
  // A fee that was owed, paid today.
  const owing = covered.find((m) => (views.get(m.id)?.outstandingP ?? 0) > 0 && !endingSoon.includes(m));
  if (owing) {
    const due = snap.memberships
      .filter((x) => x.memberId === owing.id)
      .map((x) => {
        const paid = snap.payments.filter((p) => p.membershipId === x.id && !p.voided).reduce((s, p) => s + p.amountP, 0);
        return { x, left: x.priceP + x.joiningFeeP - paid };
      })
      .find((d) => d.left > 0);
    if (due) pay(owing.id, due.x.id, due.left, today, 'cash', DEMO_STAFF.desk, 'Paid the balance');
  }

  // ---------------------------------------------------------------- enquiries
  const enquiries: Enquiry[] = [];
  const usedPhones = new Set(snap.members.map((m) => m.phone));
  const phone = (): string => {
    for (;;) {
      // R-555: plainly made-up numbers (98765 xxxxx) on the public /demo. The first draw is kept (and not used) so every
      // other random pick in the demo stays the same as before.
      int(7, 9);
      const n = `+9198765${String(int(0, 99999)).padStart(5, '0')}`;
      if (!usedPhones.has(n)) {
        usedPhones.add(n);
        return n;
      }
    }
  };
  let nameAt = 0;
  const nextName = () => ENQUIRY_NAMES[nameAt++ % ENQUIRY_NAMES.length]!;
  const enquiry = (e: Partial<Enquiry> & Pick<Enquiry, 'name' | 'status'>, daysAgo: number): Enquiry => {
    const made = at(addDays(today, -daysAgo), int(8, 20), int(0, 59));
    const row: Enquiry = {
      id: id('enq'),
      gymId,
      phone: e.phone ?? phone(),
      interest: null,
      followUpOn: null,
      memberId: null,
      createdAt: made,
      updatedAt: made,
      ...e,
    };
    enquiries.push(row);
    return row;
  };

  // Turned into members: the recent joiners, each with the enquiry that brought them in.
  const recentJoiners = live
    .filter((m) => !m.importId && diffDays(m.joinedOn, today) <= 80 && diffDays(m.joinedOn, today) >= 1)
    .sort((a, b) => (a.joinedOn < b.joinedOn ? 1 : -1))
    .slice(0, 11);
  const joinSources: EnquirySource[] = ['walk-in', 'instagram', 'friend', 'walk-in', 'google', 'instagram', 'friend', 'justdial', 'walk-in', 'instagram', 'google'];
  const veterans = live.filter((m) => m.importId && views.get(m.id)?.state === 'active');
  for (const [i, m] of recentJoiners.entries()) {
    const source = joinSources[i % joinSources.length]!;
    const by = veterans[(i * 5) % Math.max(1, veterans.length)];
    const joinedAgo = diffDays(m.joinedOn, today);
    enquiry(
      {
        name: m.fullName,
        phone: m.phone,
        status: 'joined',
        memberId: m.id,
        source,
        interest: INTERESTS[i % INTERESTS.length]!,
        ...(source === 'friend' && by
          ? { referral: { by: by.fullName, memberId: by.id, time: 'evening' as const, rewardGiven: i === 2 ? { days: 7, membershipId: snap.memberships.filter((x) => x.memberId === by.id).at(-1)?.id ?? '', on: m.joinedOn } : null } }
          : {}),
      },
      joinedAgo + int(1, 6),
    );
  }

  // Waiting for a call today, or overdue.
  const openSources: EnquirySource[] = ['walk-in', 'instagram', 'google', 'justdial', 'walk-in', 'instagram'];
  for (let i = 0; i < 6; i += 1) {
    const late = i % 2 === 1 ? int(1, 4) : 0;
    enquiry({ name: nextName(), status: 'open', source: openSources[i]!, interest: INTERESTS[(i + 3) % INTERESTS.length]!, followUpOn: addDays(today, -late) }, late + int(2, 8));
  }
  // To call later this week and next.
  for (let i = 0; i < 5; i += 1) {
    enquiry({ name: nextName(), status: 'open', source: i % 2 ? 'instagram' : 'walk-in', interest: INTERESTS[(i + 5) % INTERESTS.length]!, followUpOn: addDays(today, int(1, 9)) }, int(1, 6));
  }
  // No call date yet.
  enquiry({ name: nextName(), status: 'open', source: 'other', interest: 'Saw the banner outside' }, 2);

  // Friends brought in by members (Bring a friend): two to call, one invited again.
  const inviters = veterans.slice(3);
  for (let i = 0; i < 2; i += 1) {
    const by = inviters[i * 7 % Math.max(1, inviters.length)];
    if (!by) break;
    enquiry({ name: nextName(), status: 'open', source: 'friend', interest: 'Friend of a member', followUpOn: today, referral: { by: by.fullName, memberId: by.id, time: i ? 'morning' : 'evening', rewardGiven: null } }, i + 1);
  }
  const again = enquiries.find((e) => e.status === 'open' && e.followUpOn && e.followUpOn > today);
  const againBy = inviters[11 % Math.max(1, inviters.length)];
  if (again && againBy) again.invitedAgain = { v: 1, by: againBy.fullName, time: 'evening', at: at(addDays(today, -1), 19, 10) };

  // Filled the gym's "Become a member" page: waiting at the desk to be made members (Today shows them).
  const quarterly = snap.plans.find((p) => p.name === 'Quarterly') ?? snap.plans[0]!;
  const monthlyPlan = snap.plans.find((p) => p.name === 'Monthly') ?? snap.plans[0]!;
  for (const [i, plan] of [quarterly, monthlyPlan].entries()) {
    const name = nextName();
    const when = at(addDays(today, -i), 7 + i * 11, 40);
    enquiry(
      {
        name,
        status: 'open',
        source: 'other',
        interest: `Joined online: ${plan.name}`,
        followUpOn: today,
        selfJoin: {
          v: 1,
          name,
          gender: i ? 'female' : 'male',
          planId: plan.id,
          planName: plan.name,
          durationUnit: plan.durationUnit,
          durationCount: plan.durationCount,
          priceP: plan.priceP,
          joiningFeeP: plan.joiningFeeP,
          totalP: plan.priceP + plan.joiningFeeP,
          startsOn: addDays(today, 1 - i),
          pay: 'desk',
          paid: false,
          phoneChecked: true,
          lang: i ? 'hi' : 'en',
          consents: { adultAt: when, healthAt: when, wording: '2026-11-01' },
          at: when,
        },
      },
      i,
    );
  }

  // Asked a question on the gym's web page.
  const pageQuestions = ['Do you have a ladies-only batch in the evening?', 'Is there parking for a car? And what is the fee for 6 months?'];
  for (const [i, question] of pageQuestions.entries()) {
    const name = nextName();
    enquiry({ name, status: 'open', source: 'other', interest: `Asked on your web page: ${question}`, followUpOn: today, pageAsk: { v: 1, name, question, at: at(addDays(today, -i), 21, 5) } }, i);
  }

  // Did not join, with the reason the desk heard.
  const lost: EnquiryLostReason[] = ['price', 'distance', 'timings', 'other-gym', 'just-asking'];
  for (const [i, reason] of lost.entries()) {
    enquiry({ name: nextName(), status: 'lost', lostReason: reason, source: i % 2 ? 'justdial' : 'walk-in', interest: INTERESTS[i % INTERESTS.length]! }, int(10, 40));
  }

  // One walked in this morning and joined on the spot.
  const fresh: Member = {
    ...snap.members[0]!,
    id: id('mem'),
    fullName: 'Rohit Khandelwal',
    phone: phone(),
    email: null,
    gender: 'male',
    dateOfBirth: addDays(today, -26 * 365 - 40),
    address: 'Malviya Nagar, Jaipur',
    emergencyName: null,
    emergencyPhone: null,
    joinedOn: today,
    photoUri: null,
    notes: 'Wants to lose 8 kg before his wedding.',
    batch: 'Evening 6-9',
    archived: false,
    appUserId: null,
    createdAt: at(today, 8, 5),
    updatedAt: at(today, 8, 5),
  };
  delete fresh.importId;
  snap.members.push(fresh);
  const freshMs = sell(fresh, quarterly, today, DEMO_STAFF.desk, { joiningFeeP: quarterly.joiningFeeP });
  pay(fresh.id, freshMs.id, quarterly.priceP + quarterly.joiningFeeP, today, 'upi', DEMO_STAFF.desk);
  const freshVisit: Visit = { id: id('vis'), gymId, memberId: fresh.id, visitedOn: today, checkedInAt: at(today, 8, 20), source: 'desk' };
  snap.visits.push(freshVisit);
  enquiry({ name: fresh.fullName, phone: fresh.phone, status: 'joined', memberId: fresh.id, source: 'walk-in', interest: '3 months, evening batch' }, 3);

  snap.enquiries = enquiries;

  // ---------------------------------------------------------------- what the gym spends
  snap.expenses = demoExpenses(snap, today, rnd, id);

  // ---------------------------------------------------------------- workout plans
  snap.workoutPlans = demoWorkoutPlans(snap, today, recentJoiners, id);

  // ---------------------------------------------------------------- receipts, in date order, once
  // The showcase sold some plans on past days (the PT packs), so the whole book is numbered again in date order,
  // the way data/demo.ts does it: a receipt never predates a lower number.
  snap.payments.push(...newPayments);
  const issued: { receiptNo: string }[] = [];
  for (const p of [...snap.payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id))) {
    p.receiptNo = nextReceiptNo(issued, p.paidOn);
    issued.push({ receiptNo: p.receiptNo });
  }

  return { snapshot: snap, appMembers, ptMemberships };
}

/** Rent, salaries, electricity, shop stock and the odd repair, every month since the gym started on MettleUp. */
function demoExpenses(snap: CrmSnapshot, today: DateISO, rnd: () => number, id: (p: string) => string): Expense[] {
  const out: Expense[] = [];
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const add = (spentOn: DateISO, amountP: number, category: ExpenseCategory, note: string | null) => {
    if (spentOn > today) return;
    out.push({ id: id('exp'), gymId: snap.gym.gymId, spentOn, amountP, category, note, createdAt: at(spentOn, 18) });
  };
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  for (let back = 7; back >= 0; back -= 1) {
    const y = ty - (tm - 1 - back < 0 ? 1 : 0);
    const m = ((tm - 1 - back + 12) % 12) + 1;
    const day = (d: number): DateISO => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as DateISO;
    const summer = m >= 4 && m <= 9;
    add(day(1), 1_800_000, 'rent', 'Shop rent');
    add(day(2), 1_000_000, 'salary', 'Arjun (trainer)');
    add(day(2), 800_000, 'salary', 'Kavita (trainer)');
    add(day(2), 700_000, 'salary', 'Sunita (front desk)');
    add(day(3), 350_000, 'salary', 'Cleaning staff');
    add(day(int(9, 12)), (summer ? int(70, 90) : int(45, 60)) * 10_000, 'electricity', summer ? 'Electricity bill (ACs on)' : 'Electricity bill');
    if (back % 2 === 0) add(day(int(14, 18)), int(6, 9) * 100_000, 'stock', 'Protein and shakers for the shop');
    if (back % 3 === 1) add(day(int(19, 26)), int(18, 60) * 10_000, 'repairs', back === 4 ? 'Treadmill belt' : 'Cable machine service');
    if (back === 5) add(day(21), 4_500_000, 'equipment', 'New dumbbell rack, 2.5 to 30 kg');
    add(day(int(5, 25)), int(6, 15) * 10_000, 'other', 'Drinking water and cleaning items');
  }
  return out.sort((a, b) => (a.spentOn < b.spentOn ? -1 : 1));
}

const ex = (name: string, catalogKey: string, primary: string[], sets: number, repMin: number, repMax: number, weightKg: number | null, restSec = 90): WorkoutExercise => ({
  name,
  catalogKey,
  logType: weightKg === null ? 'reps' : 'weight_reps',
  sets,
  repMin,
  repMax,
  primary,
  restSec,
  setList: Array.from({ length: sets }, () => ({ type: 'normal' as const, reps: repMax, weightKg })),
});

/** Four plans the trainers made: two for everyone on a plan, one for new joiners, one taken back. */
function demoWorkoutPlans(snap: CrmSnapshot, today: DateISO, newJoiners: readonly Member[], id: (p: string) => string): WorkoutPlan[] {
  const byPlan = (name: string) => snap.plans.find((p) => p.name === name)?.id;
  const push: WorkoutRoutine = {
    name: 'Day 1 · Push',
    dayType: 'push',
    exercises: [
      ex('Barbell Bench Press', 'barbell_bench_press', ['chest'], 4, 8, 10, 40),
      ex('Incline Dumbbell Press', 'incline_dumbbell_press', ['chest'], 3, 10, 12, 14),
      ex('Dumbbell Shoulder Press', 'dumbbell_shoulder_press', ['front_delts'], 3, 10, 12, 12),
      ex('Lateral Raise', 'lateral_raise', ['side_delts'], 3, 12, 15, 5, 60),
      ex('Triceps Pushdown', 'triceps_pushdown', ['triceps'], 3, 12, 15, 20, 60),
    ],
  };
  const pull: WorkoutRoutine = {
    name: 'Day 2 · Pull',
    dayType: 'pull',
    exercises: [
      ex('Lat Pulldown', 'lat_pulldown', ['lats'], 4, 10, 12, 40),
      ex('Seated Cable Row', 'seated_cable_row', ['upper_back'], 3, 10, 12, 35),
      ex('Face Pull', 'face_pull', ['rear_delts'], 3, 12, 15, 15, 60),
      ex('Barbell Curl', 'barbell_curl', ['biceps'], 3, 10, 12, 15, 60),
      ex('Hammer Curl', 'hammer_curl', ['biceps'], 2, 12, 12, 8, 60),
    ],
  };
  const legs: WorkoutRoutine = {
    name: 'Day 3 · Legs',
    dayType: 'legs',
    exercises: [
      ex('Barbell Squat', 'barbell_back_squat', ['quads'], 4, 8, 10, 50, 120),
      ex('Leg Press', 'leg_press', ['quads'], 3, 10, 12, 100),
      ex('Romanian Deadlift', 'romanian_deadlift', ['hamstrings'], 3, 10, 10, 40),
      ex('Leg Extension', 'leg_extension', ['quads'], 3, 12, 15, 30, 60),
      ex('Lying Leg Curl', 'lying_leg_curl', ['hamstrings'], 3, 12, 15, 25, 60),
    ],
  };
  const beginner: WorkoutRoutine = {
    name: 'Full body',
    dayType: 'full',
    exercises: [
      ex('Leg Press', 'leg_press', ['quads'], 3, 12, 15, 60),
      ex('Machine Chest Press', 'machine_chest_press', ['chest'], 3, 12, 15, 20),
      ex('Lat Pulldown', 'lat_pulldown', ['lats'], 3, 12, 15, 25),
      ex('Dumbbell Shoulder Press', 'dumbbell_shoulder_press', ['front_delts'], 2, 12, 15, 6),
      ex('Push-Up', 'push_up', ['chest'], 2, 8, 12, null, 60),
    ],
  };
  const ladies: WorkoutRoutine[] = [
    { name: 'Lower body + core', dayType: 'lower', exercises: [ex('Leg Press', 'leg_press', ['quads'], 3, 15, 15, 40), ex('Dumbbell Lunge', 'dumbbell_lunge', ['quads'], 3, 12, 12, 4), ex('Romanian Deadlift', 'romanian_deadlift', ['hamstrings'], 3, 12, 12, 15), ex('Lying Leg Curl', 'lying_leg_curl', ['hamstrings'], 3, 15, 15, 15, 60)] },
    { name: 'Upper body', dayType: 'upper', exercises: [ex('Lat Pulldown', 'lat_pulldown', ['lats'], 3, 12, 15, 20), ex('Machine Chest Press', 'machine_chest_press', ['chest'], 3, 12, 15, 10), ex('Seated Cable Row', 'seated_cable_row', ['upper_back'], 3, 12, 15, 20), ex('Lateral Raise', 'lateral_raise', ['side_delts'], 3, 15, 15, 2, 60)] },
  ];
  const stamp = (daysAgo: number) => at(addDays(today, -daysAgo), 11);
  const plan = (name: string, note: string | null, routines: WorkoutRoutine[], assign: WorkoutPlan['assign'], by: DemoStaff, daysAgo: number, withdrawn = false): WorkoutPlan => ({
    id: id('wp'),
    gymId: snap.gym.gymId,
    name,
    note,
    routines,
    assign,
    withdrawn,
    createdAt: stamp(daysAgo),
    updatedAt: stamp(Math.max(0, daysAgo - 3)),
    createdBy: by.staffId,
    createdByName: by.name,
  });
  const ladiesIds = snap.members.filter((m) => m.batch === 'Ladies 11-12' && !m.archived).map((m) => m.id).slice(0, 8);
  return [
    plan('Push Pull Legs (3 days)', 'Rest a day between. Add 2.5 kg when every set reaches the top of the reps.', [push, pull, legs], { memberIds: [], planIds: [byPlan('Half-yearly'), byPlan('Annual')].filter((x): x is string => Boolean(x)) }, DEMO_STAFF.trainerA, 60),
    plan('First month: full body', 'For your first 4 weeks. Light weights, learn each move well.', [beginner], { memberIds: newJoiners.slice(0, 6).map((m) => m.id), planIds: [byPlan('Monthly')].filter((x): x is string => Boolean(x)) }, DEMO_STAFF.trainerB, 45),
    plan('Ladies batch: tone and strength', 'Two days a week, with 20 minutes of walking after.', ladies, { memberIds: ladiesIds, planIds: [] }, DEMO_STAFF.trainerB, 30),
    plan('Old summer plan', null, [beginner], { memberIds: [], planIds: [byPlan('Quarterly')].filter((x): x is string => Boolean(x)) }, DEMO_STAFF.trainerA, 150, true),
  ];
}
