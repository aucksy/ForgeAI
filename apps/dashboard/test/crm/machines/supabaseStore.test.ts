// F103 / T77: the gym-server store (crm/machines/supabaseStore.ts) with a stand-in server, and the
// pretend machine talking through it. Nothing leaves this computer.
import { describe, expect, it } from 'vitest';

import { handleDevice } from '../../../src/crm/machines/handler';
import { isValidCommand } from '../../../src/crm/machines/entryMachine';
import { SupabaseStore } from '../../../src/crm/machines/supabaseStore';
import { visitSourceTag } from '../../../src/crm/logic/attendance';
import { MORNING } from './pretendMachine';

type Call = { fn: string; args: Record<string, unknown>; key: string };

function fakeServer(answers: Record<string, unknown>, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const fn = url.split('/rpc/')[1]!;
    calls.push({ fn, args: JSON.parse(init.body) as Record<string, unknown>, key: init.headers.apikey! });
    const a = answers[fn];
    return { ok: status < 400, status, text: async () => (a === undefined ? '' : JSON.stringify(a)) };
  };
  return { calls, store: new SupabaseStore({ SUPABASE_URL: 'https://db.test', SUPABASE_GATE_KEY: 'gate-key' }, fetchImpl) };
}

const MACHINE = {
  id: 'm-1', gymId: 'g-1', family: 'zk-adms', serial: 'SER1', name: 'Front', firmware: 'ta',
  caps: { canHoldExpiry: false, canDisable: false, canOpenDoor: false, canEnrollRemotely: false, canFetchMissed: true },
  tzMinutes: 330, paused: false, attlogStamp: null, operlogStamp: null,
};

describe('the gym-server store', () => {
  it('a punch upload makes the right gate_* calls with the gate key', async () => {
    const { calls, store } = fakeServer({ gate_machine: MACHINE, gate_member_nos: { '1001': 'mem-ravi' }, gate_recent_punches: {}, gate_save_punches: { punches: 2, visits: 1 } });
    const r = await handleDevice({ method: 'POST', url: '/iclock/cdata?SN=SER1&table=ATTLOG&Stamp=77', body: '1001\t2026-11-06 07:00:00\t0\t1\r\n5555\t2026-11-06 07:01:00\t0\t1\r\n' }, store, MORNING);
    expect(r.body).toBe('OK: 2');
    expect(calls.map((c) => c.fn)).toEqual(['gate_machine', 'gate_member_nos', 'gate_recent_punches', 'gate_save_punches', 'gate_seen']);
    expect(calls.every((c) => c.key === 'gate-key')).toBe(true);
    const save = calls[3]!.args;
    expect(save.p_visits).toEqual([{ memberId: 'mem-ravi', visitedOn: '2026-11-06', checkedInAt: Date.UTC(2026, 10, 6, 1, 30) }]);
    expect((save.p_punches as { kind: string }[]).map((p) => p.kind)).toEqual(['visit', 'unknown-member']);
    expect(calls[4]!.args.p_info).toMatchObject({ attlogStamp: '77' });
  });

  it('a bad command row from storage is skipped, the good ones go out', async () => {
    const { store } = fakeServer({
      gate_machine: MACHINE,
      gate_take_commands: [
        { id: 5, command: { type: 'set_time' }, tries: 1 }, // no time: skipped
        { id: 6, command: { type: 'remove_member', memberNo: '1002' }, tries: 1 },
      ],
    });
    expect((await handleDevice({ method: 'GET', url: '/iclock/getrequest?SN=SER1', body: '' }, store, MORNING)).body)
      .toBe('C:6:DATA DELETE USERINFO PIN=1002');
  });

  it('the server down or answering an error: the machine is told "ERROR" and keeps its data', async () => {
    const { store } = fakeServer({}, 503);
    expect((await handleDevice({ method: 'GET', url: '/iclock/cdata?SN=SER1', body: '' }, store, MORNING)).body).toBe('ERROR');
  });

  it('an unknown serial: null from the server, logged as a stranger', async () => {
    const { calls, store } = fakeServer({ gate_machine: null });
    expect((await handleDevice({ method: 'GET', url: '/iclock/getrequest?SN=NEW1', body: '' }, store, MORNING)).body).toBe('OK');
    expect(calls.map((c) => [c.fn, c.args.p_serial])).toEqual([['gate_machine', 'NEW1'], ['gate_stranger', 'NEW1']]);
  });
});

describe('small pieces', () => {
  it('command rows are checked before sending', () => {
    expect(isValidCommand({ type: 'remove_member', memberNo: '1002' })).toBe(true);
    expect(isValidCommand({ type: 'remove_member', memberNo: '0042' })).toBe(false);
    expect(isValidCommand({ type: 'upsert_member', memberNo: '1', name: 'A', active: true, validFrom: '2026-02-30', validTo: null })).toBe(false);
    expect(isValidCommand({ type: 'set_time', at: Number.NaN })).toBe(false);
    expect(isValidCommand({ type: 'fetch_missed_entries', from: 10, to: 5 })).toBe(false);
    expect(isValidCommand({ type: 'format_disk' })).toBe(false);
    expect(isValidCommand(null)).toBe(false);
  });
  it('the register shows "Machine" beside a machine entry', () => {
    expect(visitSourceTag('machine')).toBe('Machine');
    expect(visitSourceTag('desk')).toBeNull();
  });
});
