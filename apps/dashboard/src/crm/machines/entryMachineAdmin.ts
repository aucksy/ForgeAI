/**
 * Entry machines in the owner's admin app (F103 / T77 step 2, owner request R-378). PURE: no network, no
 * clock, no storage. The rules themselves are the core's (entryMachine.ts: allowedOn, syncCommands,
 * cleanMemberNo, nextMemberNo); this file turns MettleUp's members and plans into the core's MemberAccess,
 * picks each member's machine number, says which commands to queue after a sale, a renewal, a freeze, an
 * archive and in the nightly sweep, and holds the words of Settings -> Entry machines.
 *
 * NOT LIVE: the screen talks to owner_entry_* functions in supabase/migrations/0059 (NOT APPLIED). Until
 * they are on the server the screen says so plainly and saves nothing (entryMachinesApi.ts).
 */

import { addDays, dateISOFromEpoch, formatDayShort, hourOfEpoch, minuteOfEpoch, type DateISO } from '../logic/dates';
import { gymTerms } from '../logic/pt';
import { isPassMember } from '../logic/passMembers';
import type { Member, Membership } from '../types';
import { cleanSerial } from './adms';
import {
  allowedOn,
  cleanMemberNo,
  nextMemberNo,
  syncCommands,
  type MachineCapabilities,
  type MachineCommand,
  type MachineFamily,
  type MemberAccess,
} from './entryMachine';

// ---------------------------------------------------------------- brands

export interface BrandChoice {
  family: MachineFamily;
  label: string;
  /** False: shown as "Coming soon", cannot be picked. */
  ready: boolean;
}

/** The brands on "Add a machine". Only eSSL / ZKTeco has a driver today (adms.ts). */
export const BRANDS: readonly BrandChoice[] = [
  { family: 'zk-adms', label: 'eSSL / ZKTeco', ready: true },
  { family: 'realtime', label: 'Realtime', ready: false },
  { family: 'matrix-cosec', label: 'Matrix', ready: false },
  { family: 'hikvision', label: 'Hikvision', ready: false },
];

export function brandLabel(family: string): string {
  return BRANDS.find((b) => b.family === family)?.label ?? 'Entry machine';
}

/**
 * The address a machine is pointed to (Step 2, "Server Address"). The gate Worker's sub-domain
 * (deploy/gate/wrangler.jsonc), to be agreed before it goes live.
 */
export const ENTRY_SERVER_ADDRESS = 'gate.mettleup.fit';
export const ENTRY_SERVER_PORT = '80';

export interface SetupStep {
  title: string;
  lines: string[];
}

/** The setup steps from docs/ENTRY-MACHINES-SETUP.md, with our address written in. PURE. */
export function setupSteps(address: string = ENTRY_SERVER_ADDRESS, port: string = ENTRY_SERVER_PORT): SetupStep[] {
  return [
    {
      title: 'Step 1: find the serial number',
      lines: [
        'Press Menu on the machine.',
        'Go to System Info (on some models: Sys Info > Device Info).',
        'Write down the Serial Number. It looks like CJDE231560123.',
      ],
    },
    {
      title: 'Step 2: point the machine to MettleUp',
      lines: [
        'Press Menu.',
        'Go to COMM (or Comm.).',
        'Open ADMS (or Cloud Server Setting).',
        'Set Enable Domain Name to ON.',
        `Set Server Address to ${address}`,
        `Set Server Port to ${port}.`,
        'Set Enable Proxy Server to OFF.',
        'If you see HTTPS, leave it OFF.',
        'Press OK or Save. If the machine asks, switch it off and on.',
      ],
    },
    {
      title: 'Step 3: add the machine here',
      lines: ['Type the serial number below.', 'Give the machine a name, like "Front door".', 'Press Save machine.'],
    },
    {
      title: 'Step 4: give each member their number',
      lines: [
        'Every member gets a machine number in MettleUp, like 1001. You see it on the member’s page.',
        'Add the member on the machine with that same number. Then take their finger or face at the machine.',
      ],
    },
  ];
}

// ---------------------------------------------------------------- the add form

export const NAME_MAX = 40;
export const DEFAULT_MACHINE_NAME = 'Entry machine';

export type AddCheck =
  | { ok: true; serial: string; name: string; family: MachineFamily }
  | { ok: false; field: 'brand' | 'serial' | 'name'; message: string };

/**
 * Check "Add a machine" before it is sent. A serial is letters, numbers, - and _ (up to 32), the
 * same rule the server and the gate use. Spaces typed around it are dropped; inside it they are an
 * error (a serial never has one). PURE.
 */
