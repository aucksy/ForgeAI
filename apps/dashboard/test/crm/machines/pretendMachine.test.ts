// F103 / T77: a pretend eSSL / ZKTeco machine talks to the real handler (crm/machines/handler.ts)
// over the ADMS conversation, with the in-memory reference store. TZ is Asia/Kolkata (vitest.config).
import { describe, expect, it } from 'vitest';

import { localToEpoch, syncCommands, ZK_TA_CAPS, type MemberAccess } from '../../../src/crm/machines/entryMachine';
import { handleDevice, handleDeviceFetch } from '../../../src/crm/machines/handler';
import { gymWithMachine, MORNING, PretendMachine } from './pretendMachine';

describe('a full day at the door', () => {
  it('handshake, poll, punches, a command and its answer', async () => {
    const { store, machine, row } = gymWithMachine();

    const hello = await machine.handshake();
    expect(hello.status).toBe(200);
    expect(hello.body.split('\n')[0]).toBe(`GET OPTION FROM: ${row.serial}`);

    expect((await machine.poll()).body).toBe('OK'); // nothing to do yet

    const up = await machine.punch([
      ['1001', '2026-11-06 06:58:12', '1'],
      ['1002', '2026-11-06 07:03:40', '15'],
      ['1001', '2026-11-06 06:59:00', '1'], // a second press 48 s later: a repeat
      ['5555', '2026-11-06 07:05:00', '1'], // nobody we know
    ]);
    expect(up.body).toBe('OK: 4');
    expect(store.visits.map((v) => [v.memberId, v.visitedOn, v.source])).toEqual([
      ['mem-ravi', '2026-11-06', 'machine'], ['mem-priya', '2026-11-06', 'machine'],
    ]);
    expect(store.visits[0]!.checkedInAt).toBe(localToEpoch('2026-11-06 06:58:12', 330));
    expect(store.punches.map((p) => [p.memberNo, p.kind])).toEqual([
      ['1001', 'visit'], ['1002', 'visit'], ['5555', 'unknown-member'],
    ]);
    expect(row.attlogStamp).toBe('9999'); // the next handshake tells the machine what we hold

    // The owner sells Ravi a plan: the machine is told on its next poll and answers "done".
    const ravi: MemberAccess = { memberNo: '1001', name: 'Ravi Kumar', coversFrom: '2026-11-06', coversUntil: '2026-12-05', pausedUntil: null, passMember: false, archived: false };
    for (const c of syncCommands(ravi, ZK_TA_CAPS, '2026-11-06')) store.queueCommand(row.id, c, MORNING);
    const poll = await machine.poll(MORNING + 10_000);
    expect(poll.body).toBe('C:1:DATA UPDATE USERINFO PIN=1001\tName=Ravi Kumar\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0');
    expect((await machine.poll(MORNING + 20_000)).body).toBe('OK'); // not handed out twice
    expect((await machine.answer([[1, '0']], MORNING + 21_000)).body).toBe('OK');
    expect(store.queue[0]).toMatchObject({ status: 'done', result: '0' });

    expect(store.seen.get(row.id)).toMatchObject({ firmware: 'Ver 8.0.4.2-20230701', users: 12, ip: '192.168.1.201' });
    expect(machine.log.every((x) => x.reply.status === 200)).toBe(true);
  });

  it('the same upload sent again (no answer reached the machine) adds nothing', async () => {
    const { store, machine } = gymWithMachine();
    const rows = [['1001', '2026-11-06 06:58:12'], ['5555', '2026-11-06 07:05:00']] as const;
    await machine.punch(rows);
    await machine.punch(rows);
    expect(store.visits).toHaveLength(1);
    expect(store.punches).toHaveLength(2);
  });

  it('LF-only firmware reads the same as CRLF', async () => {
    const { store, row } = gymWithMachine();
    const lf = new PretendMachine(store, row.serial, '\n');
    expect((await lf.punch([['1001', '2026-11-06 06:58:12'], ['1002', '2026-11-06 06:59:12']])).body).toBe('OK: 2');
    expect(store.visits).toHaveLength(2);
  });

  it('a desk check-in earlier that day is kept; the machine adds no second visit', async () => {
    const { store, machine } = gymWithMachine();
    store.visits.push({ id: 'desk-1', gymId: 'gym-a', memberId: 'mem-ravi', visitedOn: '2026-11-06', checkedInAt: 1, source: 'desk' });
    await machine.punch([['1001', '2026-11-06 07:00:00']]);
    expect(store.visits).toHaveLength(1);
    expect(store.visits[0]!.source).toBe('desk');
  });
});

