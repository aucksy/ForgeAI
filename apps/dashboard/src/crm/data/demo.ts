/**
 * Demo gym — a deterministic, realistic Indian value gym.
 *
 * Two jobs: it is the sales demo (a full, plausible gym in one click, no signup),
 * and it is the fixture the UI is developed and verified against. Deterministic
 * PRNG (mulberry32, fixed seed) so the same gym appears every time and a screenshot
 * from yesterday still matches — but every date is generated RELATIVE TO TODAY, so
 * the renewals list is never full of memberships that expired in 2026 while the
 * demo is being shown in 2027.
 *
 * Numbers are drawn from the R1 research profile of an Indian value gym: annual
 * prepay dominant with a 20–30% discount against monthly, joining fee on first
 * sale, cash-and-UPI collection, a real tail of part-payers, and attendance that
 * decays hard after the first few weeks.
 */

import { addDays, diffDays, type DateISO } from '../logic/dates';
import { endDateForPlan } from '../logic/membership';
import { nextReceiptNo } from '../logic/receipts';
import type {
  Member,
  Membership,
  Payment,
  PaymentMethod,
  Plan,
  Visit,
} from '../types';
import type { CrmSnapshot, GymRecord } from './adapter';

/** Fixed-seed PRNG — same gym every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Kabir', 'Yash', 'Dev', 'Aryan', 'Karan', 'Nikhil', 'Rahul', 'Siddharth', 'Manish', 'Varun',
  'Ananya', 'Diya', 'Aadhya', 'Riya', 'Isha', 'Sneha', 'Pooja', 'Neha', 'Kavya', 'Meera',
  'Shreya', 'Priya', 'Nisha', 'Tanvi', 'Aditi', 'Simran', 'Anjali', 'Divya', 'Ritu', 'Swati',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Yadav', 'Mehta', 'Patel', 'Reddy', 'Nair',
  'Joshi', 'Chauhan', 'Malhotra', 'Bose', 'Iyer', 'Rao', 'Agarwal', 'Bhatt', 'Kapoor', 'Saxena',
];

const NOTES = [
  'Prefers evening slot.',
  'Knee injury — no heavy squats.',
  'Referred by Rohan.',
  'Wants personal training from next month.',
  'Asked about diet plan.',
  null,
  null,
  null,
];

export interface DemoOptions {
  today: DateISO;
  memberCount?: number;
  seed?: number;
}

/** The demo gym's own id: every made-up record carries it (until "Erase and start fresh"). */
export const DEMO_GYM_ID = 'gym_demo';

/**
 * UAT U-A12 (17 Oct 2026): is this browser's gym the made-up demo? True after "Start demo", after
 * "Open the demo without the shop" (no internet) and after "Load demo gym"; false once erased. PURE.
 */
export function isDemoGym(gym: Pick<GymRecord, 'gymId'>): boolean {
  return gym.gymId === DEMO_GYM_ID;
}

