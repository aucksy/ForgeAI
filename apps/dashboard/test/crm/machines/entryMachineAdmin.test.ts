// F103 / T77 step 2: entry machines in the admin app (crm/machines/entryMachineAdmin.ts, shop/entryMachinesApi.ts,
// machines/accessChanges.ts, supabase/migrations/0059). Pure rules, the screen's states, the server read and the
// "not ready" answer, and the migration's locks. TZ is Asia/Kolkata (vitest.config).
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import { memberIdsOf, noteAccessChange, onAccessChange, takeAccessChanges } from '../../../src/crm/machines/accessChanges';
import { allowedOn, nightlyChanges, ZK_AC_CAPS, ZK_TA_CAPS } from '../../../src/crm/machines/entryMachine';
import {
  BRANDS,
  ENTRY_SERVER_ADDRESS,
  ENTRY_WORDS,
  checkMachineNumber,
  checkNewMachine,
  clockWords,
  commandsForMembers,
  defaultMachineNumber,
  enrolLine,
  entryErrorWords,
  entryScreenView,
  machineRowView,
  machineStatus,
  memberAccess,
  numbersToGive,
  ownMemberNumber,
  setupSteps,
  sweepCommands,
  type MachineRow,
  type MachineTarget,
} from '../../../src/crm/machines/entryMachineAdmin';
import {
  addEntryMachine,
  entryServer,
  getEntryMachines,
  overviewFrom,
  queueMachineCommands,
  resetEntryServerForTest,
} from '../../../src/crm/shop/entryMachinesApi';
import { makeMember, makeMembership } from '../fixtures';

const TODAY = '2026-11-06';
/** 6 Nov 2026, 10:00 am India time. */
const NOW = Date.parse('2026-11-06T10:00:00+05:30');
const noName = () => null;

function row(over: Partial<MachineRow> = {}): MachineRow {
  return {
    id: 'mac-1',
    name: 'Front door',
    family: 'zk-adms',
    serial: 'CJDE231560123',
    firmware: 'ta',
    caps: ZK_TA_CAPS,
    paused: false,
    lastSeenAt: NOW - 30_000,
    sweptOn: TODAY,
    refusedToday: 0,
    unknownToday: 0,
    lastRefused: null,
    ...over,
  };
}

const TA: MachineTarget = { id: 'mac-1', caps: ZK_TA_CAPS, paused: false };
const AC: MachineTarget = { id: 'mac-2', caps: ZK_AC_CAPS, paused: false };

// ---------------------------------------------------------------- the screen's states

