/**
 * An in-memory EntryStore (F103 / T77 step 1): the reference behaviour the gym-server functions
 * (supabase/migrations/0058_entry_machines.sql, gate_*) must match, and the store the pretend
 * machine tests run against. Not used by the admin app.
 */

import {
  applyResult,
  enqueue,
  takeForPoll,
  type MachineCommand,
  type MachineVisit,
  type PunchOutcome,
  type QueuedCommand,
} from './entryMachine';
import type { CommandAnswer } from './adms';
import type { EntryStore, SeenInfo, StoredMachine } from './handler';

export interface PunchRow {
  machineId: string;
  gymId: string;
  memberNo: string;
  memberId: string | null;
  at: number;
  localTime: string;
  kind: Exclude<PunchOutcome['kind'], 'repeat'>;
  verify: string;
  reason: string | null;
}

export interface VisitRow {
  id: string;
  gymId: string;
  memberId: string;
  visitedOn: string;
  checkedInAt: number;
  source: 'desk' | 'app' | 'import' | 'machine';
  machineId?: string;
}

export class MemoryStore implements EntryStore {
  machines: StoredMachine[] = [];
  /** gymId -> (member number -> member id) */
  numbers = new Map<string, Map<string, string>>();
  punches: PunchRow[] = [];
  visits: VisitRow[] = [];
  queue: QueuedCommand[] = [];
  strangers = new Map<string, { lastAt: number; count: number; what: string }>();
  seen = new Map<string, { at: number } & SeenInfo>();
  failNext = false;
  private nextId = 1;

  private gate(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('gym server unreachable');
    }
  }

  addMachine(m: StoredMachine): void {
    this.machines.push(m);
  }

  setNumber(gymId: string, memberNo: string, memberId: string): void {
    if (!this.numbers.has(gymId)) this.numbers.set(gymId, new Map());
    this.numbers.get(gymId)!.set(memberNo, memberId);
  }

  queueCommand(machineId: string, command: MachineCommand, now: number): QueuedCommand {
    const q: QueuedCommand = {
      id: this.nextId++, machineId, command, status: 'pending', tries: 0,
      createdAt: now, sentAt: null, doneAt: null, result: null,
    };
    this.queue = enqueue(this.queue, q);
    return q;
  }

  async machineBySerial(serial: string): Promise<StoredMachine | null> {
    this.gate();
    return this.machines.find((m) => m.serial === serial) ?? null;
  }

  async machineSeen(machineId: string, at: number, info: SeenInfo): Promise<void> {
    this.gate();
    const was = this.seen.get(machineId) ?? { at };
    const next = { ...was, at };
    for (const [k, v] of Object.entries(info)) if (v !== null && v !== undefined) (next as Record<string, unknown>)[k] = v;
    this.seen.set(machineId, next);
    const m = this.machines.find((x) => x.id === machineId);
    if (m && info.attlogStamp) m.attlogStamp = info.attlogStamp;
    if (m && info.operlogStamp) m.operlogStamp = info.operlogStamp;
  }

  async strangerSeen(serial: string, at: number, what: string): Promise<void> {
    this.gate();
    const was = this.strangers.get(serial);
    this.strangers.set(serial, { lastAt: at, count: (was?.count ?? 0) + 1, what });
  }

  async memberNos(gymId: string, nos: readonly string[]): Promise<Map<string, string>> {
    this.gate();
    const all = this.numbers.get(gymId) ?? new Map<string, string>();
    return new Map(nos.filter((n) => all.has(n)).map((n) => [n, all.get(n)!]));
  }

  async recentPunches(machineId: string, nos: readonly string[], since: number): Promise<Map<string, number>> {
    this.gate();
    const want = new Set(nos);
    const out = new Map<string, number>();
    for (const p of this.punches) {
      if (p.machineId !== machineId || !want.has(p.memberNo) || p.at < since || p.kind === 'refused') continue;
      out.set(p.memberNo, Math.max(out.get(p.memberNo) ?? 0, p.at));
    }
    return out;
  }

  async savePunches(machine: StoredMachine, outcomes: readonly PunchOutcome[], visits: readonly MachineVisit[]): Promise<void> {
    this.gate();
    for (const o of outcomes) {
      if (o.kind === 'repeat') continue;
      const dup = this.punches.some((p) => p.machineId === machine.id && p.memberNo === o.punch.memberNo && p.at === o.punch.at);
      if (dup) continue;
      this.punches.push({
        machineId: machine.id, gymId: machine.gymId, memberNo: o.punch.memberNo,
        memberId: o.kind === 'unknown-member' ? null : o.memberId, at: o.punch.at, localTime: o.punch.localTime,
        kind: o.kind, verify: o.punch.verify, reason: o.punch.reason,
      });
    }
    for (const v of visits) {
      const had = this.visits.find((x) => x.gymId === machine.gymId && x.memberId === v.memberId && x.visitedOn === v.visitedOn);
      if (!had) this.visits.push({ ...v, gymId: machine.gymId });
      else if (had.source === 'machine' && v.checkedInAt < had.checkedInAt) had.checkedInAt = v.checkedInAt;
    }
  }

  async takeCommands(machineId: string, now: number): Promise<QueuedCommand[]> {
    this.gate();
    const r = takeForPoll(this.queue, machineId, now);
    this.queue = r.queue;
    return r.send;
  }

  async commandResults(machineId: string, answers: readonly CommandAnswer[], now: number): Promise<void> {
    this.gate();
    for (const a of answers) this.queue = applyResult(this.queue, machineId, a.id, a.code, now);
  }
}