/** Build the whole demo gym. Pure — no storage, no clock beyond `today`. */
export function buildDemoGym(opts: DemoOptions): CrmSnapshot {
  const { today, memberCount = 128, seed = 20260726 } = opts;
  const rnd = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

  const createdAt = Date.parse(`${today}T00:00:00Z`);
  let idCounter = 0;
  const id = (prefix: string) => `${prefix}_${(idCounter += 1).toString(36).padStart(4, '0')}`;

  const gym: GymRecord = {
    gymId: DEMO_GYM_ID,
    name: 'Iron Temple Fitness',
    joinCode: 'IRON24',
    phone: '+919876500000',
    address: 'Shop 4, Malviya Nagar, Jaipur 302017',
    gstin: null,
    createdAt,
  };

  // ---------------------------------------------------------------- plans
  // Annual is priced at a ~30% discount to 12x monthly — the prepay incentive the
  // research says Indian value gyms actually run on.
  const planSpecs: Array<Omit<Plan, 'id' | 'gymId' | 'createdAt' | 'updatedAt'>> = [
    { name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 120_000, joiningFeeP: 50_000, description: 'Pay month by month.', active: true, sortOrder: 1 },
    { name: 'Quarterly', durationUnit: 'month', durationCount: 3, priceP: 300_000, joiningFeeP: 50_000, description: 'The most popular first plan.', active: true, sortOrder: 2 },
    { name: 'Half-yearly', durationUnit: 'month', durationCount: 6, priceP: 550_000, joiningFeeP: 50_000, description: 'Saves ₹1,700 on paying monthly.', active: true, sortOrder: 3 },
    { name: 'Annual', durationUnit: 'month', durationCount: 12, priceP: 1_000_000, joiningFeeP: 0, description: 'Best value. No joining fee.', active: true, sortOrder: 4 },
    { name: 'Day pass', durationUnit: 'day', durationCount: 1, priceP: 20_000, joiningFeeP: 0, description: 'For visitors and trial workouts.', active: true, sortOrder: 5 },
  ];

  const plans: Plan[] = planSpecs.map((p) => ({
    ...p,
    id: id('plan'),
    gymId: gym.gymId,
    createdAt,
    updatedAt: createdAt,
  }));

  // Weighted toward the longer terms, matching the annual-prepay pattern. The day
  // pass is sellable but never generated — nobody's history is a run of day passes.
  const planWeights = [
    ...Array(2).fill(plans[0]),
    ...Array(4).fill(plans[1]),
    ...Array(3).fill(plans[2]),
    ...Array(5).fill(plans[3]),
  ] as Plan[];

  const members: Member[] = [];
  const memberships: Membership[] = [];
  const payments: Payment[] = [];
  const visits: Visit[] = [];

  const usedPhones = new Set<string>();
  const phoneFor = (): string => {
    for (;;) {
      const n = `+91${int(6, 9)}${String(int(0, 999999999)).padStart(9, '0')}`;
      if (!usedPhones.has(n)) {
        usedPhones.add(n);
        return n;
      }
    }
  };

  for (let i = 0; i < memberCount; i += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const female = FIRST_NAMES.indexOf(first) >= 20;

    // Joined anywhere from 2 years ago to yesterday, skewed toward recent.
    const joinedDaysAgo = Math.floor(Math.pow(rnd(), JOIN_CURVE) * 730) + 1;
    const joinedOn = addDays(today, -joinedDaysAgo);

    const member: Member = {
      id: id('mem'),
      gymId: gym.gymId,
      fullName: `${first} ${last}`,
      phone: phoneFor(),
      email: rnd() < 0.35 ? `${first.toLowerCase()}.${last.toLowerCase()}@example.com` : null,
      gender: female ? 'female' : 'male',
      dateOfBirth: addDays(today, -int(18, 52) * 365 - int(0, 364)),
      address: rnd() < 0.4 ? `${int(1, 90)}, Sector ${int(1, 12)}, Jaipur` : null,
      emergencyName: rnd() < 0.3 ? `${pick(FIRST_NAMES)} ${last}` : null,
      emergencyPhone: null,
      joinedOn,
      photoUri: null,
      notes: pick(NOTES),
      // Chosen by position, not by `rnd()`: drawing another random number here would shift every
      // later draw and change the whole demo gym.
      batch: demoBatch(i, female),
      archived: rnd() < 0.04,
      appUserId: null,
      createdAt: createdAt - joinedDaysAgo * 86_400_000,
      updatedAt: createdAt,
    };
    members.push(member);

    // ------------------------------------------------------------ their terms
    // Walk terms forward from the join date until we run past today, so a
    // long-standing member has a real renewal history behind them.
    // This member's own terms, kept locally. Scanning the whole growing
    // `memberships` array once per member per day was ~5M comparisons at 128
    // members and grew quadratically with roster size.
    const myTerms: Membership[] = [];
    let cursor = joinedOn;
    let firstTerm = true;
    let lapsed = false;

    while (cursor <= today && !lapsed) {
      const plan = pick(planWeights);
      const endsOn = endDateForPlan(cursor, plan);

      // Occasional negotiated discount, in round hundreds.
      const discountP = rnd() < 0.18 ? int(1, 5) * 10_000 : 0;
      const priceP = Math.max(0, plan.priceP - discountP);
      const joiningFeeP = firstTerm ? plan.joiningFeeP : 0;

      const membership: Membership = {
        id: id('ms'),
        gymId: gym.gymId,
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        priceP,
        joiningFeeP,
        listPriceP: plan.priceP,
        startsOn: cursor,
        endsOn,
        cancelled: false,
        notes: null,
        soldBy: null,
        createdAt: createdAt - Math.max(0, diffDays(cursor, today)) * 86_400_000,
        updatedAt: createdAt,
      };
      memberships.push(membership);
      myTerms.push(membership);

      // -------------------------------------------------------- what they paid
      const dueP = priceP + joiningFeeP;
      const roll = rnd();
      const method: PaymentMethod = rnd() < 0.55 ? 'upi' : rnd() < 0.85 ? 'cash' : 'card';

      if (roll < 0.78) {
        // Paid in full on the day.
        payments.push(makePayment(dueP, cursor, method));
      } else if (roll < 0.94) {
        // Part-paid: a chunk now, the rest a few weeks later (or never — that is
        // the dues list the owner actually wants).
        const firstPart = Math.round(dueP * (0.4 + rnd() * 0.3) / 1000) * 1000;
        payments.push(makePayment(firstPart, cursor, method));
        const settleOn = addDays(cursor, int(7, 45));
        if (settleOn <= today && rnd() < 0.6) {
          payments.push(makePayment(dueP - firstPart, settleOn, rnd() < 0.5 ? 'cash' : 'upi'));
        }
      }
      // else: nothing paid at all — a genuine outstanding due.

      function makePayment(amountP: number, paidOn: DateISO, m: PaymentMethod): Payment {
        return {
          id: id('pay'),
          gymId: gym.gymId,
          memberId: member.id,
          membershipId: membership.id,
          amountP,
          method: m,
          paidOn,
          // Assigned after generation, in date order — see below.
          receiptNo: '',
          reference: m === 'upi' ? `UPI${int(100000, 999999)}` : null,
          note: null,
          voided: false,
          voidReason: null,
          collectedBy: null,
          createdAt: epochOfLocalNoon(paidOn),
          // The demo gym is not GST-registered, and its history says so. If it
          // read the live GSTIN instead, typing one into Settings would retro-fit
          // tax lines onto two years of receipts it never charged tax on.
          gstinAtSale: gym.gstin,
        };
      }

      firstTerm = false;
      cursor = addDays(endsOn, 1);

      // Renewal is not automatic: a real share of members simply stop. "Your growth" (30 Oct 2026):
      // the demo is the sales story of a gym that started on MettleUp DEMO_START_DAYS_AGO days ago and
      // then kept more members, so a plan ending before that start lapses more often than one after.
      const sinceStart = cursor >= addDays(today, -DEMO_START_DAYS_AGO);
      if (cursor <= today && rnd() < (sinceStart ? LAPSE_SINCE : LAPSE_BEFORE)) lapsed = true;
      // A few let it lapse for a while and come back.
      else if (cursor <= today && rnd() < (sinceStart ? BREAK_SINCE : BREAK_BEFORE)) cursor = addDays(cursor, int(10, 70));
    }

    // ------------------------------------------------------------ attendance
    // Only members whose term covers a day can visit it. Frequency decays with
    // tenure — the pattern the at-risk list exists to catch.
    const activeNow = myTerms.some((m) => m.startsOn <= today && m.endsOn >= today);
    if (activeNow && !member.archived) {
      const commitment = rnd(); // 0 = ghost, 1 = every day
      for (let d = 0; d < 60; d += 1) {
        const day = addDays(today, -d);
        const covered = myTerms.some((m) => m.startsOn <= day && m.endsOn >= day);
        if (!covered) continue;
        // Recent days are likelier for the committed, and ghosts fade out entirely.
        const decay = commitment < 0.25 ? Math.max(0, 0.35 - d * 0.02) : commitment * 0.55;
        if (rnd() < decay) {
          visits.push({
            id: id('vis'),
            gymId: gym.gymId,
            memberId: member.id,
            visitedOn: day,
            // Built from LOCAL parts. Parsing `${day}T06:15:00Z` made a 6am
            // gym-goer read as 11:45 IST, and a 9pm one land on the next
            // calendar day — a visit timestamped outside the day it belongs to.
            checkedInAt: epochOfLocalTime(day, int(6, 21), 15),
            source: rnd() < 0.25 ? 'app' : 'desk',
          });
        }
      }
    }
  }

  // A couple of members linked their phone app — proves the roster/app join works.
  for (let i = 0; i < Math.min(6, members.length); i += 1) {
    members[i * 7 % members.length].appUserId = `user_demo_${i}`;
  }

  markOldHistoryImported(gym, members, memberships, payments, visits, today, seed);

  // Receipt numbers are assigned LAST, in payment-date order. Issuing them as we
  // generated member-by-member produced a book where receipt 0003 predated 0001 —
  // unique, but the first thing an owner or their accountant would query.
  const issued: { receiptNo: string }[] = [];
  for (const p of [...payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id))) {
    p.receiptNo = nextReceiptNo(issued, p.paidOn);
    issued.push({ receiptNo: p.receiptNo });
  }

  return { gym, members, plans, memberships, payments, visits, enquiries: [], expenses: [], workoutPlans: [] };
}