describe('who may talk to us', () => {
  it('an unregistered machine is answered politely, nothing is saved, its serial is logged', async () => {
    const { store } = gymWithMachine();
    const stranger = new PretendMachine(store, 'UNKNOWN999');
    const hello = await stranger.handshake();
    expect(hello).toMatchObject({ status: 200, body: 'OK' });
    const up = await stranger.punch([['1001', '2026-11-06 07:00:00']]);
    expect(up).toMatchObject({ status: 200, body: 'UNREGISTERED' }); // not "OK": the machine keeps its punches
    expect((await stranger.poll()).body).toBe('OK');
    expect(store.punches).toEqual([]);
    expect(store.visits).toEqual([]);
    expect(store.strangers.get('UNKNOWN999')).toMatchObject({ count: 3 });
  });

  it('once the owner registers it, the punches it kept arrive', async () => {
    const { store } = gymWithMachine();
    const late = new PretendMachine(store, 'NEWBOX01');
    expect((await late.punch([['1003', '2026-11-06 07:00:00']])).body).toBe('UNREGISTERED');
    store.addMachine({ ...store.machines[0]!, id: 'm-back', serial: 'NEWBOX01', name: 'Back door' });
    expect((await late.punch([['1003', '2026-11-06 07:00:00']])).body).toBe('OK: 1');
    expect(store.visits.map((v) => [v.memberId, v.machineId])).toEqual([['mem-arjun', 'm-back']]);
  });

  it('a machine of another gym never writes into this gym', async () => {
    const { store } = gymWithMachine();
    store.addMachine({ ...store.machines[0]!, id: 'm-b', gymId: 'gym-b', serial: 'GYMB0001' });
    await new PretendMachine(store, 'GYMB0001').punch([['1001', '2026-11-06 07:00:00']]);
    expect(store.visits).toEqual([]); // 1001 means nobody in gym B
    expect(store.punches[0]).toMatchObject({ gymId: 'gym-b', kind: 'unknown-member' });
  });

  it('a machine the owner paused is answered but nothing is saved', async () => {
    const { store, machine } = gymWithMachine({ paused: true });
    expect((await machine.punch([['1001', '2026-11-06 07:00:00']])).body).toBe('OK');
    expect(store.punches).toEqual([]);
  });

  it('bad requests: no serial, a strange serial, a wrong path, garbage bodies', async () => {
    const { store, machine } = gymWithMachine();
    expect((await handleDevice({ method: 'GET', url: '/iclock/cdata', body: '' }, store, MORNING)).body).toBe('OK');
    expect((await handleDevice({ method: 'GET', url: "/iclock/cdata?SN=x'%20or%201=1", body: '' }, store, MORNING)).body).toBe('OK');
    expect((await handleDevice({ method: 'GET', url: '/wp-admin', body: '' }, store, MORNING)).status).toBe(404);
    expect(store.strangers.size).toBe(0);
    const junk = await machine.raw('POST', `/iclock/cdata?SN=${machine.serial}&table=ATTLOG`, '\u0000ÿ garbage\r\n\t\t\r\nnot a punch');
    expect(junk).toMatchObject({ status: 200, body: 'OK: 3' }); // 3 unreadable lines, acknowledged so they are not resent forever
    expect((await machine.raw('POST', `/iclock/devicecmd?SN=${machine.serial}`, 'nonsense')).body).toBe('OK');
    expect((await machine.raw('POST', `/iclock/cdata?SN=${machine.serial}&table=ATTPHOTO`, 'x')).body).toBe('OK');
    expect((await machine.raw('POST', `/iclock/cdata?SN=${machine.serial}&table=OPERLOG`, 'OPLOG 4\t0\t2026-11-06 07:00:00\nUSER PIN=1001\tName=Ravi')).body).toBe('OK: 2');
    expect((await machine.raw('GET', `/iclock/ping?SN=${machine.serial}`)).body).toBe('OK');
    expect(store.punches).toEqual([]);
  });

  it('the gym server is down: "ERROR", nothing thrown, and the retry saves everything', async () => {
    const { store, machine } = gymWithMachine();
    store.failNext = true;
    const r = await machine.punch([['1001', '2026-11-06 07:00:00']]);
    expect(r).toMatchObject({ status: 200, body: 'ERROR' });
    expect((await machine.punch([['1001', '2026-11-06 07:00:00']])).body).toBe('OK: 1');
    expect(store.visits).toHaveLength(1);
  });
});