describe('entry machines screen states', () => {
  it('not online: says the gym must be online, nothing else', () => {
    const v = entryScreenView({ state: 'off' }, NOW, TODAY, noName);
    expect(v).toMatchObject({ kind: 'message', title: ENTRY_WORDS.offTitle, retry: false });
  });

  it('server not ready (0059 missing): says so plainly, offers no Add button, never a pretend list', () => {
    const v = entryScreenView({ state: 'missing' }, NOW, TODAY, noName);
    expect(v.kind).toBe('message');
    if (v.kind !== 'message') return;
    expect(v.title).toBe('Entry machines are not ready for your gym yet');
    expect(v.body).toContain('Nothing you do here is saved');
    expect(v.testId).toBe('entry-not-ready');
    expect(v).not.toHaveProperty('canAdd');
  });

  it('a failed read shows the reason and Try again', () => {
    const v = entryScreenView({ state: 'error', message: 'No internet.' }, NOW, TODAY, noName);
    expect(v).toMatchObject({ kind: 'message', body: 'No internet.', retry: true });
  });

  it('no machines: the owner gets Add a machine; the desk is told only the owner can', () => {
    expect(entryScreenView({ state: 'ready', canEdit: true, machines: [] }, NOW, TODAY, noName)).toMatchObject({
      kind: 'empty',
      title: 'No entry machines yet',
      canAdd: true,
    });
    const desk = entryScreenView({ state: 'ready', canEdit: false, machines: [] }, NOW, TODAY, noName);
    expect(desk).toMatchObject({ kind: 'empty', canAdd: false });
    if (desk.kind === 'empty') expect(desk.body).toContain(ENTRY_WORDS.ownerOnly);
  });

  it('one online machine: Online, last seen today, no refusal lines', () => {
    const v = entryScreenView({ state: 'ready', canEdit: true, machines: [row()] }, NOW, TODAY, noName);
    expect(v.kind).toBe('list');
    if (v.kind !== 'list') return;
    const r = v.rows[0]!;
    expect(r).toMatchObject({ status: 'online', statusWords: 'Online', tone: 'good', brand: 'eSSL / ZKTeco', serial: 'CJDE231560123' });
    expect(r.statusLine).toBe('Last seen today at 9:59 am');
    expect(r.refusedLine).toBeNull();
    expect(r.lastRefusedLine).toBeNull();
    expect(r.unknownLine).toBeNull();
  });

  it('one offline machine: Offline, when it last called and what to check', () => {
    const seen = Date.parse('2026-11-05T21:02:00+05:30');
    const r = machineRowView(row({ lastSeenAt: seen }), NOW, TODAY, noName);
    expect(r).toMatchObject({ status: 'offline', statusWords: 'Offline', tone: 'critical' });
    expect(r.statusLine).toBe('Last seen yesterday at 9:02 pm. Check the machine has internet.');
    // Exactly 3 minutes is still Online; one second more is not.
    expect(machineStatus({ lastSeenAt: NOW - 180_000 }, NOW)).toBe('online');
    expect(machineStatus({ lastSeenAt: NOW - 181_000 }, NOW)).toBe('offline');
  });

  it('a machine that never called: Not connected yet, with our address', () => {
    const r = machineRowView(row({ lastSeenAt: null }), NOW, TODAY, noName);
    expect(r).toMatchObject({ status: 'never', statusWords: 'Not connected yet', tone: 'muted' });
    expect(r.statusLine).toContain(ENTRY_SERVER_ADDRESS);
  });

  it('a refused entry: the count, and the last one with the member’s name and time', () => {
    const at = Date.parse('2026-11-06T07:15:00+05:30');
    const r = machineRowView(row({ refusedToday: 2, unknownToday: 1, lastRefused: { memberNo: '1007', at } }), NOW, TODAY, (no) =>
      no === '1007' ? 'Asha Verma' : null,
    );
    expect(r.refusedLine).toBe('Refused today: 2');
    expect(r.lastRefusedLine).toBe('Last refused: number 1007 (Asha Verma) at 7:15 am');
    expect(r.unknownLine).toBe('Numbers MettleUp does not know, today: 1');
    // A number nobody has: no name in brackets.
    expect(machineRowView(row({ refusedToday: 1, lastRefused: { memberNo: '42', at } }), NOW, TODAY, noName).lastRefusedLine).toBe(
      'Last refused: number 42 at 7:15 am',
    );
  });

  it('the desk sees the list but no Add or Remove', () => {
    const v = entryScreenView({ state: 'ready', canEdit: false, machines: [row()] }, NOW, TODAY, noName);
    expect(v).toMatchObject({ kind: 'list', canAdd: false, note: ENTRY_WORDS.ownerOnly });
  });

  it('clock words: midnight and noon', () => {
    expect(clockWords(Date.parse('2026-11-06T00:05:00+05:30'))).toBe('12:05 am');
    expect(clockWords(Date.parse('2026-11-06T12:30:00+05:30'))).toBe('12:30 pm');
  });

  it('no banned member words anywhere on the screen', () => {
    const all = JSON.stringify([ENTRY_WORDS, setupSteps(), BRANDS]);
    expect(all).not.toMatch(/\bvolume\b|\bPR\b|\bsession\b/i);
  });
});

// ---------------------------------------------------------------- add a machine