export function checkNewMachine(
  input: { family: string; serial: string; name: string },
  existingSerials: readonly string[],
): AddCheck {
  const brand = BRANDS.find((b) => b.family === input.family);
  if (!brand) return { ok: false, field: 'brand', message: 'Pick your machine’s brand.' };
  if (!brand.ready) return { ok: false, field: 'brand', message: `${brand.label} machines are coming soon. Today MettleUp works with eSSL and ZKTeco.` };
  const typed = input.serial.trim();
  if (!typed) return { ok: false, field: 'serial', message: 'Type the serial number from Menu > System Info on the machine.' };
  const serial = cleanSerial(typed);
  if (!serial) {
    return {
      ok: false,
      field: 'serial',
      message: 'A serial number has only letters and numbers, like CJDE231560123. Check it on the machine.',
    };
  }
  if (existingSerials.some((s) => s.toUpperCase() === serial.toUpperCase())) {
    return { ok: false, field: 'serial', message: 'This machine is already on your list.' };
  }
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length > NAME_MAX) return { ok: false, field: 'name', message: `Keep the name short: ${NAME_MAX} letters at most.` };
  return { ok: true, serial, name: name || DEFAULT_MACHINE_NAME, family: brand.family };
}

/** The server's refusals, in plain words. null = not one of ours (the caller uses errorWords). PURE. */
export function entryErrorWords(err: unknown): string | null {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && typeof (err as { message?: unknown }).message === 'string'
        ? String((err as { message: string }).message)
        : String(err ?? '');
  if (/\bDUPLICATE_SERIAL\b/.test(msg)) return 'This machine is already added to a gym. Message MettleUp on WhatsApp and we will check it.';
  if (/\bBAD_SERIAL\b/.test(msg)) return 'A serial number has only letters and numbers, like CJDE231560123. Check it on the machine.';
  if (/\bNOT_YET\b/.test(msg)) return 'This brand is coming soon. Today MettleUp works with eSSL and ZKTeco.';
  if (/\bNUMBER_TAKEN\b/.test(msg)) return 'Another member already has this machine number. Pick another number.';
  if (/\bBAD_NUMBER\b/.test(msg)) return 'Type a machine number from 1 to 999999999, with no letters or spaces.';
  if (/\bOWNER_ONLY\b/.test(msg)) return 'Only the gym owner can add or remove a machine.';
  if (/\bNO_MACHINE\b/.test(msg)) return 'This machine is no longer on your list.';
  if (/\bTOO_MANY\b/.test(msg)) return 'You can add up to 10 machines. Message MettleUp on WhatsApp if you need more.';
  return null;
}

// ---------------------------------------------------------------- the list

/** A machine as the owner's list reads it from the server. */
export interface MachineRow {
  id: string;
  name: string;
  family: MachineFamily;
  serial: string;
  firmware: 'ta' | 'ac';
  caps: MachineCapabilities;
  paused: boolean;
  /** Epoch ms the machine last called, or null (never yet). */
  lastSeenAt: number | null;
  /** The last day the nightly sweep ran for this machine (null = never: the first run loads every member). */
  sweptOn: DateISO | null;
  refusedToday: number;
  unknownToday: number;
  /** The newest refusal today: the number typed and when. */
  lastRefused: { memberNo: string; at: number } | null;
}

/** A machine that called within this long is Online (it calls every 30 seconds; we note it once a minute). */
export const ONLINE_WITHIN_MS = 3 * 60_000;

export type MachineStatus = 'online' | 'offline' | 'never';

export function machineStatus(m: Pick<MachineRow, 'lastSeenAt'>, now: number): MachineStatus {
  if (m.lastSeenAt === null) return 'never';
  return now - m.lastSeenAt <= ONLINE_WITHIN_MS ? 'online' : 'offline';
}

