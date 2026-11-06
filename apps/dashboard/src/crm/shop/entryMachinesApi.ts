/**
 * F103 / T77 step 2: the admin app's calls about entry machines (supabase/migrations/0059_entry_machines_owner.sql,
 * NOT APPLIED). Every call carries the owner or desk key; the server keeps each gym to its own machines and
 * lets only the owner add or remove one.
 *
 * Until 0059 is on the server, the first read answers PGRST202 ("no such function"): the page remembers "not
 * here yet" and Settings -> Entry machines SAYS SO ("not ready for your gym yet"), never a pretend list. The
 * job that queues member updates does nothing then. Any other failure (no internet) is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { INDIA_TZ_MINUTES, type MachineCapabilities, type MachineFamily } from '../machines/entryMachine';
import type { MachineRow, NumberMap, QueueItem } from '../machines/entryMachineAdmin';
import { isValidDateISO } from '../logic/dates';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type EntryServer = 'unknown' | 'yes' | 'no';

export interface EntryOverview {
  /** The owner (old owner key or an owner's session) may add and remove machines; the desk may not. */
  canEdit: boolean;
  machines: MachineRow[];
  /** memberId -> machine number. */
  numbers: NumberMap;
}

let server: EntryServer = 'unknown';

export function entryServer(): EntryServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[entry machines] this gym server has no entry machines yet (0059 not applied); the screen says so');
}

type Row = Record<string, unknown>;

const FAMILIES: readonly MachineFamily[] = ['zk-adms', 'realtime', 'matrix-cosec', 'hikvision'];

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function ms(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** One machine row as the server sent it; null for a row we cannot read. PURE. */
export function machineFromRow(raw: unknown): MachineRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Row;
  if (typeof r.id !== 'string' || !r.id || typeof r.serial !== 'string') return null;
  const caps = (r.caps && typeof r.caps === 'object' ? r.caps : {}) as Row;
  const c: MachineCapabilities = {
    canHoldExpiry: caps.canHoldExpiry === true,
    canDisable: caps.canDisable === true,
    canOpenDoor: caps.canOpenDoor === true,
    canEnrollRemotely: caps.canEnrollRemotely === true,
    canFetchMissed: caps.canFetchMissed === true,
  };
  const lr = r.lastRefused && typeof r.lastRefused === 'object' ? (r.lastRefused as Row) : null;
  const lrAt = lr ? ms(lr.at) : null;
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Entry machine',
    family: FAMILIES.includes(r.family as MachineFamily) ? (r.family as MachineFamily) : 'zk-adms',
    serial: r.serial,
    firmware: r.firmware === 'ac' ? 'ac' : 'ta',
    caps: c,
    paused: r.paused === true,
    lastSeenAt: ms(r.lastSeenAt),
    sweptOn: isValidDateISO(r.sweptOn) ? r.sweptOn : null,
    refusedToday: count(r.refusedToday),
    unknownToday: count(r.unknownToday),
    lastRefused: lr && typeof lr.memberNo === 'string' && lrAt !== null ? { memberNo: lr.memberNo, at: lrAt } : null,
  };
}

/** The whole answer of owner_entry_machines. PURE. */
export function overviewFrom(raw: unknown): EntryOverview {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const machines = (Array.isArray(r.machines) ? r.machines : []).map(machineFromRow).filter((m): m is MachineRow => m !== null);
  const numbers: Record<string, string> = {};
  if (r.numbers && typeof r.numbers === 'object') {
    for (const [memberId, no] of Object.entries(r.numbers as Row)) {
      if (typeof no === 'string' && /^[1-9]\d{0,8}$/.test(no)) numbers[memberId] = no;
    }
  }
  return { canEdit: r.canEdit === true, machines, numbers };
}

/** The gym's machines and members' numbers, or 'missing' while the server has no 0059 (then remembered). */
export async function getEntryMachines(key: string): Promise<EntryOverview | 'missing'> {
  if (entryServer() === 'no') return 'missing';
  try {
    const o = overviewFrom(await call<unknown>('owner_entry_machines', { p_key: key }));
    server = 'yes';
    return o;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markNoServer();
      return 'missing';
    }
    throw e;
  }
}

/** Add a machine (owner only). Throws DUPLICATE_SERIAL / BAD_SERIAL / NOT_YET / OWNER_ONLY / TOO_MANY as they came. */
export async function addEntryMachine(key: string, m: { serial: string; name: string; family: MachineFamily }): Promise<string> {
  const id = await call<unknown>('owner_add_entry_machine', {
    p_key: key,
    p_serial: m.serial,
    p_name: m.name,
    p_family: m.family,
    p_tz_minutes: INDIA_TZ_MINUTES,
  });
  return String(id ?? '');
}

/** Remove a machine (owner only). Its entries already saved stay in the register. */
export async function removeEntryMachine(key: string, machineId: string): Promise<void> {
  await call<unknown>('owner_remove_entry_machine', { p_key: key, p_machine: machineId });
}

/**
 * Save machine numbers (owner or desk). A number another member has: NUMBER_TAKEN, nothing saved. A member
 * whose number changes: the server queues "remove the old number" on every machine.
 */
export async function setMachineNumbers(key: string, items: ReadonlyArray<{ memberId: string; memberNo: string }>): Promise<void> {
  if (items.length === 0) return;
  await call<unknown>('owner_set_machine_numbers', { p_key: key, p_numbers: items });
}

/**
 * Queue member updates on the machines (owner or desk). `sweep` names the machines this is that day's
 * nightly sweep for: the server queues a machine's items only if it has not been swept on that day yet (two
 * desks open at once send it once), and remembers the day. -> how many were queued.
 */
export async function queueMachineCommands(
  key: string,
  items: readonly QueueItem[],
  sweep: { day: string; machineIds: readonly string[] } | null,
): Promise<number> {
  if (items.length === 0 && !sweep) return 0;
  const r = await call<unknown>('owner_queue_machine_commands', {
    p_key: key,
    p_items: items.map((i) => ({ machineId: i.machineId, command: i.command })),
    p_sweep_day: sweep?.day ?? null,
    p_sweep_machines: sweep ? [...sweep.machineIds] : [],
  });
  return typeof r === 'number' ? r : count((r as Row | null)?.queued);
}

/** Tests only: back to a fresh page. */
export function resetEntryServerForTest(): void {
  server = 'unknown';
}