describe('add a machine', () => {
  const ok = { family: 'zk-adms', serial: ' CJDE231560123 ', name: '  Front   door ' };

  it('a good serial and name pass, trimmed', () => {
    expect(checkNewMachine(ok, [])).toEqual({ ok: true, serial: 'CJDE231560123', name: 'Front door', family: 'zk-adms' });
  });

  it('an empty name becomes "Entry machine"', () => {
    expect(checkNewMachine({ ...ok, name: '' }, [])).toMatchObject({ ok: true, name: 'Entry machine' });
  });

  it('wrong serial format: spaces inside, symbols, too long, empty', () => {
    for (const serial of ['CJDE 2315', 'CJDE#2315', 'A'.repeat(33)]) {
      expect(checkNewMachine({ ...ok, serial }, [])).toMatchObject({ ok: false, field: 'serial', message: expect.stringContaining('only letters and numbers') });
    }
    expect(checkNewMachine({ ...ok, serial: '  ' }, [])).toMatchObject({ ok: false, field: 'serial', message: expect.stringContaining('Menu > System Info') });
  });

  it('duplicate serial on this gym’s list (any letter case)', () => {
    expect(checkNewMachine({ ...ok, serial: 'cjde231560123' }, ['CJDE231560123'])).toEqual({
      ok: false,
      field: 'serial',
      message: 'This machine is already on your list.',
    });
  });

  it('a brand that is coming soon cannot be added; an unknown one asks to pick', () => {
    expect(checkNewMachine({ ...ok, family: 'hikvision' }, [])).toMatchObject({ ok: false, field: 'brand', message: expect.stringContaining('coming soon') });
    expect(checkNewMachine({ ...ok, family: 'nope' }, [])).toMatchObject({ ok: false, field: 'brand' });
    expect(BRANDS.filter((b) => b.ready).map((b) => b.label)).toEqual(['eSSL / ZKTeco']);
  });

  it('a name over 40 letters is refused', () => {
    expect(checkNewMachine({ ...ok, name: 'x'.repeat(41) }, [])).toMatchObject({ ok: false, field: 'name' });
  });

  it('the server’s refusals in plain words (a serial another gym has: duplicate)', () => {
    expect(entryErrorWords({ message: 'DUPLICATE_SERIAL' })).toContain('already added to a gym');
    expect(entryErrorWords(new Error('NUMBER_TAKEN'))).toContain('Another member already has this machine number');
    expect(entryErrorWords('OWNER_ONLY')).toBe('Only the gym owner can add or remove a machine.');
    expect(entryErrorWords('something else')).toBeNull();
  });

  it('the setup steps carry our address and port 80, in the guide’s order', () => {
    const steps = setupSteps();
    expect(steps.map((s) => s.title)).toEqual([
      'Step 1: find the serial number',
      'Step 2: point the machine to MettleUp',
      'Step 3: add the machine here',
      'Step 4: give each member their number',
    ]);
    expect(steps[1]!.lines).toContain(`Set Server Address to ${ENTRY_SERVER_ADDRESS}`);
    expect(steps[1]!.lines).toContain('Set Server Port to 80.');
  });
});

// ---------------------------------------------------------------- machine numbers

