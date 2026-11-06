/**
 * Entry machines, the generic core (F103 / T77 step 1, owner request R-378). PURE: no network, no
 * clock, no storage. Design: docs/overhaul/research/R-entry-machines-india.md section 6.
 *
 *   Events in:  a punch at a machine -> one Visit tagged "machine" (unknown member numbers are KEPT
 *               as "unknown member", never dropped; repeats within 2 minutes count once).
 *   Rules out:  upsert_member / remove_member / open_door / set_time / fetch_missed_entries, put on a
 *               per-machine command queue (pending -> sent -> done | error, retried until answered).
 *   Per brand:  a driver (adms.ts for eSSL / ZKTeco) turns these into the machine's own words.
 *
 * Times. A machine keeps LOCAL wall-clock time with no zone ("2026-11-06 07:15:30"). Every machine
 * row carries its offset from UTC in minutes (India: 330, no summer time), and every conversion
 * here uses that number, never the computer's own zone.
 */

import { addDays, isValidDateISO, type DateISO } from '../logic/dates';

// ---------------------------------------------------------------- machines

/** Which protocol family a machine speaks. Only 'zk-adms' has a driver today. */
export type MachineFamily = 'zk-adms' | 'realtime' | 'matrix-cosec' | 'hikvision';

/**
 * What a machine can do. Unknown = false: a wrong "yes" would send commands the machine refuses
 * (ZK answers -1004) or, worse, leave an expired member on a machine that cannot hold an end date.
 */
export interface MachineCapabilities {
  /** The machine itself refuses a member after their end date, even with the internet down. */
  canHoldExpiry: boolean;
  /** We can switch a member off without deleting them (fingerprints stay on the machine). */
  canDisable: boolean;
  canOpenDoor: boolean;
  /** We can start a fingerprint or face enrolment from MettleUp (no known ZK way: false). */
  canEnrollRemotely: boolean;
  canFetchMissed: boolean;
}

/** ZK "T&A push" firmware (X990, K90, MB160, uFace...): attendance, no per-user dates, no disable. */
export const ZK_TA_CAPS: MachineCapabilities = {
  canHoldExpiry: false,
  canDisable: false,
  canOpenDoor: false,
  canEnrollRemotely: false,
  canFetchMissed: true,
};

/**
 * ZK "AC push" firmware (inBio, ProFace X, SpeedFace...): start/end on the user record and a door.
 * From memory of the AC push spec, NOT proven on a real machine (research section 2A, "to confirm").
 */
export const ZK_AC_CAPS: MachineCapabilities = {
  canHoldExpiry: true,
  canDisable: true,
  canOpenDoor: true,
  canEnrollRemotely: false,
  canFetchMissed: true,
};

export interface Machine {
  /** Our own id for the machine (a uuid on the server). */
  id: string;
  gymId: string;
  family: MachineFamily;
  /** The serial number the machine sends with every request (Menu > System Info). */
  serial: string;
  /** What the owner calls it ("Front door"). */
  name: string;
  /** 'ta' or 'ac' for zk-adms; unused by other families. */
  firmware: 'ta' | 'ac';
  caps: MachineCapabilities;
  /** The machine's clock offset from UTC in minutes. India = 330. */
  tzMinutes: number;
  /** Switched off by the owner: answered politely, nothing saved. */
  paused: boolean;
}

/** The offset used when a machine row has none or a nonsense one. */
export const INDIA_TZ_MINUTES = 330;

export function safeTzMinutes(tz: unknown): number {
  return typeof tz === 'number' && Number.isInteger(tz) && tz >= -720 && tz <= 840 ? tz : INDIA_TZ_MINUTES;
}

// ---------------------------------------------------------------- local time on the machine

const LOCAL_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "2026-11-06 07:15:30" on a machine at `tzMinutes` -> epoch ms. null for anything that is not a
 * real date and time (a machine with a flat clock battery says 2000-01-01; that is still a real time
 * and is kept: the visit lands on that day, and the punch log shows it). PURE.
 */
export function localToEpoch(text: string, tzMinutes: number): number | null {
  const m = LOCAL_RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [
    number, number, number, number, number, number,
  ];
  const day = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidDateISO(day) || h > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) - safeTzMinutes(tzMinutes) * 60_000;
}

/** Epoch ms -> the calendar day at that offset. PURE. */
export function dayAt(ms: number, tzMinutes: number): DateISO {
  return new Date(ms + safeTzMinutes(tzMinutes) * 60_000).toISOString().slice(0, 10);
}

