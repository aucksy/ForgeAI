// F103 / T77: the entry-machine core (crm/machines/entryMachine.ts). Pure; TZ is Asia/Kolkata (vitest.config).
import { describe, expect, it } from 'vitest';

import {
  allowedOn,
  applyResult,
  cleanMemberNo,
  dayAt,
  enqueue,
  epochToLocal,
  judgePunches,
  localToEpoch,
  MAX_TRIES,
  nextMemberNo,
  nightlyChanges,
  RESEND_AFTER_MS,
  resultWords,
  syncCommands,
  takeForPoll,
  visitsFrom,
  ZK_AC_CAPS,
  ZK_TA_CAPS,
  type MemberAccess,
  type Punch,
  type QueuedCommand,
} from '../../../src/crm/machines/entryMachine';

const IST = 330;
const punch = (memberNo: string, local: string, allowed = true): Punch => ({
  memberNo, localTime: local, at: localToEpoch(local, IST)!, allowed, verify: 'finger', reason: allowed ? null : 'event 27',
});

describe('machine local time (IST, no zone on the machine)', () => {
  it('reads 07:15 on an Indian machine as 01:45 UTC', () => {
    expect(localToEpoch('2026-11-06 07:15:30', IST)).toBe(Date.UTC(2026, 10, 6, 1, 45, 30));
  });
  it('a 00:30 punch belongs to that day in India, not the day before (UTC)', () => {
    const at = localToEpoch('2026-11-07 00:30:00', IST)!;
    expect(new Date(at).toISOString().slice(0, 10)).toBe('2026-11-06'); // UTC says yesterday
    expect(dayAt(at, IST)).toBe('2026-11-07');
  });
  it('23:59 stays on its own day', () => {
    expect(dayAt(localToEpoch('2026-11-06 23:59:59', IST)!, IST)).toBe('2026-11-06');
  });
  it('round-trips to the text a machine expects', () => {
    expect(epochToLocal(Date.UTC(2026, 10, 6, 1, 45, 30), IST)).toBe('2026-11-06 07:15:30');
  });
  it('refuses times that are not real', () => {
    for (const bad of ['2026-02-30 10:00:00', '2026-11-06 24:00:00', '2026-11-06 10:61:00', 'yesterday', '', '2026-11-06']) {
      expect(localToEpoch(bad, IST)).toBeNull();
    }
  });
  it('a nonsense offset falls back to India', () => {
    expect(localToEpoch('2026-11-06 07:15:30', 99999)).toBe(localToEpoch('2026-11-06 07:15:30', IST));
  });
});

describe('judging punches', () => {
  const lookup = new Map([['1001', 'mem-ravi'], ['1002', 'mem-priya']]);

  it('a known number becomes a visit on the India day', () => {
    const [o] = judgePunches([punch('1001', '2026-11-06 06:58:00')], lookup, new Map(), IST);
    expect(o).toMatchObject({ kind: 'visit', memberId: 'mem-ravi', visitedOn: '2026-11-06' });
  });
  it('an unknown number is kept as "unknown member", never dropped', () => {
    const out = judgePunches([punch('4321', '2026-11-06 06:58:00')], lookup, new Map(), IST);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'unknown-member', visitedOn: '2026-11-06' });
  });
  it('a second punch within 2 minutes is a repeat; at 2 minutes it is a new entry', () => {
    const out = judgePunches(
      [punch('1001', '2026-11-06 07:00:00'), punch('1001', '2026-11-06 07:01:59'), punch('1001', '2026-11-06 07:04:00')],
      lookup, new Map(), IST,
    );
    expect(out.map((o) => o.kind)).toEqual(['visit', 'repeat', 'visit']);
  });
  it('a repeat is judged against what the server already holds', () => {
    const held = new Map([['1001', localToEpoch('2026-11-06 07:00:00', IST)!]]);
    expect(judgePunches([punch('1001', '2026-11-06 07:00:30')], lookup, held, IST)[0]!.kind).toBe('repeat');
  });
  it('the exact same punch sent again is a repeat', () => {
    const held = new Map([['1001', localToEpoch('2026-11-06 07:00:00', IST)!]]);
    expect(judgePunches([punch('1001', '2026-11-06 07:00:00')], lookup, held, IST)[0]!.kind).toBe('repeat');
  });
  it('a refusal makes no visit, and the let-in right after it still counts', () => {
    const out = judgePunches([punch('1002', '2026-11-06 07:00:00', false), punch('1002', '2026-11-06 07:00:20')], lookup, new Map(), IST);
    expect(out.map((o) => o.kind)).toEqual(['refused', 'visit']);
  });
  it('an out-of-order batch is judged oldest first', () => {
    const out = judgePunches([punch('1001', '2026-11-06 07:01:00'), punch('1001', '2026-11-06 07:00:00')], lookup, new Map(), IST);
    expect(out.map((o) => [o.kind, o.punch.localTime])).toEqual([['visit', '2026-11-06 07:00:00'], ['repeat', '2026-11-06 07:01:00']]);
  });
});