describe('machine numbers', () => {
  it('the gym’s own member number from an import is used when it is free', () => {
    expect(ownMemberNumber({ extra: { 'Member ID': '0457' } })).toBe('457');
    expect(ownMemberNumber({ extra: { 'Reg No.': '88' } })).toBe('88');
    expect(ownMemberNumber({ extra: { ID: '12' } })).toBe('12');
    // A row counter, a locker or a word is not a member number.
    expect(ownMemberNumber({ extra: { 'Sr. No.': '3' } })).toBeNull();
    expect(ownMemberNumber({ extra: { 'Locker No.': '12' } })).toBeNull();
    expect(ownMemberNumber({ extra: { 'Member ID': 'GYM-12' } })).toBeNull();
    expect(ownMemberNumber({})).toBeNull();
    expect(defaultMachineNumber({ extra: { 'Member ID': '457' } }, new Set(['1001']))).toBe('457');
  });

  it('else the next free number from 1001; a taken own number falls back too', () => {
    expect(defaultMachineNumber({}, new Set())).toBe('1001');
    expect(defaultMachineNumber({}, new Set(['1001', '1004']))).toBe('1005');
    expect(defaultMachineNumber({ extra: { 'Member ID': '1004' } }, new Set(['1004']))).toBe('1005');
  });

  it('numbers for everyone without one: oldest first, never twice, archived left out, own numbers kept', () => {
    const a = makeMember({ id: 'a', createdAt: 1 });
    const b = makeMember({ id: 'b', createdAt: 2, extra: { 'Member ID': '1002' } });
    const c = makeMember({ id: 'c', createdAt: 3 });
    const gone = makeMember({ id: 'gone', createdAt: 0, archived: true });
    const has = makeMember({ id: 'has', createdAt: 0 });
    const give = numbersToGive([c, gone, b, a, has], { has: '1001' });
    expect(give).toEqual([
      { memberId: 'a', memberNo: '1003' },
      { memberId: 'b', memberNo: '1002' },
      { memberId: 'c', memberNo: '1004' },
    ]);
    expect(new Set(give.map((g) => g.memberNo)).size).toBe(give.length);
  });

  it('the desk changes a number: good, same, wrong format, duplicate', () => {
    const numbers = { m1: '1001', m2: '1002' };
    const nameOf = (id: string) => (id === 'm2' ? 'Asha Verma' : null);
    expect(checkMachineNumber(' 1005 ', 'm1', numbers, nameOf)).toEqual({ ok: true, memberNo: '1005', same: false });
    expect(checkMachineNumber('1001', 'm1', numbers, nameOf)).toEqual({ ok: true, memberNo: '1001', same: true });
    for (const bad of ['', 'abc', '12a', '0', '1234567890', '-5', '10 01']) {
      expect(checkMachineNumber(bad, 'm1', numbers, nameOf)).toEqual({
        ok: false,
        message: 'Type a machine number from 1 to 999999999, with no letters or spaces.',
      });
    }
    expect(checkMachineNumber('1002', 'm1', numbers, nameOf)).toEqual({
      ok: false,
      message: 'Number 1002 is already Asha Verma’s. Pick another number.',
    });
    // Leading zeros are the same number on the machine.
    expect(checkMachineNumber('01002', 'm1', numbers, () => null)).toMatchObject({ ok: false, message: expect.stringContaining('another member’s') });
  });

  it('the member page line', () => {
    expect(enrolLine('1001')).toBe('Enrol this member’s finger or face on the machine with number 1001.');
  });
});

// ---------------------------------------------------------------- who may come in

describe('member access from MettleUp plans', () => {
  const m = makeMember({ id: 'm', fullName: '  Asha Verma ' });
  const term = (startsOn: string, endsOn: string, over = {}) => makeMembership({ memberId: 'm', startsOn, endsOn, ...over });

  it('a running plan, renewed back to back: covered to the end of the run', () => {
    const a = memberAccess(m, [term('2026-10-10', '2026-11-09'), term('2026-11-10', '2026-12-09')], '1001', TODAY);
    expect(a).toMatchObject({ memberNo: '1001', name: 'Asha Verma', coversFrom: '2026-10-10', coversUntil: '2026-12-09', passMember: false });
    expect(allowedOn(a, TODAY)).toBe(true);
  });

  it('a plan that ended yesterday: allowed yesterday, not today (so the sweep sees it)', () => {
    const a = memberAccess(m, [term('2026-10-06', '2026-11-05')], '1001', TODAY);
    expect(a.coversUntil).toBe('2026-11-05');
    expect(allowedOn(a, '2026-11-05')).toBe(true);
    expect(allowedOn(a, TODAY)).toBe(false);
  });

  it('a plan bought to start later; a cancelled plan; a PT pack never lets them in', () => {
    expect(memberAccess(m, [term('2026-11-10', '2026-12-09')], '1', TODAY)).toMatchObject({ coversFrom: '2026-11-10', coversUntil: '2026-12-09' });
    expect(allowedOn(memberAccess(m, [term('2026-11-01', '2026-11-30', { cancelled: true })], '1', TODAY), TODAY)).toBe(false);
    const pt = term('2026-11-01', '2026-11-30', { ptSessions: 12 });
    const lapsed = term('2026-09-01', '2026-09-30');
    expect(allowedOn(memberAccess(m, [lapsed, pt], '1', TODAY), TODAY)).toBe(false);
  });

  it('a pass member comes in with no plan; an archived member never', () => {
    expect(allowedOn(memberAccess({ ...m, passCompany: 'FITPASS' }, [], '1', TODAY), TODAY)).toBe(true);
    expect(allowedOn(memberAccess({ ...m, archived: true }, [term('2026-11-01', '2026-11-30')], '1', TODAY), TODAY)).toBe(false);
  });
});

