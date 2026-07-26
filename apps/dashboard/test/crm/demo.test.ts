import { describe, expect, it } from 'vitest';

import { buildDemoGym, demoSnapshot, starterPlans } from '../../src/crm/data/demo';
import { atRiskList, attendanceProfile, attendanceSummary } from '../../src/crm/logic/attendance';
import { diffDays, hourOfEpoch } from '../../src/crm/logic/dates';
import {
  buildMemberView,
  coverageEndsOn,
  endDateForPlan,
  needsAttentionToday,
} from '../../src/crm/logic/membership';
import { parseReceiptNo } from '../../src/crm/logic/receipts';

const TODAY = '2026-07-26';

describe('demo gym', () => {
  const snap = demoSnapshot(TODAY);

  it('is deterministic — the same gym every run', () => {
    const again = demoSnapshot(TODAY);
    expect(again.members.map((m) => m.fullName)).toEqual(snap.members.map((m) => m.fullName));
    expect(again.payments.length).toBe(snap.payments.length);
  });

  it('is dated relative to today, so it never looks stale in a demo', () => {
    const later = demoSnapshot('2027-01-15');
    const activeThen = later.memberships.filter(
      (m) => m.startsOn <= '2027-01-15' && m.endsOn >= '2027-01-15',
    );
    expect(activeThen.length).toBeGreaterThan(0);
  });

  it('builds a gym big enough to look real', () => {
    expect(snap.members.length).toBe(128);
    expect(snap.plans.length).toBe(5);
    expect(snap.memberships.length).toBeGreaterThan(snap.members.length);
    expect(snap.payments.length).toBeGreaterThan(50);
    expect(snap.visits.length).toBeGreaterThan(100);
  });

  it('gives every member a unique phone number', () => {
    const phones = new Set(snap.members.map((m) => m.phone));
    expect(phones.size).toBe(snap.members.length);
  });

  it('generates only valid Indian mobile numbers', () => {
    for (const m of snap.members) {
      expect(m.phone).toMatch(/^\+91[6-9]\d{9}$/);
    }
  });

  it('issues unique, well-formed receipt numbers', () => {
    const seen = new Set<string>();
    for (const p of snap.payments) {
      expect(parseReceiptNo(p.receiptNo)).not.toBeNull();
      expect(seen.has(p.receiptNo)).toBe(false);
      seen.add(p.receiptNo);
    }
  });

  it('numbers receipts in date order within each financial year', () => {
    // Generating member-by-member issued numbers in roster order, producing a
    // book where receipt 0003 predated 0001 — unique, but the first thing an
    // owner or their accountant would query.
    const byYear = new Map<string, { seq: number; paidOn: string }[]>();
    for (const p of snap.payments) {
      const parsed = parseReceiptNo(p.receiptNo);
      expect(parsed).not.toBeNull();
      if (!parsed) continue;
      const list = byYear.get(parsed.fy) ?? [];
      list.push({ seq: parsed.seq, paidOn: p.paidOn });
      byYear.set(parsed.fy, list);
    }

    for (const [, rows] of byYear) {
      const bySeq = [...rows].sort((a, b) => a.seq - b.seq);
      for (let i = 1; i < bySeq.length; i += 1) {
        expect(bySeq[i].paidOn >= bySeq[i - 1].paidOn).toBe(true);
      }
    }
  });

  it('timestamps a check-in inside the day it is recorded against', () => {
    // Building the timestamp from `${day}T21:15:00Z` put a 9pm visit at 02:45
    // IST the NEXT calendar day — outside the day it belongs to.
    for (const v of snap.visits) {
      const d = new Date(v.checkedInAt);
      const localDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(localDay).toBe(v.visitedOn);
    }
  });

  it('never lets a term end before it starts', () => {
    for (const m of snap.memberships) {
      expect(diffDays(m.startsOn, m.endsOn)).toBeGreaterThanOrEqual(0);
    }
  });

  it('computes every end date with the real plan rule', () => {
    const byId = new Map(snap.plans.map((p) => [p.id, p]));
    for (const m of snap.memberships) {
      const plan = byId.get(m.planId);
      expect(plan).toBeDefined();
      if (plan) expect(m.endsOn).toBe(endDateForPlan(m.startsOn, plan));
    }
  });

  it('never overlaps two terms for the same member', () => {
    // Overlapping terms would double-count revenue and make the renewal date wrong.
    const byMember = new Map<string, { startsOn: string; endsOn: string }[]>();
    for (const m of snap.memberships) {
      const list = byMember.get(m.memberId) ?? [];
      list.push(m);
      byMember.set(m.memberId, list);
    }
    for (const [, terms] of byMember) {
      const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i].startsOn > sorted[i - 1].endsOn).toBe(true);
      }
    }
  });

  it('ties every membership, payment and visit to a real member', () => {
    const memberIds = new Set(snap.members.map((m) => m.id));
    const membershipIds = new Set(snap.memberships.map((m) => m.id));
    for (const m of snap.memberships) expect(memberIds.has(m.memberId)).toBe(true);
    for (const p of snap.payments) {
      expect(memberIds.has(p.memberId)).toBe(true);
      if (p.membershipId) expect(membershipIds.has(p.membershipId)).toBe(true);
    }
    for (const v of snap.visits) expect(memberIds.has(v.memberId)).toBe(true);
  });

  it('never collects more than a term is worth', () => {
    const dueById = new Map(snap.memberships.map((m) => [m.id, m.priceP + m.joiningFeeP]));
    const paidById = new Map<string, number>();
    for (const p of snap.payments) {
      if (!p.membershipId || p.voided) continue;
      paidById.set(p.membershipId, (paidById.get(p.membershipId) ?? 0) + p.amountP);
    }
    for (const [id, paid] of paidById) {
      expect(paid).toBeLessThanOrEqual(dueById.get(id) ?? 0);
    }
  });

  it('records at most one visit per member per day', () => {
    const seen = new Set<string>();
    for (const v of snap.visits) {
      const key = `${v.memberId}|${v.visitedOn}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('only records visits on days the member’s term actually covered', () => {
    const terms = new Map<string, { startsOn: string; endsOn: string }[]>();
    for (const m of snap.memberships) {
      const list = terms.get(m.memberId) ?? [];
      list.push(m);
      terms.set(m.memberId, list);
    }
    for (const v of snap.visits) {
      const covered = (terms.get(v.memberId) ?? []).some(
        (t) => t.startsOn <= v.visitedOn && t.endsOn >= v.visitedOn,
      );
      expect(covered).toBe(true);
    }
  });

  it('produces a spread of states worth demoing, not all-active', () => {
    const states = new Map<string, number>();
    for (const member of snap.members) {
      const view = buildMemberView(
        member,
        snap.memberships.filter((m) => m.memberId === member.id),
        snap.payments,
        snap.visits.filter((v) => v.memberId === member.id),
        TODAY,
      );
      states.set(view.state, (states.get(view.state) ?? 0) + 1);
    }
    expect(states.get('active') ?? 0).toBeGreaterThan(5);
    expect(states.get('expired') ?? 0).toBeGreaterThan(5);
    expect(states.get('expiring') ?? 0).toBeGreaterThan(0);
  });

  it('leaves a real dues tail for the collections screen to show', () => {
    const withDues = snap.members.filter((member) => {
      const view = buildMemberView(
        member,
        snap.memberships.filter((m) => m.memberId === member.id),
        snap.payments,
        [],
        TODAY,
      );
      return view.outstandingP > 0;
    });
    expect(withDues.length).toBeGreaterThan(5);
  });

  it('leaves a real at-risk tail, and does not flag half the gym', () => {
    // Both directions matter. An empty at-risk list makes the screen impossible to
    // demo or verify; a list holding most of the roster means the thresholds are
    // wrong, and that is precisely the failure the research warns about — a list
    // that flags everybody is a list the owner stops opening.
    const rows = atRiskList(snap.members, snap.memberships, snap.visits, TODAY);
    const covered = snap.members.filter(
      (m) => !m.archived && coverageEndsOn(snap.memberships.filter((x) => x.memberId === m.id), TODAY) !== null,
    );

    expect(rows.length).toBeGreaterThan(3);
    expect(rows.length).toBeLessThan(covered.length / 2);
  });

  it('never puts the same member on the at-risk list and the renewals chase list', () => {
    // This assertion used to check `!r.member.archived` — which tests archival, is
    // already covered elsewhere, and cannot fail, while its comment claimed to be
    // guarding the overlap. The overlap was in fact real (members whose cover ends
    // this week are 'expiring', which both lists matched), so the one test that
    // named the invariant was the one asserting a tautology instead.
    const atRisk = new Set(
      atRiskList(snap.members, snap.memberships, snap.visits, TODAY).map((r) => r.member.id),
    );
    const chased = new Set(
      snap.members
        .filter((m) =>
          needsAttentionToday(
            buildMemberView(
              m,
              snap.memberships.filter((x) => x.memberId === m.id),
              snap.payments.filter((p) => p.memberId === m.id),
              snap.visits.filter((v) => v.memberId === m.id),
              TODAY,
            ),
          ),
        )
        .map((m) => m.id),
    );

    expect(atRisk.size).toBeGreaterThan(0);
    expect(chased.size).toBeGreaterThan(0);
    expect([...atRisk].filter((id) => chased.has(id))).toEqual([]);
  });

  it('never reports a member training more than seven times in a seven-day week', () => {
    // The rate is printed on every member's page next to their raw visit count, so
    // an impossible number there is a number the owner can see is wrong — which is
    // how it was found. Asserted over the whole roster rather than by clicking.
    const worst = snap.members
      .map((m) =>
        attendanceProfile(
          m,
          snap.memberships.filter((x) => x.memberId === m.id),
          snap.visits.filter((v) => v.memberId === m.id),
          TODAY,
        ),
      )
      .reduce((max, p) => Math.max(max, p.weeklyRate), 0);

    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(7);
  });

  it('records EVERY visit at a believable local hour', () => {
    // The previous version asserted only that the BUSIEST hour was between 6 and 21,
    // which survives the bug it named: the demo peaks at 9pm, and read in UTC that
    // shifts to 15:30 — still inside the band. Asserting every visit is what
    // actually bites, because a 6am check-in read in UTC becomes 00:30.
    const hours = snap.visits.map((v) => hourOfEpoch(v.checkedInAt));
    expect(hours.length).toBeGreaterThan(100);
    expect(hours.every((h) => h !== null && h >= 6 && h <= 21)).toBe(true);

    expect(attendanceSummary(snap.visits, '2026-06-01', TODAY).busiestHour).not.toBeNull();
  });

  it('scales down to an empty roster for the starter-plan case', () => {
    const empty = buildDemoGym({ today: TODAY, memberCount: 0 });
    expect(empty.members).toEqual([]);
    expect(empty.memberships).toEqual([]);
    expect(empty.payments).toEqual([]);
    expect(starterPlans(TODAY)).toHaveLength(5);
  });
});