describe('visits from punches', () => {
  const lookup = new Map([['1001', 'mem-ravi']]);
  it('morning and evening the same day = one visit, the morning time kept', () => {
    const out = judgePunches([punch('1001', '2026-11-06 18:00:00'), punch('1001', '2026-11-06 06:30:00')], lookup, new Map(), IST);
    const v = visitsFrom(out, 'm-front');
    expect(v).toEqual([{
      id: 'mem-ravi:2026-11-06', memberId: 'mem-ravi', visitedOn: '2026-11-06',
      checkedInAt: localToEpoch('2026-11-06 06:30:00', IST), source: 'machine', machineId: 'm-front',
    }]);
  });
  it('a late-night and an after-midnight punch are two days', () => {
    const out = judgePunches([punch('1001', '2026-11-06 23:58:00'), punch('1001', '2026-11-07 00:05:00')], lookup, new Map(), IST);
    expect(visitsFrom(out, 'm').map((v) => v.visitedOn)).toEqual(['2026-11-06', '2026-11-07']);
  });
  it('unknown members and refusals make no visit', () => {
    const out = judgePunches([punch('9', '2026-11-06 07:00:00'), punch('1001', '2026-11-06 07:00:00', false)], lookup, new Map(), IST);
    expect(visitsFrom(out, 'm')).toEqual([]);
  });
});