describe('the commands queued after a sale, a freeze or an archive', () => {
  const a = makeMember({ id: 'a', fullName: 'Asha Verma' });
  const b = makeMember({ id: 'b', fullName: 'Bina Rao' });
  const plans = [makeMembership({ memberId: 'a', startsOn: '2026-11-01', endsOn: '2026-11-30' })];

  it('a sale: upsert on every machine; the dates only on a machine that can hold them', () => {
    const q = commandsForMembers(['a'], [a, b], plans, { a: '1001' }, [TA, AC], TODAY);
    expect(q).toEqual([
      { machineId: 'mac-1', command: { type: 'upsert_member', memberNo: '1001', name: 'Asha Verma', active: true, validFrom: null, validTo: null } },
      { machineId: 'mac-2', command: { type: 'upsert_member', memberNo: '1001', name: 'Asha Verma', active: true, validFrom: '2026-11-01', validTo: '2026-11-30' } },
    ]);
  });

  it('an archive: removed from every machine', () => {
    const q = commandsForMembers(['a'], [{ ...a, archived: true }], plans, { a: '1001' }, [TA], TODAY);
    expect(q).toEqual([{ machineId: 'mac-1', command: { type: 'remove_member', memberNo: '1001' } }]);
  });

  it('nothing for a member with no number, a paused machine, or no machine at all', () => {
    expect(commandsForMembers(['b'], [a, b], plans, { a: '1001' }, [TA], TODAY)).toEqual([]);
    expect(commandsForMembers(['a'], [a], plans, { a: '1001' }, [{ ...TA, paused: true }], TODAY)).toEqual([]);
    expect(commandsForMembers(['a'], [a], plans, { a: '1001' }, [], TODAY)).toEqual([]);
  });

  it('the same member noted twice is sent once', () => {
    expect(commandsForMembers(['a', 'a'], [a], plans, { a: '1001' }, [TA], TODAY)).toHaveLength(1);
  });
});

