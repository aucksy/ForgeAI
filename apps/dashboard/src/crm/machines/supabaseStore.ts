/**
 * The gym-server EntryStore (F103 / T77 step 1): each method is one call to a gate_* function
 * (supabase/migrations/0058_entry_machines.sql, NOT APPLIED). Used only by the gate Worker
 * (deploy/gate/worker.ts, NOT DEPLOYED), with its secret key SUPABASE_GATE_KEY: a Supabase secret key
 * named "gate", which reaches the database as service_role, the only role the gate_* functions are
 * granted to. The key is never logged and never sent to a machine.
 */

import type { CommandAnswer } from './adms';
import {
  isValidCommand,
  safeTzMinutes,
  type MachineVisit,
  type PunchOutcome,
  type QueuedCommand,
} from './entryMachine';
import type { EntryStore, SeenInfo, StoredMachine } from './handler';

export interface GateEnv {
  SUPABASE_URL: string;
  SUPABASE_GATE_KEY: string;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class SupabaseStore implements EntryStore {
  private readonly env: GateEnv;
  private readonly fetchImpl: FetchLike;

  constructor(env: GateEnv, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  /** POST /rest/v1/rpc/gate_<fn>. Throws on any failure: the handler answers "ERROR" and the machine retries. */
  private async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    if (!/^gate_[a-z_]+$/.test(fn)) throw new Error('bad function');
    const res = await this.fetchImpl(`${this.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: this.env.SUPABASE_GATE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${fn} answered ${res.status}`);
    if (!text) return null;
    return JSON.parse(text) as unknown;
  }

  async machineBySerial(serial: string): Promise<StoredMachine | null> {
    const r = (await this.rpc('gate_machine', { p_serial: serial })) as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null;
    const caps = (r.caps ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      gymId: String(r.gymId),
      family: 'zk-adms',
      serial: String(r.serial),
      name: String(r.name ?? ''),
      firmware: r.firmware === 'ac' ? 'ac' : 'ta',
      caps: {
        canHoldExpiry: caps.canHoldExpiry === true,
        canDisable: caps.canDisable === true,
        canOpenDoor: caps.canOpenDoor === true,
        canEnrollRemotely: caps.canEnrollRemotely === true,
        canFetchMissed: caps.canFetchMissed === true,
      },
      tzMinutes: safeTzMinutes(r.tzMinutes),
      paused: r.paused === true,
      attlogStamp: typeof r.attlogStamp === 'string' ? r.attlogStamp : null,
      operlogStamp: typeof r.operlogStamp === 'string' ? r.operlogStamp : null,
    };
  }

  async machineSeen(machineId: string, _at: number, info: SeenInfo): Promise<void> {
    await this.rpc('gate_seen', { p_machine: machineId, p_info: info });
  }

  async strangerSeen(serial: string, _at: number, what: string): Promise<void> {
    await this.rpc('gate_stranger', { p_serial: serial, p_what: what });
  }

  async memberNos(gymId: string, nos: readonly string[]): Promise<Map<string, string>> {
    const r = (await this.rpc('gate_member_nos', { p_gym: gymId, p_nos: nos })) as Record<string, unknown> | null;
    return new Map(Object.entries(r ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }

  async recentPunches(machineId: string, nos: readonly string[], since: number): Promise<Map<string, number>> {
    const r = (await this.rpc('gate_recent_punches', { p_machine: machineId, p_nos: nos, p_since_ms: Math.floor(since) })) as Record<string, unknown> | null;
    return new Map(Object.entries(r ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number'));
  }

  async savePunches(machine: StoredMachine, outcomes: readonly PunchOutcome[], visits: readonly MachineVisit[]): Promise<void> {
    const punches = outcomes
      .filter((o) => o.kind !== 'repeat')
      .map((o) => ({
        memberNo: o.punch.memberNo,
        memberId: o.kind === 'unknown-member' ? null : o.memberId,
        at: o.punch.at,
        localTime: o.punch.localTime,
        kind: o.kind,
        verify: o.punch.verify,
        reason: o.punch.reason,
      }));
    await this.rpc('gate_save_punches', {
      p_machine: machine.id,
      p_punches: punches,
      p_visits: visits.map((v) => ({ memberId: v.memberId, visitedOn: v.visitedOn, checkedInAt: v.checkedInAt })),
    });
  }

  async takeCommands(machineId: string, now: number): Promise<QueuedCommand[]> {
    const r = await this.rpc('gate_take_commands', { p_machine: machineId });
    if (!Array.isArray(r)) return [];
    const out: QueuedCommand[] = [];
    for (const x of r as Record<string, unknown>[]) {
      const id = Number(x.id);
      if (!Number.isSafeInteger(id) || id <= 0 || !isValidCommand(x.command)) continue;
      out.push({
        id, machineId, command: x.command, status: 'sent', tries: Number(x.tries) || 1,
        createdAt: now, sentAt: now, doneAt: null, result: null,
      });
    }
    return out;
  }

  async commandResults(machineId: string, answers: readonly CommandAnswer[]): Promise<void> {
    await this.rpc('gate_command_results', { p_machine: machineId, p_answers: answers.map((a) => ({ id: a.id, code: a.code })) });
  }
}