describe('commands that fail or never get an answer', () => {
  it('"not on this model" is kept as an error; no answer = sent again after 10 minutes', async () => {
    const { store, machine, row } = gymWithMachine();
    store.queueCommand(row.id, { type: 'open_door', seconds: 5 }, MORNING);
    store.queueCommand(row.id, { type: 'remove_member', memberNo: '1002' }, MORNING);
    expect((await machine.poll()).body).toBe('C:1:AC_UNLOCK\nC:2:DATA DELETE USERINFO PIN=1002');
    await machine.answer([[1, '-1004']]);
    expect((await machine.poll(MORNING + 60_000)).body).toBe('OK');
    expect((await machine.poll(MORNING + 10 * 60_000)).body).toBe('C:2:DATA DELETE USERINFO PIN=1002');
    expect(store.queue.map((q) => [q.id, q.status, q.result, q.tries])).toEqual([[1, 'error', '-1004', 1], [2, 'sent', null, 2]]);
  });
});

describe('expiry and lapse at the machine', () => {
  it('a plan that ended last night: the nightly sweep removes the member, and a renewal adds them back', async () => {
    const { store, machine, row } = gymWithMachine();
    const priya: MemberAccess = { memberNo: '1002', name: 'Priya', coversFrom: '2026-10-06', coversUntil: '2026-11-05', pausedUntil: null, passMember: false, archived: false };
    for (const c of syncCommands(priya, ZK_TA_CAPS, '2026-11-06')) store.queueCommand(row.id, c, MORNING);
    expect((await machine.poll()).body).toBe('C:1:DATA DELETE USERINFO PIN=1002');
    await machine.answer([[1, '0']]);

    // She punched before the removal reached the machine: the visit is kept (she was inside), and the
    // desk's "came in with no plan" list is where it shows (logic/cameInToday.ts).
    await machine.punch([['1002', '2026-11-06 06:45:00']]);
    expect(store.visits.map((v) => v.memberId)).toEqual(['mem-priya']);

    const renewed = { ...priya, coversFrom: '2026-11-06', coversUntil: '2026-12-05' };
    for (const c of syncCommands(renewed, ZK_TA_CAPS, '2026-11-06')) store.queueCommand(row.id, c, MORNING + 3_600_000);
    expect((await machine.poll(MORNING + 3_600_000)).body).toMatch(/^C:2:DATA UPDATE USERINFO PIN=1002\tName=Priya\t/);
  });
});

describe('time zone', () => {
  it('a punch at 00:20 India time lands on the India day, whatever the server clock says', async () => {
    const { store, machine } = gymWithMachine();
    await machine.punch([['1001', '2026-11-07 00:20:00']]);
    expect(store.visits[0]!.visitedOn).toBe('2026-11-07');
    expect(store.visits[0]!.checkedInAt).toBe(Date.UTC(2026, 10, 6, 18, 50, 0));
  });
  it('a machine set to another zone is read in its own zone', async () => {
    const { store, machine } = gymWithMachine({ tzMinutes: 240 }); // Dubai branch
    await machine.punch([['1001', '2026-11-06 23:30:00']]);
    expect(store.visits[0]!.visitedOn).toBe('2026-11-06');
    expect(store.visits[0]!.checkedInAt).toBe(Date.UTC(2026, 10, 6, 19, 30, 0));
  });
});

describe('many punches at once (the internet came back after a day)', () => {
  it('600 punches in one upload: every one judged, one visit per member per day', async () => {
    const { store, machine, row } = gymWithMachine();
    for (let n = 1; n <= 200; n += 1) store.setNumber(row.gymId, String(2000 + n), `mem-${n}`);
    const rows: [string, string][] = [];
    for (let n = 1; n <= 200; n += 1) {
      const hh = String(6 + (n % 12)).padStart(2, '0');
      rows.push([String(2000 + n), `2026-11-06 ${hh}:00:00`]); // in
      rows.push([String(2000 + n), `2026-11-06 ${hh}:00:30`]); // repeat press
      rows.push([String(2000 + n), `2026-11-06 ${hh}:59:00`]); // leaving: same day, same visit
    }
    const r = await machine.punch(rows);
    expect(r.body).toBe('OK: 600');
    expect(r.note).toContain('600 punches: 200 visits, 0 unknown, 200 repeats');
    expect(store.visits).toHaveLength(200);
    expect(store.punches).toHaveLength(400);
  });
});

describe('the Worker side (Request -> Response)', () => {
  it('reads the body as UTF-8, answers plain text', async () => {
    const { store, row } = gymWithMachine();
    const res = await handleDeviceFetch(
      new Request(`http://gate.example/iclock/cdata?SN=${row.serial}&table=ATTLOG&Stamp=1`, {
        method: 'POST', body: '1001\t2026-11-06 07:00:00\t0\t1\r\n',
      }),
      store, MORNING,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    expect(await res.text()).toBe('OK: 1');
    expect(store.visits).toHaveLength(1);
  });
});