describe('the nightly sweep', () => {
  const ended = makeMember({ id: 'ended', fullName: 'Ended Yesterday' });
  const running = makeMember({ id: 'running', fullName: 'Still Running' });
  const starts = makeMember({ id: 'starts', fullName: 'Starts Today' });
  const later = makeMember({ id: 'later', fullName: 'Starts Later' });
  const lapsedLong = makeMember({ id: 'old', fullName: 'Lapsed Long Ago' });
  const members = [ended, running, starts, later, lapsedLong];
  const ms = [
    makeMembership({ memberId: 'ended', startsOn: '2026-10-06', endsOn: '2026-11-05' }),
    makeMembership({ memberId: 'running', startsOn: '2026-10-20', endsOn: '2026-11-19' }),
    makeMembership({ memberId: 'starts', startsOn: '2026-11-06', endsOn: '2026-12-05' }),
    makeMembership({ memberId: 'later', startsOn: '2026-11-20', endsOn: '2026-12-19' }),
    makeMembership({ memberId: 'old', startsOn: '2026-01-01', endsOn: '2026-01-31' }),
  ];
  const numbers = { ended: '1001', running: '1002', starts: '1003', later: '1004', old: '1005' };

  it('since yesterday: only the members whose right to come in changed (same as the core’s nightlyChanges)', () => {
    const out = sweepCommands(members, ms, numbers, TA, '2026-11-05', TODAY);
    expect(out).toEqual([
      { type: 'remove_member', memberNo: '1001' },
      { type: 'upsert_member', memberNo: '1003', name: 'Starts Today', active: true, validFrom: null, validTo: null },
    ]);
    const core = nightlyChanges(
      members.map((m) => memberAccess(m, ms.filter((x) => x.memberId === m.id), numbers[m.id as keyof typeof numbers], TODAY)),
      ZK_TA_CAPS,
      TODAY,
    );
    expect(out).toEqual(core);
  });

  it('a desk closed for days still catches a plan that ended in between', () => {
    const out = sweepCommands(members, ms, numbers, TA, '2026-11-01', TODAY);
    expect(out).toContainEqual({ type: 'remove_member', memberNo: '1001' });
  });

  it('already swept today: nothing; a paused machine: nothing', () => {
    expect(sweepCommands(members, ms, numbers, TA, TODAY, TODAY)).toEqual([]);
    expect(sweepCommands(members, ms, numbers, { ...TA, paused: true }, '2026-11-05', TODAY)).toEqual([]);
  });

  it('a machine just added: every member who may come in today, nobody removed', () => {
    const out = sweepCommands(members, ms, numbers, TA, null, TODAY);
    expect(out.map((c) => c.memberNo)).toEqual(['1002', '1003']);
    expect(out.every((c) => c.type === 'upsert_member')).toBe(true);
    // A machine that holds dates also gets the member whose plan starts later, switched off until then.
    const ac = sweepCommands(members, ms, numbers, AC, null, TODAY);
    expect(ac).toContainEqual({ type: 'upsert_member', memberNo: '1004', name: 'Starts Later', active: false, validFrom: '2026-11-20', validTo: '2026-12-19' });
  });

  it('an archived member is left to the archive itself (it queued the removal when it happened)', () => {
    expect(sweepCommands([{ ...running, archived: true }], ms, numbers, TA, '2026-11-05', TODAY)).toEqual([]);
    expect(commandsForMembers(['running'], [{ ...running, archived: true }], ms, numbers, [TA], TODAY)).toEqual([
      { machineId: 'mac-1', command: { type: 'remove_member', memberNo: '1002' } },
    ]);
  });
});