describe('the command queue', () => {
  const q = (id: number, command: QueuedCommand['command'], over: Partial<QueuedCommand> = {}): QueuedCommand => ({
    id, machineId: 'm', command, status: 'pending', tries: 0, createdAt: id, sentAt: null, doneAt: null, result: null, ...over,
  });
  const up = (no: string, active = true) => ({ type: 'upsert_member' as const, memberNo: no, name: 'X', active, validFrom: null, validTo: null });

  it('a newer command for the same member replaces a pending one', () => {
    const queue = enqueue([q(1, up('1001'))], q(2, { type: 'remove_member', memberNo: '1001' }));
    expect(queue.map((x) => x.id)).toEqual([2]);
  });
  it('a command already sent is kept: the new one follows it', () => {
    const queue = enqueue([q(1, up('1001'), { status: 'sent', sentAt: 1 })], q(2, { type: 'remove_member', memberNo: '1001' }));
    expect(queue.map((x) => x.id)).toEqual([1, 2]);
  });
  it('other members and other machines are untouched', () => {
    const queue = enqueue([q(1, up('1002')), q(3, up('1001'), { machineId: 'other' })], q(2, up('1001')));
    expect(queue.map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it('set_time is not queued twice', () => {
    const queue = enqueue([q(1, { type: 'set_time', at: 1 })], q(2, { type: 'set_time', at: 2 }));
    expect(queue.map((x) => x.id)).toEqual([2]);
  });
  it('a poll hands out pending oldest first and marks them sent', () => {
    const r = takeForPoll([q(2, up('1002')), q(1, up('1001'))], 'm', 1000);
    expect(r.send.map((x) => [x.id, x.status, x.tries, x.sentAt])).toEqual([[1, 'sent', 1, 1000], [2, 'sent', 1, 1000]]);
    expect(r.queue.every((x) => x.status === 'sent')).toBe(true);
  });
  it('a poll hands out at most 20; the rest wait for the next poll', () => {
    const many = Array.from({ length: 45 }, (_, i) => q(i + 1, up(String(1001 + i))));
    const first = takeForPoll(many, 'm', 1000);
    expect(first.send).toHaveLength(20);
    const second = takeForPoll(first.queue, 'm', 2000);
    expect(second.send.map((x) => x.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 21));
  });
  it('a sent command with no answer for 10 minutes is sent again', () => {
    const sent = takeForPoll([q(1, up('1001'))], 'm', 0).queue;
    expect(takeForPoll(sent, 'm', RESEND_AFTER_MS - 1).send).toEqual([]);
    expect(takeForPoll(sent, 'm', RESEND_AFTER_MS).send.map((x) => x.tries)).toEqual([2]);
  });
  it(`after ${MAX_TRIES} unanswered sends it becomes an error`, () => {
    let queue = [q(1, up('1001'))];
    let t = 0;
    for (let i = 0; i < MAX_TRIES; i += 1) {
      queue = takeForPoll(queue, 'm', t).queue;
      t += RESEND_AFTER_MS;
    }
    const r = takeForPoll(queue, 'm', t);
    expect(r.send).toEqual([]);
    expect(r.queue[0]).toMatchObject({ status: 'error', result: 'NO_ANSWER' });
  });
  it('answers: 0 = done, anything else = error; strangers and repeats change nothing', () => {
    const sent = takeForPoll([q(1, up('1001')), q(2, up('1002'))], 'm', 0).queue;
    let queue = applyResult(sent, 'm', 1, '0', 5);
    queue = applyResult(queue, 'm', 2, '-1004', 5);
    queue = applyResult(queue, 'm', 1, '-1002', 6); // late second answer: ignored
    queue = applyResult(queue, 'other', 2, '0', 6); // another machine: ignored
    queue = applyResult(queue, 'm', 99, '0', 6); // not ours: ignored
    expect(queue.map((x) => [x.status, x.result])).toEqual([['done', '0'], ['error', '-1004']]);
    expect(resultWords('-1004')).toBe('This machine cannot do that');
  });
});

describe('member rules out: sale, renewal, pause, lapse', () => {
  const base: MemberAccess = {
    memberNo: '1001', name: 'Ravi Kumar', coversFrom: '2026-10-01', coversUntil: '2026-11-30',
    pausedUntil: null, passMember: false, archived: false,
  };

  it('who may come in', () => {
    expect(allowedOn(base, '2026-11-30')).toBe(true);
    expect(allowedOn(base, '2026-12-01')).toBe(false);
    expect(allowedOn(base, '2026-09-30')).toBe(false);
    expect(allowedOn({ ...base, pausedUntil: '2026-11-10' }, '2026-11-10')).toBe(false);
    expect(allowedOn({ ...base, pausedUntil: '2026-11-10' }, '2026-11-11')).toBe(true);
    expect(allowedOn({ ...base, coversUntil: null, passMember: true }, '2026-11-11')).toBe(true);
    expect(allowedOn({ ...base, archived: true }, '2026-11-11')).toBe(false);
  });

  it('T&A machine (no end date): a sale adds them, with no dates', () => {
    expect(syncCommands(base, ZK_TA_CAPS, '2026-11-06')).toEqual([
      { type: 'upsert_member', memberNo: '1001', name: 'Ravi Kumar', active: true, validFrom: null, validTo: null },
    ]);
  });
  it('T&A machine: a lapse or a pause removes them', () => {
    expect(syncCommands(base, ZK_TA_CAPS, '2026-12-01')).toEqual([{ type: 'remove_member', memberNo: '1001' }]);
    expect(syncCommands({ ...base, pausedUntil: '2026-11-20' }, ZK_TA_CAPS, '2026-11-06')).toEqual([{ type: 'remove_member', memberNo: '1001' }]);
  });
  it('a machine that holds dates always gets the dates, switched off while paused', () => {
    expect(syncCommands(base, ZK_AC_CAPS, '2026-11-06')).toEqual([
      { type: 'upsert_member', memberNo: '1001', name: 'Ravi Kumar', active: true, validFrom: '2026-10-01', validTo: '2026-11-30' },
    ]);
    expect(syncCommands({ ...base, pausedUntil: '2026-11-20' }, ZK_AC_CAPS, '2026-11-06')[0]).toMatchObject({ active: false });
  });
  it('a renewal sends the new end date', () => {
    expect(syncCommands({ ...base, coversUntil: '2027-02-28' }, ZK_AC_CAPS, '2026-11-06')[0]).toMatchObject({ validTo: '2027-02-28' });
  });
  it('archived = removed from every machine', () => {
    expect(syncCommands({ ...base, archived: true }, ZK_AC_CAPS, '2026-11-06')).toEqual([{ type: 'remove_member', memberNo: '1001' }]);
  });
  it('a member with no usable number sends nothing', () => {
    expect(syncCommands({ ...base, memberNo: 'abc' }, ZK_TA_CAPS, '2026-11-06')).toEqual([]);
  });
  it('the nightly sweep touches only members whose right to come in changed overnight', () => {
    const members: MemberAccess[] = [
      base, // still fine
      { ...base, memberNo: '1002', coversUntil: '2026-11-05' }, // ended last night
      { ...base, memberNo: '1003', coversFrom: '2026-11-06' }, // starts today
      { ...base, memberNo: '1004', pausedUntil: '2026-11-05' }, // pause ended
      { ...base, memberNo: '1005', coversUntil: '2026-10-01' }, // lapsed long ago: already removed
    ];
    expect(nightlyChanges(members, ZK_TA_CAPS, '2026-11-06').map((c) => [c.type, 'memberNo' in c ? c.memberNo : ''])).toEqual([
      ['remove_member', '1002'], ['upsert_member', '1003'], ['upsert_member', '1004'],
    ]);
  });
});

describe('member numbers', () => {
  it('cleans what a person types', () => {
    expect(cleanMemberNo(' 0042 ')).toBe('42');
    expect(cleanMemberNo('0')).toBeNull();
    expect(cleanMemberNo('12a')).toBeNull();
    expect(cleanMemberNo('1234567890')).toBeNull();
  });
  it('the next number starts at 1001 and never reuses one', () => {
    expect(nextMemberNo([])).toBe('1001');
    expect(nextMemberNo(['5', '1001', '1007', 'junk'])).toBe('1008');
  });
});