/**
 * How long ago the demo gym started on MettleUp ("Your growth", 30 Oct 2026): about seven months, so
 * the page has six months before it (brought in from the old register and fee book) and six since.
 */
export const DEMO_START_DAYS_AGO = 214;

/** The share of demo members who stop when a plan ends, before and since the demo gym's start. */
const LAPSE_BEFORE = 0.33;
const LAPSE_SINCE = 0.2;
/** The share who take a break of 10-70 days and come back. */
const BREAK_BEFORE = 0.14;
const BREAK_SINCE = 0.06;
/**
 * How strongly join days lean to recent months (1 = even over two years). 1.1: a gym that grows steadily
 * rather than one that doubled in a year, so the money and members since the start rise modestly.
 */
const JOIN_CURVE = 1.1;

/**
 * "Your growth" needs the demo to tell the story a real gym's would: it started on MettleUp a few
 * months ago and brought its old records in. Runs AFTER everything above and draws from its OWN
 * random numbers, so every member, plan, receipt and recent check-in stays exactly as it was:
 *  - the gym was made DEMO_START_DAYS_AGO days ago (Settings says "Set up <that day>");
 *  - every member, plan and receipt dated before then carries one import's id (`importId`), like the
 *    Excel import marks the rows it brings in;
 *  - check-ins further back than the 60 days drawn above: before the start they are paper-register
 *    rows (source 'import', no time), after it desk and app check-ins with a time. They stop 60 days
 *    back, so the last 60 days (and the at-risk lists read from them) keep their own visits; the
 *    habit check reads at most 8 visits back, which older rows can only fill in for a rare member.
 */