describe('the store’s "access may have changed" notes', () => {
  it('collects members and memberships, tells the job, and empties when taken', () => {
    takeAccessChanges();
    const heard = vi.fn();
    const off = onAccessChange(heard);
    noteAccessChange({ memberId: 'a' });
    noteAccessChange({ membershipId: 'ms-9' });
    noteAccessChange({ memberId: 'a' });
    expect(heard).toHaveBeenCalledTimes(3);
    const notes = takeAccessChanges();
    expect(memberIdsOf(notes, [{ id: 'ms-9', memberId: 'b' }])).toEqual(['a', 'b']);
    expect(takeAccessChanges()).toEqual([]);
    off();
    noteAccessChange({ memberId: 'c' });
    expect(heard).toHaveBeenCalledTimes(3);
    // A membership that is no longer there names nobody.
    expect(memberIdsOf(['t:gone'], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------- the server read

describe('the server', () => {
  beforeEach(() => {
    callMock.mockReset();
    resetEntryServerForTest();
  });

  it('before 0059: "missing", remembered, and no second call', async () => {
    callMock.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function public.owner_entry_machines' });
    expect(await getEntryMachines('k')).toBe('missing');
    expect(entryServer()).toBe('no');
    expect(await getEntryMachines('k')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it('no internet is thrown, not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(getEntryMachines('k')).rejects.toThrow('Failed to fetch');
    expect(entryServer()).toBe('unknown');
  });

  it('reads the list, the numbers and a refusal; drops what it cannot read', async () => {
    callMock.mockResolvedValueOnce({
      ok: true,
      canEdit: true,
      machines: [
        {
          id: 'mac-1', name: 'Front door', family: 'zk-adms', serial: 'CJDE231560123', firmware: 'ac',
          caps: { canHoldExpiry: true, canDisable: true, canOpenDoor: true, canEnrollRemotely: false, canFetchMissed: true },
          paused: false, lastSeenAt: NOW, sweptOn: '2026-11-05', refusedToday: 2, unknownToday: 0,
          lastRefused: { memberNo: '1007', at: NOW - 1000 },
        },
        { id: 7, serial: 'X' },
        null,
      ],
      numbers: { m1: '1001', m2: 'abc', m3: '0012' },
    });
    const o = await getEntryMachines('k');
    expect(entryServer()).toBe('yes');
    expect(o).not.toBe('missing');
    if (o === 'missing') return;
    expect(o.canEdit).toBe(true);
    expect(o.machines).toHaveLength(1);
    expect(o.machines[0]).toMatchObject({ firmware: 'ac', caps: ZK_AC_CAPS, sweptOn: '2026-11-05', refusedToday: 2, lastRefused: { memberNo: '1007' } });
    expect(o.numbers).toEqual({ m1: '1001' });
    expect(callMock).toHaveBeenCalledWith('owner_entry_machines', { p_key: 'k' });
  });

  it('a bare answer reads as an empty list the desk cannot edit', () => {
    expect(overviewFrom(null)).toEqual({ canEdit: false, machines: [], numbers: {} });
    expect(overviewFrom({ machines: [{ id: 'm', serial: 'S', lastSeenAt: -5, family: 'weird', name: '  ' }] }).machines[0]).toMatchObject({
      lastSeenAt: null,
      family: 'zk-adms',
      name: 'Entry machine',
      sweptOn: null,
      lastRefused: null,
    });
  });

  it('adding sends India time; queueing sends the sweep day and machines', async () => {
    callMock.mockResolvedValue('new-id');
    await addEntryMachine('k', { serial: 'S1', name: 'Front door', family: 'zk-adms' });
    expect(callMock).toHaveBeenLastCalledWith('owner_add_entry_machine', {
      p_key: 'k', p_serial: 'S1', p_name: 'Front door', p_family: 'zk-adms', p_tz_minutes: 330,
    });
    callMock.mockResolvedValue(1);
    const item = { machineId: 'mac-1', command: { type: 'remove_member' as const, memberNo: '1001' } };
    expect(await queueMachineCommands('k', [item], { day: TODAY, machineIds: ['mac-1'] })).toBe(1);
    expect(callMock).toHaveBeenLastCalledWith('owner_queue_machine_commands', {
      p_key: 'k', p_items: [item], p_sweep_day: TODAY, p_sweep_machines: ['mac-1'],
    });
    // Nothing to send and no sweep: no call at all.
    callMock.mockClear();
    expect(await queueMachineCommands('k', [], null)).toBe(0);
    expect(callMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- the migration (not applied)

describe('0059 (not applied)', () => {
  const sql = readFileSync(new URL('../../../../../supabase/migrations/0059_entry_machines_owner.sql', import.meta.url), 'utf8');

  it('is marked not applied and is additive', () => {
    expect(sql.split('\n')[0]).toContain('(NOT APPLIED)');
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/\bdrop\s+(table|function|column)\b/i);
    expect(sql).toContain('add column if not exists swept_on date');
  });

  it('only the owner adds or removes a machine; the helper is never callable from outside', () => {
    expect(sql).toMatch(/owner_add_entry_machine[\s\S]*?_owner_only_gym\(p_key\)/);
    expect(sql).toMatch(/owner_remove_entry_machine\(p_key text, p_machine uuid\)[\s\S]*?_owner_only_gym\(p_key\)/);
    expect(sql).toContain('revoke all on function public._entry_enqueue(uuid, jsonb)                                   from public, anon, authenticated;');
    expect(sql).not.toMatch(/grant execute on function public\._entry_enqueue/);
  });

  it('refuses a number another member has, a serial another gym has, and a brand that is not ready', () => {
    for (const code of ['NUMBER_TAKEN', 'DUPLICATE_SERIAL', 'NOT_YET', 'BAD_SERIAL', 'TOO_MANY']) expect(sql).toContain(`'${code}'`);
  });
});