/** "7:15 am" in India time. PURE. */
export function clockWords(ms: number): string {
  const h = hourOfEpoch(ms);
  const m = minuteOfEpoch(ms);
  if (h === null || m === null) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Last seen today at 7:15 am" / "Last seen 4 Nov at 9:02 pm". PURE. */
export function lastSeenWords(ms: number, today: DateISO): string {
  const day = dateISOFromEpoch(ms);
  const when = day === today ? 'today' : day === addDays(today, -1) ? 'yesterday' : formatDayShort(day);
  return `Last seen ${when} at ${clockWords(ms)}`;
}

export interface MachineRowView {
  id: string;
  name: string;
  brand: string;
  serial: string;
  status: MachineStatus;
  /** "Online", "Offline", "Not connected yet". */
  statusWords: string;
  tone: 'good' | 'critical' | 'muted';
  /** Under the status: when it last called, or what to do. */
  statusLine: string;
  /** "Refused today: 2" etc., or null when nothing to say. */
  refusedLine: string | null;
  unknownLine: string | null;
  /** "Last refused: number 1007 (Asha Verma) at 7:15 am". */
  lastRefusedLine: string | null;
  paused: boolean;
}

/** One row of the list, in words. `nameOfNo` names the member a number belongs to. PURE. */
export function machineRowView(
  m: MachineRow,
  now: number,
  today: DateISO,
  nameOfNo: (memberNo: string) => string | null,
): MachineRowView {
  const status = machineStatus(m, now);
  const statusWords = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Not connected yet';
  const tone = status === 'online' ? 'good' : status === 'offline' ? 'critical' : 'muted';
  const statusLine =
    m.lastSeenAt === null
      ? `Set the machine’s Server Address to ${ENTRY_SERVER_ADDRESS}. It shows Online within a minute.`
      : status === 'offline'
        ? `${lastSeenWords(m.lastSeenAt, today)}. Check the machine has internet.`
        : lastSeenWords(m.lastSeenAt, today);
  const who = m.lastRefused ? nameOfNo(m.lastRefused.memberNo) : null;
  return {
    id: m.id,
    name: m.name,
    brand: brandLabel(m.family),
    serial: m.serial,
    status,
    statusWords,
    tone,
    statusLine,
    refusedLine: m.refusedToday > 0 ? `Refused today: ${m.refusedToday}` : null,
    unknownLine: m.unknownToday > 0 ? `Numbers MettleUp does not know, today: ${m.unknownToday}` : null,
    lastRefusedLine: m.lastRefused
      ? `Last refused: number ${m.lastRefused.memberNo}${who ? ` (${who})` : ''} at ${clockWords(m.lastRefused.at)}`
      : null,
    paused: m.paused,
  };
}

/** What the server says when asked for the list. 'missing' = 0059 is not on the gym's server yet. */
export type EntryLoad =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error'; message: string }
  | { state: 'ready'; canEdit: boolean; machines: MachineRow[] };

export type EntryScreenView =
  | { kind: 'loading' }
  | { kind: 'message'; title: string; body: string; retry: boolean; testId: string }
  | { kind: 'empty'; title: string; body: string; canAdd: boolean }
  | { kind: 'list'; rows: MachineRowView[]; canAdd: boolean; note: string | null };

export const ENTRY_WORDS = {
  offTitle: 'Entry machines need your gym online',
  offBody: 'Put your gym online first (Settings → Sign-in & data).',
  missingTitle: 'Entry machines are not ready for your gym yet',
  missingBody:
    'MettleUp cannot talk to entry machines yet. Nothing you do here is saved. Message MettleUp on WhatsApp if you want it for your gym.',
  emptyTitle: 'No entry machines yet',
  emptyBody:
    'Add your eSSL or ZKTeco finger or face machine. When a member comes in, MettleUp marks them as come in. When a plan ends, the machine stops letting them in.',
  ownerOnly: 'Only the gym owner can add or remove a machine.',
  card: 'Connect your eSSL or ZKTeco finger or face machine. Members come in with a finger or face, and MettleUp keeps the register.',
};

/** Which state the Entry machines screen shows. PURE. */
export function entryScreenView(
  load: EntryLoad,
  now: number,
  today: DateISO,
  nameOfNo: (memberNo: string) => string | null,
): EntryScreenView {
  switch (load.state) {
    case 'off':
      return { kind: 'message', title: ENTRY_WORDS.offTitle, body: ENTRY_WORDS.offBody, retry: false, testId: 'entry-off' };
    case 'loading':
      return { kind: 'loading' };
    case 'missing':
      return { kind: 'message', title: ENTRY_WORDS.missingTitle, body: ENTRY_WORDS.missingBody, retry: false, testId: 'entry-not-ready' };
    case 'error':
      return { kind: 'message', title: 'Could not load your machines', body: load.message, retry: true, testId: 'entry-error' };
    case 'ready': {
      if (load.machines.length === 0) {
        return {
          kind: 'empty',
          title: ENTRY_WORDS.emptyTitle,
          body: load.canEdit ? ENTRY_WORDS.emptyBody : `${ENTRY_WORDS.emptyBody} ${ENTRY_WORDS.ownerOnly}`,
          canAdd: load.canEdit,
        };
      }
      return {
        kind: 'list',
        rows: load.machines.map((m) => machineRowView(m, now, today, nameOfNo)),
        canAdd: load.canEdit,
        note: load.canEdit ? null : ENTRY_WORDS.ownerOnly,
      };
    }
  }
}

// ---------------------------------------------------------------- machine numbers

/** Headers of an imported column that is the gym's own member number ("Member ID", "Reg No", "Roll No"). */
const OWN_NUMBER_LABEL = /^((member|membership|reg|registration|roll|admission|gym|card)\.?\s*(id|no|num|number|code|#)|id|member\s*id)\.?$/i;

/**
 * The gym's own member number, brought in from an old file ("Member ID", "Reg No", "Roll No", "ID"),
 * if it can be a machine number. A "Sr. No." column only counts the rows of the old file: never used. PURE.
 */
export function ownMemberNumber(member: Pick<Member, 'extra'>): string | null {
  const extra = member.extra ?? {};
  for (const [label, value] of Object.entries(extra)) {
    const l = label.trim().replace(/\s+/g, ' ');
    if (!OWN_NUMBER_LABEL.test(l)) continue;
    const n = cleanMemberNo(value);
    if (n !== null) return n;
  }
  return null;
}

/** memberId -> number, and the other way round. */
export type NumberMap = Readonly<Record<string, string>>;

export function numberOwners(numbers: NumberMap): Map<string, string> {
  const out = new Map<string, string>();
  for (const [memberId, no] of Object.entries(numbers)) out.set(no, memberId);
  return out;
}

/**
 * The number a member who has none should get: the gym's own member number when it is free, else
 * the next free number (1001 up, the core's nextMemberNo). `taken` grows as numbers are handed out,
 * so a batch never gives two members the same one. PURE.
 */
export function defaultMachineNumber(member: Pick<Member, 'extra'>, taken: ReadonlySet<string>): string {
  const own = ownMemberNumber(member);
  if (own !== null && !taken.has(own)) return own;
  return nextMemberNo(taken);
}

/**
 * Numbers for every member still without one (archived members are left out), oldest member first so
 * the order is the same on every desk. PURE.
 */
export function numbersToGive(
  members: readonly Pick<Member, 'id' | 'extra' | 'archived' | 'createdAt'>[],
  numbers: NumberMap,
): Array<{ memberId: string; memberNo: string }> {
  const taken = new Set(Object.values(numbers));
  const out: Array<{ memberId: string; memberNo: string }> = [];
  const without = members
    .filter((m) => !m.archived && !numbers[m.id])
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  // The gym's own numbers first, so a later member's "next free" never takes an imported number.
  const own = new Map<string, string>();
  for (const m of without) {
    const n = ownMemberNumber(m);
    if (n !== null && !taken.has(n) && ![...own.values()].includes(n)) own.set(m.id, n);
  }
  for (const n of own.values()) taken.add(n);
  for (const m of without) {
    const memberNo = own.get(m.id) ?? nextMemberNo(taken);
    taken.add(memberNo);
    out.push({ memberId: m.id, memberNo });
  }
  return out;
}

export type NumberCheck = { ok: true; memberNo: string; same: boolean } | { ok: false; message: string };

/** The desk typed a new number for a member. PURE. */
export function checkMachineNumber(
  typed: string,
  memberId: string,
  numbers: NumberMap,
  nameOf: (memberId: string) => string | null,
): NumberCheck {
  const memberNo = cleanMemberNo(typed);
  if (memberNo === null) return { ok: false, message: 'Type a machine number from 1 to 999999999, with no letters or spaces.' };
  if (numbers[memberId] === memberNo) return { ok: true, memberNo, same: true };
  const owner = numberOwners(numbers).get(memberNo);
  if (owner && owner !== memberId) {
    const who = nameOf(owner);
    return { ok: false, message: `Number ${memberNo} is already ${who ? `${who}’s` : 'another member’s'}. Pick another number.` };
  }
  return { ok: true, memberNo, same: false };
}

/** The line on the member's page. PURE. */
export function enrolLine(memberNo: string): string {
  return `Enrol this member’s finger or face on the machine with number ${memberNo}.`;
}

// ---------------------------------------------------------------- who may come in (MettleUp -> the core)

/**
 * One member as the core's MemberAccess, judged on `day`. coversUntil is the end of the run of plans
 * that covers `day`; when nothing covers it, the nearest plan still to start (bought to start later),
 * else the last plan that ended (so "allowed yesterday, not today" can be seen the night a plan ends).
 * PT packs never decide it (logic/pt.ts gymTerms). MettleUp has no pause of its own: "Freeze / extra
 * days" moves the plan's last day, so pausedUntil is always null. PURE.
 */
export function memberAccess(
  member: Pick<Member, 'fullName' | 'archived' | 'passCompany'>,
  memberships: readonly Membership[],
  memberNo: string,
  day: DateISO,
): MemberAccess {
  const live = gymTerms(memberships).filter((m) => !m.cancelled);
  const chainEnd = (from: DateISO): DateISO | null => {
    const covering = live.filter((m) => m.startsOn <= from && m.endsOn >= from);
    if (covering.length === 0) return null;
    let end = covering.reduce((max, m) => (m.endsOn > max ? m.endsOn : max), covering[0]!.endsOn);
    for (let guard = 0; guard < live.length; guard += 1) {
      const next = live.find((m) => m.startsOn <= addDays(end, 1) && m.endsOn > end);
      if (!next) break;
      end = next.endsOn;
    }
    return end;
  };
  let coversFrom: DateISO | null = null;
  let coversUntil: DateISO | null = chainEnd(day);
  if (coversUntil !== null) {
    coversFrom = live.filter((m) => m.startsOn <= day && m.endsOn >= day).reduce((min, m) => (m.startsOn < min ? m.startsOn : min), day);
  } else {
    const upcoming = live.filter((m) => m.startsOn > day).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
    if (upcoming) {
      coversFrom = upcoming.startsOn;
      coversUntil = chainEnd(upcoming.startsOn);
    } else {
      const last = live.filter((m) => m.endsOn < day).sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0];
      if (last) {
        coversFrom = last.startsOn;
        coversUntil = last.endsOn;
      }
    }
  }
  return {
    memberNo,
    name: member.fullName.trim().slice(0, NAME_MAX),
    coversUntil,
    coversFrom,
    pausedUntil: null,
    passMember: isPassMember(member),
    archived: member.archived,
  };
}

/** A machine the job sends to: its id and what it can do. */
export interface MachineTarget {
  id: string;
  caps: MachineCapabilities;
  paused: boolean;
}

export interface QueueItem {
  machineId: string;
  command: MachineCommand;
}

/**
 * After a sale, renewal, freeze, cancel or archive: the core's commands for these members, for every
 * machine that is not switched off. Members with no machine number are skipped (give one first). PURE.
 */
export function commandsForMembers(
  memberIds: readonly string[],
  members: readonly Member[],
  memberships: readonly Membership[],
  numbers: NumberMap,
  machines: readonly MachineTarget[],
  today: DateISO,
): QueueItem[] {
  const out: QueueItem[] = [];
  const live = machines.filter((m) => !m.paused);
  if (live.length === 0) return out;
  for (const id of new Set(memberIds)) {
    const member = members.find((m) => m.id === id);
    const no = numbers[id];
    if (!member || !no) continue;
    const access = memberAccess(member, memberships.filter((x) => x.memberId === id), no, today);
    for (const machine of live) {
      for (const command of syncCommands(access, machine.caps, today)) out.push({ machineId: machine.id, command });
    }
  }
  return out;
}

/**
 * The nightly sweep for one machine. `since` is the last day it ran for this machine:
 *  - null (a machine just added): load every member who may come in today, or has a plan bought to start
 *    later (nobody is removed: they were never put on this machine by MettleUp);
 *  - otherwise: only members whose right to come in changed between `since` and today (a plan ended, a
 *    plan bought to start later began). With since = yesterday this is exactly the core's nightlyChanges;
 *    a desk closed for days still catches up. Archiving is not seen here (the member is archived on both
 *    days): the archive itself queued the removal (machines/accessChanges.ts).
 * Already swept today: nothing. PURE.
 */
export function sweepCommands(
  members: readonly Member[],
  memberships: readonly Membership[],
  numbers: NumberMap,
  machine: MachineTarget,
  since: DateISO | null,
  today: DateISO,
): MachineCommand[] {
  if (machine.paused || (since !== null && since >= today)) return [];
  const byMember = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = byMember.get(m.memberId);
    if (list) list.push(m);
    else byMember.set(m.memberId, [m]);
  }
  const out: MachineCommand[] = [];
  for (const member of members) {
    const no = numbers[member.id];
    if (!no) continue;
    const ms = byMember.get(member.id) ?? [];
    const now = memberAccess(member, ms, no, today);
    if (since === null) {
      if (member.archived) continue;
      const comingLater = now.coversFrom !== null && now.coversFrom > today && machine.caps.canHoldExpiry;
      if (!allowedOn(now, today) && !comingLater) continue;
      out.push(...syncCommands(now, machine.caps, today));
      continue;
    }
    const then = memberAccess(member, ms, no, since);
    if (allowedOn(then, since) === allowedOn(now, today)) continue;
    out.push(...syncCommands(now, machine.caps, today));
  }
  return out;
}
