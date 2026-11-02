/**
 * F137 "Busy machines" in the admin app (OWNER-INBOX #68): the owner switches it on and types how many of each
 * machine the gym has, from the ready list (packages/theme/src/busyMachines.ts), and can add a machine that is
 * missing with its count and the exercises done on it. Saved on the gym's server (0049). PURE: reading the
 * server's answer, the editor's draft, the list to save, and the words.
 */
import { MACHINE_UNITS_MAX, READY_MACHINES, machineCounts, readyMachine } from '@forgeai/theme';

export interface MachineCheck {
  weeksChecked: number;
  weeksRight: number;
  proven: boolean;
}

export interface SavedMachine {
  id: string;
  name: string;
  units: number;
  ex: string[];
  own: boolean;
  counted: boolean;
  check: MachineCheck | null;
}

export interface MachineSetup {
  enabled: boolean;
  machines: SavedMachine[];
  canEdit: boolean;
  /** Members whose phones sent workouts in the last 35 days; null under 5 (never a count of one or two). */
  membersSending: number | null;
  updatedAt: number | null;
  updatedByName: string | null;
}

export interface OwnMachineDraft {
  id: string;
  name: string;
  units: string;
  ex: string[];
}

export interface MachineDraft {
  enabled: boolean;
  /** Ready-list machine id -> the count as typed ('' = the gym does not have it). */
  counts: Record<string, string>;
  own: OwnMachineDraft[];
}

export interface SaveMachine {
  id: string;
  name: string;
  units: number;
  ex: string[];
  own: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function checkFrom(raw: unknown): MachineCheck | null {
  if (!isObj(raw)) return null;
  return { weeksChecked: num(raw.weeksChecked), weeksRight: num(raw.weeksRight), proven: raw.proven === true };
}

/** The server's answer (owner_machine_setup / owner_save_machine_setup), checked. PURE. */
export function machineSetupFrom(raw: unknown): MachineSetup {
  const r = isObj(raw) ? raw : {};
  const machines: SavedMachine[] = [];
  for (const m of Array.isArray(r.machines) ? r.machines : []) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.name !== 'string') continue;
    const ex = Array.isArray(m.ex) ? m.ex.filter((k): k is string => typeof k === 'string') : [];
    const units = num(m.units);
    machines.push({ id: m.id, name: m.name, units, ex, own: m.own === true, counted: m.counted === true || machineCounts({ units, ex }), check: checkFrom(m.check) });
  }
  return {
    enabled: r.enabled === true,
    machines,
    canEdit: r.canEdit === true,
    membersSending: typeof r.membersSending === 'number' ? r.membersSending : null,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
    updatedByName: typeof r.updatedByName === 'string' ? r.updatedByName : null,
  };
}

/** The editor's starting point from what is saved. PURE. */
export function draftFrom(s: MachineSetup): MachineDraft {
  const counts: Record<string, string> = {};
  const own: OwnMachineDraft[] = [];
  for (const m of s.machines) {
    if (!m.own && readyMachine(m.id)) counts[m.id] = String(m.units);
    else own.push({ id: m.id, name: m.name, units: String(m.units), ex: [...m.ex] });
  }
  return { enabled: s.enabled, counts, own };
}

/** A fresh id for a machine the owner adds ('own_1', 'own_2', ...). PURE. */
export function newOwnId(own: readonly { id: string }[]): string {
  let n = 1;
  while (own.some((o) => o.id === `own_${n}`)) n++;
  return `own_${n}`;
}

/** A typed count: null for "none" ('' or 0), a whole number 1..50, or 'bad'. PURE. */
export function unitsOf(typed: string): number | null | 'bad' {
  const t = typed.trim();
  if (t === '' || t === '0') return null;
  if (!/^\d{1,3}$/.test(t)) return 'bad';
  const n = Number(t);
  return n >= 1 && n <= MACHINE_UNITS_MAX ? n : 'bad';
}