function markOldHistoryImported(
  gym: GymRecord,
  members: Member[],
  memberships: Membership[],
  payments: Payment[],
  visits: Visit[],
  today: DateISO,
  seed: number,
): void {
  if (members.length === 0) return;
  const startOn = addDays(today, -DEMO_START_DAYS_AGO);
  gym.createdAt = epochOfLocalNoon(startOn);
  const importId = `import-${gym.createdAt.toString(36)}`;
  for (const m of members) if (m.joinedOn < startOn) m.importId = importId;
  for (const m of memberships) if (m.startsOn < startOn) m.importId = importId;
  for (const p of payments) if (p.paidOn < startOn) p.importId = importId;

  const rnd = mulberry32(seed ^ 0x5eed);
  const byMember = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = byMember.get(m.memberId);
    if (list) list.push(m);
    else byMember.set(m.memberId, [m]);
  }
  let n = 0;
  for (const member of members) {
    if (member.archived) continue;
    const terms = byMember.get(member.id) ?? [];
    const habit = 0.1 + rnd() * 0.35;
    for (let d = 60; d < 400; d += 1) {
      const day = addDays(today, -d);
      if (!terms.some((t) => t.startsOn <= day && t.endsOn >= day)) continue;
      const before = day < startOn;
      // A paper register misses days (nobody wrote them down), so it reads a little thinner.
      if (rnd() >= (before ? habit * 0.8 : habit)) continue;
      visits.push({
        id: `vis_old_${(n += 1).toString(36).padStart(5, '0')}`,
        gymId: gym.gymId,
        memberId: member.id,
        visitedOn: day,
        checkedInAt: before ? 0 : epochOfLocalTime(day, 6 + Math.floor(rnd() * 16), 15),
        source: before ? 'import' : rnd() < 0.25 ? 'app' : 'desk',
      });
    }
  }
}

/** Epoch ms for local noon on `day` — timezone-correct, unlike parsing a `Z` string. */
function epochOfLocalNoon(day: DateISO): number {
  return epochOfLocalTime(day, 12, 0);
}

/** Epoch ms for a local wall-clock time on `day`. */
function epochOfLocalTime(day: DateISO, hour: number, minute: number): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
}

/** Named export used by the "Load demo gym" action and by the test fixtures. */
export function demoSnapshot(today: DateISO): CrmSnapshot {
  return buildDemoGym({ today });
}

/** Plan list only — used to give a brand-new empty gym something sellable on day one. */
export function starterPlans(today: DateISO): Plan[] {
  return buildDemoGym({ today, memberCount: 0 }).plans;
}

/** Most of a demo gym trains mornings or evenings; some women in the ladies' slot; a few unset. */
function demoBatch(i: number, female: boolean): string | null {
  const slot = i % 10;
  if (slot < 4) return 'Morning 6-8';
  if (slot < 8) return 'Evening 6-9';
  if (slot === 8) return female ? 'Ladies 11-12' : 'Morning 6-8';
  return null;
}