/** Epoch ms -> "YYYY-MM-DD HH:MM:SS" at that offset (what a machine expects). PURE. */
export function epochToLocal(ms: number, tzMinutes: number): string {
  return new Date(ms + safeTzMinutes(tzMinutes) * 60_000).toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------------------------------------------------------- punches in

/** One punch as a driver read it from the machine, before we know who it is. */
export interface Punch {
  /** The member number typed into the machine ("PIN" on ZK). Digits only once cleaned. */
  memberNo: string;
  /** The machine's own local time text, kept as sent. */
  localTime: string;
  /** Epoch ms, from localTime and the machine's offset. */
  at: number;
  /** false when the machine itself refused the person (AC firmware events); T&A logs only "in". */
  allowed: boolean;
  /** How they proved who they are: 'finger' | 'face' | 'card' | 'password' | 'other'. */
  verify: string;
  /** The machine's refusal reason, when it gave one. */
  reason: string | null;
}

/** A member number -> the member's id in the gym's list. Absent = we do not know this number. */
export type MemberNoLookup = ReadonlyMap<string, string>;

/** The newest punch we already hold per member number on this machine (epoch ms). */
export type RecentPunches = ReadonlyMap<string, number>;

/** Two punches by the same number on the same machine this close together are one entry. */
export const REPEAT_WINDOW_MS = 2 * 60_000;

export type PunchOutcome =
  /** A known member let in: becomes (or joins) their visit that day. */
  | { kind: 'visit'; punch: Punch; memberId: string; visitedOn: DateISO }
  /** A number nobody in the gym has: logged for the owner, never dropped. */
  | { kind: 'unknown-member'; punch: Punch; visitedOn: DateISO }
  /** The machine said no: logged, no visit. */
  | { kind: 'refused'; punch: Punch; memberId: string | null; visitedOn: DateISO }
  /** Within 2 minutes of the same number's last punch here (or the exact same punch sent again). */
  | { kind: 'repeat'; punch: Punch; memberId: string | null; visitedOn: DateISO };

/**
 * Sort a batch of punches into what each one means. Oldest first, so a burst sent after the
 * internet came back is judged in the order it happened. `recent` is what the server already holds;
 * the batch's own punches count too. PURE.
 */
export function judgePunches(
  punches: readonly Punch[],
  lookup: MemberNoLookup,
  recent: RecentPunches,
  tzMinutes: number,
): PunchOutcome[] {
  const last = new Map<string, number>(recent);
  const sorted = [...punches].sort((a, b) => a.at - b.at || a.memberNo.localeCompare(b.memberNo));
  const out: PunchOutcome[] = [];
  for (const punch of sorted) {
    const visitedOn = dayAt(punch.at, tzMinutes);
    const memberId = lookup.get(punch.memberNo) ?? null;
    const prev = last.get(punch.memberNo);
    // A repeat is judged against ALLOWED punches only: a refusal then a let-in is two real events.
    if (punch.allowed && prev !== undefined && Math.abs(punch.at - prev) < REPEAT_WINDOW_MS) {
      out.push({ kind: 'repeat', punch, memberId, visitedOn });
      continue;
    }
    if (!punch.allowed) {
      out.push({ kind: 'refused', punch, memberId, visitedOn });
      continue;
    }
    last.set(punch.memberNo, punch.at);
    if (memberId === null) out.push({ kind: 'unknown-member', punch, visitedOn });
    else out.push({ kind: 'visit', punch, memberId, visitedOn });
  }
  return out;
}

/** The visit row a machine entry makes: one per member per day, the first entry's time kept. */
export interface MachineVisit {
  /** Same id scheme as the QR check-in (0048): `<memberId>:<day>`, so no day is counted twice. */
  id: string;
  memberId: string;
  visitedOn: DateISO;
  checkedInAt: number;
  source: 'machine';
  machineId: string;
}

/**
 * The visits a judged batch makes: one per member per day, earliest time. Days that already have a
 * visit (from the desk, the app or an earlier batch) are left to the server's "already in" check:
 * it keeps the earliest. PURE.
 */
export function visitsFrom(outcomes: readonly PunchOutcome[], machineId: string): MachineVisit[] {
  const byId = new Map<string, MachineVisit>();
  for (const o of outcomes) {
    if (o.kind !== 'visit') continue;
    const id = `${o.memberId}:${o.visitedOn}`;
    const had = byId.get(id);
    if (!had || o.punch.at < had.checkedInAt) {
      byId.set(id, { id, memberId: o.memberId, visitedOn: o.visitedOn, checkedInAt: o.punch.at, source: 'machine', machineId });
    }
  }
  return [...byId.values()].sort((a, b) => a.checkedInAt - b.checkedInAt);
}

// ---------------------------------------------------------------- rules out (the command queue)

export type MachineCommand =
  | { type: 'upsert_member'; memberNo: string; name: string; active: boolean; validFrom: DateISO | null; validTo: DateISO | null }
  | { type: 'remove_member'; memberNo: string }
  | { type: 'open_door'; seconds: number }
  | { type: 'set_time'; at: number }
  | { type: 'fetch_missed_entries'; from: number; to: number };

export type CommandStatus = 'pending' | 'sent' | 'done' | 'error';

/**
 * A command read back from storage is one we can send: the right fields, of the right kinds. A bad row
 * must never stop a machine's queue (it is skipped and ends as NO_ANSWER). PURE.
 */
export function isValidCommand(c: unknown): c is MachineCommand {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  const day = (v: unknown) => v === null || v === undefined || isValidDateISO(v);
  const ms = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 8.64e15;
  switch (x.type) {
    case 'upsert_member':
      return cleanMemberNo(x.memberNo) === x.memberNo && typeof x.active === 'boolean' && day(x.validFrom) && day(x.validTo);
    case 'remove_member':
      return cleanMemberNo(x.memberNo) === x.memberNo;
    case 'open_door':
      return typeof x.seconds === 'number' && Number.isFinite(x.seconds);
    case 'set_time':
      return ms(x.at);
    case 'fetch_missed_entries':
      return ms(x.from) && ms(x.to) && (x.from as number) <= (x.to as number);
    default:
      return false;
  }
}


export interface QueuedCommand {
  /** A positive whole number: ZK echoes it back as ID=<n> in its answer. */
  id: number;
  machineId: string;
  command: MachineCommand;
  status: CommandStatus;
  /** How many times it has been handed to the machine. */
  tries: number;
  createdAt: number;
  sentAt: number | null;
  doneAt: number | null;
  /** The machine's answer code (ZK: 0 = done, -1002 refused, -1004 not on this model) or our note. */
  result: string | null;
}

/** A command handed out and not answered in this long goes back in the queue. */
export const RESEND_AFTER_MS = 10 * 60_000;
/** After this many hand-outs with no answer, it is marked error ("the machine never answered"). */
export const MAX_TRIES = 5;
/** At most this many commands per poll: a machine with 500 members to load is fed in steps. */
export const COMMANDS_PER_POLL = 20;

/** The member a command is about, if any (two commands about one member: only the newest counts). */
export function commandMember(c: MachineCommand): string | null {
  return c.type === 'upsert_member' || c.type === 'remove_member' ? c.memberNo : null;
}

/**
 * Add a command. A newer upsert/remove for the same member replaces any that is still PENDING (a
 * sale then a freeze in the same minute sends only the freeze). One already SENT is left alone: the
 * machine may have done it, and the new one simply follows. A set_time or open_door that is already
 * pending is not queued twice. PURE: returns the new queue.
 */
export function enqueue(queue: readonly QueuedCommand[], add: QueuedCommand): QueuedCommand[] {
  const who = commandMember(add.command);
  const kept = queue.filter((q) => {
    if (q.machineId !== add.machineId || q.status !== 'pending') return true;
    if (who !== null) return commandMember(q.command) !== who;
    if (add.command.type === 'set_time' || add.command.type === 'open_door') return q.command.type !== add.command.type;
    return true;
  });
  return [...kept, add];
}

/**
 * What to hand a polling machine now: first anything sent too long ago with no answer (again), then
 * pending, oldest first, at most COMMANDS_PER_POLL. Commands past MAX_TRIES become 'error'. PURE:
 * returns the commands to send and the queue as it must be saved.
 */
export function takeForPoll(
  queue: readonly QueuedCommand[],
  machineId: string,
  now: number,
): { send: QueuedCommand[]; queue: QueuedCommand[] } {
  const next = queue.map((q) => ({ ...q }));
  for (const q of next) {
    if (q.machineId === machineId && q.status === 'sent' && q.sentAt !== null && now - q.sentAt >= RESEND_AFTER_MS) {
      if (q.tries >= MAX_TRIES) {
        q.status = 'error';
        q.doneAt = now;
        q.result = 'NO_ANSWER';
      } else {
        q.status = 'pending';
      }
    }
  }
  const due = next
    .filter((q) => q.machineId === machineId && q.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    .slice(0, COMMANDS_PER_POLL);
  for (const q of due) {
    q.status = 'sent';
    q.sentAt = now;
    q.tries += 1;
  }
  return { send: due.map((q) => ({ ...q })), queue: next };
}

/**
 * The machine answered command `id` with `code` ("0" = done). Any other number is an error kept for
 * the owner's machine page. An answer for a command that is not ours, not this machine's, or already
 * finished changes nothing. PURE.
 */
export function applyResult(
  queue: readonly QueuedCommand[],
  machineId: string,
  id: number,
  code: string,
  now: number,
): QueuedCommand[] {
  return queue.map((q) => {
    if (q.id !== id || q.machineId !== machineId || q.status === 'done' || q.status === 'error') return q;
    const ok = code.trim() === '0';
    return { ...q, status: ok ? 'done' : 'error', doneAt: now, result: code.trim().slice(0, 32) || 'EMPTY' };
  });
}

/** Plain words for a ZK answer code, for the owner's machine page. PURE. */
export function resultWords(code: string | null): string {
  switch ((code ?? '').trim()) {
    case '0': return 'Done';
    case '-1002': return 'The machine said no';
    case '-1004': return 'This machine cannot do that';
    case 'NO_ANSWER': return 'The machine never answered';
    case '': return 'Waiting';
    default: return `The machine said ${String(code).trim().slice(0, 12)}`;
  }
}

// ---------------------------------------------------------------- member rules out

/** What MettleUp knows about one member, enough to say whether the machine should let them in. */
export interface MemberAccess {
  memberNo: string;
  name: string;
  /** Last day a paid plan covers (coverageEndsOn); null = no plan covers today or later. */
  coversUntil: DateISO | null;
  /** First day of that cover (a plan bought to start later still loads the member, but switched off). */
  coversFrom: DateISO | null;
  /** On a pause (freeze) until and including this day; null = not paused. */
  pausedUntil: DateISO | null;
  /** A pass member (FITPASS, cultpass...): the pass company pays, the machine lets them in. */
  passMember: boolean;
  archived: boolean;
}

/** May this member come in on `day`? PURE. */
export function allowedOn(m: MemberAccess, day: DateISO): boolean {
  if (m.archived) return false;
  if (m.pausedUntil !== null && m.pausedUntil >= day) return false;
  if (m.passMember) return true;
  if (m.coversUntil === null || m.coversUntil < day) return false;
  return m.coversFrom === null || m.coversFrom <= day;
}

/**
 * The commands that make one machine match one member today. Called after a sale, a renewal, a
 * pause, an archive, and by the nightly sweep (a plan lapses on its own, with nobody pressing
 * anything). PURE.
 *
 *  - A machine that holds dates (AC firmware, Matrix, Realtime): ALWAYS an upsert carrying the dates,
 *    so it refuses them by itself on the day after the end, even offline. Paused or archived: the
 *    upsert says active=false. Archived and never coming back: removed.
 *  - A machine that cannot (ZK T&A): allowed today -> upsert with no dates; not allowed -> remove.
 *    Removing a ZK T&A user also deletes their fingerprints, so a renewal means enrolling again at
 *    the machine (research section 6; prefer AC firmware where a gym can choose).
 */
export function syncCommands(m: MemberAccess, caps: MachineCapabilities, today: DateISO): MachineCommand[] {
  const memberNo = cleanMemberNo(m.memberNo);
  if (memberNo === null) return [];
  const name = m.name;
  const ok = allowedOn(m, today);
  if (m.archived) return [{ type: 'remove_member', memberNo }];
  if (caps.canHoldExpiry) {
    const validFrom = m.passMember ? null : m.coversFrom;
    const validTo = m.passMember ? null : m.coversUntil;
    // Paused: switched off now, and the machine gets the real dates again when the pause ends
    // (the nightly sweep sees allowedOn flip back).
    return [{ type: 'upsert_member', memberNo, name, active: ok, validFrom, validTo }];
  }
  if (ok) return [{ type: 'upsert_member', memberNo, name, active: true, validFrom: null, validTo: null }];
  if (caps.canDisable) return [{ type: 'upsert_member', memberNo, name, active: false, validFrom: null, validTo: null }];
  return [{ type: 'remove_member', memberNo }];
}

/**
 * The nightly sweep: members whose right to come in CHANGES between yesterday and today (a plan
 * ended last night, a pause ended, a plan bought to start today began). Only they get commands, so a
 * 600-member gym sends a handful a night, not 600. PURE.
 */
export function nightlyChanges(
  members: readonly MemberAccess[],
  caps: MachineCapabilities,
  today: DateISO,
): MachineCommand[] {
  const yesterday = addDays(today, -1);
  const out: MachineCommand[] = [];
  for (const m of members) {
    if (allowedOn(m, yesterday) === allowedOn(m, today)) continue;
    out.push(...syncCommands(m, caps, today));
  }
  return out;
}

// ---------------------------------------------------------------- member numbers

/**
 * A member number the machine will accept: 1-9 digits, no leading zeros kept ("007" -> "7"; ZK
 * stores the PIN as a number on most firmware). null for anything else. PURE.
 */
export function cleanMemberNo(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = String(Number(s));
  return n === '0' ? null : n;
}

/**
 * The next free member number for a gym: one more than the biggest in use, starting at 1001 so
 * numbers never collide with the 1-99 the machine's installer usually used for staff. PURE.
 */
export function nextMemberNo(inUse: Iterable<string>): string {
  let max = 1000;
  for (const s of inUse) {
    const n = Number(cleanMemberNo(s) ?? 0);
    if (n > max) max = n;
  }
  return String(max + 1);
}