/** The list to save, or the first problem in plain words. PURE. */
export function machinesPayload(d: MachineDraft): { payload: SaveMachine[] | null; problem: string | null } {
  const out: SaveMachine[] = [];
  for (const m of READY_MACHINES) {
    const u = unitsOf(d.counts[m.id] ?? '');
    if (u === 'bad') return { payload: null, problem: `${m.name}: type how many you have, from 1 to ${MACHINE_UNITS_MAX}, or leave it empty.` };
    if (u != null) out.push({ id: m.id, name: m.name, units: u, ex: [...m.ex], own: false });
  }
  const names = new Set(out.map((m) => m.name.toLowerCase()));
  for (const o of d.own) {
    const name = o.name.trim().replace(/\s+/g, ' ');
    if (!name) return { payload: null, problem: 'Give the machine you added a name.' };
    if (name.length > 40) return { payload: null, problem: `${name.slice(0, 20)}…: keep the name under 40 letters.` };
    if (names.has(name.toLowerCase())) return { payload: null, problem: `${name} is on the list twice.` };
    const u = unitsOf(o.units);
    if (u === null || u === 'bad') return { payload: null, problem: `${name}: type how many you have, from 1 to ${MACHINE_UNITS_MAX}.` };
    names.add(name.toLowerCase());
    out.push({ id: o.id, name, units: u, ex: [...new Set(o.ex)], own: true });
  }
  return { payload: out, problem: null };
}

/** Has the owner changed anything since the last save? PURE. */
export function machinesChanged(d: MachineDraft, saved: MachineSetup): boolean {
  const now = machinesPayload(d).payload;
  if (!now) return true;
  if (d.enabled !== saved.enabled) return true;
  const before = saved.machines.map((m) => ({ id: m.id, name: m.name, units: m.units, ex: m.ex, own: m.own }));
  const key = (l: SaveMachine[]) => JSON.stringify([...l].sort((a, b) => (a.id < b.id ? -1 : 1)));
  return key(now) !== key(before);
}

/** How many machines on the draft can get busy (1 or 2, with exercises). PURE. */
export function countedInDraft(d: MachineDraft): number {
  return (machinesPayload(d).payload ?? []).filter((m) => machineCounts(m)).length;
}

/** One saved machine's line: what the app is doing with it. PURE. */
export function machineStatusWords(m: SavedMachine, enabled: boolean): string {
  if (m.ex.length === 0) return 'Not used yet. Pick the exercises done on it.';
  if (!m.counted) return `Not used. You have ${m.units}, so it rarely gets busy.`;
  if (!enabled) return 'Busy machines are switched off.';
  const c = m.check;
  if (!c || c.weeksChecked === 0) return 'It is still learning. Members see nothing yet.';
  if (c.proven) return `Members see tips. Its guess was right ${c.weeksRight} of the last ${c.weeksChecked} weeks.`;
  return `It is still learning. Its guess was right ${c.weeksRight} of the last ${c.weeksChecked} weeks. Members see tips after 4 right weeks out of 6.`;
}

/** Plain words for the server's refusals, or null when it is not one of them. PURE. */
export function machineErrorWords(e: unknown): string | null {
  const t = e instanceof Error ? e.message : isObj(e) && typeof e.message === 'string' ? e.message : String(e ?? '');
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can change this.';
  if (/\bINVALID\b/.test(t)) return 'Something on the list could not be saved. Check the counts and names.';
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused, so this cannot be changed now.';
  return null;
}

export const MACHINES_SAVED = 'Saved.';
export const MACHINES_HOW =
  'It learns from workouts your members log in the MettleUp app: the day, the hour and the exercises. No names. ' +
  'Only machines you have 1 or 2 of can get busy. Each week it guesses which hours will be busy and checks itself. ' +
  'Members see a tip only after it has been right 4 weeks out of 6 (usually 6 to 8 weeks).';
export const MACHINES_MEMBER_SEES = 'Members see one line on the Gym tab, for example: “Leg day is quieter on Tuesday”.';
